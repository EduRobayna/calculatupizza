// Prueba de integración de los modos Auto/Manual de SAL y LEVADURA, y de que el
// cálculo es correcto y coherente en MÉTRICO e IMPERIAL.
//
// Modela exactamente la resolución que hace la app (js/calculator.js) antes de
// llamar al núcleo puro computeRecipe (js/dough.js):
//   · Sal:      el campo es "% del agua"; canónico g/L = % × 10 (D.saltPctToGL).
//              Auto = 4 %  (40 g/L, bloqueada);  Manual = el % que ponga el usuario.
//   · Levadura: el campo es "% de la harina"; canónico g/kg = % × 10.
//              Auto = tabla por temperatura (D.yeastPerKgFlour); Manual = valor fijo.
//   · Peso:     canónico SIEMPRE en gramos; en imperial la entrada es oz (U.ozToG).
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../pizza/js/dough.js');
const U = require('../pizza/js/units.js');

const OZ = 1 / 28.349523125;
function closeTo(a, b, tol = 1e-9, m) {
  assert.ok(Math.abs(a - b) <= tol, `${m || ''} esperado≈${b}, obtenido ${a} (tol ${tol})`);
}
function round2(x) { return Math.round(x * 100) / 100; }

// Tabla de referencia (la que aportó el usuario): g por kg de harina.
const YEAST_REF = [
  { temp: 17, fresh: 1.3, dry: 0.43 }, { temp: 18, fresh: 1.0, dry: 0.33 }, { temp: 19, fresh: 0.9, dry: 0.30 },
  { temp: 20, fresh: 0.7, dry: 0.23 }, { temp: 21, fresh: 0.6, dry: 0.20 }, { temp: 22, fresh: 0.5, dry: 0.17 },
  { temp: 23, fresh: 0.4, dry: 0.13 }, { temp: 24, fresh: 0.3, dry: 0.10 }, { temp: 25, fresh: 0.2, dry: 0.07 },
];

// Resuelve los valores canónicos igual que la app y calcula la receta.
//   salMode: 'auto'|'manual', saltPct: % del agua (solo si manual)
//   yeastMode: 'auto'|'manual', yeastPct: % de la harina (solo si manual)
//   pesoOz: si se da, el peso entra en onzas (imperial) y se convierte a gramos.
function appCompute(o) {
  const salGL = (o.salMode === 'auto') ? D.saltPctToGL(4) : D.saltPctToGL(o.saltPct);
  const pesoG = (o.pesoOz != null) ? U.ozToG(o.pesoOz) : o.pesoG;
  const input = {
    numPizzas: o.numPizzas, pesoG: pesoG, tempC: o.tempC, hidPct: o.hidPct,
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

test('LEVADURA Auto sigue la tabla por temperatura (fresca y seca = referencia)', () => {
  for (const row of YEAST_REF) {
    const r = appCompute(withBase({ tempC: row.temp, salMode: 'auto', yeastMode: 'auto', flours: [{ pct: 100 }] }));
    // ritmo g/kg de la tabla
    closeTo(r.levaduraPorKgHarina, row.fresh, 1e-9, `g/kg fresca @${row.temp}`);
    // fresca por kg de harina obtenida del resultado
    closeTo(r.levaduraFresca / r.harinaTotal * 1000, row.fresh, 1e-9, `fresca/kg @${row.temp}`);
    // seca = fresca / 3, redondeada a 2 decimales = columna "dry" de la tabla
    assert.equal(round2(r.levaduraSeca / r.harinaTotal * 1000), row.dry, `seca/kg @${row.temp}`);
    // relación fresca:seca = 3:1
    closeTo(r.levaduraSeca, r.levaduraFresca / 3, 1e-12, `ratio 3:1 @${row.temp}`);
  }
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

test('LEVADURA Manual 0,1 % equivale a Auto a 18 °C (ambos 1,0 g/kg)', () => {
  const auto18 = appCompute(withBase({ tempC: 18, salMode: 'auto', yeastMode: 'auto' }));
  const man01 = appCompute(withBase({ tempC: 18, salMode: 'auto', yeastMode: 'manual', yeastPct: 0.1 }));
  assert.deepEqual(auto18, man01);
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
