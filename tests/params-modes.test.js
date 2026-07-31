// Prueba de integración de los modos Auto/Manual de SAL y LEVADURA, y de que el
// cálculo es correcto y coherente en MÉTRICO e IMPERIAL.
//
// Modela exactamente la resolución que hace la app (js/calculator.js) antes de
// llamar al núcleo puro computeRecipe (js/dough.js):
//   · Sal:      el campo es "% del agua"; canónico g/L = % × 10 (D.saltPctToGL).
//              Auto = 4 %  (40 g/L, bloqueada);  Manual = el % que ponga el usuario.
//   · Levadura: el campo es "% de la harina"; canónico g/kg = % × 10.
//              Auto = fórmula continua (horas + temperatura, D.yeastPerKgFlour);
//              Manual = valor fijo.
//   · Peso:     canónico SIEMPRE en gramos; en imperial la entrada es oz (U.ozToG).
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../pizza/js/dough.js');
const U = require('../pizza/js/units.js');

const OZ = 1 / 28.349523125;
function closeTo(a, b, tol = 1e-9, m) {
  assert.ok(Math.abs(a - b) <= tol, `${m || ''} esperado≈${b}, obtenido ${a} (tol ${tol})`);
}

// Resuelve los valores canónicos igual que la app y calcula la receta.
//   salMode: 'auto'|'manual', saltPct: % del agua (solo si manual)
//   yeastMode: 'auto'|'manual', yeastPct: % de la harina (solo si manual)
//   hours: horas de fermentación (por defecto 24, como la app)
//   pesoOz: si se da, el peso entra en onzas (imperial) y se convierte a gramos.
function appCompute(o) {
  const salGL = (o.salMode === 'auto') ? D.saltPctToGL(4) : D.saltPctToGL(o.saltPct);
  const pesoG = (o.pesoOz != null) ? U.ozToG(o.pesoOz) : o.pesoG;
  const input = {
    numPizzas: o.numPizzas, pesoG: pesoG, tempC: o.tempC, hidPct: o.hidPct,
    hours: (o.hours != null ? o.hours : 24),
    salGL: salGL, flours: o.flours || [{ pct: 100 }],
  };
  if (o.yeastMode === 'manual') input.levPorKgHarina = o.yeastPct * 10; // % harina -> g/kg
  return D.computeRecipe(input);
}

const BASE = { numPizzas: 6, pesoG: 280, tempC: 18, hidPct: 63, flours: [{ pct: 75 }, { pct: 15 }, { pct: 10 }] };
const withBase = (extra) => Object.assign({}, BASE, extra);

// ---------------------------------------------------------------- SAL

test('SAL Auto = 4 % del agua (40 g/L) y es lo mismo que Manual 4 %', () => {
  const auto = appCompute(withBase({ salMode: 'auto', yeastMode: 'auto' }));
  const man4 = appCompute(withBase({ salMode: 'manual', saltPct: 4, yeastMode: 'auto' }));
  assert.deepEqual(auto, man4, 'Auto debe equivaler a Manual 4 %');
  // sal = agua × 4 %
  closeTo(auto.salTotal, auto.aguaTotal * 0.04, 1e-9, 'sal Auto = 4% del agua');
});

test('SAL Manual respeta el % introducido (2,5 %, 6 %, 0 %)', () => {
  for (const pct of [0, 2.5, 6, 8.3]) {
    const r = appCompute(withBase({ salMode: 'manual', saltPct: pct, yeastMode: 'auto' }));
    closeTo(r.salTotal, r.aguaTotal * (pct / 100), 1e-9, `sal Manual ${pct}%`);
  }
});

// ---------------------------------------------------------------- LEVADURA (Auto)

test('LEVADURA Auto sigue la fórmula continua (horas + temperatura) y seca = fresca/3', () => {
  for (const hours of [12, 24, 48]) {
    for (const temp of [15, 18, 21, 25, 30]) {
      const r = appCompute(withBase({ tempC: temp, hours, salMode: 'auto', yeastMode: 'auto', flours: [{ pct: 100 }] }));
      const espGkg = D.yeastPerKgFlour(hours, temp); // g/kg puros de la fórmula
      closeTo(r.levaduraPorKgHarina, espGkg, 1e-9, `g/kg @${hours}h/${temp}C`);
      closeTo(r.levaduraFresca / r.harinaTotal * 1000, espGkg, 1e-9, `fresca/kg @${hours}h/${temp}C`);
      // seca = fresca / 3
      closeTo(r.levaduraSeca, r.levaduraFresca / 3, 1e-12, `ratio 3:1 @${hours}h/${temp}C`);
    }
  }
  // Monotonía observable en la receta: más horas -> menos levadura; más calor -> menos.
  const pocasH = appCompute(withBase({ tempC: 21, hours: 12, salMode: 'auto', yeastMode: 'auto', flours: [{ pct: 100 }] }));
  const muchasH = appCompute(withBase({ tempC: 21, hours: 48, salMode: 'auto', yeastMode: 'auto', flours: [{ pct: 100 }] }));
  assert.ok(pocasH.levaduraPorKgHarina > muchasH.levaduraPorKgHarina, 'menos horas -> más levadura');
  const frio = appCompute(withBase({ tempC: 18, hours: 24, salMode: 'auto', yeastMode: 'auto', flours: [{ pct: 100 }] }));
  const calor = appCompute(withBase({ tempC: 25, hours: 24, salMode: 'auto', yeastMode: 'auto', flours: [{ pct: 100 }] }));
  assert.ok(frio.levaduraPorKgHarina > calor.levaduraPorKgHarina, 'menos calor -> más levadura');
});

// ---------------------------------------------------------------- LEVADURA (Manual)

test('LEVADURA Manual (% de harina) fija la cantidad y NO depende de la temperatura', () => {
  // 0,15 % de harina = 1,5 g/kg
  const r17 = appCompute(withBase({ tempC: 17, salMode: 'auto', yeastMode: 'manual', yeastPct: 0.15 }));
  const r25 = appCompute(withBase({ tempC: 25, salMode: 'auto', yeastMode: 'manual', yeastPct: 0.15 }));
  assert.deepEqual(r17, r25, 'con levadura Manual la temperatura no debe cambiar nada');
  closeTo(r17.levaduraPorKgHarina, 1.5, 1e-9, 'manual 0,15% -> 1,5 g/kg');
  closeTo(r17.levaduraFresca, r17.harinaTotal * 1.5 / 1000, 1e-9, 'fresca con manual 1,5 g/kg');
  closeTo(r17.levaduraSeca, r17.levaduraFresca / 3, 1e-12, 'seca = fresca/3 (manual)');
});

test('LEVADURA Manual con el % de la fórmula equivale a Auto (misma temperatura y horas)', () => {
  const autoPct = D.yeastFreshPct(24, 18); // % de harina que da la fórmula a 24 h / 18 °C
  const auto18 = appCompute(withBase({ tempC: 18, hours: 24, salMode: 'auto', yeastMode: 'auto' }));
  const manEq = appCompute(withBase({ tempC: 18, hours: 24, salMode: 'auto', yeastMode: 'manual', yeastPct: autoPct }));
  assert.deepEqual(auto18, manEq);
});

// ---------------------------------------------------------------- MÉTRICO vs IMPERIAL

test('MÉTRICO = IMPERIAL: la receta en gramos es idéntica en todas las combinaciones', () => {
  const combos = [];
  for (const salMode of ['auto', 'manual'])
    for (const yeastMode of ['auto', 'manual'])
      for (const tempC of [17, 21, 25])
        combos.push(withBase({ salMode, saltPct: 5, yeastMode, yeastPct: 0.12, tempC, hidPct: 65 }));

  for (const c of combos) {
    U.set('metric');   const rm = appCompute(c);
    U.set('imperial'); const ri = appCompute(c);
    assert.deepEqual(rm, ri, `receta idéntica métrico/imperial: ${JSON.stringify({ salMode: c.salMode, yeastMode: c.yeastMode, tempC: c.tempC })}`);
  }
  U.set('metric');
});

test('IMPERIAL: sal y levadura se presentan como la conversión exacta de los mismos gramos', () => {
  globalThis.PizzaI18N = { getLang: () => 'en' };
  const combos = [
    withBase({ salMode: 'auto', yeastMode: 'auto', tempC: 18 }),
    withBase({ salMode: 'manual', saltPct: 6, yeastMode: 'manual', yeastPct: 0.2, tempC: 22 }),
  ];
  for (const c of combos) {
    const r = appCompute(c);
    // La conversión g -> oz debe ser exacta (misma que el factor onza)
    closeTo(U.gToOz(r.salTotal), r.salTotal * OZ, 1e-12, 'sal g->oz');
    closeTo(U.gToOz(r.levaduraFresca), r.levaduraFresca * OZ, 1e-12, 'levadura fresca g->oz');
    closeTo(U.gToOz(r.levaduraSeca), r.levaduraSeca * OZ, 1e-12, 'levadura seca g->oz');
    // Temperatura °C -> °F
    U.set('imperial');
    assert.equal(U.tempValue(c.tempC), Math.round(c.tempC * 9 / 5 + 32));
    U.set('metric');
  }
  delete globalThis.PizzaI18N;
});

test('PESO: la entrada en onzas (imperial) da la misma receta que en gramos', () => {
  // 280 g <-> su equivalente en oz; ozToG/gToOz son inversas exactas.
  const enG = appCompute(withBase({ pesoG: 280, salMode: 'auto', yeastMode: 'auto' }));
  const enOz = appCompute(withBase({ pesoOz: U.gToOz(280), salMode: 'auto', yeastMode: 'auto' }));
  closeTo(enOz.masaTotal, enG.masaTotal, 1e-6, 'misma masa entrando en oz o en g');
  closeTo(enOz.harinaTotal, enG.harinaTotal, 1e-6, 'misma harina');
});

// ---------------------------------------------------------------- CONSERVACIÓN DE MASA

test('Conservación de masa en todas las combinaciones auto/manual', () => {
  for (const salMode of ['auto', 'manual'])
    for (const yeastMode of ['auto', 'manual'])
      for (const tempC of [17, 20, 25]) {
        const r = appCompute(withBase({ salMode, saltPct: 5.5, yeastMode, yeastPct: 0.08, tempC }));
        const suma = r.harinaTotal + r.aguaTotal + r.salTotal + r.levaduraFresca;
        closeTo(suma, r.masaTotal, 1e-6, `conservación ${salMode}/${yeastMode}@${tempC}`);
      }
});
