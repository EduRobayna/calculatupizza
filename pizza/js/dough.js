// ==================== FÓRMULA DE LA MASA (núcleo de cálculo) ====================
// Módulo PURO, sin DOM ni unidades de presentación: todo en canónico métrico
// (gramos, g/l de agua, °C). Es la ÚNICA fuente de la fórmula: la usa la app
// (window.PizzaDough en calculator.js) y el banco de pruebas (require en Node).
// Por eso cualquier cambio en la fórmula queda cubierto por los tests.
(function (root, factory) {
  const api = factory();
  root.PizzaDough = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Levadura fresca (g) por kg de harina según la temperatura ambiente (°C).
  const YEAST_TABLE = { 17: 1.3, 18: 1.0, 19: 0.9, 20: 0.7, 21: 0.6, 22: 0.5, 23: 0.4, 24: 0.3, 25: 0.2 };

  function toNum(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }

  // Levadura por kg de harina para una temperatura; fuera de tabla → 1.0.
  function yeastPerKgFlour(tempC) {
    return YEAST_TABLE[tempC] || 1.0;
  }

  // Sal: se INTRODUCE como % del peso del agua, pero la fórmula la usa en g por
  // litro (≈ kg) de agua. 1 % = 10 g/l (1 l de agua ≈ 1000 g; 1 % de 1000 g = 10 g).
  // Estas dos conversiones son la ÚNICA definición de esa equivalencia.
  function saltPctToGL(pct) { return toNum(pct) * 10; }
  function saltGLToPct(gL) { return toNum(gL) / 10; }

  // Harina total (g) despejada de la masa total, repartida EXACTAMENTE entre sus
  // cuatro componentes:
  //   masa = harina·(1+h) + sal + levadura
  //   sal      = agua·(salGL/1000) = harina·h·(salGL/1000)
  //   levadura = harina·(levPorKg/1000)
  // => harina = masa / (1 + h + h·salGL/1000 + levPorKg/1000)
  function harinaDesdeMasa(masaTotal, h, salGL, levPorKgHarina) {
    const divisor = 1 + h + h * (salGL / 1000) + (levPorKgHarina / 1000);
    return masaTotal / divisor;
  }

  // Calcula la receta completa a partir de valores CANÓNICOS (métrico):
  //   { numPizzas, pesoG (g/bola), tempC (°C), hidPct (%), salGL (g/l agua), flours:[{pct}] }
  // Devuelve gramos de cada componente y el desglose por harina.
  function computeRecipe(input) {
    input = input || {};
    const numPizzas = toNum(input.numPizzas);
    const pesoG = toNum(input.pesoG);
    const tempC = Math.round(toNum(input.tempC));
    const h = toNum(input.hidPct) / 100;
    const salGL = toNum(input.salGL);
    const flours = Array.isArray(input.flours) ? input.flours : [];

    const masaTotal = numPizzas * pesoG;
    // Levadura: por defecto según la tabla de temperatura (modo Auto). Si se pasa
    // input.levPorKgHarina (g de levadura fresca por kg de harina, modo Manual),
    // se usa ese valor y la temperatura deja de influir en la levadura.
    const levPorKg = (input.levPorKgHarina != null && isFinite(input.levPorKgHarina) && toNum(input.levPorKgHarina) >= 0)
      ? toNum(input.levPorKgHarina)
      : yeastPerKgFlour(tempC);
    // La sal se normaliza a "gramos de sal por gramo de harina" (saltPerFlour):
    //   · % de la harina (panadero, input.salPctFlour): saltPerFlour = salPctFlour/100
    //     — un % REAL de la harina, independiente de la hidratación.
    //   · g/L de agua (input.salGL, tradición napolitana): saltPerFlour = h·salGL/1000
    //     (agua = harina·h). Es el comportamiento por defecto y no cambia si no se
    //     pasa salPctFlour, así la receta en g/L es idéntica a siempre.
    const useFlourSalt = (input.salPctFlour != null && isFinite(parseFloat(input.salPctFlour)));
    const saltPerFlour = useFlourSalt ? (toNum(input.salPctFlour) / 100) : h * (salGL / 1000);
    const harinaTotal = masaTotal / (1 + h + saltPerFlour + (levPorKg / 1000));
    const aguaTotal = harinaTotal * h;
    const salTotal = harinaTotal * saltPerFlour;
    const levaduraFresca = harinaTotal * (levPorKg / 1000);
    const levaduraSeca = levaduraFresca / 3;

    return {
      masaTotal: masaTotal,
      harinaTotal: harinaTotal,
      aguaTotal: aguaTotal,
      salTotal: salTotal,
      levaduraFresca: levaduraFresca,
      levaduraSeca: levaduraSeca,
      levaduraPorKgHarina: levPorKg,
      flours: flours.map(function (f) { return harinaTotal * (toNum(f.pct) / 100); })
    };
  }

  // Suma de los porcentajes de harina (para validar que es exactamente 100%).
  function flourSum(flours) {
    return (flours || []).reduce(function (a, f) { return a + toNum(f.pct); }, 0);
  }

  // Reparte un total ENTERO `target` entre pesos que suman 1, con el método del
  // mayor resto (largest remainder): a cada uno la parte entera y los +1 sobrantes
  // van a las mayores partes fraccionarias. Así la suma es EXACTAMENTE `target`,
  // sin arrastre de coma flotante. Devuelve un array de enteros.
  function largestRemainder(weights, target) {
    var raw = weights.map(function (w) { return target * w; });
    var base = raw.map(function (x) { return Math.floor(x); });
    var leftover = target - base.reduce(function (s, x) { return s + x; }, 0);
    var order = raw
      .map(function (x, i) { return { i: i, frac: x - Math.floor(x) }; })
      .sort(function (a, b) { return b.frac - a.frac; });
    for (var k = 0; k < leftover; k++) base[order[k].i] += 1;
    return base;
  }

  // Auto-balanceo REACTIVO de las proporciones de harina. Trabaja en ENTEROS y
  // garantiza que la suma total sea exactamente 100. Reglas de negocio:
  //   1. A la harina modificada se le asigna el valor introducido (redondeado).
  //   2. El déficit/excedente respecto a 100 se reparte entre el RESTO de harinas
  //      NO bloqueadas.
  //   3. Las bloqueadas (locked === true) nunca cambian su porcentaje.
  //   4. Si bloqueadas + nuevo valor > 100, la modificada se capa al máximo posible.
  //   5. El reparto es proporcional al peso actual de cada no bloqueada, o
  //      equitativo si todas parten de 0.
  //   6. Redondeo a enteros con suma estricta 100 (mayor resto).
  //
  //   flours:       [{ pct, locked }]
  //   changedIndex: índice de la harina modificada, o -1 si no hay ninguna concreta
  //                 (p. ej. tras borrar una harina: solo se reequilibra el resto).
  //   newValue:     nuevo % de la harina modificada (se ignora si changedIndex < 0).
  // Devuelve un array de enteros (mismos índices) con las proporciones balanceadas.
  function balanceFlours(flours, changedIndex, newValue) {
    var list = (flours || []).map(function (f) {
      return { pct: Math.max(0, Math.round(toNum(f.pct))), locked: !!(f && f.locked) };
    });
    var n = list.length;
    var result = list.map(function (f) { return f.pct; });
    if (n === 0) return result;

    var hasChanged = (changedIndex != null && changedIndex >= 0 && changedIndex < n);
    var lockedSum = list.reduce(function (s, f, i) {
      return (f.locked && i !== changedIndex) ? s + f.pct : s;
    }, 0);

    if (hasChanged) {
      var maxForChanged = Math.max(0, 100 - lockedSum); // regla 4: tope
      result[changedIndex] = Math.min(Math.max(0, Math.round(toNum(newValue))), maxForChanged);
    }

    // Índices de las harinas NO bloqueadas que absorben el resto (regla 2/3).
    var othersIdx = [];
    for (var i = 0; i < n; i++) {
      if (!list[i].locked && i !== changedIndex) othersIdx.push(i);
    }
    if (othersIdx.length === 0) return result; // nada donde repartir: quedará el desajuste

    var changedPct = hasChanged ? result[changedIndex] : 0;
    var target = Math.max(0, 100 - lockedSum - changedPct);
    var othersSum = othersIdx.reduce(function (s, idx) { return s + list[idx].pct; }, 0);
    var weights = othersSum > 0
      ? othersIdx.map(function (idx) { return list[idx].pct / othersSum; }) // regla 5: proporcional
      : othersIdx.map(function () { return 1 / othersIdx.length; });        // regla 5: equitativo
    var shares = largestRemainder(weights, target);
    othersIdx.forEach(function (idx, k) { result[idx] = shares[k]; });
    return result;
  }

  return {
    YEAST_TABLE: YEAST_TABLE,
    yeastPerKgFlour: yeastPerKgFlour,
    saltPctToGL: saltPctToGL,
    saltGLToPct: saltGLToPct,
    harinaDesdeMasa: harinaDesdeMasa,
    computeRecipe: computeRecipe,
    flourSum: flourSum,
    balanceFlours: balanceFlours
  };
});
