// Pruebas del auto-balanceo reactivo de proporciones de harina (js/dough.js).
// Reglas: valor asignado directo, reparto del resto entre las NO bloqueadas,
// bloqueadas intactas, tope al 100%, reparto proporcional/equitativo y suma
// ESTRICTA de 100 con porcentajes enteros. Se ejecutan con: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../pizza/js/dough.js');

// Todas las proporciones deben ser enteras y sumar exactamente 100.
function assertEnterosSuman100(res) {
  res.forEach((p) => assert.ok(Number.isInteger(p), `no es entero: ${p}`));
  assert.equal(res.reduce((s, p) => s + p, 0), 100);
}

test('regla 1+2: asigna el valor y reparte el resto entre las no bloqueadas', () => {
  const flours = [{ pct: 75 }, { pct: 15 }, { pct: 10 }];
  const res = D.balanceFlours(flours, 0, 50); // harina 0 -> 50
  assert.equal(res[0], 50);
  assertEnterosSuman100(res);
  // Las otras dos mantienen su ratio 15:10 (=3:2) al repartir 50 -> 30 y 20.
  assert.deepEqual(res, [50, 30, 20]);
});

test('regla 3: una harina bloqueada nunca cambia su porcentaje', () => {
  const flours = [{ pct: 50 }, { pct: 30, locked: true }, { pct: 20 }];
  const res = D.balanceFlours(flours, 0, 40); // sube la 0 a 40
  assert.equal(res[1], 30, 'la bloqueada no se toca');
  assert.equal(res[0], 40);
  assert.equal(res[2], 30, 'la no bloqueada absorbe el resto: 100-30-40');
  assertEnterosSuman100(res);
});

test('regla 4: si bloqueadas + nuevo valor > 100, se capa la harina modificada', () => {
  const flours = [{ pct: 10 }, { pct: 60, locked: true }, { pct: 30, locked: true }];
  const res = D.balanceFlours(flours, 0, 80); // pide 80 pero el tope es 100-90=10
  assert.equal(res[0], 10, 'capada al máximo permitido');
  assert.equal(res[1], 60);
  assert.equal(res[2], 30);
  assertEnterosSuman100(res);
});

test('regla 5: reparto equitativo cuando las demás parten de 0', () => {
  const flours = [{ pct: 40 }, { pct: 0 }, { pct: 0 }, { pct: 0 }];
  const res = D.balanceFlours(flours, 0, 40); // reparte 60 entre 3 a partes iguales
  assert.equal(res[0], 40);
  assert.deepEqual(res.slice(1), [20, 20, 20]);
  assertEnterosSuman100(res);
});

test('regla 5: reparto proporcional mantiene la ratio', () => {
  const flours = [{ pct: 20 }, { pct: 60 }, { pct: 20 }];
  const res = D.balanceFlours(flours, 0, 40); // reparte 60 en ratio 60:20 (=3:1)
  assert.equal(res[0], 40);
  assert.deepEqual(res, [40, 45, 15]);
  assertEnterosSuman100(res);
});

test('regla 6: suma estricta 100 con enteros pese a la coma flotante', () => {
  // 100 entre 3 iguales = 33.33...; el mayor resto reparte los +1 sobrantes.
  const flours = [{ pct: 0 }, { pct: 0 }, { pct: 0 }];
  const res = D.balanceFlours(flours, -1); // los 3 desbloqueados reparten 100
  assertEnterosSuman100(res);
  // Con pesos iguales, el reparto es 34/33/33 (o permutación que sume 100).
  const ordenado = [...res].sort((a, b) => b - a);
  assert.deepEqual(ordenado, [34, 33, 33]);
});

test('regla 6: redondea a enteros un valor decimal introducido', () => {
  const flours = [{ pct: 50 }, { pct: 50 }];
  const res = D.balanceFlours(flours, 0, 33.6); // 33.6 -> 34
  assert.equal(res[0], 34);
  assert.equal(res[1], 66);
  assertEnterosSuman100(res);
});

test('changedIndex = -1: reequilibra el resto tras borrar (sin harina concreta)', () => {
  // Tras borrar, las tres restantes suman 90; se reparte el 10 que falta.
  const flours = [{ pct: 30 }, { pct: 30 }, { pct: 30 }];
  const res = D.balanceFlours(flours, -1);
  assertEnterosSuman100(res);
});

test('changedIndex = -1 con una bloqueada: solo se mueven las libres', () => {
  const flours = [{ pct: 40, locked: true }, { pct: 20 }, { pct: 20 }];
  const res = D.balanceFlours(flours, -1); // reparte 60 entre las dos libres
  assert.equal(res[0], 40, 'la bloqueada intacta');
  assert.deepEqual(res.slice(1), [30, 30]);
  assertEnterosSuman100(res);
});

test('todas bloqueadas menos la modificada: no hay dónde repartir, se respeta lo que hay', () => {
  const flours = [{ pct: 20 }, { pct: 30, locked: true }, { pct: 30, locked: true }];
  const res = D.balanceFlours(flours, 0, 20);
  assert.deepEqual(res, [20, 30, 30]); // suma 80: la validación de la UI lo marcará
});

test('no muta el array de entrada', () => {
  const flours = [{ pct: 75 }, { pct: 15 }, { pct: 10 }];
  const copia = JSON.parse(JSON.stringify(flours));
  D.balanceFlours(flours, 0, 50);
  assert.deepEqual(flours, copia, 'la entrada no debe modificarse');
});
