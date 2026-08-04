// ==================== CALCULADORA ====================
// Lógica central: parámetros de la masa, mezcla de harinas, cálculo de
// ingredientes, persistencia en localStorage, recetas guardadas y copiar receta.
// Depende de window.PizzaI18N (js/i18n.js), que debe cargarse antes.

// Lee un valor decimal de un campo de texto tolerando la coma como separador
// decimal (es-ES): "63,5" -> 63.5. Devuelve NaN si no hay número. Todos los
// campos numéricos decimales leen a través de aquí para aceptar coma o punto.
function parseDecimal(v){
  const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '.'));
  return isFinite(n) ? n : NaN;
}

// stepValue es global porque lo usan los onclick="..." de los botones +/− del HTML.
window.stepValue = function(id, delta, minVal, maxVal) {
  const input = document.getElementById(id);
  let val = parseDecimal(input.value) || 0;
  val += delta;
  val = Math.round(val * 10) / 10;
  if(minVal !== undefined && val < minVal) val = minVal;
  if(maxVal !== undefined && val > maxVal) val = maxVal;
  input.value = val;
  input.dispatchEvent(new Event('input'));
};

// Mínimo de horas de fermentación a temperatura ambiente: 2 h normalmente, pero 0 h si la
// fase fría está activa (permite meter la masa directa a la nevera). Global porque lo usan
// el onclick del stepper de #horas y clampHoras dentro de la calculadora.
window.ambHorasMin = function() {
  const fr = document.getElementById('fridgeToggle');
  return (fr && fr.checked) ? 0 : 2;
};

// Stepper del peso por pizza: el paso depende de la unidad activa (10 g / 0,5 oz).
window.stepPeso = function(dir) {
  const input = document.getElementById('pesoPaneto');
  const imperial = window.PizzaUnits && window.PizzaUnits.isImperial();
  const step = imperial ? 0.5 : 10;
  const min = imperial ? 3.5 : 100;
  let v = (parseDecimal(input.value) || 0) + dir * step;
  v = imperial ? Math.round(v * 10) / 10 : Math.round(v);
  if (v < min) v = min;
  input.value = v;
  input.dispatchEvent(new Event('input'));
};

// Stepper de la sal. El paso y el tope se leen de los atributos que fija
// renderSaltField según la unidad: 0,1 (máx 10) en % del agua, 1 (máx 100) en g/L.
window.stepSal = function(dir) {
  const input = document.getElementById('sal');
  const step = parseFloat(input.getAttribute('step')) || 0.1;
  const max = parseFloat(input.getAttribute('max')) || 10;
  const f = step < 1 ? 10 : 1; // decimales según el paso
  let v = (parseDecimal(input.value) || 0) + dir * step;
  v = Math.round(v * f) / f;
  if (v < 0) v = 0;
  if (v > max) v = max;
  input.value = v;
  input.dispatchEvent(new Event('input'));
};

// Stepper de la levadura fresca (% del peso de la harina), paso 0,01. Solo en Manual.
// El manual se mueve en [0,01 %, 3 %] (mismos topes que la fórmula automática).
window.stepYeast = function(dir) {
  const input = document.getElementById('levadura');
  let v = (parseDecimal(input.value) || 0) + dir * 0.01;
  v = Math.round(v * 100) / 100;
  if (v < 0.01) v = 0.01;
  if (v > 3) v = 3;
  input.value = v;
  input.dispatchEvent(new Event('input'));
};

// Stepper de la temperatura de la nevera. El canónico es SIEMPRE °C (rango [2,18]); el
// campo se muestra en la unidad activa (°C/°F). Damos el paso en °C aunque se vea en
// °F (una nevera se ajusta en grados enteros °C), evitando conversiones "atascadas".
window.stepColdTemp = function(dir) {
  const U = window.PizzaUnits;
  const input = document.getElementById('tempFrio');
  const f = !!(U && U.isFahrenheit && U.isFahrenheit());
  let shown = parseDecimal(input.value);
  if (!isFinite(shown)) shown = f ? 39 : 4;
  let c = f ? Math.round((shown - 32) * 5 / 9) : Math.round(shown);
  c = Math.max(2, Math.min(18, c + dir));
  input.value = Math.round(f ? c * 9 / 5 + 32 : c);
  input.dispatchEvent(new Event('input'));
};

(function(){
  const I18N = window.PizzaI18N;
  const U = window.PizzaUnits; // formato/conversión de unidades (métrico/imperial)
  const D = window.PizzaDough; // fórmula de la masa (núcleo de cálculo, js/dough.js)
  const COLORES_HARINA = ['var(--color-h1)', 'var(--color-h2)', 'var(--color-h3)', 'var(--color-h4)', 'var(--color-h5)'];
  const STORAGE_KEY = 'edu_pizza_calc_settings_v16';

  // Base de datos de harinas + capa de acceso (js/flours.js). La UI referencia cada
  // harina por su id de texto ESTABLE (flour.flourId), nunca por su posición: así el
  // catálogo puede crecer/reordenarse sin romper recetas guardadas ni enlaces.
  const F = window.PizzaFlours;

  // Nombre COMPLETO de una harina ("Caputo Pizzería (Tipo 00)"): se usa donde el
  // contexto no tiene la línea de detalle (barra de proporción, desglose, receta).
  function flourName(id){ return F.name(id, I18N.getLang()); }
  // Nombre PRINCIPAL para las etiquetas de fila/selector ("Caputo Pizzería").
  function flourMain(id){ return F.mainName(id, I18N.getLang()); }
  // Escapa texto de control del usuario (nombres de harina propia) antes de inyectarlo
  // vía innerHTML o dentro de un atributo. NO usar para el texto de receta (va en crudo).
  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
  }
  // Pills de la harina: tipo (neutra) + fuerza W (color según banda). La PALABRA de
  // banda (Alta/Media…) no se muestra —vive solo en el filtro—; el color de la pill
  // de W conserva esa pista para escanear de un vistazo.
  function flourTagsHtml(id){
    const sub = F.subLabel(id, I18N.getLang()); // "Tipo 00" / "Integrale" / "Supermercado"
    const wv = F.w(id);
    let h = '';
    if (sub) h += `<span class="flour-tag flour-tag-type">${sub}</span>`;
    if (wv) h += `<span class="flour-tag flour-tag-w fp-band--${F.band(id)}">${wv}</span>`;
    return h;
  }

  // Normaliza un array de harinas al formato interno { id (nº de fila), flourId
  // (texto), pct, locked }, MIGRANDO referencias antiguas (catalogId entero) a id de
  // texto. Es el punto único por el que pasa todo lo que se ingiere: ajustes de
  // localStorage, recetas guardadas/importadas y valores por defecto.
  function migrateFlours(arr){
    const src = Array.isArray(arr) ? arr : [];
    return src.map((f, i) => ({
      id: (f && parseInt(f.id, 10)) || (i + 1),
      flourId: F.migrateRef(f),
      pct: (f && isFinite(parseFloat(f.pct))) ? parseFloat(f.pct) : 0,
      locked: !!(f && f.locked)
    }));
  }

  const el = {
    numPaneteos: document.getElementById('numPaneteos'),
    pesoPaneto: document.getElementById('pesoPaneto'),
    temperatura: document.getElementById('temperatura'),
    tempValue: document.getElementById('tempValue'),
    tempUnit: document.getElementById('tempUnit'),
    horas: document.getElementById('horas'),
    fridgeToggle: document.getElementById('fridgeToggle'),
    fridgePhase: document.getElementById('fridgePhase'),
    ambientRestTip: document.getElementById('ambientRestTip'),
    tempFrio: document.getElementById('tempFrio'),
    tempFrioUnit: document.getElementById('tempFrioUnit'),
    horasFrio: document.getElementById('horasFrio'),
    ambientLongNote: document.getElementById('ambientLongNote'),
    fermTotal: document.getElementById('fermTotal'),
    fermTotalValue: document.getElementById('fermTotalValue'),
    tempNote: document.getElementById('tempNote'),
    tempNoteText: document.getElementById('tempNoteText'),
    coldNote: document.getElementById('coldNote'),
    coldNoteText: document.getElementById('coldNoteText'),
    warnHighYeast: document.getElementById('warnHighYeast'),
    flourStrengthValue: document.getElementById('flourStrengthValue'),
    flourWarn: document.getElementById('flourWarn'),
    flourWarnText: document.getElementById('flourWarnText'),
    fermTipsLink: document.getElementById('fermTipsLink'),
    hidratacion: document.getElementById('hidratacion'),
    sal: document.getElementById('sal'),
    levadura: document.getElementById('levadura'),
    salStepper: document.getElementById('salStepper'),
    yeastStepper: document.getElementById('yeastStepper'),
    yeastModeChip: document.getElementById('yeastModeChip'),
    yeastEditBtn: document.getElementById('yeastEditBtn'),
    salHint: document.getElementById('salHint'),
    yeastHint: document.getElementById('yeastHint'),
    hydrationInfo: document.getElementById('hydrationInfo'),
    hydrationInfoHead: document.getElementById('hydrationInfoHead'),
    hydrationInfoText: document.getElementById('hydrationInfoText'),
    hydMarker: document.getElementById('hydMarker'),
    warningBanner: document.getElementById('warningBanner'),
    resultsBody: document.getElementById('resultsBody'),
    disabledOverlay: document.getElementById('disabledOverlay'),
    resultsBadge: document.getElementById('resultsBadge'),
    totalMasa: document.getElementById('totalMasa'),
    batchContext: document.getElementById('batchContext'),
    ingredientBar: document.getElementById('ingredientBar'),
    totalHarina: document.getElementById('totalHarina'),
    totalAgua: document.getElementById('totalAgua'),
    aguaPct: document.getElementById('aguaPct'),
    totalSal: document.getElementById('totalSal'),
    salPct: document.getElementById('salPct'),
    totalLevadura: document.getElementById('totalLevadura'),
    levaduraPct: document.getElementById('levaduraPct'),
    totalLevaduraSeca: document.getElementById('totalLevaduraSeca'),
    resultFermentBody: document.getElementById('resultFermentBody'),
    flourBreakdown: document.getElementById('flourBreakdown'),
    flourRowsContainer: document.getElementById('flourRowsContainer'),
    progressBar: document.getElementById('progressBar'),
    progressStatus: document.getElementById('progressStatus'),
    addFlourBtn: document.getElementById('addFlourBtn'),
    resetBtn: document.getElementById('resetBtn'),
    cardTanda: document.getElementById('cardTanda'),
    cardFerm: document.getElementById('cardFerm'),
    cardParams: document.getElementById('cardParams'),
    cardFlour: document.getElementById('cardFlour'),
    summaryTanda: document.getElementById('summaryTanda'),
    summaryFerm: document.getElementById('summaryFerm'),
    summaryParams: document.getElementById('summaryParams'),
    summaryFlour: document.getElementById('summaryFlour')
  };

  // Barra-resumen fija (solo móvil)
  const mobileSummary = document.getElementById('mobileSummary');
  const ms = {
    total: document.getElementById('ms-total'),
    harina: document.getElementById('ms-harina'),
    agua: document.getElementById('ms-agua'),
    sal: document.getElementById('ms-sal'),
    lev: document.getElementById('ms-lev')
  };

  // Preferencia global (Configuración → Avisos): mostrar/ocultar los banners de aviso
  // no bloqueantes. Se guarda aparte de la receta (es una preferencia de interfaz).
  const WARN_KEY = 'edu_pizza_warnings_v1';
  let warningsEnabled = true;
  try { warningsEnabled = localStorage.getItem(WARN_KEY) !== 'off'; } catch (e) {}

  // Micro-interacción: reinicia y relanza la animación "result-pop" del total.
  // Se llama solo cuando el número cambia de verdad (no en cada tecla), y nunca
  // en la primera pintura (masaInitialized). prefers-reduced-motion la anula en CSS.
  let masaInitialized = false;
  function pulseRecalc(node){
    if (!node) return;
    node.classList.remove('recalc');
    void node.offsetWidth; // fuerza reflow para poder relanzar la animación
    node.classList.add('recalc');
  }
  // Fija el texto de una cifra de la barra fija y la hace "latir" solo si cambió
  // (y no es la primera pintura).
  function setMsVal(node, text, firstRun){
    if (!node) return;
    if (node.textContent !== text) {
      node.textContent = text;
      if (!firstRun) pulseRecalc(node);
    }
  }
  // Iconos (línea) para el resumen de la tarjeta "Parámetros de la masa".
  const ICON_WATER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.7l5.7 5.6a8 8 0 1 1-11.4 0z"></path></svg>';
  const ICON_SALT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8a1 1 0 0 0 1-1.08L16.3 9H7.7l-.7 10.92A1 1 0 0 0 8 21Z"></path><path d="M8.5 9V6a3.5 3.5 0 0 1 7 0v3"></path></svg>';
  const ICON_YEAST = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="14" r="4"></circle><circle cx="16.5" cy="8.5" r="2.5"></circle><circle cx="17" cy="16" r="1.5"></circle></svg>';
  const WARN_MINI = '<svg class="cs-warn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  const ICON_SPARK = '<svg class="cs-auto-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.7 5.1 5.1 1.7-5.1 1.7L12 15.6l-1.7-5.1L5.2 8.8l5.1-1.7z"/></svg>';
  // Chips de aviso resumido para la tarjeta colapsada (ámbar).
  function warnChipsHtml(shorts){
    if (!shorts || !shorts.length) return '';
    return '<span class="card-sum-warns">' + shorts.map(function (s) {
      return '<span class="card-sum-warn">' + WARN_MINI + escapeHtml(s) + '</span>';
    }).join('') + '</span>';
  }

  // Muestra el punto de aviso de una tarjeta si alguno de sus avisos está visible.
  function setCardDot(card, notes){
    if (!card) return;
    const dot = card.querySelector('.card-warn-dot');
    if (!dot) return;
    dot.hidden = !notes.some(n => n && !n.hidden);
  }

  // Resúmenes de las tarjetas colapsadas (se ven al plegar) + puntos de aviso.
  // Se llama al final de calcular(), así reflejan siempre el estado actual.
  function updateCards(){
    if (el.summaryTanda){
      const n = Math.max(1, parseDecimal(el.numPaneteos.value) || 0);
      el.summaryTanda.textContent = n + ' ' + I18N.t('recipePizzas').toLowerCase() + ' ' +
        I18N.t('recipeOf') + ' ' + U.formatWeight(pesoG);
    }
    // Valores para el resumen de Fermentación y los avisos resumidos.
    const temp = parseInt(el.temperatura.value, 10);
    const horas = clampHoras(el.horas.value);
    const coldH = coldHoursActive();
    const coldT = coldTempC();
    // Avisos resumidos activos de la tarjeta Fermentación (mismos criterios que calcular()).
    const fermShorts = [];
    if (el.tempNote && !el.tempNote.hidden) fermShorts.push(I18N.t(temp > 28 ? 'warnShortTempHigh' : 'warnShortTempLow'));
    if (el.ambientLongNote && !el.ambientLongNote.hidden) fermShorts.push(I18N.t('warnShortAmbientLong'));
    if (el.coldNote && !el.coldNote.hidden) {
      let ck = 'warnShortColdLong';
      if (coldH > 0 && coldH < 12) ck = 'warnShortColdShort';
      else { const thr = coldHotThreshold(coldT); if (thr != null && coldH > thr) ck = 'warnShortColdHot'; }
      fermShorts.push(I18N.t(ck));
    }
    // La levadura vive ahora en Fermentación, así que su aviso también resume aquí.
    if (el.warnHighYeast && !el.warnHighYeast.hidden) fermShorts.push(I18N.t('warnShortYeast'));
    if (el.summaryFerm){
      const atW = I18N.t('fermAt');
      const sep = '<span class="card-sum-sep" aria-hidden="true"></span>';
      const parts = ['<span class="ferm-sum-phase">' + U.formatNumber(horas, 0) + ' h ' + atW + ' ' + U.tempValue(temp) + U.tempUnit() + '</span>'];
      if (el.fridgeToggle && el.fridgeToggle.checked){
        parts.push('<span class="ferm-sum-phase">' + U.formatNumber(coldH, 0) + ' h ' + atW + ' ' + U.tempValue(coldT) + U.tempUnit() + '</span>');
      }
      // La levadura va con el MISMO estilo que las fases (texto + mismo separador vertical),
      // y una chispa ✦ verde como único indicador de "automático" (sin píldora ni icono
      // propio, para que la fila tenga la misma estructura de principio a fin).
      const yv = U.formatNumber(parseDecimal(el.levadura.value) || 0, 2) + '%';
      const magic = (yeastMode === 'auto')
        ? '<span class="ferm-sum-magic" title="' + I18N.t('modeAuto') + '">' + ICON_SPARK + '</span>' : '';
      parts.push('<span class="ferm-sum-phase ferm-sum-yeast">' + ICON_YEAST + '<span>' + yv + '</span>' + magic + '</span>');
      el.summaryFerm.innerHTML = parts.join(sep) + warnChipsHtml(fermShorts);
    }
    if (el.summaryParams){
      const hid = U.formatNumber(parseDecimal(el.hidratacion.value) || 0, 1) + '%';
      // Unidad mínima en el resumen: la base ("agua"/"harina") se sobreentiende por el
      // icono, igual que hidratación y levadura no la explicitan. % harina → "%", g/L → "g/L".
      const salTxt = U.formatNumber(parseDecimal(el.sal.value) || 0) + (saltIsFlour() ? '%' : ' g/L');
      el.summaryParams.innerHTML =
        '<span class="card-sum-item">' + ICON_WATER + hid + '</span>' +
        '<span class="card-sum-sep" aria-hidden="true"></span>' +
        '<span class="card-sum-item">' + ICON_SALT + salTxt + '</span>';
    }
    if (el.summaryFlour){
      const w = el.flourStrengthValue ? el.flourStrengthValue.textContent : '';
      const label = (flours.length === 1)
        ? flourName(flours[0].flourId)
        : (flours.length + ' ' + I18N.t('flourCountWord'));
      const flShorts = (el.flourWarn && !el.flourWarn.hidden) ? [I18N.t('warnShortFlour')] : [];
      el.summaryFlour.innerHTML = '<span class="card-sum-item">' + escapeHtml(label) +
        (w && w !== '—' ? ' · ' + escapeHtml(w) : '') + '</span>' + warnChipsHtml(flShorts);
    }
    setCardDot(el.cardFerm, [el.tempNote, el.ambientLongNote, el.coldNote, el.warnHighYeast]);
    setCardDot(el.cardParams, []);
    setCardDot(el.cardFlour, [el.flourWarn]);
  }

  // Rango de hidratación: la napolitana clásica vive en 55,5%+, pero permitimos
  // bajar hasta el 50% (masa densa, por debajo del estándar). La barra (50%→85%+)
  // y las notas de color cubren desde esa banda "densa" hasta la extrema.
  const HID_MIN = 50, HID_MAX = 100;
  function clampHidratacion(v) {
    const n = parseDecimal(v);
    if (!isFinite(n)) return HID_MIN;
    return Math.max(HID_MIN, Math.min(HID_MAX, n));
  }

  // Horas de fermentación a temperatura ambiente. Máximo 96 h; el MÍNIMO es dinámico
  // (ambHorasMin): 2 h normalmente, pero 0 h si la fase fría está activa (se permite meter
  // la masa directa a la nevera). Un valor no válido cae a 24 h, la referencia por defecto
  // (24 h a 23 °C, la napolitana clásica de siempre).
  const HORAS_MAX = 96, HORAS_DEFAULT = 24;
  function clampHoras(v) {
    const n = parseInt(v, 10);
    if (!isFinite(n)) return HORAS_DEFAULT;
    return Math.max(window.ambHorasMin(), Math.min(HORAS_MAX, n));
  }

  // Fermentación en nevera (fase fría opcional). Horas [0, 96]. Temperatura [2, 18] °C:
  // el canónico es SIEMPRE °C, pero el campo se muestra/edita en la unidad activa
  // (°C/°F). Ambiente y nevera son fases independientes (sin tope combinado).
  function clampColdHoras(v) {
    const n = parseInt(v, 10);
    if (!isFinite(n)) return 0;
    return Math.max(0, Math.min(96, n));
  }
  function clampColdTempC(v) {
    const n = Math.round(parseFloat(v));
    if (!isFinite(n)) return 4;
    return Math.max(2, Math.min(18, n));
  }
  // ¿El campo de la nevera se muestra ahora mismo en °F? Se mantiene sincronizado con
  // la unidad activa y sirve para convertir el campo al cambiar de unidad.
  let fridgeShownF = false;
  // Temperatura canónica de la nevera en °C (entero, [2,18]), leída del campo según la
  // unidad mostrada. Es lo que usan la fórmula y los textos.
  function coldTempC() {
    const v = parseDecimal(el.tempFrio.value);
    if (!isFinite(v)) return 4;
    return clampColdTempC(U.isFahrenheit() ? (v - 32) * 5 / 9 : v);
  }
  // Pinta el campo de la nevera desde un valor canónico °C, en la unidad activa.
  function renderColdTempField(c) {
    if (!el.tempFrio) return;
    el.tempFrio.value = Math.round(U.tempValue(clampColdTempC(c)));
    if (el.tempFrioUnit) el.tempFrioUnit.textContent = U.tempUnit();
    fridgeShownF = U.isFahrenheit();
  }
  // Reconvierte el campo de la nevera cuando la unidad EFECTIVA de temperatura cambia
  // (p. ej. al pasar el peso a imperial con la temperatura en modo 'auto'). Usa fridgeShownF
  // —la unidad en que se pintó por última vez— para interpretar el valor actual sin ambigüedad.
  function syncFridgeTempUnit(){
    if (el.tempFrio && U.isFahrenheit() !== fridgeShownF) {
      const v = parseDecimal(el.tempFrio.value);
      const c = isFinite(v) ? (fridgeShownF ? (v - 32) * 5 / 9 : v) : 4;
      renderColdTempField(clampColdTempC(c));
    }
  }
  // Horas de la fase fría que cuentan (0 si la nevera está desactivada).
  function coldHoursActive() {
    return el.fridgeToggle.checked ? clampColdHoras(el.horasFrio.value) : 0;
  }
  // Umbral de horas en frío a partir del cual la temperatura de la nevera acelera
  // demasiado la levadura y exige harina de gran fuerza (aviso coldNoteHot). Cuanto
  // más cálida la nevera, antes se alcanza: ≥14 °C→24 h · 10-13 °C→36 h · 7-9 °C→48 h.
  // Por debajo de 7 °C (nevera normal) no aplica este aviso.
  function coldHotThreshold(tC) {
    if (tC >= 14) return 24;
    if (tC >= 10) return 36;
    if (tC >= 7) return 48;
    return null;
  }
  // Muestra/oculta la fase de nevera según el interruptor.
  function applyFridgeVisibility() {
    if (el.fridgePhase) el.fridgePhase.hidden = !el.fridgeToggle.checked;
    // La visibilidad del consejo de reposo la decide calcular(): nevera activa Y ambiente < 2 h.
  }
  // g/kg de levadura fresca en modo Auto según el estado actual de la interfaz
  // (fase ambiente + fase nevera si está activada).
  function autoYeastGkg() {
    return D.yeastPerKgFlour(
      clampHoras(el.horas.value),
      parseInt(el.temperatura.value, 10) || 18,
      coldHoursActive(),
      coldTempC()
    );
  }

  // Levadura en modo Manual: % del peso de la harina, topado a [0,01 %, 3 %], los
  // mismos límites de seguridad que la fórmula automática. Valor no válido → 0,01 %.
  const YEAST_MANUAL_MIN = 0.01, YEAST_MANUAL_MAX = 3;
  function clampYeastPct(v) {
    const n = parseDecimal(v);
    if (!isFinite(n)) return YEAST_MANUAL_MIN;
    return Math.max(YEAST_MANUAL_MIN, Math.min(YEAST_MANUAL_MAX, Math.round(n * 100) / 100));
  }

  const defaultSettings = {
    numPaneteos: 6,
    pesoPaneto: 280,
    temperatura: 23,
    horas: 24,
    fridgeOn: false,   // fermentación mixta (nevera) desactivada por defecto
    tempFrio: 4,       // °C de la nevera (fase fría)
    horasFrio: 24,     // horas en nevera (fase fría)
    hidratacion: 63,
    sal: 40,
    salMode: 'manual',      // la sal ya no tiene modo; siempre editable (valor recomendado por defecto)
    yeastMode: 'auto',      // 'auto' = según temperatura | 'manual' = valor fijo
    manualYeastPerKg: 1.0,  // g de levadura fresca por kg de harina (modo Manual)
    flours: [
      { id: 1, flourId: 'caputo-pizzeria', pct: 75, locked: false },
      { id: 2, flourId: 'caputo-manitoba-oro', pct: 15, locked: false },
      { id: 3, flourId: 'caputo-tipo-1', pct: 10, locked: false }
    ]
  };

  function loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("No se pudo cargar la configuración", e);
    }
    return defaultSettings;
  }

  function saveSettings() {
    const settingsToSave = {
      numPaneteos: parseDecimal(el.numPaneteos.value),
      pesoPaneto: pesoG,
      temperatura: parseInt(el.temperatura.value, 10),
      horas: clampHoras(el.horas.value),
      fridgeOn: el.fridgeToggle.checked,
      tempFrio: coldTempC(),
      horasFrio: clampColdHoras(el.horasFrio.value),
      hidratacion: parseDecimal(el.hidratacion.value),
      sal: salGL,
      salMode: salMode,
      yeastMode: yeastMode,
      manualYeastPerKg: manualYeastPerKg,
      flours: flours
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsToSave));
    } catch (e) {}
  }

  const initData = loadSettings();
  el.numPaneteos.value = initData.numPaneteos !== undefined ? initData.numPaneteos : defaultSettings.numPaneteos;
  el.temperatura.value = initData.temperatura !== undefined ? initData.temperatura : defaultSettings.temperatura;
  // La fase fría debe fijarse ANTES de topar las horas: ambHorasMin() depende de ella (con
  // nevera activa el mínimo es 0, así se respeta un ambiente de 0 h guardado).
  el.fridgeToggle.checked = initData.fridgeOn !== undefined ? !!initData.fridgeOn : defaultSettings.fridgeOn;
  el.horas.value = initData.horas !== undefined ? clampHoras(initData.horas) : defaultSettings.horas;
  renderColdTempField(initData.tempFrio !== undefined ? clampColdTempC(initData.tempFrio) : defaultSettings.tempFrio);
  el.horasFrio.value = initData.horasFrio !== undefined ? clampColdHoras(initData.horasFrio) : defaultSettings.horasFrio;
  applyFridgeVisibility();
  el.hidratacion.value = initData.hidratacion !== undefined ? initData.hidratacion : defaultSettings.hidratacion;
  // Peso por pizza y sal: valores canónicos SIEMPRE en métrico (gramos y g/L).
  // El peso se muestra en g u oz según el sistema; la sal siempre como % del agua.
  let pesoG = initData.pesoPaneto !== undefined ? initData.pesoPaneto : defaultSettings.pesoPaneto;
  let salGL = initData.sal !== undefined ? initData.sal : defaultSettings.sal;
  // La sal se guarda SIEMPRE en g/L (canónico). En modo "% harina" la variable
  // autoritativa es salPctFlour; se deriva aquí del g/L canónico y la hidratación.
  let salPctFlour = 0;
  // La sal ya no tiene modo Auto/Manual: es siempre editable, con el valor recomendado
  // por defecto (40 g/L). La levadura sí conserva Auto (fórmula) / Manual (valor fijo).
  let salMode = 'manual';
  let yeastMode = initData.yeastMode || 'auto';
  let manualYeastPerKg = (initData.manualYeastPerKg != null)
    ? initData.manualYeastPerKg
    : autoYeastGkg();
  { const h0 = (parseDecimal(el.hidratacion.value) || 0) / 100; salPctFlour = h0 > 0 ? h0 * salGL / 10 : 2.5; }

  // Lee un campo (en su unidad visible) y lo devuelve en la unidad canónica.
  function readPesoField(){
    const v = parseDecimal(el.pesoPaneto.value) || 0;
    return U.isImperial() ? U.ozToG(v) : v;    // -> gramos
  }
  function saltIsFlour(){ return !!(U.isSaltFlour && U.isSaltFlour()); }
  // Mantiene sincronizada la representación NO autoritativa de la sal según la
  // hidratación actual. En modo % harina manda salPctFlour (salGL se deriva); en
  // g/L manda salGL (salPctFlour se deriva). Gracias a esto, al cambiar la
  // hidratación en modo % harina la sal sigue siendo el MISMO % de la harina.
  function syncSaltDerived(){
    const h = (parseDecimal(el.hidratacion.value) || 0) / 100;
    if (saltIsFlour()) { salGL = h > 0 ? 10 * salPctFlour / h : 0; }
    else { salPctFlour = h > 0 ? h * salGL / 10 : 0; }
  }
  // Valor a MOSTRAR en el campo de la sal según la unidad activa.
  function saltDisplayValue(){
    return saltIsFlour() ? Math.round(salPctFlour * 10) / 10 : Math.round(salGL);
  }
  // Vuelca lo escrito en el campo (en la unidad activa) a la variable autoritativa.
  function applySalFromField(){
    const v = parseDecimal(el.sal.value) || 0;
    if (saltIsFlour()) salPctFlour = v; else salGL = v;
    syncSaltDerived();
  }
  // Ajusta el campo de la sal (valor, paso, límites y etiqueta) a la unidad activa.
  function renderSaltField(){
    const salUnitEl = document.getElementById('salUnitTag');
    if (saltIsFlour()){
      el.sal.step = '0.1'; el.sal.min = '0'; el.sal.max = '10';
      if (salUnitEl) salUnitEl.textContent = I18N.t('salUnitFlour');
    } else {
      el.sal.step = '1'; el.sal.min = '0'; el.sal.max = '100';
      if (salUnitEl) salUnitEl.textContent = I18N.t('salUnitGL');
    }
    el.sal.value = saltDisplayValue();
  }
  // Refresca los campos con unidad (peso por pizza y sal) para el sistema activo.
  function renderInputUnits(){
    const imperial = U.isImperial();
    const pesoUnitEl = document.getElementById('pesoUnit');
    // Peso por pizza: g (métrico) u oz (imperial).
    if (imperial){
      el.pesoPaneto.value = Math.round(U.gToOz(pesoG) * 10) / 10;
      el.pesoPaneto.step = '0.5'; el.pesoPaneto.min = '3.5';
    } else {
      el.pesoPaneto.value = Math.round(pesoG);
      el.pesoPaneto.step = '10'; el.pesoPaneto.min = '100';
    }
    if (pesoUnitEl) pesoUnitEl.textContent = U.weightUnit();
    renderSaltField();
  }
  renderInputUnits();

  // Bloquea o desbloquea un stepper (botones + input) según el modo Auto.
  function lockStepper(stepper, input, locked){
    if (!stepper) return;
    stepper.classList.toggle('is-locked', locked);
    if (input) input.disabled = locked;
    stepper.querySelectorAll('.stepper-btn').forEach(b => { b.disabled = locked; });
  }
  // Resumen de fermentación en el panel de resultado (tiempos + temperaturas). Se
  // muestra SIEMPRE (aun con levadura manual), porque son datos clave de la receta.
  function renderResultFerment(){
    if (!el.resultFermentBody) return;
    const ambH = clampHoras(el.horas.value);
    const ambT = parseInt(el.temperatura.value, 10) || 18;
    const coldH = coldHoursActive();
    const ambStr = U.formatNumber(ambH, 0) + ' h · ' + U.tempValue(ambT) + U.tempUnit();
    const coldStr = U.formatNumber(coldH, 0) + ' h · ' + Math.round(U.tempValue(coldTempC())) + U.tempUnit();
    const rows = [];
    if (el.fridgeToggle.checked) {
      rows.push([I18N.t('fermAmbientLabel'), ambStr]);
      rows.push([I18N.t('fermControlledLabel'), coldStr]);
    } else {
      rows.push([I18N.t('fermAmbientLabel'), ambStr]);
    }
    el.resultFermentBody.innerHTML = rows.map(function (r) {
      return '<div class="result-ferment-row"><span class="rf-label">' + r[0] +
             '</span><span class="rf-value">' + r[1] + '</span></div>';
    }).join('');
  }
  // Aplica el modo de la levadura (Auto/Manual) a la interfaz y refresca la pista de
  // la sal (siempre editable). No recalcula; el llamador hace calcular().
  function renderParamModes(){
    // Sal: siempre editable, con la pista del valor recomendado según la unidad.
    lockStepper(el.salStepper, el.sal, false);
    if (el.salHint) el.salHint.textContent = I18N.t(saltIsFlour() ? 'salAutoHintFlour' : 'salAutoHintGL');
    // Levadura: en Auto sigue la fórmula (horas + temperatura); en Manual, valor fijo.
    const yeastAuto = yeastMode === 'auto';
    // Canónico en g/kg; se MUESTRA como % del peso de la harina (1 g/kg = 0,1 %).
    const shownGkg = yeastAuto ? autoYeastGkg() : manualYeastPerKg;
    const shownPct = round2(shownGkg / 10);
    el.levadura.value = shownPct;
    // Control único: el stepper está SIEMPRE visible. En Auto se bloquea (valor calculado
    // de solo lectura); en Manual se desbloquea para editarlo. El lápiz alterna el modo.
    lockStepper(el.yeastStepper, el.levadura, yeastAuto);
    if (el.yeastModeChip) el.yeastModeChip.hidden = !yeastAuto;
    if (el.yeastEditBtn) {
      // OJO: el atributo [hidden] NO oculta un <svg> inline (es SVGElement, no HTMLElement),
      // así que alternamos con style.display, que gana siempre.
      const p = el.yeastEditBtn.querySelector('.ye-ico-pencil');
      const a = el.yeastEditBtn.querySelector('.ye-ico-auto');
      if (p) p.style.display = yeastAuto ? '' : 'none'; // en Auto: lápiz (tomar el control)
      if (a) a.style.display = yeastAuto ? 'none' : ''; // en Manual: magia (volver al automático)
      el.yeastEditBtn.setAttribute('aria-label', I18N.t(yeastAuto ? 'yeastAdjustManual' : 'yeastUseAuto'));
    }
    if (el.yeastHint) el.yeastHint.textContent = I18N.t(yeastAuto ? 'yeastAutoHint' : 'yeastManualHint');
  }
  renderParamModes();

  let flours = migrateFlours(initData.flours || defaultSettings.flours);
  let maxId = 0;
  flours.forEach(f => { if(f.id > maxId) maxId = f.id; });
  let flourIdCounter = maxId + 1;
  if(flourIdCounter < 1) flourIdCounter = 4;

  // Estado del selector de harina (modal). rowId = fila que se está editando;
  // query/brand/type/band = buscador y filtros activos (null = sin filtrar).
  let picker = { rowId: null, query: '', brand: null, type: null, band: null };

  // SVG del candado (abierto/cerrado) y de la papelera, reutilizados en el render.
  const SVG_LOCK_CLOSED = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
  const SVG_LOCK_OPEN = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;
  const SVG_TRASH = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

  // Si solo queda UNA harina libre, su % está determinado (100 − bloqueadas): la
  // fija al resto para que la mezcla siempre sume 100.
  function normalizeSoleUnlocked(){
    const unlocked = flours.filter(f => !f.locked);
    if (unlocked.length === 1) {
      const lockedSum = flours.filter(f => f.locked).reduce((s, f) => s + f.pct, 0);
      unlocked[0].pct = Math.max(0, Math.round(100 - lockedSum));
    }
  }

  function renderFlours() {
    normalizeSoleUnlocked();
    el.flourRowsContainer.innerHTML = '';

    // Si solo hay una harina libre, su % es obligado: se autocompleta y se
    // desactivan sus controles (no tiene sentido ajustarla ni permitir un total ≠100).
    const unlockedCount = flours.filter(f => !f.locked).length;

    flours.forEach((flour, index) => {
      const row = document.createElement('div');
      row.className = 'flour-row';
      const color = COLORES_HARINA[index % COLORES_HARINA.length];

      const name = escapeHtml(flourMain(flour.flourId));
      const tags = flourTagsHtml(flour.flourId);
      const auto = !flour.locked && unlockedCount === 1; // única libre → determinada
      const dis = (flour.locked || auto) ? 'disabled' : '';
      const groupState = flour.locked ? 'is-locked' : (auto ? 'is-auto' : '');
      const autoTitle = auto ? ` title="${I18N.t('flourAutoHint')}"` : '';

      row.innerHTML = `
        <div class="flour-index"><span class="flour-dot" style="background: ${color};" aria-hidden="true"></span></div>
        <div class="flour-select">
          <button type="button" class="flour-select-trigger" data-id="${flour.id}" aria-haspopup="dialog" aria-label="${I18N.t('flourChoose')} ${index + 1}: ${name}">
            <span class="flour-select-labels">
              <span class="flour-select-main">${name}</span>
              ${tags ? `<span class="flour-tags">${tags}</span>` : ''}
            </span>
            <svg class="flour-select-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"></polyline></svg>
          </button>
        </div>
        <div class="flour-controls">
          <div class="flour-pct-group ${groupState}"${autoTitle}>
            <button type="button" class="pct-btn flour-step" data-id="${flour.id}" data-dir="-1" aria-label="${I18N.t('flourPctDec')}" ${dis}>−</button>
            <div class="pct-value">
              <input type="text" class="flour-pct-input" data-id="${flour.id}" value="${flour.pct}" inputmode="numeric" aria-label="%${index + 1}" ${dis}>
              <span class="unit-tag">%</span>
            </div>
            <button type="button" class="pct-btn flour-step" data-id="${flour.id}" data-dir="1" aria-label="${I18N.t('flourPctInc')}" ${dis}>+</button>
            <span class="pct-divider" aria-hidden="true"></span>
            <button type="button" class="pct-lock toggle-lock ${flour.locked ? 'active-lock' : ''}" data-id="${flour.id}" title="${I18N.t(flour.locked ? 'unlockFlourTitle' : 'lockFlourTitle')}" aria-label="${I18N.t(flour.locked ? 'unlockFlourTitle' : 'lockFlourTitle')}">
              ${flour.locked ? SVG_LOCK_CLOSED : SVG_LOCK_OPEN}
            </button>
          </div>
          <button type="button" class="btn-icon delete flour-delete" data-id="${flour.id}" title="${I18N.t('deleteFlourAria')}" aria-label="${I18N.t('deleteFlourAria')}">
            ${SVG_TRASH}
          </button>
        </div>
      `;
      el.flourRowsContainer.appendChild(row);
    });

    attachFlourEvents();
    calcular();
  }

  // Redondeo a 2 decimales (evita "8.3300000001" al repartir proporciones).
  function round2(x){ return Math.round(x * 100) / 100; }
  // % de panadero: peso del ingrediente respecto a la harina (100%).
  function pctSobreHarina(valor, harina, decimales){
    if (!(harina > 0)) return '—';
    return U.formatNumber(valor / harina * 100, decimales) + '%';
  }

  // Caja informativa bajo la hidratación: color de fondo/borde + texto según el
  // rango del %. Bandas contiguas (sin huecos): <55,5 rojo (densa, bajo estándar) ·
  // 55,5–<63 verde (napolitana clásica) · 63–<70 amarillo (media) ·
  // 70–80 naranja (alta) · >80 rojo oscuro (extrema).
  const HYD_CLASSES = ['hyd-info--dense', 'hyd-info--green', 'hyd-info--yellow', 'hyd-info--orange', 'hyd-info--red'];
  function updateHydrationInfo(){
    if (!el.hydrationInfo) return;
    const pct = parseDecimal(el.hidratacion.value) || 0;
    let key;
    if (pct > 80) key = 'Red';
    else if (pct >= 70) key = 'Orange';
    else if (pct >= 63) key = 'Yellow';
    else if (pct >= 55.5) key = 'Green';
    else key = 'Dense';
    HYD_CLASSES.forEach(c => el.hydrationInfo.classList.remove(c));
    el.hydrationInfo.classList.add('hyd-info--' + key.toLowerCase());
    el.hydrationInfoHead.textContent = I18N.t('hyd' + key + 'Head');
    el.hydrationInfoText.textContent = I18N.t('hyd' + key + 'Body');
    // Marcador sobre la escala 50→85%: posición proporcional (topada a los extremos).
    if (el.hydMarker) {
      const p = Math.max(0, Math.min(100, (pct - 50) / 35 * 100));
      el.hydMarker.style.left = p + '%';
    }
  }

  // Refleja el array `flours` en los campos numéricos ya montados, sin reconstruir
  // el DOM. Salta el campo que el usuario esté editando (el de origen).
  function syncFlourInputs(skipEl){
    flours.forEach(f => {
      const num = el.flourRowsContainer.querySelector('.flour-pct-input[data-id="' + f.id + '"]');
      if (num && num !== skipEl && document.activeElement !== num) { num.value = f.pct; }
    });
  }

  // Vuelca en el array `flours` las proporciones (enteras, suma 100) que devuelve
  // el auto-balanceo puro de dough.js.
  function applyBalanced(changedIndex, newValue){
    const balanced = D.balanceFlours(flours, changedIndex, newValue);
    flours.forEach((f, i) => { f.pct = balanced[i]; });
  }

  // Handler común de cambio de proporción. El estado es puramente reactivo: al
  // fijar el % de una harina, dough.js reparte el déficit/excedente respecto al
  // 100% entre las demás harinas NO bloqueadas (proporcional a su peso, o
  // equitativo si están a 0), sin tocar las bloqueadas y capando si es necesario.
  function onPctChanged(id, rawValue, sourceEl){
    const idx = flours.findIndex(x => x.id === id);
    if (idx < 0) return;
    const typed = parseDecimal(rawValue) || 0;
    applyBalanced(idx, typed);
    // Si lo tecleado supera el tope posible (100 − bloqueadas), reflejamos el tope en el
    // propio campo en vez de mantener el número imposible hasta perder el foco.
    if (sourceEl && Math.round(typed) > flours[idx].pct) sourceEl.value = flours[idx].pct;
    syncFlourInputs(sourceEl);
    calcular();
  }

  // Botones +/− del % de una harina (paso entero de 1). Dispara el mismo reparto
  // reactivo que escribir en el campo.
  function stepFlourPct(id, dir){
    const f = flours.find(x => x.id === id);
    if (!f || f.locked) return;
    onPctChanged(id, f.pct + dir);
  }

  // ---- Selector de harina (modal con buscador + filtros) ----
  // Reemplaza al desplegable pequeño: escala a decenas de harinas. En móvil es una
  // hoja inferior; en escritorio, un diálogo. Reutiliza openModal/closeModal
  // (focus-trap + bloqueo de scroll) del bloque de recetas.
  const flourPickerModal = document.getElementById('flourPickerModal');
  const flourPickerList = document.getElementById('flourPickerList');
  const flourSearch = document.getElementById('flourSearch');
  const flourFilters = document.getElementById('flourFilters');
  const flourFiltersToggle = document.getElementById('flourFiltersToggle');
  const flourFiltersCount = document.getElementById('flourFiltersCount');
  const flourPickerCount = document.getElementById('flourPickerCount');
  const flourClearFilters = document.getElementById('flourClearFilters');
  const flourPickerEmpty = document.getElementById('flourPickerEmpty');
  const flourPickerCloseBtn = document.getElementById('flourPickerCloseBtn');
  const flourPickerCard = flourPickerModal ? flourPickerModal.querySelector('.flour-picker-card') : null;
  // Formulario "Añadir mi harina" (Fase 3): comparte modal con la lista.
  const flourAddBtn = document.getElementById('flourAddBtn');
  const flourAddForm = document.getElementById('flourAddForm');
  const flourAddName = document.getElementById('flourAddName');
  const flourAddType = document.getElementById('flourAddType');
  const flourAddW = document.getElementById('flourAddW');
  const flourAddBrand = document.getElementById('flourAddBrand');
  const flourAddError = document.getElementById('flourAddError');
  const flourAddCancel = document.getElementById('flourAddCancel');
  const flourAddSave = document.getElementById('flourAddSave');
  const flourAddTitle = document.getElementById('flourAddTitle');
  let pickerMode = 'list';
  let pendingDeleteId = null; // harina de usuario pendiente de confirmar borrado (en línea)
  let editingId = null;       // id de harina propia en edición (null = alta nueva)

  // Plegado de filtros: el bloque arranca SIEMPRE cerrado al abrir el selector
  // (más espacio para la lista). El botón lo despliega dentro de esa sesión.
  let filtersCollapsed = true;
  function applyFiltersCollapsed(){
    if (flourFilters) flourFilters.classList.toggle('is-collapsed', filtersCollapsed);
    if (flourFiltersToggle) flourFiltersToggle.setAttribute('aria-expanded', String(!filtersCollapsed));
  }
  // Muestra en el botón cuántos filtros hay activos (para no "esconder" que se está
  // filtrando cuando el bloque está plegado).
  function updateFiltersActiveCount(){
    const n = [picker.brand, picker.type, picker.band].filter(x => x != null).length;
    if (flourFiltersCount) {
      flourFiltersCount.textContent = n ? String(n) : '';
      flourFiltersCount.classList.toggle('show', n > 0);
    }
    // El botón "Limpiar filtros" solo aparece cuando hay algún filtro activo.
    if (flourClearFilters) flourClearFilters.style.display = n > 0 ? '' : 'none';
  }

  function bandLabel(b){
    return I18N.t(b === 'baja' ? 'flourBandBaja' : b === 'media' ? 'flourBandMedia'
      : b === 'alta' ? 'flourBandAlta' : b === 'muyalta' ? 'flourBandMuyalta' : 'flourBandNd');
  }

  // Chips de filtro (marca / tipo / fuerza). Se reconstruyen al abrir y al cambiar
  // un filtro para reflejar idioma y estado activo. Cada grupo tiene un chip
  // "Todas" (sin filtro). Las marcas/tipos se derivan solos del catálogo.
  function renderFlourFilters(){
    if (!flourFilters) return;
    flourFilters.innerHTML = '';
    const rows = [
      { key: 'brand', label: I18N.t('flourFilterBrand'), values: F.brands(), labelOf: (v) => v },
      { key: 'type',  label: I18N.t('flourFilterType'),  values: F.types(),  labelOf: (v) => F.typeLabel(v, I18N.getLang()) },
      { key: 'band',  label: I18N.t('flourStrength'),    values: F.bandsOrder, labelOf: bandLabel }
    ];
    rows.forEach(row => {
      const wrap = document.createElement('div');
      wrap.className = 'fp-filter-row';
      // Grupo etiquetado por su rótulo visible: el lector anuncia "Marca/Tipo/Fuerza"
      // como contexto de sus chips (si no, se oirían tres "Todas" ambiguos).
      const labId = 'fp-filter-label-' + row.key;
      wrap.setAttribute('role', 'group');
      wrap.setAttribute('aria-labelledby', labId);
      const lab = document.createElement('span');
      lab.className = 'fp-filter-label';
      lab.id = labId;
      lab.textContent = row.label;
      wrap.appendChild(lab);
      // Los chips van en su propio contenedor con scroll (la etiqueta queda fuera).
      const chipsBox = document.createElement('div');
      chipsBox.className = 'fp-filter-chips';
      [null].concat(row.values).forEach(v => {
        const active = picker[row.key] === v;
        const chip = document.createElement('button');
        chip.type = 'button';
        // En la fila de Fuerza, colorea los chips de banda con su color (Baja/Media/
        // Alta/Muy alta) para escanear igual que las pills de la lista. "Sin dato" y
        // "Todas" quedan neutros. Al activarse, la regla .is-active (más específica)
        // prevalece con el estilo de selección estándar.
        const bandColor = (row.key === 'band' && v && v !== 'nd') ? ' fp-band--' + v : '';
        const allClass = (v === null) ? ' fp-chip-all' : ''; // "Todas": activo pero neutro
        chip.className = 'fp-chip' + allClass + bandColor + (active ? ' is-active' : '');
        chip.setAttribute('aria-pressed', String(active));
        chip.textContent = (v === null) ? I18N.t('flourFilterAll') : row.labelOf(v);
        chip.addEventListener('click', () => {
          picker[row.key] = (picker[row.key] === v) ? null : v; // re-pulsar quita el filtro
          renderFlourFilters();
          renderFlourPickerList();
          updateFiltersActiveCount(); // refleja los filtros activos en el botón
          // Recoloca la seleccionada centrada tras filtrar (si sigue en los
          // resultados; si no, scrollSelectedIntoView deja la lista arriba).
          scrollSelectedIntoView();
        });
        chipsBox.appendChild(chip);
      });
      wrap.appendChild(chipsBox);
      flourFilters.appendChild(wrap);
    });
  }

  function renderFlourPickerList(){
    if (!flourPickerList) return;
    const row = flours.find(f => f.id === picker.rowId);
    const currentId = row ? row.flourId : null;
    // Oculta las harinas ya elegidas en OTRAS filas (deja siempre la propia).
    const usedByOthers = new Set(flours.filter(f => f.id !== picker.rowId).map(f => f.flourId));
    const results = F.search(picker.query, { brand: picker.brand, type: picker.type, band: picker.band })
      .filter(f => f.id === currentId || !usedByOthers.has(f.id));

    flourPickerList.innerHTML = '';
    // Si la harina en confirmación ya no está en los resultados (búsqueda/filtro), cancela.
    if (pendingDeleteId && !results.some(f => f.id === pendingDeleteId)) pendingDeleteId = null;
    results.forEach(f => {
      const selected = f.id === currentId;
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'flour-option' + (selected ? ' is-selected' : '');
      opt.setAttribute('role', 'option');
      opt.setAttribute('aria-selected', selected ? 'true' : 'false');
      opt.dataset.flour = f.id;
      opt.innerHTML = `
        <span class="flour-option-labels">
          <span class="flour-option-main">${escapeHtml(flourMain(f.id))}</span>
          <span class="flour-tags">${flourTagsHtml(f.id)}</span>
        </span>
        <svg class="flour-option-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      opt.addEventListener('click', () => selectFlour(f.id));
      // Las harinas del usuario van envueltas en una fila con botón de borrar; y si están
      // pendientes de confirmar, la fila muestra el confirmador en línea (¿Borrar? No/Sí).
      if (F.isUserFlour(f.id)) {
        const rowEl = document.createElement('div');
        rowEl.className = 'flour-option-row';
        if (pendingDeleteId === f.id) {
          rowEl.classList.add('flour-option-confirm');
          const msg = document.createElement('span');
          msg.className = 'fp-del-msg';
          msg.textContent = I18N.t('flourDeleteConfirm');
          const cancel = document.createElement('button');
          cancel.type = 'button'; cancel.className = 'fp-del-cancel';
          cancel.textContent = I18N.t('flourAddCancel');
          cancel.addEventListener('click', cancelDeleteUserFlour);
          const conf = document.createElement('button');
          conf.type = 'button'; conf.className = 'fp-del-confirm';
          conf.textContent = I18N.t('flourDeleteConfirmOk');
          conf.addEventListener('click', () => performDeleteUserFlour(f.id));
          rowEl.appendChild(msg); rowEl.appendChild(cancel); rowEl.appendChild(conf);
        } else {
          if (selected) rowEl.classList.add('is-selected'); // recuadro de selección a nivel de fila
          const edit = document.createElement('button');
          edit.type = 'button';
          edit.className = 'flour-option-edit';
          edit.setAttribute('aria-label', I18N.t('flourEditAria'));
          edit.title = I18N.t('flourEditAria');
          edit.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>';
          edit.addEventListener('click', (e) => { e.stopPropagation(); openEditForm(f.id); });
          const del = document.createElement('button');
          del.type = 'button';
          del.className = 'flour-option-del';
          del.setAttribute('aria-label', I18N.t('flourDeleteAria'));
          del.title = I18N.t('flourDeleteAria');
          del.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
          del.addEventListener('click', (e) => { e.stopPropagation(); requestDeleteUserFlour(f.id); });
          rowEl.appendChild(opt);
          rowEl.appendChild(edit);
          rowEl.appendChild(del);
        }
        flourPickerList.appendChild(rowEl);
      } else {
        flourPickerList.appendChild(opt);
      }
    });

    const n = results.length;
    if (flourPickerEmpty) flourPickerEmpty.style.display = n ? 'none' : 'block';
    flourPickerList.style.display = n ? 'flex' : 'none';
    if (flourPickerCount) {
      flourPickerCount.textContent = (n === 1)
        ? I18N.t('flourResultCountOne')
        : I18N.t('flourResultCount').replace('{n}', n);
    }
  }

  function pickerOptions(){ return Array.from(flourPickerList.querySelectorAll('.flour-option')); }
  function focusPickerOption(i){ const o = pickerOptions()[i]; if (o) o.focus(); }

  // Desplaza la lista para dejar la harina seleccionada lo más CENTRADA posible en
  // el viewport (así se ve que hay más opciones arriba y abajo). El navegador topa
  // scrollTop a [0, máx]: si la seleccionada está cerca de un extremo, simplemente
  // queda visible (no se puede centrar del todo). Solo scrollea la lista, no la página.
  function scrollSelectedIntoView(){
    if (!flourPickerList) return;
    const sel = flourPickerList.querySelector('.flour-option.is-selected');
    if (!sel) { flourPickerList.scrollTop = 0; return; }
    const listRect = flourPickerList.getBoundingClientRect();
    const selRect = sel.getBoundingClientRect();
    const contentTop = (selRect.top - listRect.top) + flourPickerList.scrollTop; // posición dentro del contenido
    flourPickerList.scrollTop = contentTop - (flourPickerList.clientHeight - selRect.height) / 2;
  }

  function openFlourPicker(rowId){
    picker = { rowId: rowId, query: '', brand: null, type: null, band: null };
    pickerMode = 'list';
    pendingDeleteId = null;
    editingId = null;
    if (flourPickerCard) flourPickerCard.classList.remove('is-adding');
    if (flourAddForm) flourAddForm.hidden = true;
    if (flourSearch) flourSearch.value = '';
    renderFlourFilters();
    renderFlourPickerList();
    filtersCollapsed = true;       // arranca SIEMPRE cerrado al abrir
    applyFiltersCollapsed();
    updateFiltersActiveCount();    // en apertura los filtros están reseteados (0)
    // Enfocamos la TARJETA del diálogo (no el buscador): así el foco entra en el
    // modal (accesibilidad) pero NO se abre el teclado del móvil automáticamente;
    // el usuario toca el buscador cuando quiere escribir. Fallback al modal.
    openModal(flourPickerModal, flourPickerCard || flourPickerModal);
    // Coloca la lista en la opción actual, tras asentarse el layout del modal.
    setTimeout(scrollSelectedIntoView, 70);
  }

  // Cancelar (X / Escape / fondo): cierra y devuelve el foco al disparador, que
  // sigue existiendo porque no hemos re-renderizado las filas.
  function closeFlourPicker(){
    picker.rowId = null;
    closeModal(flourPickerModal);
  }

  // Elegir una harina: la asigna, re-renderiza las filas y enfoca el NUEVO
  // disparador. No usamos closeModal aquí porque re-renderizar destruye el
  // disparador antiguo (al que closeModal intentaría devolver el foco).
  function selectFlour(flourId){
    const rowId = picker.rowId;
    const row = flours.find(f => f.id === rowId);
    if (row) row.flourId = flourId;
    flourPickerModal.style.display = 'none';
    lastFocusedBeforeModal = null;
    picker.rowId = null;
    syncScrollLock();
    renderFlours();
    const t = el.flourRowsContainer.querySelector('.flour-select-trigger[data-id="' + rowId + '"]');
    if (t) t.focus();
  }

  // ---- Añadir / editar / borrar harina propia (Fase 3): el selector alterna a modo form ----
  function populateAddTypeSelect(){
    if (!flourAddType) return;
    const lang = I18N.getLang();
    const prev = flourAddType.value;
    flourAddType.innerHTML = '';
    const ph = document.createElement('option'); // placeholder: el tipo es obligatorio
    ph.value = ''; ph.disabled = true; ph.textContent = I18N.t('flourAddTypePlaceholder');
    flourAddType.appendChild(ph);
    F.types().forEach(function (ty) {
      const o = document.createElement('option');
      o.value = ty; o.textContent = F.typeLabel(ty, lang);
      flourAddType.appendChild(o);
    });
    flourAddType.value = prev; // conserva la selección si se recarga por cambio de idioma
  }
  function hideAddError(){ if (flourAddError) { flourAddError.hidden = true; flourAddError.textContent = ''; } }
  function showAddError(msg){ if (flourAddError) { flourAddError.textContent = msg; flourAddError.hidden = false; } }
  function clearAddForm(){
    if (flourAddName) flourAddName.value = '';
    if (flourAddW) flourAddW.value = '';
    if (flourAddBrand) flourAddBrand.value = '';
    if (flourAddType) flourAddType.value = '';
  }
  function updateAddTitle(){
    if (flourAddTitle) flourAddTitle.textContent = I18N.t(editingId ? 'flourEditTitle' : 'flourAddBtn');
  }
  function setPickerMode(mode){
    pickerMode = mode;
    pendingDeleteId = null;
    const adding = mode === 'add';
    if (flourPickerCard) flourPickerCard.classList.toggle('is-adding', adding);
    if (flourAddForm) flourAddForm.hidden = !adding;
    if (adding) {
      hideAddError();
      populateAddTypeSelect();
      updateAddTitle();
      setTimeout(function () { if (flourAddName) flourAddName.focus(); }, 40);
    } else {
      editingId = null;
      renderFlourPickerList(); // restaura la lista al volver
    }
  }
  function openAddForm(){
    editingId = null;
    clearAddForm();
    setPickerMode('add');
    if (flourAddType) flourAddType.value = ''; // muestra el placeholder de tipo
  }
  function openEditForm(id){
    const f = F.get(id);
    if (!f) return;
    editingId = id;
    setPickerMode('add'); // conmuta modo + puebla el select de tipo
    if (flourAddName) flourAddName.value = F.mainName(id, I18N.getLang());
    if (flourAddType) flourAddType.value = f.type || '';
    if (flourAddW) flourAddW.value = f.wMin ? String(f.wMin) : '';
    if (flourAddBrand) flourAddBrand.value = f.brand || '';
    setTimeout(function () { if (flourAddName) { flourAddName.focus(); flourAddName.select(); } }, 45);
  }
  // ¿Ya existe otra harina propia con ese nombre base? (evita duplicados tipo dos "as").
  function userFlourNameExists(name, exceptId){
    const n = name.trim().toLowerCase();
    return F.userFlours().some(function (uf) {
      return uf.id !== exceptId && F.mainName(uf.id, I18N.getLang()).trim().toLowerCase() === n;
    });
  }
  function submitAddFlour(){
    const name = (flourAddName ? flourAddName.value : '').trim();
    if (!name) { showAddError(I18N.t('flourAddNameRequired')); if (flourAddName) flourAddName.focus(); return; }
    if (userFlourNameExists(name, editingId)) { showAddError(I18N.t('flourAddNameDup')); if (flourAddName) { flourAddName.focus(); flourAddName.select(); } return; }
    const type = flourAddType ? flourAddType.value : '';
    if (!type) { showAddError(I18N.t('flourAddTypeRequired')); if (flourAddType) flourAddType.focus(); return; }
    let w = 0;
    const wRaw = (flourAddW ? flourAddW.value : '').trim();
    if (wRaw) {
      if (!/^\d+$/.test(wRaw)) { showAddError(I18N.t('flourAddWError')); if (flourAddW) flourAddW.focus(); return; }
      w = parseInt(wRaw, 10);
      if (w < 80 || w > 450) { showAddError(I18N.t('flourAddWError')); if (flourAddW) flourAddW.focus(); return; }
    }
    const brand = flourAddBrand ? flourAddBrand.value : '';
    if (editingId) {
      F.updateUserFlour(editingId, { name: name, type: type, w: w, brand: brand });
      editingId = null;
      setPickerMode('list');
      renderFlours(); // refresca las filas que la usen + recalcula (calcular())
    } else {
      const id = F.addUserFlour({ name: name, type: type, w: w, brand: brand });
      if (!id) { showAddError(I18N.t('flourAddNameRequired')); return; }
      setPickerMode('list');
      selectFlour(id); // la asigna a la fila actual y cierra el selector
    }
  }
  function requestDeleteUserFlour(id){ pendingDeleteId = id; renderFlourPickerList(); }
  function cancelDeleteUserFlour(){
    const id = pendingDeleteId;
    pendingDeleteId = null;
    renderFlourPickerList();
    // Devuelve el foco a la papelera de esa harina (accesibilidad).
    const opt = flourPickerList.querySelector('.flour-option[data-flour="' + id + '"]');
    const row = opt ? opt.closest('.flour-option-row') : null;
    const del = row ? row.querySelector('.flour-option-del') : null;
    if (del) del.focus();
  }
  function performDeleteUserFlour(id){
    pendingDeleteId = null;
    F.removeUserFlour(id); // fuera del catálogo primero: así firstUnused no la devuelve
    let affected = false;
    flours.forEach(function (r) {
      if (r.flourId === id) {
        const used = new Set(flours.filter(function (x) { return x !== r; }).map(function (x) { return x.flourId; }));
        r.flourId = F.firstUnused(used); // evita id colgado o duplicado con otra fila
        affected = true;
      }
    });
    renderFlourFilters();       // las marcas/tipos pueden cambiar si era la única con ese valor
    updateFiltersActiveCount();
    renderFlourPickerList();
    if (affected) renderFlours(); // refresca las filas de fuera y recalcula (calcular())
    showToast(I18N.t('flourDeletedToast'));
  }

  // Cableado único de los controles propios del modal (no por fila).
  if (flourPickerModal) {
    if (flourPickerCloseBtn) flourPickerCloseBtn.addEventListener('click', closeFlourPicker);
    flourPickerModal.addEventListener('click', (e) => { if (e.target === flourPickerModal && pickerMode !== 'add') closeFlourPicker(); });
    // Formulario "Añadir mi harina".
    if (flourAddBtn) flourAddBtn.addEventListener('click', openAddForm);
    if (flourAddCancel) flourAddCancel.addEventListener('click', () => setPickerMode('list'));
    if (flourAddSave) flourAddSave.addEventListener('click', submitAddFlour);
    if (flourAddName) flourAddName.addEventListener('input', hideAddError);
    if (flourAddW) flourAddW.addEventListener('input', hideAddError);
    if (flourFiltersToggle) {
      flourFiltersToggle.addEventListener('click', () => {
        filtersCollapsed = !filtersCollapsed;
        applyFiltersCollapsed();
      });
    }
    if (flourClearFilters) {
      flourClearFilters.addEventListener('click', () => {
        picker.brand = null; picker.type = null; picker.band = null;
        renderFlourFilters();
        renderFlourPickerList();
        updateFiltersActiveCount();
        scrollSelectedIntoView();
      });
    }
    if (flourSearch) {
      let searchTimer = null;
      flourSearch.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { picker.query = flourSearch.value; renderFlourPickerList(); }, 120);
      });
    }
    // Teclado: Escape cierra (o vuelve de "añadir" a la lista); Tab atrapado en ambos
    // modos; las flechas navegan la lista solo en modo lista.
    flourPickerModal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (pickerMode === 'add') setPickerMode('list'); else closeFlourPicker();
        return;
      }
      if (e.key === 'Tab') {
        const f = getFocusables(flourPickerModal);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        return;
      }
      if (pickerMode === 'add') return; // en el formulario, teclas normales
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const opts = pickerOptions(); const cur = opts.indexOf(document.activeElement);
        focusPickerOption(cur < 0 ? 0 : Math.min(opts.length - 1, cur + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const opts = pickerOptions(); const cur = opts.indexOf(document.activeElement);
        if (cur <= 0) { if (flourSearch) flourSearch.focus(); } else focusPickerOption(cur - 1);
      }
    });
    // Reaplica textos traducidos si cambia el idioma con el modal abierto.
    window.addEventListener('pizzaLangChange', () => {
      if (flourPickerModal.style.display !== 'flex') return;
      if (pickerMode === 'add') { populateAddTypeSelect(); updateAddTitle(); }
      else { renderFlourFilters(); renderFlourPickerList(); }
    });
  }

  function attachFlourEvents() {
    // Disparador del selector: abre el modal de harinas para esta fila.
    document.querySelectorAll('.flour-select-trigger').forEach(trigger => {
      trigger.addEventListener('click', () => {
        openFlourPicker(parseInt(trigger.dataset.id, 10));
      });
    });

    // Botones +/− del porcentaje: mantener pulsado repite con aceleración, igual
    // que el resto de steppers.
    document.querySelectorAll('.flour-step').forEach(btn => {
      bindHoldRepeatAction(btn, () => stepFlourPct(parseInt(btn.dataset.id), parseInt(btn.dataset.dir, 10)));
    });

    document.querySelectorAll('.flour-pct-input').forEach(input => {
      input.addEventListener('input', (e) => {
        onPctChanged(parseInt(e.target.dataset.id), e.target.value, e.target);
      });
      // Al salir del campo, normaliza SOLO el número mostrado (redondeo/tope) sin
      // reconstruir el DOM. Antes se llamaba a renderFlours() aquí, pero eso "se
      // comía" el primer clic en el candado/borrar: el blur re-renderizaba y el
      // botón que recibió el mousedown desaparecía antes de completarse el click.
      input.addEventListener('change', () => syncFlourInputs());
    });

    document.querySelectorAll('.toggle-lock').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.dataset.id);
        const flour = flours.find(f => f.id === id);
        flour.locked = !flour.locked;
        renderFlours();
      });
    });

    document.querySelectorAll('.btn-icon.delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.dataset.id);
        if(flours.length > 1) {
          flours = flours.filter(f => f.id !== id);
          // Reactivo: al quitar una harina, el resto de las no bloqueadas se
          // reequilibra para que la mezcla vuelva a sumar 100%.
          // Caso límite: si TODAS las restantes están bloqueadas y no llegan a
          // 100, no hay dónde repartir; liberamos los candados para poder
          // reajustar y no dejar el cálculo bloqueado tras un borrado.
          const hayLibres = flours.some(f => !f.locked);
          if (!hayLibres && Math.round(D.flourSum(flours)) !== 100) {
            flours.forEach(f => { f.locked = false; });
            showToast(I18N.t('floursUnlockedToast'));
          }
          applyBalanced(-1);
          renderFlours();
        }
      });
    });
  }

  el.addFlourBtn.addEventListener('click', () => {
    // Estrena con la primera harina del catálogo que no esté ya elegida, para no
    // duplicar (coherente con que el selector oculta las ya usadas).
    const firstFree = F.firstUnused(flours.map(f => f.flourId));
    flours.push({ id: flourIdCounter++, flourId: firstFree, pct: 0, locked: false });
    renderFlours();
  });

  el.resetBtn.addEventListener('click', async () => {
    // Pide confirmación: restablecer descarta los parámetros actuales.
    const ok = await showConfirm(I18N.t('resetConfirm'), I18N.t('resetConfirmOk'));
    if (!ok) return;
    el.temperatura.value = defaultSettings.temperatura;
    el.horas.value = defaultSettings.horas;
    el.fridgeToggle.checked = defaultSettings.fridgeOn;
    renderColdTempField(defaultSettings.tempFrio);
    el.horasFrio.value = defaultSettings.horasFrio;
    applyFridgeVisibility();
    el.hidratacion.value = defaultSettings.hidratacion;
    salGL = defaultSettings.sal;
    salMode = defaultSettings.salMode;
    yeastMode = defaultSettings.yeastMode;
    manualYeastPerKg = autoYeastGkg();
    syncSaltDerived();
    renderInputUnits();
    renderParamModes();

    flours = migrateFlours(defaultSettings.flours);

    let maxId = 0;
    flours.forEach(f => { if(f.id > maxId) maxId = f.id; });
    flourIdCounter = maxId + 1;

    renderFlours();
  });

  // Hook que se dispara tras recalcular (se asigna cuando las recetas están listas).
  let onConfigChange = null;
  // Última receta calculada por calcular() (misma que alimenta los totales en pantalla).
  // La reutiliza buildRecipeText() para que el texto copiado SIEMPRE cuadre con lo mostrado.
  let lastRecipe = null;

  function calcular(){
    const numPaneteos = Math.max(1, parseDecimal(el.numPaneteos.value) || 0); // mínimo 1 pizza (E2)
    const pesoPaneto = pesoG;
    const temp = parseInt(el.temperatura.value, 10);
    const horas = clampHoras(el.horas.value);
    const coldH = coldHoursActive();           // 0 si la nevera está desactivada
    const coldT = coldTempC();                 // °C canónico de la nevera
    const hidratacionPct = parseDecimal(el.hidratacion.value) || 0;
    updateHydrationInfo(); // caja de guía por rango de hidratación (siempre, aun si la mezcla no es válida)
    // La hidratación puede haber cambiado: resincroniza la sal. En modo % harina
    // el % se mantiene fijo (y salGL se recalcula); en g/L, salGL se mantiene.
    syncSaltDerived();
    // Levadura: en Manual usa el valor fijo; en Auto, el modelo multifase (ambiente + nevera).
    const levPorKg = (yeastMode === 'manual') ? manualYeastPerKg : D.yeastPerKgFlour(horas, temp, coldH, coldT);
    if (yeastMode === 'auto') {
      const pct = round2(levPorKg / 10);
      el.levadura.value = pct; // el input (bloqueado) ES la lectura visible del valor Auto
    }

    // Lector del tiempo total de fermentación (ambiente + nevera): solo con la nevera activa
    // (con una sola fase el total = ese tiempo). Ayuda a decidir el tiempo de nevera viendo
    // el total al vuelo. Ya no hay tope de 96 h: ambiente y nevera son fases independientes.
    if (el.fermTotal) {
      el.fermTotal.hidden = !el.fridgeToggle.checked;
      if (el.fermTotalValue) el.fermTotalValue.textContent = U.formatNumber(horas + coldH, 0) + ' h';
    }
    // Avisos por temperatura ambiente extrema (>28 °C frenético · 15-16 °C baja).
    if (el.tempNote) {
      let key = null;
      if (temp > 28) key = 'tempNoteHigh';
      else if (temp < 17) key = 'tempNoteLow';
      el.tempNote.hidden = !key;
      if (key && el.tempNoteText) el.tempNoteText.textContent = I18N.t(key);
    }
    // Fermentación a temperatura ambiente demasiado larga (>24 h → conviene el método en frío).
    if (el.ambientLongNote) el.ambientLongNote.hidden = !(horas > 24);
    // Avisos de la fase fría (un solo hueco, por prioridad):
    //  · tiempo insuficiente (0 < t < 12 h)
    //  · nevera demasiado cálida para el tiempo elegido (coldNoteHot, umbral según °C)
    //  · maduración extrema (> 72 h)
    if (el.coldNote) {
      let text = null;
      if (coldH > 0 && coldH < 12) {
        text = I18N.t('coldNoteShort');
      } else {
        const thr = coldHotThreshold(coldT);
        if (thr != null && coldH > thr) text = I18N.t('coldNoteHot').replace('{h}', thr);
        else if (coldH > 72) text = I18N.t('coldNoteLong');
      }
      el.coldNote.hidden = !text;
      if (text && el.coldNoteText) el.coldNoteText.textContent = text;
    }
    // Consejo de reposo previo a la nevera: SOLO si se usa la fase fría Y el tiempo de
    // ambiente es corto (< 2 h). Recuerda dejar 1-2 h de ambiente antes de enfriar.
    if (el.ambientRestTip) el.ambientRestTip.hidden = !(el.fridgeToggle.checked && horas < 2);
    // Aviso de exceso de levadura (Auto y Manual): cantidad alta → nota informativa
    // NO bloqueante. Umbral > 1,5 % del peso de la harina (= 15 g/kg). En Auto,
    // #levadura ya está sincronizado con el valor calculado, así que refleja el número
    // mostrado en ambos modos (en Auto se reduce alargando horas o bajando temperatura).
    if (el.warnHighYeast) {
      el.warnHighYeast.hidden = !D.isHighYeast(parseDecimal(el.levadura.value));
    }
    // Fuerza (W) efectiva de la mezcla: media ponderada por % de las harinas con dato
    // (null si ninguna lo tiene). Se muestra junto a la barra de proporción y alimenta
    // el aviso de compatibilidad W↔tiempo (RN-02).
    const wEff = D.effectiveW(flours.map(function (f) { return { w: F.wValue(f.flourId), pct: f.pct }; }));
    if (el.flourStrengthValue) el.flourStrengthValue.textContent = (wEff != null) ? ('W' + wEff) : '—';
    // Compatibilidad fuerza de la harina ↔ tiempo de fermentación de RELOJ total
    // (ambiente + nevera activa). Sin dato de W en la mezcla → sin aviso.
    if (el.flourWarn) {
      let show = false;
      if (wEff != null) {
        // Horas estructurales de desgaste del gluten (modelo Q10/Arrhenius: AMBAS fases se
        // ponderan por su temperatura; ver structuralHours en dough.js). EXCLUSIVO para
        // validar contra la tabla de rangos W. temp = °C ambiente (#temperatura); coldT =
        // °C CANÓNICA de la fría (convertida desde °F). Ambiente y nevera son fases
        // independientes (sin tope combinado de reloj).
        const H = D.structuralHours(horas, temp, coldH, coldT);
        const clockHours = horas + coldH; // tiempo de reloj real configurado por el usuario
        const verdict = D.flourTimeWarning(wEff, H);
        if (verdict) {
          const band = D.flourBand(wEff);
          // Damos DOS arreglos concretos: fuerza de harina (de la tabla de bandas) y tiempo
          // total de reloj. El tiempo es proporcional a H manteniendo la mezcla de
          // temperaturas actual (escala lineal: reloj · objetivo_estructural / H).
          const opts = [];
          let head;
          if (verdict === 'weak') {
            head = I18N.t('warnFlourWeakHead').replace('{W_value}', wEff);
            const minW = D.minWForHours(H);
            if (minW != null) opts.push(I18N.t('adviceFlourMin').replace('{w}', minW));
            if (H > 0 && clockHours > 0) {
              const maxHours = Math.max(1, Math.floor(clockHours * band.maxH / H));
              opts.push(I18N.t('adviceTimeMax').replace('{h}', maxHours));
            }
          } else { // strong
            head = I18N.t('warnFlourStrongHead').replace('{W_value}', wEff);
            const maxW = D.maxWForHours(H);
            if (maxW != null) opts.push(I18N.t('adviceFlourMax').replace('{w}', maxW));
            if (H > 0 && clockHours > 0) {
              const minHours = Math.ceil(clockHours * band.minH / H);
              if (minHours <= 96) opts.push(I18N.t('adviceTimeMin').replace('{h}', minHours));
            }
          }
          let text = head;
          if (opts.length) text += ' ' + I18N.t('adviceNeed') + ' ' + opts.join(I18N.t('adviceOr')) + '.';
          if (el.flourWarnText) el.flourWarnText.textContent = text;
          show = true;
        }
      }
      el.flourWarn.hidden = !show;
    }

    // No pisar el campo mientras el usuario lo está escribiendo (lo confirma al salir).
    if (document.activeElement !== el.tempValue) el.tempValue.value = U.tempValue(temp);
    if (el.tempUnit) el.tempUnit.textContent = U.tempUnit();
    saveSettings();
    if (onConfigChange) onConfigChange();

    const sumaPct = flours.reduce((a, b) => a + b.pct, 0);
    const sumaRedondeada = Math.round(sumaPct * 100) / 100;
    const esValidoHarina = Math.abs(sumaRedondeada - 100) < 0.001;

    el.progressBar.innerHTML = flours.map((f, i) => {
      if(f.pct <= 0) return '';
      const color = COLORES_HARINA[i % COLORES_HARINA.length];
      return `<div class="progress-segment" style="width: ${f.pct}%; background: ${color};" title="${escapeHtml(flourName(f.flourId))} · ${f.pct}%"></div>`;
    }).join('');

    // La app fuerza el 100% de forma reactiva, así que no anunciamos "equilibrado":
    // el estado solo aparece en el caso límite en que la mezcla no llega a 100
    // (todas las harinas restantes bloqueadas). Indica cuánto falta o sobra.
    if (esValidoHarina) {
      el.progressStatus.textContent = '';
    } else {
      const delta = Math.round(sumaRedondeada - 100);
      el.progressStatus.textContent = (delta < 0)
        ? I18N.t('mixMissing').replace('{n}', Math.abs(delta))
        : I18N.t('mixExcess').replace('{n}', delta);
    }

    // Preferencia global (Configuración → Avisos): si están desactivados, ocultamos
    // todos los banners de aviso NO bloqueantes; con ello desaparecen también el badge
    // "Con avisos", los resúmenes de aviso de las tarjetas y los puntos ámbar. El aviso
    // de harina ≠ 100% NO es un aviso opcional (es un bloqueo): se mantiene siempre.
    if (!warningsEnabled) {
      [el.tempNote, el.ambientLongNote, el.coldNote, el.warnHighYeast, el.flourWarn]
        .forEach(function (e) { if (e) e.hidden = true; });
    }

    el.warningBanner.classList.toggle('show', !esValidoHarina);

    // Se bloquea el resultado solo si la mezcla de harinas no suma 100%. El tiempo de
    // fermentación ya no puede ser inválido: se capa al total de 96 h al editarlo.
    const esValido = esValidoHarina;
    if(!esValido){
      el.resultsBody.style.display = 'none';
      el.disabledOverlay.style.display = 'block';
      el.resultsBadge.textContent = I18N.t('resultsBadgeBlocked');
      el.resultsBadge.style.background = 'rgba(193,67,46,0.25)';
      el.resultsBadge.style.borderColor = 'rgba(193,67,46,0.5)';
      el.resultsBadge.style.color = '';
      if (mobileSummary) mobileSummary.classList.add('blocked');
      return;
    }

    el.resultsBody.style.display = 'block';
    el.disabledOverlay.style.display = 'none';
    // Badge de resultados: si hay algún aviso NO bloqueante activo (temperatura, tiempo,
    // nevera, exceso de levadura o compatibilidad harina↔tiempo) lo señalamos con "Con
    // avisos" (informativo, en ámbar; no impide ver ni copiar la receta). Sin avisos: "Listo".
    const hasWarnings = [el.tempNote, el.ambientLongNote, el.coldNote, el.warnHighYeast, el.flourWarn]
      .some(e => e && !e.hidden);
    if (hasWarnings) {
      el.resultsBadge.textContent = I18N.t('resultsBadgeWarn');
      el.resultsBadge.style.background = 'rgba(224,158,74,0.18)';
      el.resultsBadge.style.borderColor = 'rgba(224,158,74,0.55)';
      el.resultsBadge.style.color = '#f2c27f';
    } else {
      el.resultsBadge.textContent = I18N.t('resultsBadgeReady');
      el.resultsBadge.style.background = 'rgba(255,255,255,0.08)';
      el.resultsBadge.style.borderColor = 'rgba(255,255,255,0.14)';
      el.resultsBadge.style.color = '';
    }

    const r = D.computeRecipe({
      numPizzas: numPaneteos, pesoG: pesoPaneto, tempC: temp,
      hidPct: hidratacionPct, salGL: salGL,
      salPctFlour: saltIsFlour() ? salPctFlour : null,
      levPorKgHarina: levPorKg, flours: flours
    });
    lastRecipe = r; // se reutiliza en buildRecipeText (copiar/compartir)
    const pesoTotalMasa = r.masaTotal;
    const harinaTotal = r.harinaTotal;
    const aguaTotal = r.aguaTotal;
    const salTotal = r.salTotal;
    const levaduraTotal = r.levaduraFresca;
    const levaduraSecaTotal = r.levaduraSeca;

    el.flourBreakdown.innerHTML = flours.map((f, idx) => {
      const gramos = harinaTotal * (f.pct / 100);
      const color = COLORES_HARINA[idx % COLORES_HARINA.length];
      return `<div class="flour-sub">
        <span class="fname"><span class="swatch" style="background:${color}"></span><span class="fname-text">${escapeHtml(flourName(f.flourId))}</span></span>
        <span class="fpct">${U.formatNumber(f.pct, 1)}%</span>
        <span class="fval">${U.formatWeight(gramos)}</span>
      </div>`;
    }).join('');

    // firstRun: en la primera pintura no animamos nada (ni el titular ni la barra
    // fija), solo cuando el usuario cambia algo. Se marca al final de calcular().
    const firstRun = !masaInitialized;
    const masaText = U.formatWeight(pesoTotalMasa);
    if (el.totalMasa.textContent !== masaText) {
      el.totalMasa.textContent = masaText;
      if (!firstRun) pulseRecalc(el.totalMasa);
    }
    el.totalHarina.textContent = U.formatWeight(harinaTotal);
    el.totalAgua.textContent = U.formatWeight(aguaTotal);
    el.totalSal.textContent = U.formatWeight(salTotal);
    el.totalLevadura.textContent = U.formatWeightPrecise(levaduraTotal);
    el.totalLevaduraSeca.textContent = U.formatWeightPrecise(levaduraSecaTotal);

    // Contexto de la tanda bajo el titular: "6 pizzas de 280 g".
    if (el.batchContext) {
      el.batchContext.textContent = numPaneteos + ' ' +
        I18N.t('recipePizzas').toLowerCase() + ' ' + I18N.t('recipeOf') + ' ' +
        U.formatWeight(pesoPaneto);
    }
    renderResultFerment(); // resumen de fermentación (tiempos + temperaturas) en el resultado

    // Porcentajes de panadero (relativos a la harina = 100%).
    if (el.aguaPct) el.aguaPct.textContent = pctSobreHarina(aguaTotal, harinaTotal, 1);
    if (el.salPct) el.salPct.textContent = pctSobreHarina(salTotal, harinaTotal, 1);
    if (el.levaduraPct) el.levaduraPct.textContent = pctSobreHarina(levaduraTotal, harinaTotal, 2);

    // Barra de proporción: composición de la masa por peso (harina/agua/sal/levadura),
    // con los mismos colores que los iconos de cada ingrediente.
    if (el.ingredientBar) {
      const comp = [
        { c: 'var(--c-harina)', v: harinaTotal, label: I18N.t('statHarinaTotal') },
        { c: 'var(--c-agua)', v: aguaTotal, label: I18N.t('statAgua') },
        { c: 'var(--c-sal)', v: salTotal, label: I18N.t('statSal') },
        { c: 'var(--c-levadura)', v: levaduraTotal, label: I18N.t('statLevaduraFresca') }
      ];
      el.ingredientBar.innerHTML = comp.map(s => {
        const w = pesoTotalMasa > 0 ? (s.v / pesoTotalMasa * 100) : 0;
        if (w <= 0) return '';
        return `<span class="ing-seg" style="width:${w}%;background:${s.c}" title="${s.label}"></span>`;
      }).join('');
    }

    if (mobileSummary) {
      mobileSummary.classList.remove('blocked');
      // En móvil, la barra fija ES la superficie de resultado que se ve al ajustar,
      // así que el "latido" al recalcular vive aquí (no en el titular, que queda al pie).
      setMsVal(ms.total, U.formatWeight(pesoTotalMasa), firstRun);
      setMsVal(ms.harina, U.formatWeight(harinaTotal), firstRun);
      setMsVal(ms.agua, U.formatWeight(aguaTotal), firstRun);
      setMsVal(ms.sal, U.formatWeight(salTotal), firstRun);
      setMsVal(ms.lev, U.formatWeightPrecise(levaduraTotal), firstRun);
    }
    masaInitialized = true;
    updateCards();
  }

  [el.numPaneteos, el.temperatura, el.tempFrio, el.hidratacion].forEach(input => {
    input.addEventListener('input', calcular);
  });
  // Tiempos de fermentación: ambiente y nevera son independientes (sin tope combinado).
  el.horas.addEventListener('input', calcular);
  el.horasFrio.addEventListener('input', calcular);
  // Nº de pizzas: al salir del campo, normaliza a entero ≥ 1 (E2).
  el.numPaneteos.addEventListener('change', () => {
    let v = Math.round(parseDecimal(el.numPaneteos.value) || 0);
    if (v < 1) v = 1;
    el.numPaneteos.value = v;
    calcular();
  });
  // Hidratación: al salir del campo, la topamos al rango [50, 100] (los botones
  // ya lo hacen; esto cubre el tecleo directo de un valor fuera de rango).
  el.hidratacion.addEventListener('change', () => {
    el.hidratacion.value = clampHidratacion(el.hidratacion.value);
    calcular();
  });
  // Horas de fermentación: al salir del campo, topamos a [2, 96] (los botones ya lo
  // hacen; esto cubre el tecleo directo de un valor fuera de rango).
  el.horas.addEventListener('change', () => {
    el.horas.value = clampHoras(el.horas.value);
    calcular();
  });
  // Fase de nevera: tiempo y temperatura (topados al salir del campo), y el
  // interruptor que la muestra/oculta y recalcula.
  el.tempFrio.addEventListener('change', () => { renderColdTempField(coldTempC()); calcular(); });
  el.horasFrio.addEventListener('change', () => { el.horasFrio.value = clampColdHoras(el.horasFrio.value); calcular(); });
  el.fridgeToggle.addEventListener('change', () => {
    if (el.fridgeToggle.checked) {
      // Al ACTIVAR la nevera: 4 °C (lo habitual en un frigorífico) y las horas por
      // defecto, pero sin superar el total de 96 h (si ya hay 96 h de ambiente, 0 h).
      renderColdTempField(defaultSettings.tempFrio);
      const room = Math.max(0, 96 - clampHoras(el.horas.value));
      el.horasFrio.value = Math.min(defaultSettings.horasFrio, room);
    }
    // El mínimo de ambiente cambia con la nevera (0 h activa / 2 h apagada): re-topamos el
    // campo por si queda por debajo del nuevo mínimo (p. ej. estaba en 0 h y se apaga).
    el.horas.value = clampHoras(el.horas.value);
    applyFridgeVisibility();
    calcular();
  });
  // Enlace "Ver consejos de fermentación": abre el acordeón de consejos y hace scroll.
  if (el.fermTipsLink) el.fermTipsLink.addEventListener('click', (e) => {
    e.preventDefault();
    const tips = document.getElementById('fermentTips');
    if (!tips) return;
    tips.open = true;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    tips.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  });
  // Temperatura: además del slider, se puede escribir el valor (para quien tenga
  // problemas con el slider). El valor interno es SIEMPRE °C; si se muestra en °F
  // lo convertimos. Al salir del campo (o Enter) topamos al rango del slider
  // [5,35] °C y resincronizamos el slider; un valor no válido se restaura.
  function commitTempInput(){
    const shown = parseDecimal(el.tempValue.value);
    const cur = parseInt(el.temperatura.value, 10) || 18;
    if (!isFinite(shown)) { el.tempValue.value = U.tempValue(cur); return; } // restaura
    let c = U.isFahrenheit() ? Math.round((shown - 32) * 5 / 9) : Math.round(shown);
    const min = parseInt(el.temperatura.min, 10), max = parseInt(el.temperatura.max, 10);
    c = Math.max(min, Math.min(max, c));
    el.temperatura.value = c;
    el.tempValue.value = U.tempValue(c); // muestra el valor canónico ya topado
    calcular();
  }
  el.tempValue.addEventListener('change', commitTempInput);
  el.tempValue.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); el.tempValue.blur(); }
  });

  // ---- A4: pulsación mantenida en los +/− (auto-repetición con aceleración) ----
  // Reutilizamos el onclick inline de cada botón como "acción" y desactivamos el
  // click nativo para no duplicar el paso. El teclado (Enter/Espacio) se atiende
  // aparte, así que los botones siguen siendo accesibles.
  // Núcleo del mantener-pulsado: repite `action` con aceleración mientras se
  // mantiene pulsado (ratón/táctil) y atiende Enter/Espacio para accesibilidad.
  function bindHoldRepeatAction(btn, action){
    let startTimer = null, repeatTimer = null, holdTimer = null;
    let downX = 0, downY = 0, moved = false, repeating = false, active = false;
    const MOVE_CANCEL = 10; // px: si el dedo se mueve más, es un scroll (no una pulsación)
    function clearAll(){ clearTimeout(startTimer); clearTimeout(repeatTimer); clearTimeout(holdTimer); startTimer = repeatTimer = holdTimer = null; }
    // Primer paso + repetición acelerada mientras se mantiene pulsado.
    function beginHold(){
      action();
      repeating = true;
      let delay = 130;
      startTimer = setTimeout(function rep(){
        action();
        delay = Math.max(45, delay - 12);   // acelera al mantener pulsado
        repeatTimer = setTimeout(rep, delay);
      }, 420);
    }
    btn.addEventListener('pointerdown', (e) => {
      if ((e.button && e.button !== 0) || btn.disabled) return; // en Auto/harina bloqueada, inertes
      active = true; moved = false; repeating = false; downX = e.clientX; downY = e.clientY;
      if (e.pointerType === 'mouse') {
        // Ratón: no se hace scroll arrastrando sobre el botón → paso inmediato.
        e.preventDefault();
        beginHold();
      } else {
        // Táctil/lápiz: NO sumamos aún ni bloqueamos el scroll (sin preventDefault). El tap
        // simple suma en pointerup; el mantener-pulsado arranca tras el retardo de hold. Si el
        // dedo se desplaza (scroll) o el navegador cancela el puntero, no se suma nada.
        holdTimer = setTimeout(function(){ if (active && !moved) beginHold(); }, 400);
      }
    });
    btn.addEventListener('pointermove', (e) => {
      if (!active || moved) return;
      if (Math.abs(e.clientX - downX) > MOVE_CANCEL || Math.abs(e.clientY - downY) > MOVE_CANCEL) {
        moved = true; active = false; clearAll();   // es un scroll: cancela todo
      }
    });
    btn.addEventListener('pointerup', (e) => {
      if (!active) { clearAll(); return; }
      active = false;
      const touchTap = (e.pointerType !== 'mouse') && !moved && !repeating;
      clearAll();
      if (touchTap) action();   // tap táctil limpio (sin scroll) → un solo paso
    });
    ['pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, function(){ active = false; clearAll(); }));
    btn.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !btn.disabled) { e.preventDefault(); action(); } });
  }
  // Botones con onclick inline (steppers de pizzas/peso/hidratación/sal/levadura):
  // reutiliza su onclick como acción y desactiva el click nativo para no duplicar.
  function bindHoldRepeat(btn){
    const orig = btn.onclick;
    if (typeof orig !== 'function') return;
    btn.onclick = null;
    bindHoldRepeatAction(btn, () => orig.call(btn));
  }
  document.querySelectorAll('.stepper-btn').forEach(bindHoldRepeat);
  // Peso por pizza y sal actualizan primero su valor canónico (métrico) y luego recalculan.
  el.pesoPaneto.addEventListener('input', () => { pesoG = readPesoField(); calcular(); });
  el.sal.addEventListener('input', () => { if (salMode === 'manual') { applySalFromField(); } calcular(); });
  // Peso por pizza: al salir del campo, topamos al mínimo (100 g / 3,5 oz) y redondeamos
  // al paso de la unidad (los botones ya lo hacen; esto cubre el tecleo directo).
  el.pesoPaneto.addEventListener('change', () => {
    const imperial = U.isImperial();
    const min = imperial ? 3.5 : 100;
    let v = parseDecimal(el.pesoPaneto.value);
    if (!isFinite(v) || v < min) v = min;
    v = imperial ? Math.round(v * 10) / 10 : Math.round(v);
    el.pesoPaneto.value = v;
    pesoG = readPesoField();
    calcular();
  });
  // Sal: al salir del campo, topamos al rango de la unidad activa (min/max del input) y
  // redondeamos al paso (los botones ya lo hacen; esto cubre el tecleo directo).
  el.sal.addEventListener('change', () => {
    const min = parseFloat(el.sal.getAttribute('min')) || 0;
    const max = parseFloat(el.sal.getAttribute('max')) || 10;
    const step = parseFloat(el.sal.getAttribute('step')) || 0.1;
    const f = step < 1 ? 10 : 1;
    let v = parseDecimal(el.sal.value);
    if (!isFinite(v)) v = min;
    v = Math.round(Math.max(min, Math.min(max, v)) * f) / f;
    el.sal.value = v;
    applySalFromField();
    calcular();
  });
  // Levadura (solo editable en Manual): guarda el valor fijo y recalcula.
  el.levadura.addEventListener('input', () => {
    // El campo está en % de la harina; el canónico es g/kg (% × 10).
    if (yeastMode === 'manual') manualYeastPerKg = (parseDecimal(el.levadura.value) || 0) * 10;
    calcular();
  });
  // Al salir del campo (o Enter), topamos el % manual a [0,01 %, 3 %] (los botones ya
  // lo hacen; esto cubre el tecleo directo de un valor fuera de rango o no válido).
  el.levadura.addEventListener('change', () => {
    if (yeastMode !== 'manual') return;
    const pct = clampYeastPct(el.levadura.value);
    el.levadura.value = pct;
    manualYeastPerKg = pct * 10;
    calcular();
  });

  // ---- Levadura: alternar entre cálculo automático y ajuste manual ----
  function setYeastMode(mode){
    yeastMode = (mode === 'manual') ? 'manual' : 'auto';
    // Al pasar a Manual, arranca desde el valor Auto actual (ambiente + nevera),
    // topado al rango manual [0,01 %, 3 %].
    if (yeastMode === 'manual') {
      manualYeastPerKg = clampYeastPct(autoYeastGkg() / 10) * 10;
    }
    renderParamModes();
    calcular();
  }
  // Lápiz (Auto) / volver (Manual): alterna entre cálculo automático y ajuste manual.
  if (el.yeastEditBtn) el.yeastEditBtn.addEventListener('click', () => {
    setYeastMode(yeastMode === 'auto' ? 'manual' : 'auto');
  });

  renderFlours();

  // Al hacer foco/tap en cualquier input numérico, selecciona su contenido
  // para que el usuario pueda escribir encima sin tener que borrar antes.
  document.addEventListener('focus', (e) => {
    if (e.target.matches('input[type="number"], input[inputmode="decimal"], input[inputmode="numeric"]')) {
      e.target.select();
    }
  }, true);

  // Barra-resumen fija en móvil: visible mientras el resultado sigue por debajo
  // del pliegue; se oculta al llegar a él. Al tocarla, salta al desglose completo.
  const resultsCard = document.querySelector('.results');
  function updateSummaryVisibility(){
    if (!mobileSummary || !resultsCard) return;
    if (window.innerWidth > 900) { mobileSummary.classList.remove('show'); return; }
    const rect = resultsCard.getBoundingClientRect();
    const alcanzado = rect.top <= (window.innerHeight - 40);
    mobileSummary.classList.toggle('show', !alcanzado);
  }
  let summaryTick = false;
  function onSummaryScroll(){
    if (summaryTick) return;
    summaryTick = true;
    requestAnimationFrame(() => { updateSummaryVisibility(); summaryTick = false; });
  }
  if (mobileSummary && resultsCard) {
    const sinMovimiento = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const irAlResultado = () => resultsCard.scrollIntoView({ behavior: sinMovimiento() ? 'auto' : 'smooth', block: 'start' });
    mobileSummary.addEventListener('click', irAlResultado);
    mobileSummary.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); irAlResultado(); }
    });
    window.addEventListener('scroll', onSummaryScroll, { passive: true });
    window.addEventListener('resize', updateSummaryVisibility);
    updateSummaryVisibility();
  }

  // ---- Tarjetas plegables (01-04): estado por defecto responsive + persistencia ----
  // Por defecto: escritorio = todas abiertas (atributo open del HTML); móvil (primera
  // visita, sin preferencia guardada) = solo Fermentación. Los cambios se recuerdan.
  (function initCards(){
    const CARDS_KEY = 'edu_pizza_open_card_v1';
    const cardMap = { tanda: el.cardTanda, ferm: el.cardFerm, params: el.cardParams, flour: el.cardFlour };
    const keys = Object.keys(cardMap);
    // Acordeón guiado: solo una tarjeta abierta a la vez. Por defecto, el paso 1.
    function openOnly(which){ keys.forEach(k => { if (cardMap[k]) cardMap[k].open = (k === which); }); }
    let stored = null;
    try { stored = localStorage.getItem(CARDS_KEY); } catch (e) {}
    openOnly(cardMap[stored] ? stored : 'tanda');
    const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let userToggled = false; // true solo si el usuario abre/cierra (clic o teclado en la cabecera)
    keys.forEach(k => {
      const c = cardMap[k];
      if (!c) return;
      const head = c.querySelector('.card-head');
      if (head) head.addEventListener('click', () => { userToggled = true; });
      c.addEventListener('toggle', () => {
        const wasUser = userToggled; userToggled = false;
        if (!c.open) return;   // solo actuamos al ABRIR: cerramos las demás (paso a paso)
        // Posición de esta tarjeta ANTES de colapsar las demás (para compensar el salto).
        const beforeTop = wasUser ? c.getBoundingClientRect().top : 0;
        keys.forEach(j => { if (j !== k && cardMap[j] && cardMap[j].open) cardMap[j].open = false; });
        try { localStorage.setItem(CARDS_KEY, k); } catch (e) {}
        if (!wasUser) return;   // nunca en la carga inicial
        // Al cerrar una tarjeta que estaba ARRIBA, el contenido se encoge y esta tarjeta
        // "salta" hacia arriba de golpe. Compensamos ese salto al instante (la dejamos donde
        // estaba a la vista) y LUEGO hacemos el scroll suave hasta arriba: transición natural.
        const afterTop = c.getBoundingClientRect().top; // fuerza reflow: layout ya definitivo
        if (afterTop !== beforeTop) window.scrollBy({ top: afterTop - beforeTop, left: 0, behavior: 'auto' });
        requestAnimationFrame(function () {
          c.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
        });
      });
    });
  })();

  // Consejos (amasado / fermentación): al ABRIR uno, lo llevamos arriba con el mismo scroll
  // suave que los pasos. Son independientes (no se cierra nada encima), así que no hace falta
  // compensar salto. Solo al abrir por el usuario (no en la carga ni al abrir por el enlace
  // "Ver consejos", que ya hace su propio scroll).
  (function initTipsScroll(){
    const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const accs = Array.prototype.slice.call(document.querySelectorAll('details.accordion'));
    accs.forEach(function (acc) {
      const head = acc.querySelector('.accordion-summary');
      let userToggled = false;
      if (head) head.addEventListener('click', function () { userToggled = true; });
      acc.addEventListener('toggle', function () {
        const wasUser = userToggled; userToggled = false;
        if (!acc.open) return;
        // Posición ANTES de cerrar el resto (para compensar el salto, igual que los pasos).
        const beforeTop = wasUser ? acc.getBoundingClientRect().top : 0;
        // Solo un consejo abierto a la vez: cerramos los demás.
        accs.forEach(function (other) { if (other !== acc && other.open) other.open = false; });
        if (!wasUser) return;   // nunca en la carga ni al abrir por el enlace "Ver consejos"
        const afterTop = acc.getBoundingClientRect().top;
        if (afterTop !== beforeTop) window.scrollBy({ top: afterTop - beforeTop, left: 0, behavior: 'auto' });
        requestAnimationFrame(function () {
          acc.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
        });
      });
    });
  })();

  // Interruptor de avisos (Configuración): activa/desactiva los banners no bloqueantes.
  (function initWarningsToggle(){
    const toggle = document.getElementById('warningsToggle');
    if (!toggle) return;
    const opts = toggle.querySelectorAll('.seg-opt');
    function sync(){
      opts.forEach(function (b) {
        const on = (b.getAttribute('data-warnings') === (warningsEnabled ? 'on' : 'off'));
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
    }
    opts.forEach(function (b) {
      b.addEventListener('click', function () {
        warningsEnabled = (b.getAttribute('data-warnings') === 'on');
        try { localStorage.setItem(WARN_KEY, warningsEnabled ? 'on' : 'off'); } catch (e) {}
        sync();
        calcular();
      });
    });
    sync();
  })();


  // Vuelve a pintar las harinas y los textos calculados cuando cambia el idioma
  window.addEventListener('pizzaLangChange', () => {
    renderInputUnits();
    renderParamModes(); // reajusta la pista de la levadura al idioma según el modo
    updateHydrationInfo(); // re-traduce la caja de hidratación
    renderFlours();
    refreshRecipesUI();
    if (loadRecipeModal.style.display === 'flex') renderRecipeList();
    calcular(); // re-traduce avisos y el badge de resultados (Con avisos / Listo) al nuevo idioma
  });

  // Recalcula (reformatea pesos y temperatura) al cambiar métrico ↔ imperial.
  window.addEventListener('pizzaUnitsChange', () => { renderInputUnits(); syncFridgeTempUnit(); renderParamModes(); calcular(); });

  // Cambiar la base de la sal (g/L de agua ↔ % de la harina). Al conmutar se
  // conserva la sal física: la variable de la nueva base ya está sincronizada
  // (syncSaltDerived la mantiene al día), así que solo hay que repintar y recalcular.
  window.addEventListener('pizzaSaltUnitChange', () => { renderInputUnits(); renderParamModes(); calcular(); });

  // Cambiar °C ↔ °F SOLO reformatea el valor mostrado: el slider y el cálculo
  // siguen en °C, así que ningún gramo cambia. Actualizamos únicamente el display.
  window.addEventListener('pizzaTempChange', () => {
    const t = parseInt(el.temperatura.value, 10) || 18;
    el.tempValue.value = U.tempValue(t);
    if (el.tempUnit) el.tempUnit.textContent = U.tempUnit();
    syncFridgeTempUnit(); // reconvierte la nevera si la unidad de temperatura cambió
    renderResultFerment(); // refresca las temperaturas del resumen en la nueva unidad
  });

  // ==================== RECETAS GUARDADAS (con nombre) ====================
  const SAVED_RECIPES_KEY = 'edu_pizza_saved_recipes_v1';
  const loadRecipeBtn = document.getElementById('loadRecipeBtn');
  const loadRecipeModal = document.getElementById('loadRecipeModal');
  const loadRecipeCloseBtn = document.getElementById('loadRecipeCloseBtn');
  const recipeListContainer = document.getElementById('recipeListContainer');
  const recipeListEmpty = document.getElementById('recipeListEmpty');
  const activeRecipeLine = document.getElementById('activeRecipeLine');
  const activeRecipeNameEl = document.getElementById('activeRecipeName');
  const deleteRecipeBtn = document.getElementById('deleteRecipeBtn');
  const saveRecipeBtn = document.getElementById('saveRecipeBtn');
  const saveRecipeModal = document.getElementById('saveRecipeModal');
  const saveRecipeNameInput = document.getElementById('saveRecipeNameInput');
  const saveRecipeCancelBtn = document.getElementById('saveRecipeCancelBtn');
  const saveRecipeConfirmBtn = document.getElementById('saveRecipeConfirmBtn');
  const saveRecipeNewBtn = document.getElementById('saveRecipeNewBtn');
  const saveModalSub = document.getElementById('saveModalSub');
  const saveModalError = document.getElementById('saveModalError');
  const saveRecipeNotesInput = document.getElementById('saveRecipeNotesInput');
  const recipeNotesDisplay = document.getElementById('recipeNotesDisplay');
  const recipeStatusEl = document.getElementById('recipeStatus');
  const exportRecipesBtn = document.getElementById('exportRecipesBtn');
  const importRecipesBtn = document.getElementById('importRecipesBtn');
  const importRecipesInput = document.getElementById('importRecipesInput');
  // id de la receta seleccionada al abrir el modal (para "Actualizar"); null = crear nueva
  let editingRecipeId = null;
  // id de la receta actualmente cargada en la calculadora (la "receta activa");
  // null = ninguna receta cargada (config nueva o importada sin cargar).
  let activeRecipeId = null;

  function getSavedRecipes() {
    try {
      const raw = localStorage.getItem(SAVED_RECIPES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function setSavedRecipes(list) {
    try { localStorage.setItem(SAVED_RECIPES_KEY, JSON.stringify(list)); } catch (e) {}
  }

  // Clave de contenido de una receta, ignorando el id interno de cada harina
  // (ese id no define la receta; dos recetas con el mismo contenido deben
  // considerarse iguales aunque sus harinas tengan ids distintos).
  function dataKey(d) {
    d = d || {};
    const flours = (d.flours || []).map(f => F.migrateRef(f) + ':' + f.pct + ':' + (f.locked ? 1 : 0)).join(',');
    const sm = d.salMode || 'auto';
    const ym = d.yeastMode || 'auto';
    const my = (ym === 'manual') ? (d.manualYeastPerKg != null ? d.manualYeastPerKg : '') : '';
    const cold = d.fridgeOn ? ('1:' + d.tempFrio + ':' + d.horasFrio) : '0';
    return [d.numPaneteos, d.pesoPaneto, d.temperatura, d.horas, cold, d.hidratacion, d.sal, sm, ym, my, flours].join('|');
  }

  // ¿La configuración actual coincide con alguna receta guardada?
  function findMatchingRecipe() {
    const cur = dataKey(currentData());
    return getSavedRecipes().find(r => r.data && dataKey(r.data) === cur) || null;
  }

  // Indica si lo que hay en pantalla está guardado como receta o no.
  // La config se autoguarda en el navegador (reaparece al recargar), pero eso
  // no es una receta persistida; este aviso evita esa confusión.
  function updateRecipeStatus() {
    if (!recipeStatusEl) return;
    const match = findMatchingRecipe();
    if (match) {
      recipeStatusEl.className = 'recipe-status saved';
      recipeStatusEl.textContent = I18N.t('statusSaved');
      recipeStatusEl.title = match.name;
    } else {
      recipeStatusEl.className = 'recipe-status unsaved';
      recipeStatusEl.textContent = I18N.t('statusUnsaved');
      recipeStatusEl.removeAttribute('title');
    }
  }

  function showToast(message) {
    const toast = document.createElement('div');
    // role=status + aria-live para que los lectores de pantalla anuncien el aviso
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = message;
    toast.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%) translateY(0); background:var(--forno); color:var(--farina); padding:12px 20px; border-radius:12px; font-size:13.5px; font-weight:600; z-index:10001; box-shadow:0 12px 30px -8px rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.12); transition: opacity 0.3s ease, transform 0.3s ease; opacity:1;';
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 1800);
  }

  // Devuelve la receta activa (la cargada en la calculadora) o null.
  function getActiveRecipe() {
    if (activeRecipeId == null) return null;
    return getSavedRecipes().find(r => String(r.id) === String(activeRecipeId)) || null;
  }

  // Refresca toda la UI de recetas: línea de "receta activa", estado guardada/sin
  // guardar, notas y disponibilidad de los botones. Sustituye al antiguo <select>.
  function refreshRecipesUI() {
    const list = getSavedRecipes();
    const active = getActiveRecipe();
    if (!active) activeRecipeId = null;

    if (activeRecipeNameEl && activeRecipeLine) {
      if (active) {
        activeRecipeNameEl.textContent = active.name;
        activeRecipeLine.classList.remove('none');
      } else {
        activeRecipeNameEl.textContent = I18N.t('noActiveRecipe');
        activeRecipeLine.classList.add('none');
      }
    }

    loadRecipeBtn.disabled = list.length === 0;   // "Cargar" abre la lista de recetas
    deleteRecipeBtn.disabled = !active;            // "Borrar" actúa sobre la receta activa
    if (exportRecipesBtn) exportRecipesBtn.disabled = list.length === 0;

    updateNotesDisplay();
    updateRecipeStatus();
  }

  // Muestra las notas de la receta activa (si tiene) bajo la fila de acciones.
  function updateNotesDisplay() {
    if (!recipeNotesDisplay) return;
    const recipe = getActiveRecipe();
    const notes = recipe && recipe.notes ? String(recipe.notes).trim() : '';
    recipeNotesDisplay.textContent = notes;
    recipeNotesDisplay.style.display = notes ? '' : 'none';
  }

  // Iconos (estilo trazo del resto de la app) para las stats de cada receta.
  const RECIPE_STAT_ICON = {
    hydration: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.7l5.7 5.6a8 8 0 1 1-11.4 0z"/></svg>',
    batch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 11h.01"/><path d="M11 15h.01"/><path d="M16 16h.01"/><path d="m2 16 20 6-6-20A20 20 0 0 0 2 16"/><path d="M5.71 17.11a17.04 17.04 0 0 1 11.4-11.4"/></svg>',
    total: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"/><path d="M6.5 8h11l1.84 10.15a2 2 0 0 1-1.97 2.35H6.63a2 2 0 0 1-1.97-2.35z"/></svg>',
    salt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8a1 1 0 0 0 1-1.08L16.3 9H7.7l-.7 10.92A1 1 0 0 0 8 21Z"/><path d="M8.5 9V6a3.5 3.5 0 0 1 7 0v3"/></svg>',
    ferment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    yeast: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="14" r="4"/><circle cx="16.5" cy="8.5" r="2.5"/><circle cx="17" cy="16" r="1.5"/></svg>',
    flour: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 22 16 8"/><path d="M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"/><path d="M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"/><path d="M11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"/><path d="M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z"/><path d="M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z"/></svg>'
  };
  // Añade una stat (icono + valor) a la línea meta. El texto va con textContent
  // (a prueba de XSS); el icono es marcado estático de confianza.
  function addRecipeStat(container, iconSvg, label, value){
    const stat = document.createElement('span');
    stat.className = 'recipe-meta-stat';
    if (label) stat.title = label;
    const ico = document.createElement('span');
    ico.className = 'recipe-meta-ico';
    ico.setAttribute('aria-hidden', 'true');
    ico.innerHTML = iconSvg;
    stat.appendChild(ico);
    stat.appendChild(document.createTextNode(value));
    container.appendChild(stat);
  }

  // Pinta la lista de recetas dentro del modal "Cargar receta".
  function renderRecipeList() {
    if (!recipeListContainer) return;
    const list = getSavedRecipes();
    recipeListContainer.innerHTML = '';
    if (list.length === 0) {
      recipeListEmpty.style.display = '';
      return;
    }
    recipeListEmpty.style.display = 'none';
    list.slice().reverse().forEach(recipe => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'recipe-item' + (String(recipe.id) === String(activeRecipeId) ? ' active' : '');
      item.dataset.id = recipe.id;

      const nameRow = document.createElement('span');
      nameRow.className = 'recipe-item-name';
      const nameText = document.createElement('span');
      nameText.textContent = recipe.name;            // textContent -> a prueba de XSS
      nameRow.appendChild(nameText);
      if (String(recipe.id) === String(activeRecipeId)) {
        const badge = document.createElement('span');
        badge.className = 'recipe-item-badge';
        badge.textContent = I18N.t('statusActive');
        nameRow.appendChild(badge);
      }
      item.appendChild(nameRow);

      const d = recipe.data || {};
      const num = parseDecimal(d.numPaneteos) || 0;
      const per = parseDecimal(d.pesoPaneto) || 0;
      const meta = document.createElement('span');
      meta.className = 'recipe-item-meta';
      // Etiqueta con iconos: hidratación · tanda (nº × peso) · masa total.
      // Cada stat lleva su icono para que se entienda sin descifrar los números.
      addRecipeStat(meta, RECIPE_STAT_ICON.hydration, I18N.t('recipeHydration'),
        (d.hidratacion != null ? d.hidratacion : '?') + '%');
      addRecipeStat(meta, RECIPE_STAT_ICON.batch, I18N.t('recipeMetaBatch'),
        (num || '?') + ' × ' + U.formatWeight(per));
      addRecipeStat(meta, RECIPE_STAT_ICON.total, I18N.t('recipeMetaTotal'),
        U.formatWeight(num * per));
      // Sal: en la unidad activa de Ajustes — g/L de agua (canónico) o % de la harina. El %
      // se deriva del g/L guardado y la hidratación de la receta (sal% = g/L · hid / 1000).
      const salTxt = saltIsFlour()
        ? U.formatNumber((d.sal || 0) * (d.hidratacion || 0) / 1000, 1) + '%'
        : U.formatNumber(d.sal != null ? d.sal : 0) + ' g/L';
      addRecipeStat(meta, RECIPE_STAT_ICON.salt, I18N.t('recipeSalt2'), salTxt);
      // Fermentación: ambiente y, si la receta la tiene, la fase controlada (nevera).
      const fAmb = U.formatNumber(d.horas != null ? d.horas : 0, 0) + ' h · ' +
        U.tempValue(parseInt(d.temperatura, 10) || 18) + U.tempUnit();
      const fermTxt = d.fridgeOn
        ? fAmb + ' + ' + U.formatNumber(d.horasFrio != null ? d.horasFrio : 0, 0) + ' h · ' +
          Math.round(U.tempValue(parseFloat(d.tempFrio) || 4)) + U.tempUnit()
        : fAmb;
      addRecipeStat(meta, RECIPE_STAT_ICON.ferment, I18N.t('recipeFermentation'), fermTxt);
      // Levadura solo si es manual (en Auto la calcula la fermentación; no es un valor fijo).
      if (d.yeastMode === 'manual') {
        addRecipeStat(meta, RECIPE_STAT_ICON.yeast, I18N.t('levaduraLabel'),
          U.formatNumber((parseFloat(d.manualYeastPerKg) || 0) / 10, 2) + '%');
      }
      item.appendChild(meta);

      // Harinas (compacto): el nombre si es una sola; el número si es mezcla. No listamos
      // todas con su % (recargaba la tarjeta); el detalle completo se ve al cargar la receta.
      const flrs = Array.isArray(d.flours) ? d.flours : [];
      if (flrs.length) {
        const flText = (flrs.length === 1)
          ? flourName(flrs[0].flourId)
          : (flrs.length + ' ' + I18N.t('flourCountWord'));
        const flLine = document.createElement('span');
        flLine.className = 'recipe-item-flours';
        flLine.title = I18N.t('section4Title');
        const flIco = document.createElement('span');
        flIco.className = 'recipe-meta-ico';
        flIco.setAttribute('aria-hidden', 'true');
        flIco.innerHTML = RECIPE_STAT_ICON.flour;
        flLine.appendChild(flIco);
        flLine.appendChild(document.createTextNode(flText));  // textContent -> a prueba de XSS
        item.appendChild(flLine);
      }

      if (recipe.notes && String(recipe.notes).trim()) {
        const notes = document.createElement('span');
        notes.className = 'recipe-item-notes';
        notes.textContent = String(recipe.notes).trim();
        item.appendChild(notes);
      }

      item.addEventListener('click', () => attemptLoad(recipe.id));
      recipeListContainer.appendChild(item);
    });
  }

  function openLoadModal() {
    if (getSavedRecipes().length === 0) return;
    renderRecipeList();
    openModal(loadRecipeModal, loadRecipeCloseBtn);
  }
  function closeLoadModal() { closeModal(loadRecipeModal); }

  // ---- Modales accesibles: foco atrapado, Escape y devolución de foco al abridor ----
  const confirmModal = document.getElementById('confirmModal');
  const confirmModalText = document.getElementById('confirmModalText');
  const confirmOkBtn = document.getElementById('confirmOkBtn');
  const confirmCancelBtn = document.getElementById('confirmCancelBtn');

  let lastFocusedBeforeModal = null;

  // Bloquea el scroll del fondo mientras haya cualquier modal (.modal-overlay) abierto.
  function syncScrollLock() {
    const anyOpen = Array.from(document.querySelectorAll('.modal-overlay')).some(m => m.style.display === 'flex');
    document.documentElement.classList.toggle('modal-open', anyOpen);
  }

  function getFocusables(modal) {
    return Array.from(modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.disabled && el.offsetParent !== null);
  }

  // Atrapa el Tab dentro del modal y cierra con Escape sea cual sea el foco.
  function onModalKeydown(e, modal, onEscape) {
    if (e.key === 'Escape') { e.preventDefault(); onEscape(); return; }
    if (e.key !== 'Tab') return;
    const f = getFocusables(modal);
    if (f.length === 0) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function openModal(modal, focusTarget) {
    lastFocusedBeforeModal = document.activeElement;
    modal.style.display = 'flex';
    syncScrollLock();
    setTimeout(() => {
      const t = focusTarget || getFocusables(modal)[0];
      // preventScroll: enfocar al abrir no debe desplazar el scroll interno de la tarjeta
      // (si no, un modal alto con el foco abajo se abre mostrando el final en vez del inicio).
      if (t) { try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); } }
    }, 50);
  }

  function closeModal(modal) {
    modal.style.display = 'none';
    syncScrollLock();
    if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
      lastFocusedBeforeModal.focus();
    }
    lastFocusedBeforeModal = null;
  }

  // ¿Existe ya una receta con ese nombre? (sin distinguir mayúsculas ni espacios).
  // exceptId permite ignorar la propia receta que se está editando.
  function nameExists(name, exceptId) {
    const n = name.trim().toLowerCase();
    if (!n) return false;
    return getSavedRecipes().some(r => r.id !== exceptId && (r.name || '').trim().toLowerCase() === n);
  }

  // Ajusta en vivo el estado de los botones y la pista según el nombre escrito.
  function updateSaveButtons() {
    const name = saveRecipeNameInput.value.trim();
    const empty = !name;
    const takenByAny = nameExists(name, null);            // lo usa alguna receta
    const takenByOther = nameExists(name, editingRecipeId); // lo usa OTRA receta

    // "Guardar como nueva": nunca puede reutilizar un nombre existente.
    saveRecipeNewBtn.disabled = empty || takenByAny;
    // Primario: crear (nueva) bloquea si el nombre existe; actualizar solo si
    // choca con OTRA receta (mantener el nombre propio sí se permite).
    saveRecipeConfirmBtn.disabled = empty || (editingRecipeId != null ? takenByOther : takenByAny);

    if (takenByOther) {
      saveModalError.textContent = I18N.t('duplicateNameError');
      saveModalError.style.display = '';
    } else {
      saveModalError.style.display = 'none';
    }
  }

  // ---- Modal "Guardar receta" (crear nueva o actualizar la seleccionada) ----
  function openSaveModal() {
    // La receta activa es la candidata a "Actualizar"; si no hay ninguna cargada,
    // se guarda como nueva.
    const seleccionada = getActiveRecipe();
    editingRecipeId = seleccionada ? seleccionada.id : null;

    if (seleccionada) {
      saveRecipeNameInput.value = seleccionada.name;
      saveRecipeNotesInput.value = seleccionada.notes || '';
      saveModalSub.textContent = I18N.t('saveModalSubEdit').replace('{name}', seleccionada.name);
      saveRecipeConfirmBtn.textContent = I18N.t('modalUpdate');
      saveRecipeNewBtn.style.display = '';
    } else {
      saveRecipeNameInput.value = '';
      saveRecipeNotesInput.value = '';
      saveModalSub.textContent = I18N.t('saveModalSub');
      saveRecipeConfirmBtn.textContent = I18N.t('modalSave');
      saveRecipeNewBtn.style.display = 'none';
    }
    updateSaveButtons();
    // Enfocamos la tarjeta del diálogo (no el campo de nombre): así el popup se
    // abre sin desplegar el teclado en móvil, pero el foco sigue dentro del modal
    // para que funcionen Escape y la trampa de tabulación.
    openModal(saveRecipeModal, saveRecipeModal.querySelector('.modal-card'));
  }
  function closeSaveModal() {
    closeModal(saveRecipeModal);
  }

  saveRecipeBtn.addEventListener('click', openSaveModal);
  saveRecipeCancelBtn.addEventListener('click', closeSaveModal);
  saveRecipeModal.addEventListener('click', (e) => {
    if (e.target === saveRecipeModal) closeSaveModal();
  });
  saveRecipeModal.addEventListener('keydown', (e) => onModalKeydown(e, saveRecipeModal, closeSaveModal));
  saveRecipeNameInput.addEventListener('input', updateSaveButtons);
  saveRecipeNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); guardarReceta({ overwriteId: editingRecipeId }); }
  });

  // ---- Modal de confirmación genérico (sustituye a window.confirm) ----
  function showConfirm(message, confirmLabel) {
    confirmModalText.textContent = message;
    confirmOkBtn.textContent = confirmLabel || I18N.t('modalConfirmDefault');
    return new Promise((resolve) => {
      const cleanup = () => {
        confirmOkBtn.removeEventListener('click', onOk);
        confirmCancelBtn.removeEventListener('click', onCancel);
        confirmModal.removeEventListener('click', onBackdrop);
        confirmModal.removeEventListener('keydown', onKey);
      };
      const finish = (val) => { cleanup(); closeModal(confirmModal); resolve(val); };
      const onOk = () => finish(true);
      const onCancel = () => finish(false);
      const onBackdrop = (e) => { if (e.target === confirmModal) finish(false); };
      const onKey = (e) => onModalKeydown(e, confirmModal, () => finish(false));
      confirmOkBtn.addEventListener('click', onOk);
      confirmCancelBtn.addEventListener('click', onCancel);
      confirmModal.addEventListener('click', onBackdrop);
      confirmModal.addEventListener('keydown', onKey);
      // Foco inicial en Cancelar para no destruir con un Enter accidental.
      openModal(confirmModal, confirmCancelBtn);
    });
  }

  // Configuración actual del formulario como objeto "data" de una receta.
  function currentData() {
    return {
      numPaneteos: parseDecimal(el.numPaneteos.value),
      pesoPaneto: pesoG,
      temperatura: parseInt(el.temperatura.value, 10),
      horas: clampHoras(el.horas.value),
      fridgeOn: el.fridgeToggle.checked,
      tempFrio: coldTempC(),
      horasFrio: clampColdHoras(el.horasFrio.value),
      hidratacion: parseDecimal(el.hidratacion.value),
      sal: salGL,
      salMode: salMode,
      yeastMode: yeastMode,
      manualYeastPerKg: manualYeastPerKg,
      flours: JSON.parse(JSON.stringify(flours))
    };
  }

  // Genera un id único que no colisione con los presentes en idsSet (Set de strings).
  function nuevoId(idsSet) {
    let id = Date.now();
    while (idsSet.has(String(id))) id++;
    return id;
  }

  // Crea una receta nueva o, si opts.overwriteId apunta a una existente, la
  // sobrescribe con el nombre y la configuración actuales.
  function guardarReceta(opts) {
    opts = opts || {};
    const name = saveRecipeNameInput.value.trim();
    if (!name) {
      showToast(I18N.t('emptyNameAlert'));
      saveRecipeNameInput.focus();
      return;
    }
    // No permitir nombres duplicados: al crear, contra cualquier receta; al
    // actualizar, contra cualquier OTRA receta (conservar el propio nombre sí vale).
    if (nameExists(name, opts.overwriteId != null ? opts.overwriteId : null)) {
      showToast(I18N.t('duplicateNameError'));
      updateSaveButtons();
      saveRecipeNameInput.focus();
      return;
    }
    const notes = saveRecipeNotesInput.value.trim().slice(0, 500);
    const list = getSavedRecipes();
    const existente = opts.overwriteId != null ? list.find(r => r.id === opts.overwriteId) : null;
    let targetId;
    if (existente) {
      existente.name = name;
      existente.notes = notes;
      existente.data = currentData();
      existente.updatedAt = new Date().toISOString();
      targetId = existente.id;
    } else {
      const ids = new Set(list.map(r => String(r.id)));
      const nueva = { id: nuevoId(ids), name: name, notes: notes, savedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), data: currentData() };
      list.push(nueva);
      targetId = nueva.id;
    }
    setSavedRecipes(list);
    // La receta guardada pasa a ser la activa. Cerramos el modal antes de repintar
    // para que el cierre nunca dependa de pasos de UI posteriores.
    activeRecipeId = targetId;
    closeSaveModal();
    refreshRecipesUI();
    showToast(existente ? I18N.t('recipeUpdatedToast') : I18N.t('recipeSavedToast'));
  }

  saveRecipeConfirmBtn.addEventListener('click', () => guardarReceta({ overwriteId: editingRecipeId }));
  saveRecipeNewBtn.addEventListener('click', () => guardarReceta({ overwriteId: null }));

  // Carga una receta por id en la calculadora y la marca como activa.
  function loadRecipe(id) {
    const recipe = getSavedRecipes().find(r => String(r.id) === String(id));
    if (!recipe) return;
    const d = recipe.data;
    el.numPaneteos.value = d.numPaneteos;
    pesoG = d.pesoPaneto;
    el.temperatura.value = d.temperatura;
    el.horas.value = clampHoras(d.horas); // recetas antiguas sin horas -> 28 h por defecto
    el.fridgeToggle.checked = !!d.fridgeOn; // recetas antiguas -> sin nevera
    renderColdTempField(clampColdTempC(d.tempFrio));
    el.horasFrio.value = clampColdHoras(d.horasFrio);
    applyFridgeVisibility();
    el.hidratacion.value = clampHidratacion(d.hidratacion); // recetas antiguas < 50% se topan a 50
    salGL = d.sal;
    // Deriva el % de harina desde el g/L canónico guardado y la hidratación de la
    // receta (round-trip exacto si se guardó en modo % harina a esa hidratación).
    { const hLoad = (parseDecimal(el.hidratacion.value) || 0) / 100; salPctFlour = hLoad > 0 ? hLoad * salGL / 10 : 2.5; }
    salMode = 'manual'; // la sal es siempre editable (sin modo)
    yeastMode = d.yeastMode || 'auto';
    manualYeastPerKg = (d.manualYeastPerKg != null) ? d.manualYeastPerKg : autoYeastGkg();
    renderInputUnits();
    renderParamModes();
    flours = migrateFlours(d.flours); // acepta recetas antiguas (catalogId) y nuevas (flourId)
    let maxIdLoaded = 0;
    flours.forEach(f => { if (f.id > maxIdLoaded) maxIdLoaded = f.id; });
    flourIdCounter = maxIdLoaded + 1;
    activeRecipeId = recipe.id;
    renderFlours();       // recalcula y dispara onConfigChange -> updateRecipeStatus
    refreshRecipesUI();
    showToast(I18N.t('recipeLoadedToast'));
  }

  // Intenta cargar una receta desde la lista. Si la config actual tiene cambios
  // sin guardar (no coincide con ninguna receta), avisa antes de descartarlos.
  async function attemptLoad(id) {
    closeLoadModal();
    if (!findMatchingRecipe()) {
      const ok = await showConfirm(I18N.t('unsavedLoadWarning'), I18N.t('discardAndLoad'));
      if (!ok) return; // el usuario cancela; puede guardar y reabrir la lista
    }
    loadRecipe(id);
  }

  loadRecipeBtn.addEventListener('click', openLoadModal);
  if (loadRecipeCloseBtn) loadRecipeCloseBtn.addEventListener('click', closeLoadModal);
  loadRecipeModal.addEventListener('click', (e) => { if (e.target === loadRecipeModal) closeLoadModal(); });
  loadRecipeModal.addEventListener('keydown', (e) => onModalKeydown(e, loadRecipeModal, closeLoadModal));

  // "Borrar" elimina la receta activa (la cargada), tras confirmar.
  deleteRecipeBtn.addEventListener('click', async () => {
    const active = getActiveRecipe();
    if (!active) return;
    const confirmado = await showConfirm(I18N.t('confirmDeleteRecipe'), I18N.t('modalDelete'));
    if (!confirmado) return;
    const list = getSavedRecipes().filter(r => String(r.id) !== String(active.id));
    setSavedRecipes(list);
    activeRecipeId = null;
    refreshRecipesUI();
    showToast(I18N.t('recipeDeletedToast'));
  });

  // ---- Exportar / Importar recetas (JSON) ----
  function recipesToJSON() {
    const recipes = getSavedRecipes();
    // Embebe las harinas de usuario referenciadas por esas recetas, para que el import las
    // recree (con su id) en otro dispositivo; si no, caerían a la por defecto.
    const usedUser = new Set();
    recipes.forEach(function (r) {
      if (r.data && Array.isArray(r.data.flours)) {
        r.data.flours.forEach(function (fl) { if (F.isUserFlour(fl.flourId)) usedUser.add(fl.flourId); });
      }
    });
    const userFlours = F.userFlours().filter(function (uf) { return usedUser.has(uf.id); });
    return JSON.stringify({
      app: 'calculatupizza', type: 'recipes', version: 2,
      exportedAt: new Date().toISOString(),
      userFlours: userFlours,
      recipes: recipes
    }, null, 2);
  }

  function exportRecipes() {
    if (getSavedRecipes().length === 0) { showToast(I18N.t('noRecipesToExport')); return; }
    const blob = new Blob([recipesToJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recetas-pizza.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(I18N.t('recipesExportedToast'));
  }

  // Valida y normaliza una receta importada; devuelve null si no es válida.
  function normalizeRecipe(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const d = (raw.data && typeof raw.data === 'object') ? raw.data : raw;
    if (!Array.isArray(d.flours) || d.flours.length === 0) return null;
    const num = (v, def) => { const n = parseFloat(v); return isFinite(n) ? n : def; };
    // migrateFlours acepta tanto flourId (nuevo) como catalogId (antiguo) y siempre
    // devuelve flourId de texto: así las recetas importadas viejas siguen valiendo.
    const flours = migrateFlours(d.flours);
    const name = (typeof raw.name === 'string' && raw.name.trim())
      ? raw.name.trim().slice(0, 40)
      : I18N.t('importedRecipeName');
    const notes = (typeof raw.notes === 'string') ? raw.notes.slice(0, 500) : '';
    return {
      name: name,
      notes: notes,
      savedAt: (typeof raw.savedAt === 'string') ? raw.savedAt : new Date().toISOString(),
      updatedAt: (typeof raw.updatedAt === 'string') ? raw.updatedAt : new Date().toISOString(),
      data: {
        numPaneteos: num(d.numPaneteos, 6),
        pesoPaneto: num(d.pesoPaneto, 280),
        temperatura: Math.round(num(d.temperatura, 18)),
        horas: clampHoras(num(d.horas, 28)),
        fridgeOn: (d.fridgeOn === true),
        tempFrio: clampColdTempC(num(d.tempFrio, 4)),
        horasFrio: clampColdHoras(num(d.horasFrio, 24)),
        hidratacion: clampHidratacion(num(d.hidratacion, 63)),
        sal: num(d.sal, 40),
        salMode: (d.salMode === 'manual' || d.salMode === 'auto') ? d.salMode : (num(d.sal, 40) === 40 ? 'auto' : 'manual'),
        yeastMode: (d.yeastMode === 'manual') ? 'manual' : 'auto',
        manualYeastPerKg: num(d.manualYeastPerKg, 1.0),
        flours: flours
      }
    };
  }

  // Firma de "misma receta" para deduplicar al importar (nombre + notas +
  // contenido, ignorando el id interno de las harinas vía dataKey).
  function recipeSignature(r) {
    return (r.name || '').trim().toLowerCase() + '|' + (r.notes || '').trim() + '|' + dataKey(r.data);
  }

  // Devuelve un nombre único (sin distinguir mayúsculas) añadiendo " (2)", " (3)"…
  // namesLower es un Set de nombres ya usados en minúsculas.
  function uniqueName(base, namesLower) {
    const MAX = 40;
    let n = 2, candidate;
    do {
      const suffix = ' (' + n + ')';
      const room = MAX - suffix.length;
      candidate = (base.length > room ? base.slice(0, room) : base) + suffix;
      n++;
    } while (namesLower.has(candidate.trim().toLowerCase()));
    return candidate;
  }

  // Fusiona el JSON importado con las recetas actuales (sin borrar nada),
  // saltando duplicados exactos. Devuelve nº de recetas añadidas, o -1 si el
  // archivo no es válido.
  function importFromText(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { return -1; }
    const incoming = Array.isArray(parsed) ? parsed
      : (parsed && Array.isArray(parsed.recipes) ? parsed.recipes : null);
    if (!incoming) return -1;
    // Recrea PRIMERO las harinas de usuario embebidas (preservan su id), para que las
    // recetas que las referencian las resuelvan y las seleccionen (migrateRef comprueba
    // existencia). Sin este paso caerían a la por defecto.
    if (parsed && Array.isArray(parsed.userFlours)) F.importUserFlours(parsed.userFlours);

    const list = getSavedRecipes();
    const ids = new Set(list.map(r => String(r.id)));
    const sigs = new Set(list.map(recipeSignature));
    const names = new Set(list.map(r => (r.name || '').trim().toLowerCase()));
    const contentKeys = new Set(list.map(r => dataKey(r.data)));
    let added = 0;
    incoming.forEach(raw => {
      const rec = normalizeRecipe(raw);
      if (!rec) return;
      if (sigs.has(recipeSignature(rec))) return; // misma receta (nombre+contenido) -> saltar
      // No permitir nombres duplicados: si el nombre ya existe...
      if (names.has(rec.name.trim().toLowerCase())) {
        // ...y ya tienes ese contenido (bajo cualquier nombre), no acumules copias;
        if (contentKeys.has(dataKey(rec.data))) return;
        // ...si el contenido es distinto, renómbrala con sufijo " (2)", " (3)"…
        rec.name = uniqueName(rec.name, names);
      }
      rec.id = nuevoId(ids);
      ids.add(String(rec.id));
      sigs.add(recipeSignature(rec));
      names.add(rec.name.trim().toLowerCase());
      contentKeys.add(dataKey(rec.data));
      list.push(rec);
      added++;
    });
    if (added > 0) setSavedRecipes(list);
    return added;
  }

  exportRecipesBtn.addEventListener('click', exportRecipes);
  importRecipesBtn.addEventListener('click', () => importRecipesInput.click());
  // (al final del bloque se llama a updateNotesDisplay tras el populate inicial)
  importRecipesInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const added = importFromText(String(reader.result));
      if (added < 0) {
        showToast(I18N.t('importError'));
      } else if (added === 0) {
        showToast(I18N.t('importNothingNew'));
      } else {
        refreshRecipesUI();
        if (loadRecipeModal.style.display === 'flex') renderRecipeList();
        showToast(I18N.t('recipesImportedToast').replace('{n}', added));
      }
      importRecipesInput.value = ''; // permite reimportar el mismo archivo
    };
    reader.onerror = () => { showToast(I18N.t('importError')); importRecipesInput.value = ''; };
    reader.readAsText(file);
  });

  // Al arrancar, si la config actual coincide con una receta guardada, la marca
  // como activa (p. ej. tras recargar la página con una receta cargada).
  (function detectActiveOnLoad(){
    const match = findMatchingRecipe();
    if (match) activeRecipeId = match.id;
  })();
  refreshRecipesUI();
  onConfigChange = updateRecipeStatus; // a partir de aquí, cada recálculo refresca el estado
  updateRecipeStatus();

  // Genera el texto de la receta (compartido por Copiar y Compartir).
  function buildRecipeText() {
    const tempC = parseInt(el.temperatura.value, 10);
    const horas = clampHoras(el.horas.value);
    const coldH = coldHoursActive();
    const coldT = coldTempC();
    // Reutiliza la harina ya calculada por calcular() (mismo objeto que alimenta los
    // totales en pantalla), para que el desglose de la mezcla SIEMPRE cuadre con el
    // "Harina total" mostrado. Fallback defensivo: recalcular con la MISMA levadura
    // (Manual o Auto) que usa calcular(), nunca la Auto por defecto.
    const harinaT = (lastRecipe && isFinite(lastRecipe.harinaTotal))
      ? lastRecipe.harinaTotal
      : D.computeRecipe({
          numPizzas: parseDecimal(el.numPaneteos.value) || 0, pesoG: pesoG,
          ambTemp: tempC, ambHours: horas, coldHours: coldH, coldTemp: coldT,
          hidPct: parseDecimal(el.hidratacion.value),
          salGL: salGL, salPctFlour: saltIsFlour() ? salPctFlour : null,
          levPorKgHarina: (yeastMode === 'manual') ? manualYeastPerKg : autoYeastGkg(),
          flours: flours
        }).harinaTotal;

    // Formato compacto y vertical para WhatsApp/redes: cabecera con la web, la fórmula (%)
    // arriba y las cantidades (g) abajo. Pesos pegados a la unidad ("340g") y grados sin
    // espacio ("15°C"); sin markdown (que en algunas apps se ve literal).
    const noSp = (s) => (s || '').replace(/\s+/g, '');
    const wU = U.weightUnit();
    const tU = U.tempUnit();
    const ambTemp = U.tempValue(tempC) + tU;
    const coldTemp = Math.round(U.tempValue(coldT)) + tU;
    const salFormula = U.formatNumber(el.sal.value) + (saltIsFlour() ? '%' : ' g/L');
    const ferm = coldH > 0
      ? U.formatNumber(coldH, 0) + 'h (' + coldTemp + ') + ' + U.formatNumber(horas, 0) + 'h (' + ambTemp + ')'
      : U.formatNumber(horas, 0) + 'h (' + ambTemp + ')';

    const L = [];
    L.push('🍕 ' + I18N.t('recipeHeader') + ' (calculatupizza.com)');
    L.push('');
    L.push('⚪ ' + U.formatNumber(el.numPaneteos.value, 0) + 'x' + U.formatNumber(el.pesoPaneto.value) + wU);
    L.push('💧 ' + U.formatNumber(el.hidratacion.value) + '% ' + I18N.t('recipeWater') +
           ' | 🧂 ' + salFormula + ' ' + I18N.t('recipeSalt2'));
    L.push('⏱️ ' + ferm);
    L.push('');
    L.push(I18N.t('recipeIngredients'));
    L.push('🌾 ' + noSp(el.totalHarina.textContent) + ' ' + I18N.t('recipeFlourShort'));
    L.push('💧 ' + noSp(el.totalAgua.textContent) + ' ' + I18N.t('recipeWater'));
    L.push('🧂 ' + noSp(el.totalSal.textContent) + ' ' + I18N.t('recipeSalt2'));
    L.push('🫧 ' + noSp(el.totalLevadura.textContent) + ' ' + I18N.t('recipeYeastShort') +
           ' (' + noSp(el.totalLevaduraSeca.textContent) + ' ' + I18N.t('recipeDryShort') + ')');
    // La mezcla solo si hay más de una harina (con una sola, ya es la "Harina" de arriba).
    if (flours.length > 1) {
      L.push('');
      L.push(I18N.t('recipeFloursHeader'));
      flours.forEach((f) => L.push('🔸 ' + noSp(U.formatWeight(harinaT * (f.pct / 100))) +
        ' (' + U.formatNumber(f.pct) + '%) ' + flourName(f.flourId)));
    }
    return L.join('\n');
  }

  // Fallback para contextos no seguros (HTTP) o navegadores sin Clipboard API.
  function fallbackCopy(str) {
    const ta = document.createElement('textarea');
    ta.value = str;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed; top:-9999px; left:-9999px;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  function copyText(str, onOk) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(str).then(onOk).catch(() => {
        if (fallbackCopy(str)) onOk(); else showToast(I18N.t('copyError'));
      });
    } else if (fallbackCopy(str)) { onOk(); }
    else { showToast(I18N.t('copyError')); }
  }

  // Copiar receta
  document.getElementById('btnCopiarReceta').addEventListener('click', function() {
    const btn = this;
    const showCopied = () => {
      const originalHtml = btn.innerHTML;
      btn.innerHTML = I18N.t('copiado');
      btn.classList.add('btn-on-dark-ok');
      setTimeout(() => { btn.innerHTML = originalHtml; btn.classList.remove('btn-on-dark-ok'); }, 2500);
    };
    copyText(buildRecipeText(), showCopied);
  });

  // Compartir receta (Web Share API con fallback a copiar) — D2
  const btnCompartir = document.getElementById('btnCompartir');
  if (btnCompartir) {
    btnCompartir.addEventListener('click', async () => {
      const text = buildRecipeText();
      if (navigator.share) {
        try { await navigator.share({ title: I18N.t('recipeHeader'), text: text }); }
        catch (e) { /* el usuario canceló el diálogo de compartir */ }
      } else {
        copyText(text, () => showToast(I18N.t('shareFallbackToast')));
      }
    });
  }

  // ---- Popup de novedades 2.0: se muestra una sola vez por usuario (localStorage,
  // clave por dominio, así probarlo en la beta NO lo silencia en producción). Reutiliza
  // openModal/closeModal (focus-trap + bloqueo de scroll). Los textos los rellena
  // applyStaticDom vía data-i18n, aunque el modal se abra antes de esa pasada. ----
  (function initWhatsNew(){
    const modal = document.getElementById('whatsNewModal');
    if (!modal) return;
    const KEY = 'edu_pizza_whatsnew_v2';
    let seen = false;
    try { seen = localStorage.getItem(KEY) === '1'; } catch (e) {}
    if (seen) return;
    const onBackdrop = (e) => { if (e.target === modal) dismiss(); };
    const onKey = (e) => onModalKeydown(e, modal, dismiss);
    function dismiss(){
      try { localStorage.setItem(KEY, '1'); } catch (e) {}
      modal.removeEventListener('click', onBackdrop);
      modal.removeEventListener('keydown', onKey);
      closeModal(modal);
    }
    const okBtn = document.getElementById('whatsNewOkBtn');
    if (okBtn) okBtn.addEventListener('click', dismiss);
    modal.addEventListener('click', onBackdrop);
    modal.addEventListener('keydown', onKey);
    // Enfocamos la TARJETA (no un botón): el popup abre por arriba y sin resaltar ningún
    // botón. "¡Empezar!", tocar el fondo y Escape cierran igual (foco atrapado en el modal).
    openModal(modal, modal.querySelector('.modal-card'));
  })();

})();
