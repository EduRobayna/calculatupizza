// Pruebas de los avisos dinámicos de formulación (RN-01 exceso de levadura ·
// RN-02 compatibilidad fuerza W ↔ tiempo). Lógica pura en js/dough.js (+ js/flours.js
// para el W numérico), la misma que usa calculator.js para mostrar los avisos.
// Se ejecutan con: npm test  (o  node --test tests/)
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../pizza/js/dough.js');
const F = require('../pizza/js/flours.js');

// Ejemplo 1 — RN-01: > 1,5 % del peso de la harina dispara el aviso, en Auto y Manual.
// (calculator.js muestra el aviso en ambos modos sobre el valor mostrado de #levadura.)
test('RN-01 · exceso de levadura: el umbral es 1,5 %', () => {
  assert.equal(D.isHighYeast(2.0), true);   // ejemplo 1: 2,0 % → aviso
  assert.equal(D.isHighYeast(1.5), false);  // límite exacto: NO (es > 1,5, no ≥)
  assert.equal(D.isHighYeast(1.0), false);
  assert.equal(D.isHighYeast(0.1), false);
  // En Auto la propia fórmula puede superar 1,5 % (fermentación corta/fría) → también avisa.
  assert.equal(D.isHighYeast(D.yeastPerKgFlour(2, 15) / 10), true);
});

// Ejemplo 2 — RN-02: harina floja para demasiado tiempo → "weak".
test('RN-02 · W250 con 20 h → warnFlourWeak', () => {
  assert.equal(D.effectiveW([{ w: 250, pct: 100 }]), 250);
  assert.equal(D.flourTimeWarning(250, 20), 'weak'); // banda W≤259: maxH 16; 20 > 16
});

// Ejemplo 3 — RN-02: harina fuerte para poco tiempo → "strong".
test('RN-02 · W340 con 10 h → warnFlourStrong', () => {
  assert.equal(D.effectiveW([{ w: 340, pct: 100 }]), 340);
  assert.equal(D.flourTimeWarning(340, 10), 'strong'); // banda W≤350: minH 24; 10 < 24
  // Dentro de banda no hay aviso (control): W340 con 36 h cae en [24,48].
  assert.equal(D.flourTimeWarning(340, 36), null);
});

// Ejemplo 4 — RN-02: sin dato de fuerza (w=0) → no hay W efectivo, no hay aviso.
test('RN-02 · harina sin dato (w=0) → sin W efectivo', () => {
  assert.equal(D.effectiveW([{ w: 0, pct: 100 }]), null); // ejemplo 4: 100% "Supermercado"
  // En una mezcla, solo cuentan las harinas con dato (la de w=0 se ignora).
  assert.equal(D.effectiveW([{ w: 250, pct: 50 }, { w: 0, pct: 50 }]), 250);
  // El accesor numérico de flours.js devuelve 0 para harinas sin dato de fuerza.
  const sinDato = F.all().find(function (f) { return F.w(f.id) === ''; });
  if (sinDato) assert.equal(F.wValue(sinDato.id), 0);
});

// RN-02 — horas estructurales Q10 (Arrhenius) en AMBAS fases: cada una se pondera por su
// temperatura con factor 2^((T−21)/10) (base 21 °C). Firma: (hAmb, tAmb, hFrío, tFrío).
test('RN-02 · horas estructurales Q10 (ambiente + fría)', () => {
  // A 21 °C (base) el factor es 1 → ambas fases cuentan 1:1.
  assert.equal(D.structuralHours(10, 21, 20, 21), 30);
  // Q10 en la fase AMBIENTE: 11 °C = base−10 → factor 0,5.
  assert.equal(D.structuralHours(10, 11, 0, 4), 5);
  // Q10 en la fase FRÍA: 11 °C = base−10 → factor 0,5.
  assert.equal(D.structuralHours(0, 21, 20, 11), 10);
  // Ambas ponderadas a la vez: 31 °C (×2) y 1 °C (×0,25).
  assert.equal(D.structuralHours(10, 31, 20, 1), 25); // 10*2 + 20*0.25
  // Monotonía: cocina más cálida desgasta más; nevera más fría desgasta menos.
  assert.ok(D.structuralHours(24, 28, 0, 4) > D.structuralHours(24, 15, 0, 4));
  assert.ok(D.structuralHours(0, 21, 24, 18) > D.structuralHours(0, 21, 24, 4));
  // Efecto FRÍA: mismo reloj (4 h amb@21 °C + 48 h fría) con W282, 4 °C vs 18 °C…
  assert.equal(D.flourTimeWarning(282, D.structuralHours(4, 21, 48, 4)), null);   // ≈18,8 → dentro
  assert.equal(D.flourTimeWarning(282, D.structuralHours(4, 21, 48, 18)), 'weak'); // ≈43 → supera
  // Efecto AMBIENTE: 30 h sin nevera, cocina fría (15 °C) vs cálida (30 °C) con W282…
  assert.equal(D.flourTimeWarning(282, D.structuralHours(30, 15, 0, 4)), null);   // ≈19,8 → dentro
  assert.equal(D.flourTimeWarning(282, D.structuralHours(30, 30, 0, 4)), 'weak'); // ≈56 → supera
});

// ── Escenarios reales de obrador (regresión termodinámica Arrhenius / Q10) ───────────
// Firma: structuralHours(ambientHours, ambientTempC, coldHours, coldTempC).
// closeTo replica el toBeCloseTo(valor, dígitos) de Jest: |actual − esperado| < 0.5·10^(−dígitos).
function closeTo(actual, expected, digits = 2) {
  const tol = 0.5 * Math.pow(10, -digits);
  assert.ok(Math.abs(actual - expected) < tol,
    `esperado ${expected} ±${tol}, obtenido ${actual}`);
}

test('Q10 · 1. Napolitana clásica: 24 h a 21 °C (base) → 24,00 h estructurales', () => {
  // A 21 °C el factor es 1 → horas de reloj = horas estructurales.
  closeTo(D.structuralHours(24, 21, 0, 4), 24.00, 1);
});

test('Q10 · 2. Calor de verano: 12 h a 28 °C → ~19,49 h estructurales', () => {
  // A 28 °C el calor acelera las proteasas (factor ~1,62): 12 h físicas ≈ 19,49 h a 21 °C.
  closeTo(D.structuralHours(12, 28, 0, 4), 19.49, 1);
});

test('Q10 · 3. Mixta contemporánea: 2 h a 21 °C + 48 h nevera 4 °C → ~16,77 h', () => {
  // A 4 °C el frío ralentiza el desgaste (factor ~0,31): 48 h ≈ 14,77 h + las 2 h de ambiente.
  closeTo(D.structuralHours(2, 21, 48, 4), 16.77, 1);
});

test('Q10 · 4. Maduración de autor: 0 h ambiente + 30 h vinoteca 15 °C → ~19,79 h', () => {
  // A 15 °C se frena, pero menos que la nevera (factor ~0,66): 30 h físicas ≈ 19,79 h a 21 °C.
  closeTo(D.structuralHours(0, 21, 30, 15), 19.79, 1);
});

// ── Recomendaciones concretas de fuerza de harina para los avisos W↔tiempo ──────────
test('RN-02 · recomendaciones de fuerza (bandas de W)', () => {
  const b = D.flourBand(282);
  assert.equal(b.minH, 16); assert.equal(b.maxH, 30); // mezcla W282 → banda [260-309]
  // 'weak' (harina floja para tanto tiempo): W MÍNIMO que aguanta H horas estructurales.
  assert.equal(D.minWForHours(43), 310);   // primera banda con maxH>=43 → [310-350]
  assert.equal(D.minWForHours(10), 220);   // [220-259] (maxH 16)
  assert.equal(D.minWForHours(80), null);  // ni la más fuerte (maxH 72) aguanta 80 h
  // 'strong' (harina fuerte para poco tiempo): W MÁXIMO que necesita <= H horas.
  assert.equal(D.maxWForHours(10), 259);   // banda más fuerte con minH<=10 → [220-259]
  assert.equal(D.maxWForHours(2), null);   // ni la más floja (minH 4) necesita <= 2 h
});
