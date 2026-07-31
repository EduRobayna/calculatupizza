// Pruebas de la base de datos de harinas + capa de acceso (js/flours.js).
// Cubre: identidad por id estable, migración retrocompatible de catalogId,
// búsqueda sin acentos, filtros y bandas de fuerza. Se ejecutan con: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../pizza/js/flours.js');

test('migración: catalogId antiguo (0..7) -> id de texto estable', () => {
  // El orden de LEGACY_INDEX_TO_ID es el del catálogo antiguo; no debe cambiar.
  assert.equal(F.migrateRef({ catalogId: 0 }), 'caputo-doppio-zero');
  assert.equal(F.migrateRef({ catalogId: 3 }), 'caputo-cuoco');
  assert.equal(F.migrateRef({ catalogId: 7 }), 'comun-supermercado');
});

test('migración: flourId nuevo pasa tal cual; entradas inválidas -> por defecto', () => {
  assert.equal(F.migrateRef({ flourId: 'caputo-nuvola' }), 'caputo-nuvola');
  assert.equal(F.migrateRef({ flourId: 'caputo-nuvola', catalogId: 0 }), 'caputo-nuvola'); // flourId manda
  assert.equal(F.migrateRef({}), F.DEFAULT_ID);
  assert.equal(F.migrateRef(null), F.DEFAULT_ID);
  assert.equal(F.migrateRef({ catalogId: 999 }), F.DEFAULT_ID); // fuera de rango -> por defecto
});

test('el mapa de migración cubre exactamente las 8 posiciones antiguas', () => {
  assert.equal(F.LEGACY_INDEX_TO_ID.length, 8);
  // Todos los ids legados deben existir en el catálogo actual.
  F.LEGACY_INDEX_TO_ID.forEach((id) => assert.ok(F.get(id), `id legado inexistente: ${id}`));
});

test('name(): bilingüe y con fallback seguro para id desconocido', () => {
  assert.equal(F.name('caputo-cuoco', 'es'), 'Caputo Cuoco / Saccorosso (Tipo 00)');
  assert.equal(F.name('caputo-cuoco', 'en'), 'Caputo Cuoco / Saccorosso (Type 00)');
  assert.equal(F.name('no-existe', 'es'), F.name(F.DEFAULT_ID, 'es')); // nunca vacío
});

test('mainName()/subLabel(): parten el nombre en principal + paréntesis', () => {
  // Marca + producto, sin el "(Tipo …)"; y el tipo como etiqueta secundaria.
  assert.equal(F.mainName('caputo-pizzeria', 'es'), 'Caputo Pizzería');
  assert.equal(F.subLabel('caputo-pizzeria', 'es'), 'Tipo 00');
  assert.equal(F.mainName('caputo-pizzeria', 'en'), 'Caputo Pizzeria');
  assert.equal(F.subLabel('caputo-pizzeria', 'en'), 'Type 00');
  // Nombre con barra en el producto no se parte antes de tiempo (parte por el ÚLTIMO paréntesis).
  assert.equal(F.mainName('caputo-cuoco', 'es'), 'Caputo Cuoco / Saccorosso');
  assert.equal(F.subLabel('caputo-cuoco', 'es'), 'Tipo 00');
  // Supermercado: el paréntesis es la marca genérica, no un tipo.
  assert.equal(F.mainName('fuerza-supermercado', 'es'), 'Harina de Fuerza');
  assert.equal(F.subLabel('fuerza-supermercado', 'es'), 'Supermercado');
});

test('typeLabel(): etiqueta de tipo uniforme y localizada para el filtro', () => {
  assert.equal(F.typeLabel('00', 'es'), 'Tipo 00');
  assert.equal(F.typeLabel('0', 'es'), 'Tipo 0');
  assert.equal(F.typeLabel('00', 'en'), 'Type 00');
  assert.equal(F.typeLabel('Tipo 1', 'en'), 'Type 1'); // ya no muestra "Tipo" en inglés
  assert.equal(F.typeLabel('Integrale', 'en'), 'Whole wheat');
  assert.equal(F.typeLabel('Fuerza', 'en'), 'Bread flour');
  assert.equal(F.typeLabel('Común', 'en'), 'All-purpose');
  assert.equal(F.typeLabel('desconocido', 'es'), 'desconocido'); // fallback
});

test('w(): rango "W300/320", valor único "W410", vacía si no hay dato', () => {
  assert.equal(F.w('caputo-cuoco'), 'W300/320');
  assert.equal(F.w('5stagioni-manitoba'), 'W410'); // wMin===wMax -> sin barra
  assert.equal(F.w('fuerza-supermercado'), '');
});

test('band(): bandas (femeninas) por punto medio del rango W', () => {
  assert.equal(F.band('caputo-doppio-zero'), 'baja');     // mid 230
  assert.equal(F.band('caputo-nuvola'), 'media');         // mid 280
  assert.equal(F.band('caputo-cuoco'), 'alta');           // mid 310
  assert.equal(F.band('caputo-manitoba-oro'), 'muyalta'); // mid 380
  assert.equal(F.band('fuerza-supermercado'), 'nd');      // sin dato
});

test('search(): sin query devuelve todo; términos casan sin acentos', () => {
  assert.equal(F.search('', {}).length, F.all().length);
  assert.deepEqual(F.search('pizzeria', {}).map((f) => f.id), ['caputo-pizzeria']); // "Pizzería" sin acento
  assert.deepEqual(F.search('00', {}).map((f) => f.type).every((t) => t === '00'), true);
});

test('search(): filtros combinables por marca, tipo y banda', () => {
  const soloSuper = F.search('', { brand: 'Supermercado' });
  assert.deepEqual(soloSuper.map((f) => f.id).sort(), ['comun-supermercado', 'fuerza-supermercado']);
  const muyAlta = F.search('', { band: 'muyalta' });
  assert.ok(muyAlta.length >= 1 && muyAlta.every((f) => F.band(f.id) === 'muyalta'));
  assert.equal(F.search('', { brand: 'Caputo', band: 'nd' }).length, 0); // combinación vacía
});

test('brands()/types(): facetas derivadas sin duplicados', () => {
  assert.deepEqual(F.brands(), ['Caputo', 'Le 5 Stagioni', 'Naldoni', 'Dallagiovanna', 'Casillo', 'Agricola Piano', 'Supermercado']);
  assert.ok(F.types().includes('00') && F.types().includes('Tipo 1') && F.types().includes('Integrale'));
  assert.equal(new Set(F.types()).size, F.types().length);
  // Orden limpio: refinado (00→0→1→2→Integrale) y genéricas al final.
  assert.deepEqual(F.types(), ['00', '0', 'Tipo 1', 'Tipo 2', 'Integrale', 'Fuerza', 'Común']);
});

test('firstUnused(): por defecto si libre; si no, primera libre; o por defecto si todas usadas', () => {
  assert.equal(F.firstUnused([]), F.DEFAULT_ID);
  const next = F.firstUnused([F.DEFAULT_ID]);
  assert.notEqual(next, F.DEFAULT_ID);
  assert.ok(F.get(next));
  assert.equal(F.firstUnused(F.all().map((f) => f.id)), F.DEFAULT_ID); // todas usadas -> por defecto
});

test('integridad del catálogo: ids únicos, por defecto existente, tamaño esperado', () => {
  const ids = F.all().map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length); // sin ids duplicados
  assert.ok(F.get(F.DEFAULT_ID)); // la harina por defecto existe
  assert.ok(ids.length >= 40); // catálogo cargado (Fase 2)
});
