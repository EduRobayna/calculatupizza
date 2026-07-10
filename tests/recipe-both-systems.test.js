// Prueba de integración: valida que los cálculos son consistentes en MÉTRICO e
// IMPERIAL. Es el guardián de "la fórmula intacta al cambiar de sistema".
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../pizza/js/dough.js');
const U = require('../pizza/js/units.js');

const OZ = 1 / 28.349523125;
function num(s) { return parseFloat(String(s).replace(/,/g, '')); } // en-US: coma = miles

const SCENARIOS = [
  { numPizzas: 6, pesoG: 280, tempC: 18, hidPct: 63, salGL: D.saltPctToGL(4), flours: [{ pct: 75 }, { pct: 15 }, { pct: 10 }] },
  { numPizzas: 4, pesoG: 250, tempC: 22, hidPct: 70, salGL: D.saltPctToGL(5), flours: [{ pct: 100 }] },
  { numPizzas: 10, pesoG: 200, tempC: 25, hidPct: 55, salGL: D.saltPctToGL(3), flours: [{ pct: 50 }, { pct: 50 }] },
];

test('la receta en gramos NO depende del sistema de unidades elegido', () => {
  for (const s of SCENARIOS) {
    U.set('metric');   const rm = D.computeRecipe(s);
    U.set('imperial'); const ri = D.computeRecipe(s);
    assert.deepEqual(rm, ri, 'computeRecipe debe ser idéntico en métrico e imperial');
  }
  U.set('metric');
});

test('presentación: cada valor imperial es la conversión exacta de los mismos gramos', () => {
  globalThis.PizzaI18N = { getLang: () => 'en' };
  for (const s of SCENARIOS) {
    const r = D.computeRecipe(s);

    U.set('metric');
    const mHarina = num(U.formatWeight(r.harinaTotal));
    const mSal = num(U.formatWeight(r.salTotal));

    U.set('imperial');
    const iHarina = num(U.formatWeight(r.harinaTotal));
    const iSal = num(U.formatWeight(r.salTotal));

    // Métrico = gramos redondeados
    assert.ok(Math.abs(mHarina - Math.round(r.harinaTotal)) < 0.5, `harina métrico ${mHarina}`);
    assert.ok(Math.abs(mSal - Math.round(r.salTotal)) < 0.5, `sal métrico ${mSal}`);
    // Imperial = gramos × factor onza (dentro del redondeo a 1 decimal)
    assert.ok(Math.abs(iHarina - r.harinaTotal * OZ) < 0.1, `harina imperial ${iHarina} vs ${r.harinaTotal * OZ}`);
    assert.ok(Math.abs(iSal - r.salTotal * OZ) < 0.1, `sal imperial ${iSal} vs ${r.salTotal * OZ}`);
    // Temperatura: °C -> °F
    assert.equal(U.tempValue(s.tempC), Math.round(s.tempC * 9 / 5 + 32));
  }
  U.set('metric');
  delete globalThis.PizzaI18N;
});

test('sal: introducir 4% equivale exactamente a 40 g/l (misma receta)', () => {
  const base = { numPizzas: 6, pesoG: 280, tempC: 18, hidPct: 63, flours: [{ pct: 100 }] };
  const rPct = D.computeRecipe(Object.assign({}, base, { salGL: D.saltPctToGL(4) }));
  const rGL = D.computeRecipe(Object.assign({}, base, { salGL: 40 }));
  assert.deepEqual(rPct, rGL);
});
