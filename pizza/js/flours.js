// ==================== BASE DE DATOS DE HARINAS + CAPA DE ACCESO ====================
// Módulo de datos puro (sin i18n, sin DOM): expone window.PizzaFlours.
//
// Cada harina tiene un IDENTIFICADOR DE TEXTO ESTABLE (`id`, un slug). Las recetas
// guardadas y los enlaces compartidos referencian la harina por ESE id, nunca por
// su posición en el array. Así el catálogo se puede reordenar, ampliar o corregir
// sin romper ninguna receta existente (el índice posicional del selector antiguo
// —catalogId— era frágil justo por esto).
//
// Migración: las recetas antiguas guardaban `catalogId` (un entero 0..7, la posición
// en el catálogo viejo). LEGACY_INDEX_TO_ID traduce ese entero al id de texto nuevo;
// migrateRef() acepta indistintamente una harina con `flourId` (nuevo) o `catalogId`
// (antiguo) y devuelve siempre un id de texto.
//
// La UI (calculator.js) habla SOLO con esta capa (all/get/search/brands/types/…),
// nunca con el array directo. Cuando en la Fase 2 los datos se muevan a un JSON
// versionado, o en la Fase 3 se fusionen harinas del usuario, solo cambia este
// módulo: el selector no se entera.
(function () {
  'use strict';

  // ---- Catálogo base. `name` es bilingüe (el resto son datos neutros de idioma).
  // wMin/wMax = rango de fuerza W (0 = sin dato; wMin===wMax cuando la marca da un
  // valor único). `type`: 00/0/Tipo 1/Tipo 2/Integrale (o Fuerza/Común para las de
  // supermercado). El orden es solo de presentación; NO define la identidad (esa es
  // `id`), así que se puede reordenar/ampliar con libertad.
  //
  // IMPORTANTE — no cambies ni reutilices los `id` de las 8 harinas listadas en
  // LEGACY_INDEX_TO_ID (las 6 Caputo históricas + las 2 de supermercado): las
  // recetas antiguas las referencian por ahí. Añadir harinas nuevas es libre.
  const FLOURS = [
    // -- Caputo (Mulino Caputo) --
    { id: 'caputo-manitoba-oro', brand: 'Caputo', line: 'Manitoba Oro', type: '0', wMin: 370, wMax: 390,
      name: { es: 'Caputo Manitoba Oro (Tipo 0)', en: 'Caputo Manitoba Oro (Type 0)' } },
    { id: 'caputo-nuvola-super', brand: 'Caputo', line: 'Nuvola Super', type: '0', wMin: 320, wMax: 340,
      name: { es: 'Caputo Nuvola Super (Tipo 0)', en: 'Caputo Nuvola Super (Type 0)' } },
    { id: 'caputo-ricca', brand: 'Caputo', line: 'Ricca', type: '0', wMin: 320, wMax: 340,
      name: { es: 'Caputo Ricca (Tipo 0)', en: 'Caputo Ricca (Type 0)' } },
    { id: 'caputo-cuoco', brand: 'Caputo', line: 'Cuoco / Saccorosso', type: '00', wMin: 300, wMax: 320,
      name: { es: 'Caputo Cuoco / Saccorosso (Tipo 00)', en: 'Caputo Cuoco / Saccorosso (Type 00)' } },
    { id: 'caputo-nuvola', brand: 'Caputo', line: 'Nuvola', type: '0', wMin: 270, wMax: 290,
      name: { es: 'Caputo Nuvola (Tipo 0)', en: 'Caputo Nuvola (Type 0)' } },
    { id: 'caputo-pizzeria', brand: 'Caputo', line: 'Pizzería', type: '00', wMin: 260, wMax: 270,
      name: { es: 'Caputo Pizzería (Tipo 00)', en: 'Caputo Pizzeria (Type 00)' } },
    { id: 'caputo-tipo-1', brand: 'Caputo', line: 'Tipo 1', type: 'Tipo 1', wMin: 250, wMax: 270,
      name: { es: 'Caputo Tipo 1 (Tipo 1)', en: 'Caputo Tipo 1 (Type 1)' } },
    { id: 'caputo-doppio-zero', brand: 'Caputo', line: 'Doppio Zero', type: '00', wMin: 220, wMax: 240,
      name: { es: 'Caputo Doppio Zero (Tipo 00)', en: 'Caputo Doppio Zero (Type 00)' } },
    { id: 'caputo-classica', brand: 'Caputo', line: 'Classica', type: '00', wMin: 220, wMax: 240,
      name: { es: 'Caputo Classica (Tipo 00)', en: 'Caputo Classica (Type 00)' } },

    // -- Le 5 Stagioni --
    { id: '5stagioni-manitoba', brand: 'Le 5 Stagioni', line: 'Manitoba', type: '0', wMin: 410, wMax: 410,
      name: { es: 'Le 5 Stagioni Manitoba (Tipo 0)', en: 'Le 5 Stagioni Manitoba (Type 0)' } },
    { id: '5stagioni-oro', brand: 'Le 5 Stagioni', line: 'Oro', type: '00', wMin: 390, wMax: 390,
      name: { es: 'Le 5 Stagioni Oro (Tipo 00)', en: 'Le 5 Stagioni Oro (Type 00)' } },
    { id: '5stagioni-la-rustica-tipo-1', brand: 'Le 5 Stagioni', line: 'La Rustica', type: 'Tipo 1', wMin: 380, wMax: 380,
      name: { es: 'Le 5 Stagioni La Rustica (Tipo 1)', en: 'Le 5 Stagioni La Rustica (Type 1)' } },
    { id: '5stagioni-la-rustica-integrale', brand: 'Le 5 Stagioni', line: 'La Rustica Integrale', type: 'Integrale', wMin: 340, wMax: 340,
      name: { es: 'Le 5 Stagioni La Rustica Integrale (Integrale)', en: 'Le 5 Stagioni La Rustica Wholemeal (Whole wheat)' } },
    { id: '5stagioni-superiore', brand: 'Le 5 Stagioni', line: 'Superiore', type: '00', wMin: 330, wMax: 330,
      name: { es: 'Le 5 Stagioni Superiore (Tipo 00)', en: 'Le 5 Stagioni Superiore (Type 00)' } },
    { id: '5stagioni-napoletana-rossa', brand: 'Le 5 Stagioni', line: 'Napoletana Rossa', type: '00', wMin: 310, wMax: 310,
      name: { es: 'Le 5 Stagioni Napoletana Rossa (Tipo 00)', en: 'Le 5 Stagioni Napoletana Rossa (Type 00)' } },
    { id: '5stagioni-napoletana-verde', brand: 'Le 5 Stagioni', line: 'Napoletana Verde', type: '00', wMin: 280, wMax: 280,
      name: { es: 'Le 5 Stagioni Napoletana Verde (Tipo 00)', en: 'Le 5 Stagioni Napoletana Verde (Type 00)' } },
    { id: '5stagioni-classica', brand: 'Le 5 Stagioni', line: 'Classica', type: '00', wMin: 200, wMax: 200,
      name: { es: 'Le 5 Stagioni Classica (Tipo 00)', en: 'Le 5 Stagioni Classica (Type 00)' } },

    // -- Molino Naldoni --
    { id: 'naldoni-mari', brand: 'Naldoni', line: 'Mari', type: '00', wMin: 350, wMax: 350,
      name: { es: 'Naldoni Mari (Tipo 00)', en: 'Naldoni Mari (Type 00)' } },
    { id: 'naldoni-eterea', brand: 'Naldoni', line: 'Eterea', type: '0', wMin: 320, wMax: 320,
      name: { es: 'Naldoni Eterea (Tipo 0)', en: 'Naldoni Eterea (Type 0)' } },
    { id: 'naldoni-lucia', brand: 'Naldoni', line: 'Lucia', type: '00', wMin: 300, wMax: 300,
      name: { es: 'Naldoni Lucia (Tipo 00)', en: 'Naldoni Lucia (Type 00)' } },
    { id: 'naldoni-integrale-bio', brand: 'Naldoni', line: 'Macinata a Pietra Bio', type: 'Integrale', wMin: 300, wMax: 300,
      name: { es: 'Naldoni Macinata a Pietra Bio (Integrale)', en: 'Naldoni Stone-ground Organic (Whole wheat)' } },
    { id: 'naldoni-tipo1-bio', brand: 'Naldoni', line: 'Macinata a Pietra Bio', type: 'Tipo 1', wMin: 300, wMax: 300,
      name: { es: 'Naldoni Macinata a Pietra Bio (Tipo 1)', en: 'Naldoni Stone-ground Organic (Type 1)' } },
    { id: 'naldoni-smorfia', brand: 'Naldoni', line: 'Smorfia', type: '0', wMin: 290, wMax: 290,
      name: { es: 'Naldoni Smorfia (Tipo 0)', en: 'Naldoni Smorfia (Type 0)' } },
    { id: 'naldoni-sofia', brand: 'Naldoni', line: 'Sofia', type: '00', wMin: 260, wMax: 260,
      name: { es: 'Naldoni Sofia (Tipo 00)', en: 'Naldoni Sofia (Type 00)' } },
    { id: 'naldoni-semintegrale', brand: 'Naldoni', line: 'Semintegrale', type: 'Tipo 2', wMin: 250, wMax: 250,
      name: { es: 'Naldoni Semintegrale (Tipo 2)', en: 'Naldoni Semi-wholemeal (Type 2)' } },
    { id: 'naldoni-tina', brand: 'Naldoni', line: 'Tina', type: '00', wMin: 200, wMax: 200,
      name: { es: 'Naldoni Tina (Tipo 00)', en: 'Naldoni Tina (Type 00)' } },

    // -- Molino Dallagiovanna --
    { id: 'dallagiovanna-farpizza-s', brand: 'Dallagiovanna', line: 'FarPizza S Rossa', type: '00', wMin: 390, wMax: 390,
      name: { es: 'Dallagiovanna FarPizza S Rossa (Tipo 00/0)', en: 'Dallagiovanna FarPizza S Rossa (Type 00/0)' } },
    { id: 'dallagiovanna-uniqua-blu', brand: 'Dallagiovanna', line: 'UNIQUA Blu', type: 'Tipo 1', wMin: 380, wMax: 380,
      name: { es: 'Dallagiovanna UNIQUA Blu (Tipo 1)', en: 'Dallagiovanna UNIQUA Blu (Type 1)' } },
    { id: 'dallagiovanna-farpizza-r', brand: 'Dallagiovanna', line: 'FarPizza R Verde', type: '00', wMin: 340, wMax: 340,
      name: { es: 'Dallagiovanna FarPizza R Verde (Tipo 00/0)', en: 'Dallagiovanna FarPizza R Verde (Type 00/0)' } },
    { id: 'dallagiovanna-lanapoletana', brand: 'Dallagiovanna', line: 'laNapoletana', type: '00', wMin: 310, wMax: 310,
      name: { es: 'Dallagiovanna laNapoletana (Tipo 00)', en: 'Dallagiovanna laNapoletana (Type 00)' } },
    { id: 'dallagiovanna-lanapoletana-2', brand: 'Dallagiovanna', line: 'laNapoletana 2.0', type: '0', wMin: 310, wMax: 310,
      name: { es: 'Dallagiovanna laNapoletana 2.0 (Tipo 0)', en: 'Dallagiovanna laNapoletana 2.0 (Type 0)' } },
    { id: 'dallagiovanna-farpizza-n', brand: 'Dallagiovanna', line: 'FarPizza N Blu', type: '00', wMin: 290, wMax: 290,
      name: { es: 'Dallagiovanna FarPizza N Blu (Tipo 00)', en: 'Dallagiovanna FarPizza N Blu (Type 00)' } },
    { id: 'dallagiovanna-farpizza-e', brand: 'Dallagiovanna', line: 'FarPizza E Rosa', type: '00', wMin: 210, wMax: 210,
      name: { es: 'Dallagiovanna FarPizza E Rosa (Tipo 00)', en: 'Dallagiovanna FarPizza E Rosa (Type 00)' } },

    // -- Molino Casillo --
    { id: 'casillo-zero-xl', brand: 'Casillo', line: 'Zero XL', type: '0', wMin: 390, wMax: 390,
      name: { es: 'Casillo Zero XL (Tipo 0)', en: 'Casillo Zero XL (Type 0)' } },
    { id: 'casillo-zero-l', brand: 'Casillo', line: 'Zero L', type: '0', wMin: 340, wMax: 340,
      name: { es: 'Casillo Zero L (Tipo 0)', en: 'Casillo Zero L (Type 0)' } },
    { id: 'casillo-tipo-1', brand: 'Casillo', line: 'Tipo 1', type: 'Tipo 1', wMin: 250, wMax: 340,
      name: { es: 'Casillo Tipo 1 (Tipo 1)', en: 'Casillo Tipo 1 (Type 1)' } },
    { id: 'casillo-integra', brand: 'Casillo', line: 'Integra', type: 'Integrale', wMin: 250, wMax: 320,
      name: { es: 'Casillo Integra (Integrale)', en: 'Casillo Integra (Whole wheat)' } },
    { id: 'casillo-altograno', brand: 'Casillo', line: 'Altograno', type: '0', wMin: 290, wMax: 290,
      name: { es: 'Casillo Altograno (Tipo 0)', en: 'Casillo Altograno (Type 0)' } },
    { id: 'casillo-zero-m', brand: 'Casillo', line: 'Zero M', type: '0', wMin: 290, wMax: 290,
      name: { es: 'Casillo Zero M (Tipo 0)', en: 'Casillo Zero M (Type 0)' } },
    { id: 'casillo-la-pizza', brand: 'Casillo', line: 'La Pizza', type: '00', wMin: 260, wMax: 260,
      name: { es: 'Casillo La Pizza (Tipo 00)', en: 'Casillo La Pizza (Type 00)' } },
    { id: 'casillo-zero-unica', brand: 'Casillo', line: 'Zero Unica', type: '0', wMin: 260, wMax: 260,
      name: { es: 'Casillo Zero Unica (Tipo 0)', en: 'Casillo Zero Unica (Type 0)' } },

    // -- Agricola Piano --
    { id: 'piano-forte-320', brand: 'Agricola Piano', line: 'Forte 320', type: '0', wMin: 300, wMax: 360,
      name: { es: 'Agricola Piano Forte 320 (Tipo 0)', en: 'Agricola Piano Forte 320 (Type 0)' } },
    { id: 'piano-profumata-290', brand: 'Agricola Piano', line: 'Profumata 290', type: 'Tipo 1', wMin: 270, wMax: 290,
      name: { es: 'Agricola Piano Profumata 290 (Tipo 1)', en: 'Agricola Piano Profumata 290 (Type 1)' } },
    { id: 'piano-mediterranea', brand: 'Agricola Piano', line: 'Mediterranea', type: '0', wMin: 270, wMax: 290,
      name: { es: 'Agricola Piano Mediterranea (Tipo 0)', en: 'Agricola Piano Mediterranea (Type 0)' } },
    { id: 'piano-rustica-260', brand: 'Agricola Piano', line: 'Rustica 260', type: 'Tipo 2', wMin: 240, wMax: 260,
      name: { es: 'Agricola Piano Rustica 260 (Tipo 2)', en: 'Agricola Piano Rustica 260 (Type 2)' } },
    { id: 'piano-versatile-240', brand: 'Agricola Piano', line: 'Versatile 240', type: '0', wMin: 200, wMax: 240,
      name: { es: 'Agricola Piano Versatile 240 (Tipo 0)', en: 'Agricola Piano Versatile 240 (Type 0)' } },

    // -- Genéricas de supermercado (para quien no tiene acceso a harinas de molino;
    //    además las referencian recetas antiguas por su id: NO borrar) --
    { id: 'fuerza-supermercado', brand: 'Supermercado', line: '', type: 'Fuerza', wMin: 0, wMax: 0,
      name: { es: 'Harina de Fuerza (Supermercado)', en: 'Bread/Strong Flour (Supermarket)' } },
    { id: 'comun-supermercado', brand: 'Supermercado', line: '', type: 'Común', wMin: 0, wMax: 0,
      name: { es: 'Harina de Trigo Común (Supermercado)', en: 'All-Purpose Wheat Flour (Supermarket)' } }
  ];

  // Traducción posición-antigua -> id-nuevo. El ORDEN de este array SÍ es sagrado:
  // es el orden exacto del catálogo antiguo (catalogId 0..7). No reordenar ni borrar
  // entradas; solo se puede añadir al final si en el futuro hiciera falta.
  const LEGACY_INDEX_TO_ID = [
    'caputo-doppio-zero',   // 0
    'caputo-pizzeria',      // 1
    'caputo-nuvola',        // 2
    'caputo-cuoco',         // 3
    'caputo-manitoba-oro',  // 4
    'caputo-tipo-1',        // 5
    'fuerza-supermercado',  // 6
    'comun-supermercado'    // 7
  ];

  // Harina por defecto (fallback de referencias inválidas y estreno de fila nueva).
  // La napolitana clásica del molino de referencia; se garantiza que existe abajo.
  const DEFAULT_ID = 'caputo-pizzeria';

  // Normaliza para buscar: minúsculas y sin acentos ("Pizzería" -> "pizzeria").
  function norm(s) {
    return (s == null ? '' : String(s)).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // Índice por id + cadena de búsqueda precomputada (marca + línea + tipo + nombres).
  const byId = new Map();
  FLOURS.forEach(function (f) {
    f._search = norm([f.brand, f.line, f.type, f.name.es, f.name.en].join(' '));
    byId.set(f.id, f);
  });

  // Cadena de fuerza para mostrar: rango "W300/320", valor único "W410", o "" sin dato.
  function w(id) {
    const f = byId.get(id);
    if (!f || (!f.wMin && !f.wMax)) return '';
    if (f.wMin && f.wMax && f.wMin !== f.wMax) return 'W' + f.wMin + '/' + f.wMax;
    return 'W' + (f.wMax || f.wMin);
  }

  // Valor NUMÉRICO de fuerza W para cálculo (no presentación): punto medio del rango
  // wMin/wMax (igual criterio que bandOf). 0 si la harina no tiene dato de fuerza.
  function wValue(id) {
    const f = byId.get(id);
    if (!f || (!f.wMin && !f.wMax)) return 0;
    return (f.wMin && f.wMax) ? (f.wMin + f.wMax) / 2 : (f.wMax || f.wMin);
  }

  // Banda de fuerza (para el filtro y la insignia), por el punto medio del rango W:
  //   baja < 250 ≤ media < 290 ≤ alta < 340 ≤ muyalta ; sin rango -> 'nd' (sin dato).
  // Etiquetas todas en femenino (concuerdan con "fuerza"): Baja/Media/Alta/Muy alta.
  function bandOf(f) {
    if (!f || (!f.wMin && !f.wMax)) return 'nd';
    const mid = (f.wMin && f.wMax) ? (f.wMin + f.wMax) / 2 : (f.wMax || f.wMin);
    if (mid >= 340) return 'muyalta';
    if (mid >= 290) return 'alta';
    if (mid >= 250) return 'media';
    return 'baja';
  }
  const BANDS = ['baja', 'media', 'alta', 'muyalta', 'nd']; // orden de presentación del filtro

  function all() { return FLOURS.slice(); }
  function get(id) { return byId.get(id) || null; }

  // Nombre completo en el idioma pedido ("Caputo Pizzería (Tipo 00)"); si el id no
  // existe, cae a la harina por defecto (nunca devuelve vacío ni rompe la UI).
  function name(id, lang) {
    const f = byId.get(id) || byId.get(DEFAULT_ID);
    return f.name[lang] || f.name.es;
  }

  // Nombre PRINCIPAL para mostrar: marca + producto, sin el paréntesis final
  // ("Caputo Pizzería"). Se deriva del nombre completo bilingüe partiéndolo por el
  // último " (", así reutiliza la localización existente sin datos extra.
  function mainName(id, lang) {
    const full = name(id, lang);
    const i = full.lastIndexOf(' (');
    return i > 0 ? full.slice(0, i) : full;
  }
  // Etiqueta SECUNDARIA: el contenido del paréntesis final ("Tipo 00", "Integrale",
  // "Supermercado"…). Vacío si el nombre no tiene paréntesis.
  function subLabel(id, lang) {
    const m = name(id, lang).match(/\(([^)]*)\)\s*$/);
    return m ? m[1] : '';
  }

  // Etiqueta LOCALIZADA y con formato uniforme de un valor de `type`, para los chips
  // del filtro (el dato crudo es un token neutro e inconsistente: "00" vs "Tipo 1").
  // Todos los numerados llevan "Tipo/Type"; las categorías genéricas van traducidas.
  const TYPE_LABELS = {
    '00':        { es: 'Tipo 00',  en: 'Type 00' },
    '0':         { es: 'Tipo 0',   en: 'Type 0' },
    'Tipo 1':    { es: 'Tipo 1',   en: 'Type 1' },
    'Tipo 2':    { es: 'Tipo 2',   en: 'Type 2' },
    'Integrale': { es: 'Integrale', en: 'Whole wheat' },
    'Fuerza':    { es: 'Fuerza',   en: 'Bread flour' },
    'Común':     { es: 'Común',    en: 'All-purpose' }
  };
  function typeLabel(type, lang) {
    const t = TYPE_LABELS[type];
    return t ? (t[lang] || t.es) : type;
  }
  // Orden limpio de tipos para el filtro (explícito: Object.keys reordenaría "0"
  // antes que "00" al ser clave tipo-índice). Refinado 00→0→1→2→Integrale, genéricas al final.
  const TYPE_ORDER = ['00', '0', 'Tipo 1', 'Tipo 2', 'Integrale', 'Fuerza', 'Común'];

  function band(id) { return bandOf(byId.get(id)); }

  // Marcas presentes en el catálogo, en orden de primera aparición (sin duplicados).
  function uniqueBy(key) {
    const seen = new Set(); const out = [];
    FLOURS.forEach(function (f) { const v = f[key]; if (v && !seen.has(v)) { seen.add(v); out.push(v); } });
    return out;
  }
  function brands() { return uniqueBy('brand'); }
  // Tipos presentes, en ORDEN LIMPIO: escala de refinado (00 → 0 → 1 → 2 →
  // Integrale) y genéricas al final. Se toma el orden de TYPE_LABELS; cualquier
  // tipo no listado ahí iría al final.
  function types() {
    const present = new Set();
    FLOURS.forEach(function (f) { if (f.type) present.add(f.type); });
    const out = TYPE_ORDER.filter(function (t) { return present.has(t); });
    present.forEach(function (t) { if (TYPE_ORDER.indexOf(t) === -1) out.push(t); });
    return out;
  }

  // Buscador + filtros combinables. `filters` = { brand, type, band } (cualquiera
  // null/ausente = sin filtrar). La query casa si TODOS sus términos aparecen en la
  // cadena de búsqueda (marca/línea/tipo/nombre).
  function search(query, filters) {
    filters = filters || {};
    const terms = norm(query).trim().split(/\s+/).filter(Boolean);
    return FLOURS.filter(function (f) {
      if (filters.brand && f.brand !== filters.brand) return false;
      if (filters.type && f.type !== filters.type) return false;
      if (filters.band && bandOf(f) !== filters.band) return false;
      for (let i = 0; i < terms.length; i++) { if (f._search.indexOf(terms[i]) === -1) return false; }
      return true;
    });
  }

  // Traduce una referencia de harina de receta (nueva `flourId` o antigua
  // `catalogId`) a un id de texto. Base de la migración retrocompatible.
  function migrateRef(f) {
    if (!f || typeof f !== 'object') return DEFAULT_ID;
    if (typeof f.flourId === 'string' && f.flourId) return f.flourId;
    const ci = f.catalogId;
    if (typeof ci === 'number' && ci >= 0 && ci < LEGACY_INDEX_TO_ID.length) return LEGACY_INDEX_TO_ID[ci];
    return DEFAULT_ID;
  }

  // Id para estrenar una fila nueva sin duplicar: la harina por defecto si está
  // libre; si no, el primer id del catálogo no usado; o DEFAULT_ID si están todas.
  function firstUnused(usedIds) {
    const used = (usedIds instanceof Set) ? usedIds : new Set(usedIds || []);
    if (!used.has(DEFAULT_ID)) return DEFAULT_ID;
    for (let i = 0; i < FLOURS.length; i++) { if (!used.has(FLOURS[i].id)) return FLOURS[i].id; }
    return DEFAULT_ID;
  }

  const api = {
    all: all, get: get, name: name, mainName: mainName, subLabel: subLabel,
    typeLabel: typeLabel, w: w, wValue: wValue, band: band, bandsOrder: BANDS,
    brands: brands, types: types, search: search,
    migrateRef: migrateRef, firstUnused: firstUnused,
    DEFAULT_ID: DEFAULT_ID, LEGACY_INDEX_TO_ID: LEGACY_INDEX_TO_ID
  };

  if (typeof window !== 'undefined') window.PizzaFlours = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // tests (node --test)
})();
