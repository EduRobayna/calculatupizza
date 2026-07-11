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
    const harinaTotal = harinaDesdeMasa(masaTotal, h, salGL, levPorKg);
    const aguaTotal = harinaTotal * h;
    const salTotal = aguaTotal * (salGL / 1000);
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

  return {
    YEAST_TABLE: YEAST_TABLE,
    yeastPerKgFlour: yeastPerKgFlour,
    saltPctToGL: saltPctToGL,
    saltGLToPct: saltGLToPct,
    harinaDesdeMasa: harinaDesdeMasa,
    computeRecipe: computeRecipe,
    flourSum: flourSum
  };
});
