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

  function toNum(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }

  // Levadura fresca (% del peso de la harina) mediante un modelo predictivo térmico
  // continuo (estilo TXCraig1) para fermentación MULTIFASE (nevera + ambiente). Dos pasos:
  //
  //   PASO A) Tiempo efectivo (horas equivalentes a temperatura AMBIENTE): la levadura se
  //      ralentiza con el frío, así que las horas en nevera se descuentan al ritmo del
  //      ambiente con un factor de decaimiento exponencial 0.82 por cada grado de diferencia:
  //        Teff = Hambiente + Hnevera·0.82^(Tambiente − Tnevera)
  //   PASO B) Curva de crecimiento sobre el tiempo efectivo, con un ajuste térmico global
  //      respecto a la temperatura de referencia (21 °C):
  //        fresca% = 0.10 · (18/Teff)^1.3 · 0.82^(Tambiente − 21)
  //
  // La levadura seca es fresca/3 (se aplica en computeRecipe). Topes de seguridad
  // (clipping): la fresca nunca baja de 0.01% ni supera 3.0%. Una fase de nevera ausente/0
  // no aporta al tiempo efectivo; Teff≤0 (0 h totales) → tope mínimo. NO se lanza excepción:
  // en el contexto de la app el cálculo nunca debe romper la interfaz (la división por cero
  // se resuelve devolviendo el tope mínimo de seguridad).
  //
  // Nota: el ambiente es el marco de referencia y la nevera se descuenta respecto a él, así
  // que el modelo NO es simétrico entre fases (intercambiar fase/temperatura cambia Teff).
  const YEAST_MIN_PCT = 0.01, YEAST_MAX_PCT = 3.0;
  const YEAST_BASE_PCT = 0.10;    // tasa de levadura base: 0.10 % a la temperatura de referencia
  const YEAST_ANCHOR_HOURS = 18;  // ventana de tiempo base (horas de referencia)
  const YEAST_GROWTH_EXP = 1.3;   // exponente de crecimiento (curva no lineal de la levadura)
  const YEAST_DECAY = 0.82;       // coeficiente térmico (variación metabólica por cada °C)
  const YEAST_REF_TEMP = 21;      // temperatura de referencia (°C) sobre la que pivota el modelo
  // Límites de tiempo TOTAL de fermentación (regla de negocio RF-LEV-02).
  const FERM_MIN_HOURS = 2, FERM_MAX_HOURS = 96;

  // PASO A — Tiempo efectivo de una fermentación, en horas equivalentes a temperatura
  // ambiente (fase ambiente tal cual + fase nevera opcional descontada por el factor térmico).
  function yeastEffectiveHours(ambHours, ambTemp, coldHours, coldTemp) {
    const ambH = Math.max(0, toNum(ambHours));
    const coldH = Math.max(0, toNum(coldHours));
    const coldTerm = coldH > 0
      ? coldH * Math.pow(YEAST_DECAY, toNum(ambTemp) - toNum(coldTemp))
      : 0;
    return ambH + coldTerm;
  }
  // PASO B — Levadura fresca (%) a partir del tiempo efectivo y la temperatura ambiente:
  // curva de crecimiento + ajuste térmico global + clipping de seguridad. Teff≤0 → tope mínimo
  // (evita la división por cero sin lanzar excepción).
  function yeastFreshPctFromEffective(effectiveHours, ambTemp) {
    const teff = toNum(effectiveHours);
    if (!(teff > 0)) return YEAST_MIN_PCT;
    const pct = YEAST_BASE_PCT
      * Math.pow(YEAST_ANCHOR_HOURS / teff, YEAST_GROWTH_EXP)
      * Math.pow(YEAST_DECAY, toNum(ambTemp) - YEAST_REF_TEMP);
    return Math.min(YEAST_MAX_PCT, Math.max(YEAST_MIN_PCT, pct));
  }
  // Levadura fresca (%) de una fermentación completa (ambiente + nevera opcional).
  function yeastFreshPct(ambHours, ambTemp, coldHours, coldTemp) {
    return yeastFreshPctFromEffective(
      yeastEffectiveHours(ambHours, ambTemp, coldHours, coldTemp), ambTemp);
  }
  // g de levadura fresca por kg de harina (= fresca% × 10): unidad canónica que usa el
  // resto del cálculo (harinaDesdeMasa / computeRecipe trabajan en g/kg).
  function yeastPerKgFlour(ambHours, ambTemp, coldHours, coldTemp) {
    return yeastFreshPct(ambHours, ambTemp, coldHours, coldTemp) * 10;
  }
  // Validez del tiempo TOTAL de fermentación: 'min' (<2 h), 'max' (>96 h) u 'ok'.
  function fermentValidity(totalHours) {
    const t = toNum(totalHours);
    if (t < FERM_MIN_HOURS) return 'min';
    if (t > FERM_MAX_HOURS) return 'max';
    return 'ok';
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
  //   { numPizzas, pesoG (g/bola), hidPct (%), salGL (g/l agua), flours:[{pct}],
  //     ambHours, ambTemp (fase ambiente), coldHours, coldTemp (fase nevera opcional) }
  // Alias retro-compatibles: hours→ambHours, tempC→ambTemp (fermentación de una fase).
  // Devuelve gramos de cada componente y el desglose por harina.
  function computeRecipe(input) {
    input = input || {};
    const numPizzas = toNum(input.numPizzas);
    const pesoG = toNum(input.pesoG);
    const ambHours = (input.ambHours != null) ? input.ambHours : input.hours;
    const ambTemp = (input.ambTemp != null) ? input.ambTemp : input.tempC;
    const h = toNum(input.hidPct) / 100;
    const salGL = toNum(input.salGL);
    const flours = Array.isArray(input.flours) ? input.flours : [];

    const masaTotal = numPizzas * pesoG;
    // Levadura: por defecto según el modelo multifase (Heq de ambiente + nevera, modo
    // Auto). Si se pasa input.levPorKgHarina (g de levadura fresca por kg de harina,
    // modo Manual), se usa ese valor y las fases dejan de influir.
    const levPorKg = (input.levPorKgHarina != null && isFinite(input.levPorKgHarina) && toNum(input.levPorKgHarina) >= 0)
      ? toNum(input.levPorKgHarina)
      : yeastPerKgFlour(ambHours, ambTemp, input.coldHours, input.coldTemp);
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

  // ---- Avisos de formulación (puros, sin DOM) ----
  // La UI (calculator.js) construye los datos, decide con estas funciones y muestra
  // los avisos NO bloqueantes. Cubierto por tests igual que el resto de la fórmula.

  // W efectivo de la mezcla: media ponderada por porcentaje SOLO de las harinas con
  // dato de fuerza (w>0). items = [{ w, pct }]. Devuelve null si ninguna tiene dato
  // (→ no hay aviso de compatibilidad W↔tiempo posible).
  function effectiveW(items) {
    let wSum = 0, pctSum = 0;
    (items || []).forEach(function (it) {
      const w = toNum(it && it.w), pct = toNum(it && it.pct);
      if (w > 0) { wSum += w * pct; pctSum += pct; }
    });
    return pctSum > 0 ? Math.round(wSum / pctSum) : null;
  }

  // Bandas de compatibilidad fuerza (W) ↔ horas de fermentación de RELOJ (RN-02).
  const W_BANDS = [
    { max: 219, minH: 4, maxH: 8 },
    { max: 259, minH: 8, maxH: 16 },
    { max: 309, minH: 16, maxH: 30 },
    { max: 350, minH: 24, maxH: 48 },
    { max: Infinity, minH: 36, maxH: 72 }
  ];
  // Veredicto: 'weak' (harina floja para tanto tiempo · H>maxH), 'strong' (harina
  // fuerte para tan poco tiempo · H<minH) o null (dentro de banda → sin aviso).
  function flourTimeWarning(W, H) {
    const w = toNum(W), h = toNum(H);
    const band = W_BANDS.find(function (b) { return w <= b.max; });
    if (!band) return null;
    if (h > band.maxH) return 'weak';
    if (h < band.minH) return 'strong';
    return null;
  }

  // ---- Recomendaciones concretas para los avisos de compatibilidad W↔tiempo ----
  // Banda de fuerza para un W (la primera cuyo tope no se supera; nunca null: la última
  // tiene tope Infinity). Expone { max, minH, maxH }.
  function flourBand(W) {
    const w = toNum(W);
    return W_BANDS.find(function (b) { return w <= b.max; }) || W_BANDS[W_BANDS.length - 1];
  }
  // Cota INFERIOR de W de la banda i (= tope de la anterior + 1; 0 para la primera).
  function bandMinW(i) { return i <= 0 ? 0 : W_BANDS[i - 1].max + 1; }
  // 'weak' (harina demasiado floja): W MÍNIMO de una harina cuya banda aguanta H horas
  // estructurales (maxH >= H). null si ni la más fuerte lo aguanta (solo cabe bajar el tiempo).
  function minWForHours(H) {
    const h = toNum(H);
    for (var i = 0; i < W_BANDS.length; i++) {
      if (W_BANDS[i].maxH >= h) return bandMinW(i);
    }
    return null;
  }
  // 'strong' (harina demasiado fuerte): W MÁXIMO de una harina cuya banda necesita como
  // mucho H horas estructurales (minH <= H). null si ni la más floja necesita tan poco.
  function maxWForHours(H) {
    const h = toNum(H);
    for (var i = W_BANDS.length - 1; i >= 0; i--) {
      if (W_BANDS[i].minH <= h) return (W_BANDS[i].max === Infinity) ? null : W_BANDS[i].max;
    }
    return null;
  }

  // Horas ESTRUCTURALES de desgaste del gluten mediante el coeficiente Q10 (Arrhenius):
  // la velocidad de las proteasas se reduce a la mitad por cada 10 °C de caída (y se duplica
  // por cada 10 °C de subida) respecto a la temperatura base de la tabla de fuerzas W (21 °C).
  // AMBAS fases se ponderan por su propia temperatura con factor 2^((T − 21)/10): la ambiente
  // según #temperatura y la fría (nevera/vinoteca) según su termostato. Así una cocina cálida
  // desgasta más y una nevera fría menos. (A 21 °C el factor es 1 → cuenta 1:1; a 4 °C ≈0,31;
  // a 30 °C ≈1,87.) Se usa SOLO para juzgar la compatibilidad fuerza (W) ↔ tiempo con
  // flourTimeWarning; NO es tiempo de reloj (tope 96 h) ni horas equivalentes de la levadura.
  const STRUCTURAL_BASE_TEMP = 21;
  function structuralHours(ambientHours, ambientTempC, coldHours, coldTempC) {
    function q10(t) { return Math.pow(2, (toNum(t) - STRUCTURAL_BASE_TEMP) / 10); }
    return toNum(ambientHours) * q10(ambientTempC) + toNum(coldHours) * q10(coldTempC);
  }

  // Exceso de levadura (RN-01): > 1,5 % del peso de la harina (= 15 g/kg).
  function isHighYeast(pct) { return toNum(pct) > 1.5; }

  return {
    yeastEffectiveHours: yeastEffectiveHours,
    yeastFreshPctFromEffective: yeastFreshPctFromEffective,
    yeastFreshPct: yeastFreshPct,
    yeastPerKgFlour: yeastPerKgFlour,
    fermentValidity: fermentValidity,
    saltPctToGL: saltPctToGL,
    saltGLToPct: saltGLToPct,
    harinaDesdeMasa: harinaDesdeMasa,
    computeRecipe: computeRecipe,
    flourSum: flourSum,
    balanceFlours: balanceFlours,
    effectiveW: effectiveW,
    flourTimeWarning: flourTimeWarning,
    flourBand: flourBand,
    minWForHours: minWForHours,
    maxWForHours: maxWForHours,
    structuralHours: structuralHours,
    isHighYeast: isHighYeast,
    W_BANDS: W_BANDS
  };
});
