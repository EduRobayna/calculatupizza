// Pruebas de conversión y formato de unidades (js/units.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../pizza/js/units.js');

function closeTo(a, b, tol = 1e-9, m) {
  assert.ok(Math.abs(a - b) <= tol, `${m || ''} esperado≈${b}, obtenido ${a}`);
}

test('gToOz / ozToG: factor correcto y son inversas', () => {
  closeTo(U.ozToG(1), 28.349523125);
  closeTo(U.gToOz(28.349523125), 1);
  closeTo(U.gToOz(U.ozToG(280)), 280);
  closeTo(U.gToOz(1000), 35.27396195, 1e-6);
});

test('tempValue / tempUnit según el sistema', () => {
  U.set('metric');
  assert.equal(U.tempUnit(), '°C');
  assert.equal(U.tempValue(18), 18);
  assert.equal(U.tempValue(25), 25);

  U.set('imperial');
  assert.equal(U.tempUnit(), '°F');
  assert.equal(U.tempValue(18), 64);  // 18*9/5+32 = 64.4 -> 64
  assert.equal(U.tempValue(25), 77);  // 77.0
  assert.equal(U.tempValue(0), 32);
  assert.equal(U.tempValue(100), 212);
  U.set('metric');
});

test('weightUnit', () => {
  U.set('metric');   assert.equal(U.weightUnit(), 'g');
  U.set('imperial'); assert.equal(U.weightUnit(), 'oz');
  U.set('metric');
});

test('formatWeight / formatWeightPrecise: g en métrico, oz en imperial', () => {
  // Fijamos idioma inglés para un formato determinista (miles con coma, decimal con punto).
  globalThis.PizzaI18N = { getLang: () => 'en' };

  U.set('metric');
  assert.equal(U.formatWeight(1014.37), '1,014 g');
  assert.equal(U.formatWeight(639), '639 g');
  assert.equal(U.formatWeightPrecise(1.0144), '1.01 g');

  U.set('imperial');
  assert.equal(U.formatWeight(1014.37), '35.8 oz');      // 1014.37 * 0.035274 = 35.78 -> 35.8
  assert.equal(U.formatWeightPrecise(1.0144), '0.04 oz'); // 0.0358 -> 0.04

  U.set('metric');
  delete globalThis.PizzaI18N;
});

test('temperatura desacoplada del peso: °C/°F independiente (setTempSystem)', () => {
  // 'auto' sigue al peso: métrico→°C, imperial→°F.
  U.set('metric'); U.setTempSystem('auto');
  assert.equal(U.isFahrenheit(), false);
  assert.equal(U.tempUnit(), '°C');
  U.set('imperial');
  assert.equal(U.isFahrenheit(), true);
  assert.equal(U.tempUnit(), '°F');

  // Fijar °C aunque el peso sea imperial (el caso desacoplado).
  U.setTempSystem('c');
  assert.equal(U.isFahrenheit(), false);
  assert.equal(U.tempUnit(), '°C');
  assert.equal(U.tempValue(20), 20);

  // Fijar °F aunque el peso sea métrico.
  U.set('metric'); U.setTempSystem('f');
  assert.equal(U.isFahrenheit(), true);
  assert.equal(U.tempUnit(), '°F');
  assert.equal(U.tempValue(20), 68); // 20*9/5+32

  // Valor no reconocido cae a 'auto'.
  U.setTempSystem('loquesea');
  assert.equal(U.getTempSystem(), 'auto');

  // Restaura estado por defecto para no afectar a otros tests.
  U.set('metric'); U.setTempSystem('auto');
});

test('unidad de la sal: g/L por defecto, conmuta a % harina y valor no válido cae a g/L', () => {
  assert.equal(U.getSaltUnit(), 'gl'); // por defecto
  assert.equal(U.isSaltGL(), true);
  assert.equal(U.isSaltFlour(), false);

  U.setSaltUnit('harina');
  assert.equal(U.getSaltUnit(), 'harina');
  assert.equal(U.isSaltFlour(), true);
  assert.equal(U.isSaltGL(), false);

  U.setSaltUnit('loquesea'); // cualquier cosa que no sea 'harina' -> 'gl'
  assert.equal(U.getSaltUnit(), 'gl');
  assert.equal(U.isSaltGL(), true);
});

test('get / set / isImperial y valor no reconocido cae a métrico', () => {
  U.set('metric');
  assert.equal(U.get(), 'metric');
  assert.equal(U.isImperial(), false);

  U.set('imperial');
  assert.equal(U.get(), 'imperial');
  assert.equal(U.isImperial(), true);

  U.set('loquesea'); // no es 'imperial' -> metric
  assert.equal(U.get(), 'metric');
});
