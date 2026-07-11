// Pruebas de la fórmula de la masa (js/dough.js) — núcleo de cálculo, canónico métrico.
// Se ejecutan con: npm test  (o  node --test tests/)
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../pizza/js/dough.js');

function closeTo(actual, expected, tol = 1e-6, msg) {
  assert.ok(Math.abs(actual - expected) <= tol,
    `${msg || ''} esperado≈${expected}, obtenido ${actual} (tol ${tol})`);
}

test('yeastPerKgFlour: tabla de levadura y fallback fuera de rango', () => {
  assert.equal(D.yeastPerKgFlour(17), 1.3);
  assert.equal(D.yeastPerKgFlour(18), 1.0);
  assert.equal(D.yeastPerKgFlour(22), 0.5);
  assert.equal(D.yeastPerKgFlour(25), 0.2);
  assert.equal(D.yeastPerKgFlour(30), 1.0); // fuera de tabla -> 1.0
  assert.equal(D.yeastPerKgFlour(0), 1.0);
});

test('saltPctToGL / saltGLToPct: 1% = 10 g/l y son inversas', () => {
  assert.equal(D.saltPctToGL(4), 40);
  assert.equal(D.saltGLToPct(40), 4);
  assert.equal(D.saltPctToGL(0), 0);
  closeTo(D.saltGLToPct(D.saltPctToGL(3.7)), 3.7, 1e-9);
});

test('harinaDesdeMasa: divisor = 1 + h + h·salGL/1000 + lev/1000', () => {
  const h = 0.63, salGL = 40, lev = 1.0, masa = 1680;
  const divisor = 1 + h + h * (salGL / 1000) + (lev / 1000);
  closeTo(D.harinaDesdeMasa(masa, h, salGL, lev), masa / divisor, 1e-12);
});

test('computeRecipe: receta por defecto (6×280 g, 18°C, 63%, 4% sal)', () => {
  const inp = { numPizzas: 6, pesoG: 280, tempC: 18, hidPct: 63, salGL: 40,
                flours: [{ pct: 75 }, { pct: 15 }, { pct: 10 }] };
  const r = D.computeRecipe(inp);

  // valores derivados independientemente
  const h = 0.63, lev = 1.0, masa = 6 * 280;
  const harina = masa / (1 + h + h * (40 / 1000) + lev / 1000);
  closeTo(r.masaTotal, masa, 1e-9);
  closeTo(r.harinaTotal, harina, 1e-9);
  closeTo(r.aguaTotal, harina * h, 1e-9);
  closeTo(r.salTotal, harina * h * (40 / 1000), 1e-9);
  closeTo(r.levaduraFresca, harina * (lev / 1000), 1e-9);
  closeTo(r.levaduraSeca, r.levaduraFresca / 3, 1e-12);

  // valor "dorado" de regresión: si cambia la fórmula, salta aquí
  closeTo(r.harinaTotal, 1014.37, 0.01);
  closeTo(r.aguaTotal, 639.05, 0.01);
  closeTo(r.salTotal, 25.56, 0.01);

  // desglose de harinas proporcional
  closeTo(r.flours[0], r.harinaTotal * 0.75, 1e-9);
  closeTo(r.flours[1], r.harinaTotal * 0.15, 1e-9);
  closeTo(r.flours[2], r.harinaTotal * 0.10, 1e-9);
});

test('computeRecipe: levPorKgHarina manual sobreescribe la tabla de temperatura', () => {
  const base = { numPizzas: 6, pesoG: 280, tempC: 18, hidPct: 63, salGL: 40,
                 flours: [{ pct: 100 }] };
  // Sin override: usa la tabla (18°C -> 1.0 g/kg)
  const auto = D.computeRecipe(base);
  closeTo(auto.levaduraPorKgHarina, 1.0, 1e-9);

  // Con override manual: usa 0.4 g/kg aunque la temperatura sea 18°C
  const manual = D.computeRecipe(Object.assign({}, base, { levPorKgHarina: 0.4 }));
  closeTo(manual.levaduraPorKgHarina, 0.4, 1e-9);
  closeTo(manual.levaduraFresca, manual.harinaTotal * (0.4 / 1000), 1e-9);
  closeTo(manual.levaduraSeca, manual.levaduraFresca / 3, 1e-12);

  // override 0 es válido (sin levadura); valores inválidos caen a la tabla
  closeTo(D.computeRecipe(Object.assign({}, base, { levPorKgHarina: 0 })).levaduraPorKgHarina, 0, 1e-9);
  closeTo(D.computeRecipe(Object.assign({}, base, { levPorKgHarina: -5 })).levaduraPorKgHarina, 1.0, 1e-9);
  closeTo(D.computeRecipe(Object.assign({}, base, { levPorKgHarina: NaN })).levaduraPorKgHarina, 1.0, 1e-9);

  // conservación de masa también con override
  const suma = manual.harinaTotal + manual.aguaTotal + manual.salTotal + manual.levaduraFresca;
  closeTo(suma, manual.masaTotal, 1e-6);
});

test('computeRecipe: conservación de masa (harina+agua+sal+levadura = masa)', () => {
  const casos = [
    { numPizzas: 6, pesoG: 280, tempC: 18, hidPct: 63, salGL: 40 },
    { numPizzas: 4, pesoG: 250, tempC: 22, hidPct: 70, salGL: 50 },
    { numPizzas: 10, pesoG: 200, tempC: 25, hidPct: 55, salGL: 30 },
    { numPizzas: 1, pesoG: 320, tempC: 17, hidPct: 80, salGL: 45 },
  ];
  for (const c of casos) {
    const r = D.computeRecipe(c);
    const suma = r.harinaTotal + r.aguaTotal + r.salTotal + r.levaduraFresca;
    closeTo(suma, r.masaTotal, 1e-6, `conservación ${JSON.stringify(c)}`);
  }
});

test('computeRecipe: relaciones agua/harina, sal/agua y levadura/harina', () => {
  const r = D.computeRecipe({ numPizzas: 5, pesoG: 260, tempC: 20, hidPct: 65, salGL: 48 });
  closeTo(r.aguaTotal / r.harinaTotal, 0.65, 1e-9);
  closeTo(r.salTotal / r.aguaTotal, 48 / 1000, 1e-9);
  closeTo(r.levaduraFresca / r.harinaTotal, D.yeastPerKgFlour(20) / 1000, 1e-9);
});

test('computeRecipe: casos límite (0 pizzas, sin harinas, entradas inválidas)', () => {
  const cero = D.computeRecipe({ numPizzas: 0, pesoG: 280, tempC: 18, hidPct: 63, salGL: 40 });
  assert.equal(cero.masaTotal, 0);
  assert.equal(cero.harinaTotal, 0);
  assert.equal(cero.salTotal, 0);

  const sinFlours = D.computeRecipe({ numPizzas: 6, pesoG: 280, tempC: 18, hidPct: 63, salGL: 40 });
  assert.deepEqual(sinFlours.flours, []);

  const basura = D.computeRecipe({});
  assert.equal(basura.masaTotal, 0);
  assert.ok(Number.isFinite(basura.harinaTotal));
});

test('flourSum', () => {
  assert.equal(D.flourSum([{ pct: 75 }, { pct: 15 }, { pct: 10 }]), 100);
  assert.equal(D.flourSum([{ pct: 60 }, { pct: 45 }]), 105);
  assert.equal(D.flourSum([]), 0);
  assert.equal(D.flourSum(undefined), 0);
});
