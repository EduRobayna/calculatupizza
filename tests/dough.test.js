// Pruebas de la fórmula de la masa (js/dough.js) — núcleo de cálculo, canónico métrico.
// Se ejecutan con: npm test  (o  node --test tests/)
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../pizza/js/dough.js');

function closeTo(actual, expected, tol = 1e-6, msg) {
  assert.ok(Math.abs(actual - expected) <= tol,
    `${msg || ''} esperado≈${expected}, obtenido ${actual} (tol ${tol})`);
}

test('yeast multifase: Teff, curva (18/Teff)^1.3, ajuste térmico, topes y validez del total', () => {
  // Sin nevera, el tiempo efectivo es directamente las horas de ambiente.
  closeTo(D.yeastEffectiveHours(18, 21), 18, 1e-9);
  // Ancla: 18 h efectivas a la temperatura de referencia (21 °C) = 0.10% fresca = 1.0 g/kg
  // (a 21 °C el ajuste térmico 0.82^(T−21) vale 1).
  closeTo(D.yeastFreshPct(18, 21), 0.10, 1e-9);
  closeTo(D.yeastPerKgFlour(18, 21), 1.0, 1e-9);
  closeTo(D.yeastFreshPctFromEffective(18, 21), 0.10, 1e-12);
  // Valor exacto en un punto (24 h a 20 °C, sin nevera): curva × ajuste térmico global.
  const teff2420 = 24; // sin nevera, Teff = horas de ambiente
  closeTo(D.yeastFreshPct(24, 20), 0.10 * Math.pow(18 / teff2420, 1.3) * Math.pow(0.82, 20 - 21), 1e-12);
  closeTo(D.yeastPerKgFlour(24, 20), D.yeastFreshPct(24, 20) * 10, 1e-12);
  // Monotonía: más tiempo equivalente -> menos levadura; más frío (menor T) -> más.
  assert.ok(D.yeastFreshPct(12, 21) > D.yeastFreshPct(24, 21));
  assert.ok(D.yeastFreshPct(24, 18) > D.yeastFreshPct(24, 25));
  // Topes de seguridad (clipping) [0.01%, 3.0%]
  assert.equal(D.yeastFreshPct(2, 10), 3.0);
  assert.equal(D.yeastFreshPct(200, 35), 0.01);
  // Sin fermentación válida (Heq <= 0) -> tope mínimo, sin excepción
  assert.equal(D.yeastFreshPct(0, 21), 0.01);
  assert.equal(D.yeastFreshPct(NaN, 21), 0.01);
  // Fase omitida/0 se procesa como 0 (Heq se resuelve con la fase restante)
  closeTo(D.yeastFreshPct(28, 18, 0, 4), D.yeastFreshPct(28, 18), 1e-12);
  // Validez del tiempo TOTAL de fermentación [2, 96] h (regla RF-LEV-02)
  assert.equal(D.fermentValidity(1), 'min');
  assert.equal(D.fermentValidity(2), 'ok');
  assert.equal(D.fermentValidity(96), 'ok');
  assert.equal(D.fermentValidity(97), 'max');
});

test('yeast multifase: la nevera se descuenta respecto al ambiente en el tiempo efectivo', () => {
  // 48 h a 4 °C (nevera) + 4 h a 21 °C (ambiente). Con ambiente = 21 °C (referencia),
  // Teff = Hamb + Hnev·0.82^(Tamb−Tnev) y el ajuste térmico de PASO B vale 1.
  const teff = D.yeastEffectiveHours(4, 21, 48, 4);
  closeTo(teff, 4 + 48 * Math.pow(0.82, 21 - 4), 1e-9);
  closeTo(D.yeastFreshPct(4, 21, 48, 4), 0.10 * Math.pow(18 / teff, 1.3), 1e-12);
  // El modelo NO es simétrico: el ambiente es el marco de referencia y la nevera se
  // descuenta respecto a él, así que intercambiar fase/temperatura cambia el tiempo efectivo.
  closeTo(D.yeastEffectiveHours(48, 4, 4, 21), 48 + 4 * Math.pow(0.82, 4 - 21), 1e-9);
  // computeRecipe con dos fases: g/kg = fórmula, y seca = fresca/3
  const r = D.computeRecipe({ numPizzas: 1, pesoG: 1000, hidPct: 63, salGL: 40,
    flours: [{ pct: 100 }], ambHours: 4, ambTemp: 21, coldHours: 48, coldTemp: 4 });
  closeTo(r.levaduraPorKgHarina, D.yeastPerKgFlour(4, 21, 48, 4), 1e-9);
  closeTo(r.levaduraSeca, r.levaduraFresca / 3, 1e-12);
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

test('computeRecipe: receta por defecto (6×280 g, 28 h ambiente, 18°C, 63%, 4% sal)', () => {
  const inp = { numPizzas: 6, pesoG: 280, ambTemp: 18, ambHours: 28, hidPct: 63, salGL: 40,
                flours: [{ pct: 75 }, { pct: 15 }, { pct: 10 }] };
  const r = D.computeRecipe(inp);

  // valores derivados independientemente (levadura del modelo a 28 h / 18 °C, sin nevera)
  const h = 0.63, lev = D.yeastPerKgFlour(28, 18), masa = 6 * 280;
  const harina = masa / (1 + h + h * (40 / 1000) + lev / 1000);
  closeTo(r.masaTotal, masa, 1e-9);
  closeTo(r.harinaTotal, harina, 1e-9);
  closeTo(r.aguaTotal, harina * h, 1e-9);
  closeTo(r.salTotal, harina * h * (40 / 1000), 1e-9);
  closeTo(r.levaduraFresca, harina * (lev / 1000), 1e-9);
  closeTo(r.levaduraSeca, r.levaduraFresca / 3, 1e-12);

  // valor "dorado" de regresión: si cambia la fórmula, salta aquí
  // (modelo PASO A/B: 28 h a 18 °C → ≈1.021 g/kg de levadura fresca)
  closeTo(r.harinaTotal, 1014.36, 0.01);
  closeTo(r.aguaTotal, 639.05, 0.01);
  closeTo(r.salTotal, 25.56, 0.01);

  // desglose de harinas proporcional
  closeTo(r.flours[0], r.harinaTotal * 0.75, 1e-9);
  closeTo(r.flours[1], r.harinaTotal * 0.15, 1e-9);
  closeTo(r.flours[2], r.harinaTotal * 0.10, 1e-9);
});

test('computeRecipe: sal como % de la harina (panadero) va sobre la harina, no el agua', () => {
  const r = D.computeRecipe({ numPizzas: 1, pesoG: 1000, tempC: 18, hidPct: 63, salPctFlour: 2.5, flours: [{ pct: 100 }] });
  // La sal es EXACTAMENTE el 2,5% de la harina.
  closeTo(r.salTotal, r.harinaTotal * 0.025, 1e-9);
  // Conservación de masa: harina·(1+h) + sal + levadura = masa total.
  closeTo(r.harinaTotal * (1 + 0.63) + r.salTotal + r.levaduraFresca, r.masaTotal, 1e-6);
  // Independiente de la hidratación: a 70% sigue siendo 2,5% de la harina (no deriva).
  const r2 = D.computeRecipe({ numPizzas: 1, pesoG: 1000, tempC: 18, hidPct: 70, salPctFlour: 2.5, flours: [{ pct: 100 }] });
  closeTo(r2.salTotal, r2.harinaTotal * 0.025, 1e-9);
  // salGL se ignora cuando se pasa salPctFlour.
  const r3 = D.computeRecipe({ numPizzas: 1, pesoG: 1000, tempC: 18, hidPct: 63, salGL: 999, salPctFlour: 2.5, flours: [{ pct: 100 }] });
  closeTo(r3.salTotal, r3.harinaTotal * 0.025, 1e-9);
});

test('computeRecipe: levPorKgHarina manual sobreescribe la fórmula', () => {
  const base = { numPizzas: 6, pesoG: 280, tempC: 18, hours: 24, hidPct: 63, salGL: 40,
                 flours: [{ pct: 100 }] };
  const autoLev = D.yeastPerKgFlour(24, 18); // g/kg de la fórmula a 24 h / 18 °C
  // Sin override: usa la fórmula
  const auto = D.computeRecipe(base);
  closeTo(auto.levaduraPorKgHarina, autoLev, 1e-9);

  // Con override manual: usa 0.4 g/kg aunque horas/temperatura digan otra cosa
  const manual = D.computeRecipe(Object.assign({}, base, { levPorKgHarina: 0.4 }));
  closeTo(manual.levaduraPorKgHarina, 0.4, 1e-9);
  closeTo(manual.levaduraFresca, manual.harinaTotal * (0.4 / 1000), 1e-9);
  closeTo(manual.levaduraSeca, manual.levaduraFresca / 3, 1e-12);

  // override 0 es válido (sin levadura); valores inválidos caen a la fórmula
  closeTo(D.computeRecipe(Object.assign({}, base, { levPorKgHarina: 0 })).levaduraPorKgHarina, 0, 1e-9);
  closeTo(D.computeRecipe(Object.assign({}, base, { levPorKgHarina: -5 })).levaduraPorKgHarina, autoLev, 1e-9);
  closeTo(D.computeRecipe(Object.assign({}, base, { levPorKgHarina: NaN })).levaduraPorKgHarina, autoLev, 1e-9);

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
  const r = D.computeRecipe({ numPizzas: 5, pesoG: 260, tempC: 20, hours: 24, hidPct: 65, salGL: 48 });
  closeTo(r.aguaTotal / r.harinaTotal, 0.65, 1e-9);
  closeTo(r.salTotal / r.aguaTotal, 48 / 1000, 1e-9);
  closeTo(r.levaduraFresca / r.harinaTotal, D.yeastPerKgFlour(24, 20) / 1000, 1e-9);
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
