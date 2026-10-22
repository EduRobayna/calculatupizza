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
  const min = imperial ? 1.8 : 50;   // mínimo seguro (mini pizza); 50 g ≈ 1,8 oz
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
    // Harinas genéricas (supermercado): la W es una estimación, no el dato de una marca.
    const wTxt = (wv && F.isApprox(id)) ? (I18N.t('flourWApprox') + ' ' + wv.slice(1)) : wv;
    let h = '';
    if (sub) h += `<span class="flour-tag flour-tag-type">${sub}</span>`;
    if (wv) h += `<span class="flour-tag flour-tag-w fp-band--${F.band(id)}">${wTxt}</span>`;
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
    yeastSegAuto: document.getElementById('yeastSegAuto'),
    yeastSegManual: document.getElementById('yeastSegManual'),
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
      el.summaryTanda.textContent = n + ' ' + I18N.t(n === 1 ? 'recipePizzaOne' : 'recipePizzas').toLowerCase() + ' ' +
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
      const parts = [];
      if (el.fridgeToggle && el.fridgeToggle.checked){
        parts.push('<span class="ferm-sum-phase">' + U.formatNumber(coldH, 0) + ' h ' + atW + ' ' + U.tempValue(coldT) + U.tempUnit() + '</span>');
      }
      parts.push('<span class="ferm-sum-phase">' + U.formatNumber(horas, 0) + ' h ' + atW + ' ' + U.tempValue(temp) + U.tempUnit() + '</span>');
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
      el.pesoPaneto.step = '0.5'; el.pesoPaneto.min = '1.8';
    } else {
      el.pesoPaneto.value = Math.round(pesoG);
      el.pesoPaneto.step = '10'; el.pesoPaneto.min = '50';
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
      rows.push([I18N.t('fermControlledLabel'), coldStr]);
      rows.push([I18N.t('fermAmbientLabel'), ambStr]);
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
    // El stepper del valor está SIEMPRE visible: en Auto se bloquea (valor calculado,
    // solo lectura); en Manual se desbloquea para editarlo. El interruptor Auto/Manual
    // de la cabecera marca el modo activo (segmento resaltado).
    lockStepper(el.yeastStepper, el.levadura, yeastAuto);
    if (el.yeastSegAuto) {
      el.yeastSegAuto.classList.toggle('active', yeastAuto);
      el.yeastSegAuto.setAttribute('aria-pressed', String(yeastAuto));
    }
    if (el.yeastSegManual) {
      el.yeastSegManual.classList.toggle('active', !yeastAuto);
      el.yeastSegManual.setAttribute('aria-pressed', String(!yeastAuto));
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

  // Caja informativa bajo la hidratación: color y texto según la banda del %.
  // Escala divergente centrada en el verde de la napolitana clásica (55-62):
  //   <55 rojo (muy baja, bajo estándar) · 55–<60 verde (baja, clásica) ·
  //   60–<63 verde (media, clásica) · 63–<70 ámbar (media-alta, contemporánea) ·
  //   ≥70 rojo (alta, contemporánea). El gradiente de la barra sigue el mismo patrón.
  const HYD_CLASSES = ['hyd-info--dense', 'hyd-info--green', 'hyd-info--yellow', 'hyd-info--orange', 'hyd-info--red'];
  function updateHydrationInfo(){
    if (!el.hydrationInfo) return;
    const pct = parseDecimal(el.hidratacion.value) || 0;
    let cls, key;
    if (pct < 55)      { cls = 'dense';  key = 'MuyBaja'; }
    else if (pct < 60) { cls = 'green';  key = 'Baja'; }
    else if (pct < 63) { cls = 'green';  key = 'Media'; }
    else if (pct < 70) { cls = 'yellow'; key = 'MediaAlta'; }
    else               { cls = 'red';    key = 'Alta'; }
    HYD_CLASSES.forEach(c => el.hydrationInfo.classList.remove(c));
    el.hydrationInfo.classList.add('hyd-info--' + cls);
    el.hydrationInfoHead.textContent = I18N.t('hyd' + key + 'Head');
    // El cuerpo lleva marcado de confianza (<em>cornicione</em>), por eso innerHTML.
    el.hydrationInfoText.innerHTML = I18N.t('hyd' + key + 'Body');
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

    // Lector del tiempo total de fermentación (ambiente + nevera): colocado al final
    // de la sección de tiempos como resumen del conjunto, tanto si la nevera está activa como si no.
    if (el.fermTotal) {
      el.fermTotal.hidden = false;
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
    const flourWItems = flours.map(function (f) { return { w: F.wValue(f.flourId), pct: f.pct }; });
    const wEff = D.effectiveW(flourWItems);
    const knownWPct = flourWItems.reduce(function (s, x) { return s + ((x.w > 0 && x.pct > 0) ? x.pct : 0); }, 0);
    const totalMixPct = flourWItems.reduce(function (s, x) { return s + (x.pct > 0 ? x.pct : 0); }, 0);
    const isPartialW = (wEff != null) && (totalMixPct - knownWPct > 0.05);
    if (el.flourStrengthValue) {
      el.flourStrengthValue.textContent = (wEff != null)
        ? ('W' + wEff + (isPartialW ? ' (' + I18N.t('flourStrengthPartial') + ')' : ''))
        : '—';
    }
    // Compatibilidad fuerza de la harina ↔ tiempo de fermentación de RELOJ total
    // (ambiente + nevera activa). Sin dato de W completo en la mezcla → sin aviso.
    if (el.flourWarn && el.flourWarnText) {
      el.flourWarn.hidden = true;
      if (wEff != null && !isPartialW) {
        const structH = D.structuralHours(horas, temp, coldH, coldT);
        const warnType = D.flourTimeWarning(wEff, structH);
        
        if (warnType) {
          el.flourWarn.hidden = false;
          el.flourWarnText.innerHTML = warnType === 'weak'
            ? I18N.t('warnFlourWeakHead').replace('{W_value}', Math.round(wEff))
            : I18N.t('warnFlourStrongHead').replace('{W_value}', Math.round(wEff));
        }
      }
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

    // Contexto de la tanda bajo el titular: "6 pizzas de 280 g" (o "1 pizza de 280 g").
    if (el.batchContext) {
      el.batchContext.textContent = numPaneteos + ' ' +
        I18N.t(numPaneteos === 1 ? 'recipePizzaOne' : 'recipePizzas').toLowerCase() + ' ' + I18N.t('recipeOf') + ' ' +
        U.formatWeight(pesoPaneto);
    }
    renderResultFerment();
    if (window.__triggerPlanner) window.__triggerPlanner();

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
    if (window.__updateStepByStep) window.__updateStepByStep();
  
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
  // Peso por pizza: al salir del campo, topamos al mínimo (50 g / 1,8 oz) y redondeamos
  // al paso de la unidad (los botones ya lo hacen; esto cubre el tecleo directo).
  el.pesoPaneto.addEventListener('change', () => {
    const imperial = U.isImperial();
    const min = imperial ? 1.8 : 50;
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
  // Interruptor Auto/Manual de la cabecera: cada segmento fija su modo.
  if (el.yeastSegAuto) el.yeastSegAuto.addEventListener('click', () => setYeastMode('auto'));
  if (el.yeastSegManual) el.yeastSegManual.addEventListener('click', () => setYeastMode('manual'));

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
    let userToggled = false; // true solo si el usuario abre/cierra (clic o teclado en la cabecera)
    keys.forEach(k => {
      const c = cardMap[k];
      if (!c) return;
      const head = c.querySelector('.card-head');
      if (head) head.addEventListener('click', () => { userToggled = true; });
      c.addEventListener('toggle', () => {
        const wasUser = userToggled; userToggled = false;
        if (!c.open) return;   // solo actuamos al ABRIR: cerramos las demás (paso a paso)
        keys.forEach(j => { if (j !== k && cardMap[j] && cardMap[j].open) cardMap[j].open = false; });
        try { localStorage.setItem(CARDS_KEY, k); } catch (e) {}
        if (!wasUser) return;   // nunca en la carga inicial
        // Enfoque DIRECTO, en un único movimiento: al cerrar las demás, el contenido de
        // arriba se encoge; en vez de compensar el salto y LUEGO animar (dos fases que
        // chocaban con el reflujo y se sentían raras), reposicionamos la tarjeta abierta
        // pegada arriba de una sola vez (instantáneo, tras el reflow ya definitivo).
        c.scrollIntoView({ block: 'start' });
      });
    });
  })();

  // Consejos (amasado / fermentación): al ABRIR uno, lo llevamos arriba con el mismo scroll
  // suave que los pasos. Son independientes (no se cierra nada encima), así que no hace falta
  // compensar salto. Solo al abrir por el usuario (no en la carga ni al abrir por el enlace
  // "Ver consejos", que ya hace su propio scroll).
  (function initTipsScroll(){
    const accs = Array.prototype.slice.call(document.querySelectorAll('details.accordion'));
    accs.forEach(function (acc) {
      const head = acc.querySelector('.accordion-summary');
      let userToggled = false;
      if (head) head.addEventListener('click', function () { userToggled = true; });
      acc.addEventListener('toggle', function () {
        const wasUser = userToggled; userToggled = false;
        if (!acc.open) return;
        // Solo un consejo abierto a la vez: cerramos los demás.
        accs.forEach(function (other) { if (other !== acc && other.open) other.open = false; });
        if (!wasUser) return;   // nunca en la carga ni al abrir por el enlace "Ver consejos"
        // Enfoque directo, en un único movimiento (igual que los pasos).
        acc.scrollIntoView({ block: 'start' });
      });
    });
  })();

  // Difuminado de scroll: en los contenedores .scroll-faded (listas de recetas/harinas
  // y popups altos) NO hay barra; un fundido arriba/abajo marca que hay más contenido
  // en esa dirección. Se autorefresca al abrir el modal (ResizeObserver) y al cambiar
  // el contenido (MutationObserver), además de al hacer scroll.
  (function initScrollHints(){
    Array.prototype.forEach.call(document.querySelectorAll('.scroll-faded'), function (elx) {
      const update = function () {
        const canScroll = elx.scrollHeight > elx.clientHeight + 1;
        elx.classList.toggle('more-above', canScroll && elx.scrollTop > 1);
        elx.classList.toggle('more-below', canScroll && (elx.scrollTop + elx.clientHeight < elx.scrollHeight - 1));
      };
      elx.addEventListener('scroll', update, { passive: true });
      if (window.ResizeObserver) { try { new ResizeObserver(update).observe(elx); } catch (e) {} }
      if (window.MutationObserver) { try { new MutationObserver(update).observe(elx, { childList: true, subtree: true }); } catch (e) {} }
      update();
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
  const recipeSearchWrap = document.getElementById('recipeSearchWrap');
  const recipeSearchInput = document.getElementById('recipeSearchInput');
  const activeRecipeLine = document.getElementById('activeRecipeLine');
  const activeRecipeNameEl = document.getElementById('activeRecipeName');
  const deleteRecipeBtn = document.getElementById('deleteRecipeBtn');
  const saveRecipeBtn = document.getElementById('saveRecipeBtn');
  const saveRecipeModal = document.getElementById('saveRecipeModal');
  const saveRecipeNameInput = document.getElementById('saveRecipeNameInput');
  const saveRecipeCancelBtn = document.getElementById('saveRecipeCancelBtn');
  const saveRecipeConfirmBtn = document.getElementById('saveRecipeConfirmBtn');
  const saveRecipeNewBtn = document.getElementById('saveRecipeNewBtn');
  const saveModalTitle = document.getElementById('saveModalTitle');
  const saveModalSub = document.getElementById('saveModalSub');
  const saveModalError = document.getElementById('saveModalError');
  const saveRecipeNotesInput = document.getElementById('saveRecipeNotesInput');
  const saveRecipePhotoInput = document.getElementById('saveRecipePhotoInput');
  const saveRecipePhotoAddBtn = document.getElementById('saveRecipePhotoAddBtn');
  const saveRecipePhotoPreview = document.getElementById('saveRecipePhotoPreview');
  const saveRecipePhotoViewBtn = document.getElementById('saveRecipePhotoViewBtn');
  const saveRecipePhotoImg = document.getElementById('saveRecipePhotoImg');
  const saveRecipePhotoChangeBtn = document.getElementById('saveRecipePhotoChangeBtn');
  const saveRecipePhotoRemoveBtn = document.getElementById('saveRecipePhotoRemoveBtn');
  const photoViewerModal = document.getElementById('photoViewerModal');
  const photoViewerCloseBtn = document.getElementById('photoViewerCloseBtn');
  const photoViewerImg = document.getElementById('photoViewerImg');
  const photoViewerCaption = document.getElementById('photoViewerCaption');
  const recipeNotesDisplay = document.getElementById('recipeNotesDisplay');
  const recipeStatusEl = document.getElementById('recipeStatus');
  const exportRecipesBtn = document.getElementById('exportRecipesBtn');
  const importRecipesBtn = document.getElementById('importRecipesBtn');
  const importRecipesInput = document.getElementById('importRecipesInput');
  // id de la receta seleccionada al abrir el modal (para "Actualizar"); null = crear nueva
  let editingRecipeId = null;
  // "Editar" desde la lista actualiza solo nombre+notas+foto, sin tocar los parámetros de la masa.
  let saveMetaOnly = false;
  // Foto (data URL JPEG comprimida) pendiente de guardar en el modal actual; null = sin foto.
  let pendingRecipePhoto = null;
  // Texto del buscador de la lista de recetas.
  let recipeSearchQuery = '';
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
    try {
      localStorage.setItem(SAVED_RECIPES_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
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
    const t1 = setTimeout(() => {
      toast.style.opacity = '0';
      const t2 = setTimeout(() => {
        if (typeof toast.remove === 'function') toast.remove();
        else if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
      if (t2 && typeof t2.unref === 'function') t2.unref();
    }, 1800);
    if (t1 && typeof t1.unref === 'function') t1.unref();
  }
  window.showToast = showToast;

  // ---- Visor de foto a pantalla completa (se abre por encima de cualquier modal sin cerrarlo) ----
  let photoViewerLastFocus = null;
  function openPhotoViewer(src, caption) {
    if (!photoViewerModal || !photoViewerImg || !src) return;
    photoViewerLastFocus = document.activeElement;
    photoViewerImg.src = src;
    photoViewerImg.alt = caption || I18N.t('photoViewAria');
    if (photoViewerCaption) photoViewerCaption.textContent = caption || '';
    photoViewerModal.style.display = 'flex';
    syncScrollLock();
    setTimeout(() => {
      if (photoViewerCloseBtn && typeof photoViewerCloseBtn.focus === 'function') {
        try { photoViewerCloseBtn.focus({ preventScroll: true }); } catch (e) { photoViewerCloseBtn.focus(); }
      }
    }, 30);
  }
  function closePhotoViewer() {
    if (!photoViewerModal) return;
    photoViewerModal.style.display = 'none';
    if (photoViewerImg) photoViewerImg.src = '';
    syncScrollLock();
    if (photoViewerLastFocus && typeof photoViewerLastFocus.focus === 'function') {
      try { photoViewerLastFocus.focus({ preventScroll: true }); } catch (e) { photoViewerLastFocus.focus(); }
    }
    photoViewerLastFocus = null;
  }
  if (photoViewerCloseBtn) photoViewerCloseBtn.addEventListener('click', closePhotoViewer);
  if (photoViewerModal) {
    photoViewerModal.addEventListener('click', (e) => {
      if (e.target === photoViewerModal || (e.target && e.target.classList && e.target.classList.contains('photo-viewer-box'))) {
        closePhotoViewer();
      }
    });
    photoViewerModal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePhotoViewer(); }
    });
  }

  function createPhotoThumbBtn(src, caption, extraClass) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'recipe-photo-thumb-btn' + (extraClass ? ' ' + extraClass : '');
    btn.title = I18N.t('photoViewAria');
    btn.setAttribute('aria-label', I18N.t('photoViewAria'));
    const img = document.createElement('img');
    img.className = 'recipe-photo-thumb';
    img.src = src;
    img.alt = caption || '';
    btn.appendChild(img);
    btn.addEventListener('click', (e) => {
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      openPhotoViewer(src, caption || '');
    });
    return btn;
  }

  // Devuelve la receta activa (la cargada en la calculadora) o null.
  function getActiveRecipe() {
    if (activeRecipeId == null) return null;
    return getSavedRecipes().find(r => String(r.id) === String(activeRecipeId)) || null;
  }
  window.getActiveRecipe = getActiveRecipe;

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
    if (typeof window.__updatePlannerNotifications === 'function') {
      window.__updatePlannerNotifications();
    }
  }

  // Muestra las notas y/o la foto de la receta activa bajo la fila de acciones.
  function updateNotesDisplay() {
    if (!recipeNotesDisplay) return;
    const recipe = getActiveRecipe();
    const notes = recipe && recipe.notes ? String(recipe.notes).trim() : '';
    const photo = recipe && recipe.photo ? String(recipe.photo) : '';
    recipeNotesDisplay.innerHTML = '';
    if (!notes && !photo) {
      recipeNotesDisplay.textContent = '';
      if (recipeNotesDisplay.classList) recipeNotesDisplay.classList.remove('has-photo');
      recipeNotesDisplay.style.display = 'none';
      return;
    }
    if (photo) {
      if (recipeNotesDisplay.classList) recipeNotesDisplay.classList.add('has-photo');
      recipeNotesDisplay.appendChild(createPhotoThumbBtn(photo, recipe.name));
      if (notes) {
        const txt = document.createElement('span');
        txt.className = 'recipe-notes-text';
        txt.textContent = notes;
        recipeNotesDisplay.appendChild(txt);
      }
    } else {
      if (recipeNotesDisplay.classList) recipeNotesDisplay.classList.remove('has-photo');
      recipeNotesDisplay.textContent = notes;
    }
    recipeNotesDisplay.style.display = '';
  }

  // Añade una celda "ETIQUETA + valor" a la rejilla de la tarjeta. En lugar de
  // iconos ambiguos (la sal y el peso se confundían), cada dato lleva su etiqueta
  // en versalitas, así se lee de un vistazo. `wide` = ocupa las dos columnas
  // (para textos largos como la fermentación o el nombre de la harina).
  function addRecipeCell(grid, label, value, wide){
    const cell = document.createElement('span');
    cell.className = 'rc-cell' + (wide ? ' rc-cell--wide' : '');
    const k = document.createElement('span');
    k.className = 'rc-k';
    k.textContent = label;                       // textContent -> a prueba de XSS
    const v = document.createElement('span');
    v.className = 'rc-v';
    v.textContent = value;
    cell.appendChild(k);
    cell.appendChild(v);
    grid.appendChild(cell);
  }

  // Iconos (trazo, coherentes con el resto) para las acciones por tarjeta.
  const ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

  // Pinta la lista del modal "Lista de recetas": buscador + una tarjeta por receta
  // con acciones (Abrir · Editar · Eliminar). El filtro es por nombre.
  function renderRecipeList() {
    if (!recipeListContainer) return;
    const list = getSavedRecipes();
    recipeListContainer.innerHTML = '';
    // El buscador solo aparece si hay recetas que filtrar.
    if (recipeSearchWrap) recipeSearchWrap.style.display = list.length ? '' : 'none';
    if (list.length === 0) {
      recipeListEmpty.textContent = I18N.t('noRecipesYet');
      recipeListEmpty.style.display = '';
      return;
    }
    // Filtro por nombre (sin distinguir mayúsculas). Orden: la más reciente primero.
    const q = recipeSearchQuery.trim().toLowerCase();
    const filtered = list.slice().reverse().filter(r => !q || (r.name || '').toLowerCase().indexOf(q) !== -1);
    if (filtered.length === 0) {
      recipeListEmpty.textContent = I18N.t('recipeSearchNoResults');
      recipeListEmpty.style.display = '';
      return;
    }
    recipeListEmpty.style.display = 'none';
    filtered.forEach(recipe => {
      const isActive = String(recipe.id) === String(activeRecipeId);
      const item = document.createElement('div');
      item.className = 'recipe-item' + (isActive ? ' active' : '');
      item.dataset.id = recipe.id;

      const nameRow = document.createElement('span');
      nameRow.className = 'recipe-item-name';
      const nameText = document.createElement('span');
      nameText.textContent = recipe.name;            // textContent -> a prueba de XSS
      nameRow.appendChild(nameText);
      if (isActive) {
        const badge = document.createElement('span');
        badge.className = 'recipe-item-badge';
        badge.textContent = I18N.t('statusActive');
        nameRow.appendChild(badge);
      }
      if (recipe.photo) {
        const head = document.createElement('div');
        head.className = 'recipe-item-head';
        head.appendChild(nameRow);
        head.appendChild(createPhotoThumbBtn(recipe.photo, recipe.name, 'recipe-item-thumb-btn'));
        item.appendChild(head);
      } else {
        item.appendChild(nameRow);
      }

      const d = recipe.data || {};
      const num = parseDecimal(d.numPaneteos) || 0;
      const per = parseDecimal(d.pesoPaneto) || 0;
      // Cuerpo de la tarjeta como rejilla etiquetada de 2 columnas: cada dato con
      // su etiqueta, bien separado, para leerlo de un vistazo. Los datos con texto
      // largo (fermentación, harina) ocupan la fila completa.
      const grid = document.createElement('span');
      grid.className = 'recipe-item-grid';
      addRecipeCell(grid, I18N.t('recipeHydration'),
        (d.hidratacion != null ? d.hidratacion : '?') + '%');
      // Sal: en la unidad activa de Ajustes — g/L de agua (canónico) o % de la harina. El %
      // se deriva del g/L guardado y la hidratación de la receta (sal% = g/L · hid / 1000).
      const salTxt = saltIsFlour()
        ? U.formatNumber((d.sal || 0) * (d.hidratacion || 0) / 1000, 1) + '%'
        : U.formatNumber(d.sal != null ? d.sal : 0) + ' g/L';
      addRecipeCell(grid, I18N.t('recipeSalt2'), salTxt);
      addRecipeCell(grid, I18N.t('recipeBatchShort'),
        (num || '?') + ' × ' + U.formatWeight(per));
      addRecipeCell(grid, I18N.t('recipeMetaTotal'), U.formatWeight(num * per));
      // Levadura solo si es manual (en Auto la calcula la fermentación; no es un valor fijo).
      if (d.yeastMode === 'manual') {
        addRecipeCell(grid, I18N.t('recipeYeastShort'),
          U.formatNumber((parseFloat(d.manualYeastPerKg) || 0) / 10, 2) + '%');
      }
      // Fermentación (fila completa): si tiene fase controlada va primero, y luego ambiente.
      const fAmb = U.formatNumber(d.horas != null ? d.horas : 0, 0) + ' h · ' +
        U.tempValue(parseInt(d.temperatura, 10) || 18) + U.tempUnit();
      const fCold = U.formatNumber(d.horasFrio != null ? d.horasFrio : 0, 0) + ' h · ' +
        Math.round(U.tempValue(parseFloat(d.tempFrio) || 4)) + U.tempUnit();
      const fermTxt = d.fridgeOn ? (fCold + ' + ' + fAmb) : fAmb;
      addRecipeCell(grid, I18N.t('recipeFermentation'), fermTxt, true);
      // Harina (fila completa): el nombre si es una sola; el número si es mezcla. El detalle
      // completo (cada harina con su %) se ve al cargar la receta.
      const flrs = Array.isArray(d.flours) ? d.flours : [];
      if (flrs.length) {
        const flText = (flrs.length === 1)
          ? flourName(flrs[0].flourId)
          : (flrs.length + ' ' + I18N.t('flourCountWord'));
        addRecipeCell(grid, I18N.t('recipeFlourShort'), flText, true);
      }
      item.appendChild(grid);

      if (recipe.notes && String(recipe.notes).trim()) {
        const notes = document.createElement('span');
        notes.className = 'recipe-item-notes';
        notes.textContent = String(recipe.notes).trim();
        item.appendChild(notes);
      }

      // Barra de acciones: Abrir (principal) + Editar (nombre/notas) + Eliminar.
      const actions = document.createElement('div');
      actions.className = 'recipe-item-actions';

      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'recipe-open-btn';
      openBtn.textContent = I18N.t('recipeOpenAction');
      openBtn.addEventListener('click', () => attemptLoad(recipe.id));

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'recipe-tool recipe-edit-btn';
      editBtn.title = I18N.t('recipeEditAction');
      editBtn.setAttribute('aria-label', I18N.t('recipeEditAction'));
      editBtn.innerHTML = ICON_EDIT;
      editBtn.addEventListener('click', () => editRecipeMeta(recipe.id));

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'recipe-tool recipe-del-btn delete';
      delBtn.title = I18N.t('modalDelete');
      delBtn.setAttribute('aria-label', I18N.t('modalDelete'));
      delBtn.innerHTML = ICON_TRASH;
      delBtn.addEventListener('click', () => deleteRecipeFromList(recipe.id));

      actions.appendChild(openBtn);
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      item.appendChild(actions);

      recipeListContainer.appendChild(item);
    });
  }

  // "Editar" desde la lista: solo nombre + notas (los parámetros de la masa se
  // editan cargando la receta). Cierra la lista y abre el modal en modo edición;
  // al terminar (guardar o cancelar) se vuelve a la lista.
  function editRecipeMeta(id) {
    const recipe = getSavedRecipes().find(r => String(r.id) === String(id));
    if (!recipe) return;
    closeLoadModal();
    openSaveModal({ editMeta: recipe });
  }

  // Elimina una receta concreta desde la lista, con confirmación, y repinta.
  async function deleteRecipeFromList(id) {
    const recipe = getSavedRecipes().find(r => String(r.id) === String(id));
    if (!recipe) return;
    const ok = await showConfirm(I18N.t('confirmDeleteRecipe'), I18N.t('modalDelete'));
    if (!ok) return;
    setSavedRecipes(getSavedRecipes().filter(r => String(r.id) !== String(id)));
    if (String(activeRecipeId) === String(id)) activeRecipeId = null;
    refreshRecipesUI();
    renderRecipeList();
  }

  function openLoadModal() {
    if (getSavedRecipes().length === 0) return;
    recipeSearchQuery = '';
    if (recipeSearchInput) recipeSearchInput.value = '';
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

  // Comprime una imagen elegida por el usuario a JPEG (máx. 700 px de lado, calidad 0.75)
  // para que ocupe solo ~40-60 KB en localStorage y quepan decenas de recetas con foto.
  function compressRecipePhoto(file) {
    return new Promise((resolve, reject) => {
      if (!file) { reject(new Error('no-file')); return; }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read-error'));
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        if (typeof Image === 'undefined') {
          if (/^data:image\//i.test(dataUrl)) resolve(dataUrl);
          else reject(new Error('invalid-image'));
          return;
        }
        const img = new Image();
        img.onerror = () => reject(new Error('decode-error'));
        img.onload = () => {
          try {
            const MAX_SIDE = 700;
            let w = img.naturalWidth || img.width || 700;
            let h = img.naturalHeight || img.height || 700;
            if (w > MAX_SIDE || h > MAX_SIDE) {
              if (w >= h) { h = Math.max(1, Math.round(h * (MAX_SIDE / w))); w = MAX_SIDE; }
              else { w = Math.max(1, Math.round(w * (MAX_SIDE / h))); h = MAX_SIDE; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext && canvas.getContext('2d');
            if (!ctx || typeof canvas.toDataURL !== 'function') {
              resolve(dataUrl);
              return;
            }
            ctx.fillStyle = '#14110f';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            const out = canvas.toDataURL('image/jpeg', 0.75);
            resolve(out && /^data:image\//i.test(out) ? out : dataUrl);
          } catch (err) {
            reject(err);
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  function renderSavePhotoPreview() {
    if (!saveRecipePhotoAddBtn || !saveRecipePhotoPreview || !saveRecipePhotoImg) return;
    if (pendingRecipePhoto) {
      saveRecipePhotoImg.src = pendingRecipePhoto;
      saveRecipePhotoAddBtn.style.display = 'none';
      saveRecipePhotoPreview.style.display = 'flex';
    } else {
      saveRecipePhotoImg.src = '';
      saveRecipePhotoAddBtn.style.display = '';
      saveRecipePhotoPreview.style.display = 'none';
    }
  }

  // ---- Modal "Guardar receta": crear nueva, actualizar la activa, o (desde la
  //      lista) editar solo el nombre, las notas y la foto de una receta concreta. ----
  function openSaveModal(opts) {
    opts = opts || {};
    const editMeta = opts.editMeta || null;   // receta a editar desde la lista
    saveMetaOnly = !!editMeta;

    if (editMeta) {
      editingRecipeId = editMeta.id;
      saveRecipeNameInput.value = editMeta.name;
      saveRecipeNotesInput.value = editMeta.notes || '';
      pendingRecipePhoto = editMeta.photo || null;
      if (saveModalTitle) saveModalTitle.textContent = I18N.t('editRecipeTitle');
      saveModalSub.textContent = I18N.t('editRecipeSub');
      saveRecipeConfirmBtn.textContent = I18N.t('modalSaveChanges');
      saveRecipeNewBtn.style.display = 'none';   // no aplica al editar metadatos
    } else {
      // La receta activa es la candidata a "Actualizar"; si no hay ninguna cargada,
      // se guarda como nueva.
      const seleccionada = getActiveRecipe();
      editingRecipeId = seleccionada ? seleccionada.id : null;
      pendingRecipePhoto = seleccionada ? (seleccionada.photo || null) : null;
      if (saveModalTitle) saveModalTitle.textContent = I18N.t('saveModalTitle');
      if (seleccionada) {
        saveRecipeNameInput.value = seleccionada.name;
        saveRecipeNotesInput.value = seleccionada.notes || '';
        saveModalSub.textContent = I18N.t('saveModalSubEdit').replace('{name}', seleccionada.name);
        saveRecipeConfirmBtn.textContent = I18N.t('modalUpdate');
        saveRecipeNewBtn.style.display = '';
      } else {
        saveRecipeNameInput.value = window.__sharedRecipeName || '';
        saveRecipeNotesInput.value = window.__sharedRecipeNotes || '';
        saveModalSub.textContent = I18N.t('saveModalSub');
        saveRecipeConfirmBtn.textContent = I18N.t('modalSave');
        saveRecipeNewBtn.style.display = 'none';
      }
    }
    if (saveRecipePhotoInput) saveRecipePhotoInput.value = '';
    renderSavePhotoPreview();
    updateSaveButtons();
    // Enfocamos la tarjeta del diálogo (no el campo de nombre): así el popup se
    // abre sin desplegar el teclado en móvil, pero el foco sigue dentro del modal
    // para que funcionen Escape y la trampa de tabulación.
    openModal(saveRecipeModal, saveRecipeModal.querySelector('.modal-card'));
  }
  function closeSaveModal() {
    closeModal(saveRecipeModal);
    // Si estábamos editando desde la lista, volvemos a ella al cerrar.
    if (saveMetaOnly) { saveMetaOnly = false; openLoadModal(); }
  }

  if (saveRecipePhotoAddBtn && saveRecipePhotoInput) {
    saveRecipePhotoAddBtn.addEventListener('click', () => saveRecipePhotoInput.click());
  }
  if (saveRecipePhotoChangeBtn && saveRecipePhotoInput) {
    saveRecipePhotoChangeBtn.addEventListener('click', () => saveRecipePhotoInput.click());
  }
  if (saveRecipePhotoRemoveBtn) {
    saveRecipePhotoRemoveBtn.addEventListener('click', () => {
      pendingRecipePhoto = null;
      if (saveRecipePhotoInput) saveRecipePhotoInput.value = '';
      renderSavePhotoPreview();
    });
  }
  if (saveRecipePhotoViewBtn) {
    saveRecipePhotoViewBtn.addEventListener('click', () => {
      if (pendingRecipePhoto) openPhotoViewer(pendingRecipePhoto, saveRecipeNameInput.value.trim());
    });
  }
  if (saveRecipePhotoInput) {
    saveRecipePhotoInput.addEventListener('change', (e) => {
      const file = e.target && e.target.files && e.target.files[0];
      if (!file) return;
      compressRecipePhoto(file).then((dataUrl) => {
        pendingRecipePhoto = dataUrl;
        renderSavePhotoPreview();
      }).catch(() => {
        showToast(I18N.t('photoErrorFormat'));
      });
      saveRecipePhotoInput.value = '';
    });
  }

  saveRecipeBtn.addEventListener('click', () => openSaveModal());
  saveRecipeCancelBtn.addEventListener('click', closeSaveModal);
  saveRecipeModal.addEventListener('click', (e) => {
    if (e.target === saveRecipeModal) closeSaveModal();
  });
  saveRecipeModal.addEventListener('keydown', (e) => onModalKeydown(e, saveRecipeModal, closeSaveModal));
  saveRecipeNameInput.addEventListener('input', updateSaveButtons);
  saveRecipeNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); guardarReceta({ overwriteId: editingRecipeId, metaOnly: saveMetaOnly }); }
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

    // Modo "editar metadatos" (desde la lista): actualiza solo nombre, notas y foto, sin
    // tocar los parámetros de la masa ni cambiar cuál es la receta activa.
    if (opts.metaOnly) {
      const r = list.find(x => String(x.id) === String(opts.overwriteId));
      let quotaFallback = false;
      if (r) {
        r.name = name;
        r.notes = notes;
        if (pendingRecipePhoto) r.photo = pendingRecipePhoto;
        else delete r.photo;
        r.updatedAt = new Date().toISOString();
        if (!setSavedRecipes(list) && pendingRecipePhoto) {
          delete r.photo;
          setSavedRecipes(list);
          quotaFallback = true;
        }
      }
      closeSaveModal();       // saveMetaOnly sigue en true -> vuelve a la lista
      refreshRecipesUI();
      showToast(quotaFallback ? I18N.t('photoErrorQuota') : I18N.t('recipeUpdatedToast'));
      return;
    }

    const existente = opts.overwriteId != null ? list.find(r => r.id === opts.overwriteId) : null;
    let targetRecipe;
    if (existente) {
      existente.name = name;
      existente.notes = notes;
      if (pendingRecipePhoto) existente.photo = pendingRecipePhoto;
      else delete existente.photo;
      existente.data = currentData();
      existente.updatedAt = new Date().toISOString();
      targetRecipe = existente;
    } else {
      const ids = new Set(list.map(r => String(r.id)));
      const nueva = { id: nuevoId(ids), name: name, notes: notes, savedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), data: currentData() };
      if (pendingRecipePhoto) nueva.photo = pendingRecipePhoto;
      list.push(nueva);
      targetRecipe = nueva;
    }
    let quotaFallback = false;
    if (!setSavedRecipes(list) && pendingRecipePhoto) {
      delete targetRecipe.photo;
      setSavedRecipes(list);
      quotaFallback = true;
    }
    // La receta guardada pasa a ser la activa. Cerramos el modal antes de repintar
    // para que el cierre nunca dependa de pasos de UI posteriores.
    activeRecipeId = targetRecipe.id;
    window.__sharedRecipeName = null;
    window.__sharedRecipeNotes = null;
    closeSaveModal();
    refreshRecipesUI();
    if (quotaFallback) {
      showToast(I18N.t('photoErrorQuota'));
    } else {
      showToast(existente ? I18N.t('recipeUpdatedToast') : I18N.t('recipeSavedToast'));
    }
  }

  saveRecipeConfirmBtn.addEventListener('click', () => guardarReceta({ overwriteId: editingRecipeId, metaOnly: saveMetaOnly }));
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
  if (recipeSearchInput) recipeSearchInput.addEventListener('input', () => {
    recipeSearchQuery = recipeSearchInput.value;
    renderRecipeList();
  });

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
    const photo = (typeof raw.photo === 'string' && /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(raw.photo.trim()) && raw.photo.length <= 600000)
      ? raw.photo.trim()
      : null;
    const normalized = {
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
    if (photo) normalized.photo = photo;
    return normalized;
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

  // Expone los parámetros calculados y entradas para módulos satélite (paso a paso, planificador)
  window.__getRecipeInputs = function() {
    return {
      numPizzas: parseInt(el.numPaneteos.value, 10) || 1,
      pesoG: Math.round(pesoG),
      tempC: parseInt(el.temperatura.value, 10),
      horas: clampHoras(el.horas.value),
      coldH: coldHoursActive(),
      coldT: coldTempC(),
      fridgeOn: el.fridgeToggle.checked,
      flours: flours.slice(),
      flourName: flourName,
      lastRecipe: lastRecipe,
      saltIsFlour: saltIsFlour(),
      salPctFlour: salPctFlour,
      salGL: salGL,
      yeastMode: yeastMode,
      manualYeastPerKg: manualYeastPerKg,
      autoYeastGkg: autoYeastGkg()
    };
  };

  // Cargar receta desde parámetros de consulta en la URL (ej. ?pizzas=4&peso=280&hid=65...)
  function loadRecipeFromUrl() {
    const URLParams = (typeof URLSearchParams !== 'undefined') ? URLSearchParams : (typeof window !== 'undefined' ? window.URLSearchParams : null);
    if (!URLParams || typeof window === 'undefined' || !window.location || !window.location.search) return false;
    const params = new URLParams(window.location.search);
    if (!params.has('pizzas') && !params.has('hid') && !params.has('horas') && !params.has('harinas') && !params.has('fridge') && !params.has('peso')) return false;
    try {
      if (params.has('nombre') || params.has('name')) {
        const n = (params.get('nombre') || params.get('name')).trim();
        if (n) window.__sharedRecipeName = n;
      }
      if (params.has('notas') || params.has('notes')) {
        const nt = (params.get('notas') || params.get('notes')).trim();
        if (nt) window.__sharedRecipeNotes = nt;
      }
      if (params.has('pizzas')) {
        const v = parseInt(params.get('pizzas'), 10);
        if (!isNaN(v) && v >= 1 && v <= 100) el.numPaneteos.value = v;
      }
      if (params.has('peso')) {
        const v = parseDecimal(params.get('peso'));
        if (!isNaN(v) && v >= 50 && v <= 1000) pesoG = v;
      }
      if (params.has('hid')) {
        const v = parseDecimal(params.get('hid'));
        if (!isNaN(v) && v >= 40 && v <= 100) el.hidratacion.value = v;
      }
      if (params.has('temp') || params.has('ta')) {
        const v = parseInt(params.get('temp') || params.get('ta'), 10);
        if (!isNaN(v) && v >= 10 && v <= 40) {
          el.temperatura.value = v;
          if (el.tempValue) el.tempValue.value = U.tempValue(v);
        }
      }

      // IMPORTANTE: la fase fría debe leerse ANTES de clampHoras para que ambHorasMin()
      // permita 0 h a temperatura ambiente si la nevera está activa.
      if (params.has('fridge')) {
        const f = params.get('fridge');
        el.fridgeToggle.checked = (f === '1' || f === 'true');
      }
      if (params.has('tempFrio') || params.has('tfrio')) {
        const v = parseDecimal(params.get('tempFrio') || params.get('tfrio'));
        if (!isNaN(v)) renderColdTempField(clampColdTempC(v));
      } else if (el.fridgeToggle.checked && (!el.tempFrio || !el.tempFrio.value)) {
        renderColdTempField(4);
      }
      if (params.has('horasFrio') || params.has('hfrio')) {
        const v = parseDecimal(params.get('horasFrio') || params.get('hfrio'));
        if (!isNaN(v)) el.horasFrio.value = clampColdHoras(v);
      } else if (el.fridgeToggle.checked && (!el.horasFrio || !el.horasFrio.value || el.horasFrio.value === '0')) {
        el.horasFrio.value = 24;
      }
      applyFridgeVisibility();

      if (params.has('horas')) {
        const v = parseDecimal(params.get('horas'));
        if (!isNaN(v) && v >= 0 && v <= 96) el.horas.value = clampHoras(v);
      }

      // Sincronización de la unidad de sal: fijar en PizzaUnits ANTES de leer el valor de la sal
      if (params.has('salUnit')) {
        const u = params.get('salUnit');
        if (u === 'harina' || u === 'gl') {
          if (window.PizzaUnits && window.PizzaUnits.setSaltUnit) {
            window.PizzaUnits.setSaltUnit(u);
          }
          const btnH = document.querySelector('#saltUnitToggle button[data-salt="harina"]');
          const btnG = document.querySelector('#saltUnitToggle button[data-salt="gl"]');
          if (btnH && btnG) {
            btnH.classList.toggle('active', u === 'harina');
            btnG.classList.toggle('active', u === 'gl');
          }
        }
      }
      if (params.has('sal')) {
        const v = parseDecimal(params.get('sal'));
        if (!isNaN(v) && v > 0) {
          if (saltIsFlour()) {
            salPctFlour = v;
            const h = (parseDecimal(el.hidratacion.value) || 0) / 100;
            salGL = h > 0 ? (v * 10 / h) : 40;
          } else {
            salGL = v;
            const h = (parseDecimal(el.hidratacion.value) || 0) / 100;
            salPctFlour = h > 0 ? (h * salGL / 10) : 2.5;
          }
        }
      }

      if (params.has('levMode')) {
        const lm = params.get('levMode');
        if (lm === 'auto' || lm === 'manual') yeastMode = lm;
      }
      if (params.has('lev')) {
        const v = parseDecimal(params.get('lev'));
        if (!isNaN(v) && v > 0) manualYeastPerKg = v;
      }

      if (params.has('harinas')) {
        const raw = params.get('harinas').split(',');
        const parsedFlours = [];
        let nextId = 1;
        raw.forEach(chunk => {
          const lastColon = chunk.lastIndexOf(':');
          if (lastColon > 0) {
            const fid = chunk.slice(0, lastColon).trim();
            const pct = parseDecimal(chunk.slice(lastColon + 1));
            if (fid && !isNaN(pct) && pct > 0) {
              parsedFlours.push({ id: nextId++, flourId: fid, pct: pct, locked: false });
            }
          }
        });
        if (parsedFlours.length > 0) {
          const sum = parsedFlours.reduce((a, b) => a + b.pct, 0);
          if (Math.abs(sum - 100) < 1.0) {
            // Forzar suma exacta a 100 en la última harina para evitar bloqueo de esValidoHarina
            const diff = 100 - sum;
            parsedFlours[parsedFlours.length - 1].pct = Math.round((parsedFlours[parsedFlours.length - 1].pct + diff) * 100) / 100;
            flours = parsedFlours;
            flourIdCounter = nextId;
          }
        }
      }

      // Salvaguarda: garantizar que flours siempre suma 100 para que resultsBody nunca quede bloqueado
      const floursSum = flours.reduce((a, b) => a + b.pct, 0);
      if (Math.abs(floursSum - 100) >= 0.001) {
        if (flours.length > 0) {
          const diff = 100 - floursSum;
          flours[flours.length - 1].pct = Math.round((flours[flours.length - 1].pct + diff) * 100) / 100;
        } else {
          flours = migrateFlours(defaultSettings.flours);
        }
      }

      renderInputUnits();
      renderParamModes();
      renderFlours();
      calcular();
      if (window.__triggerPlanner) window.__triggerPlanner();
      if (window.__updateStepByStep) window.__updateStepByStep();
      return true;
    } catch (err) {
      console.error('Error loading recipe from URL:', err);
      return false;
    }
  }

  // Al arrancar, si viene una receta en la URL la aplica; si no, comprueba si coincide con una guardada.
  const loadedFromUrl = loadRecipeFromUrl();
  (function detectActiveOnLoad(){
    const match = findMatchingRecipe();
    if (match) activeRecipeId = match.id;
  })();
  refreshRecipesUI();
  onConfigChange = updateRecipeStatus; // a partir de aquí, cada recálculo refresca el estado
  updateRecipeStatus();
  if (loadedFromUrl) {
    if (typeof showToast === 'function') {
      showToast(I18N.t('recipeLoadedFromUrl'));
    }
    const saveBtn = document.getElementById('saveRecipeBtn');
    if (saveBtn && !activeRecipeId) {
      saveBtn.classList.add('save-attention');
      saveBtn.addEventListener('click', function onSaveClick() {
        saveBtn.classList.remove('save-attention');
        saveBtn.removeEventListener('click', onSaveClick);
      }, { once: true });
    }
  }

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
    if (!window.__plannerPlanText && typeof window.__renderPlanner === 'function') {
      try { window.__renderPlanner(); } catch (e) {}
    }
    if (window.__plannerPlanText && window.__plannerPlanText.trim()) {
      L.push('');
      L.push(window.__plannerPlanText.trim());
    }
    return L.join('\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }
  window.buildRecipeText = buildRecipeText;

  // Fallback para contextos no seguros (HTTP) o navegadores sin Clipboard API.
  function fallbackCopy(str) {
    const ta = document.createElement('textarea');
    ta.value = str;
    ta.setAttribute('readonly', '');
    ta.style.fontSize = '12pt';
    ta.style.border = '0';
    ta.style.padding = '0';
    ta.style.margin = '0';
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, str.length);
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

  function flashButtonCopied(btn) {
    if (btn) {
      if (btn._origHtml == null) btn._origHtml = btn.innerHTML;
      if (btn._copiedTimer) clearTimeout(btn._copiedTimer);
      btn.innerHTML = I18N.t('copiado');
      btn.classList.add('btn-on-dark-ok');
      const t = setTimeout(() => {
        btn.innerHTML = btn._origHtml;
        btn.classList.remove('btn-on-dark-ok');
        btn._copiedTimer = null;
      }, 2500);
      if (t && typeof t.unref === 'function') t.unref();
      btn._copiedTimer = t;
    }
    showToast(I18N.t('copiado'));
  }

  // Copiar receta
  const btnCopiarReceta = document.getElementById('btnCopiarReceta');
  if (btnCopiarReceta) {
    btnCopiarReceta.addEventListener('click', function() {
      const btn = this || btnCopiarReceta;
      copyText(buildRecipeText(), () => flashButtonCopied(btn));
    });
  }

  // Generar URL con todos los parámetros de la receta codificados
  function generateRecipeShareUrl() {
    const URLParams = (typeof URLSearchParams !== 'undefined') ? URLSearchParams : (typeof window !== 'undefined' ? window.URLSearchParams : null);
    if (!URLParams) return '';
    const p = new URLParams();
    p.set('pizzas', el.numPaneteos.value);
    p.set('peso', Math.round(pesoG));
    p.set('hid', el.hidratacion.value);
    p.set('sal', el.sal.value);
    p.set('salUnit', saltIsFlour() ? 'harina' : 'gl');
    p.set('temp', el.temperatura.value);
    p.set('horas', el.horas.value);
    if (el.fridgeToggle.checked) {
      p.set('fridge', '1');
      p.set('tempFrio', coldTempC());
      p.set('horasFrio', el.horasFrio.value);
    } else {
      p.set('fridge', '0');
    }
    p.set('levMode', yeastMode);
    if (yeastMode === 'manual') {
      p.set('lev', manualYeastPerKg);
    }
    if (flours && flours.length > 0) {
      p.set('harinas', flours.map(f => `${f.flourId}:${f.pct}`).join(','));
    }
    const active = getActiveRecipe();
    if (active && active.name) {
      p.set('nombre', active.name);
    }
    if (active && active.notes) {
      p.set('notas', String(active.notes).slice(0, 300));
    }
    const base = (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null')
      ? (window.location.origin + window.location.pathname)
      : ((typeof window !== 'undefined' && window.location && window.location.href) ? window.location.href.split('?')[0] : 'https://calculatupizza.com/');
    return base + '?' + p.toString();
  }
  window.generateRecipeShareUrl = generateRecipeShareUrl;

  // Compartir receta (Web Share API con fallback a copiar)
  // Genera un enlace que, al abrirlo, carga la receta en la calculadora con opción de guardarla
  const btnCompartir = document.getElementById('btnCompartir');
  if (btnCompartir) {
    btnCompartir.addEventListener('click', async () => {
      const shareUrl = generateRecipeShareUrl();
      const recipeText = buildRecipeText();
      const shareTitle = I18N.t('recipeHeader');
      const shareText = `${recipeText}\n\n🔗 ${I18N.t('shareRecipeUrlText')}\n${shareUrl}`;

      if (navigator.share) {
        try {
          await navigator.share({
            title: shareTitle,
            text: shareText
          });
        } catch (e) {
          if (e.name !== 'AbortError') {
            copyText(shareText, () => flashButtonCopied(btnCompartir));
          }
        }
      } else {
        copyText(shareText, () => flashButtonCopied(btnCompartir));
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
    const KEY = 'edu_pizza_whatsnew_v3';
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
// --- LÓGICA DEL PLANIFICADOR DE FERMENTACIÓN ---
(function initPlanner() {
  const I18N = window.PizzaI18N;
  const U = window.PizzaUnits;
  const pTypes = document.getElementById('plannerTypes');
  const pBlWrap = document.getElementById('plannerBlWrap');
  const pBl = document.getElementById('plannerBl');
  const pBlHint = document.getElementById('plannerBlHint');
  const pM1 = document.getElementById('plannerM1');
  const pM2 = document.getElementById('plannerM2');
  const pDt = document.getElementById('plannerDt');
  const pDtLabel = document.getElementById('plannerDtLabel');
  const pTl = document.getElementById('plannerTl');
  const pTotal = document.getElementById('plannerTotal');
  if (!pTypes || !pDt) return;

  let planCur = 'b'; // 'a' = bloque+bollos, 'b' = solo bollos
  let planMode = 1;  // 1 = empiezo, 2 = como

  function toLocalInput(d){
    const o = new Date(d.getTime() - d.getTimezoneOffset() * 6e4);
    return o.toISOString().slice(0,16);
  }

  function setMode(m){
    planMode = m;
    pM1.className = m === 1 ? 'on' : '';
    pM2.className = m === 2 ? 'on' : '';
    pDtLabel.textContent = m === 1 ? I18N.t('plannerDtLabel1') : I18N.t('plannerDtLabel2');
    const n = new Date();
    n.setMinutes(0,0,0);
    if(m===1){
      n.setHours(n.getHours() + 1); // proxima hora
    } else {
      n.setDate(n.getDate() + 2);
      n.setHours(21);
    }
    pDt.value = toLocalInput(n);
    renderPlanner();
  }

  pM1.addEventListener('click', () => setMode(1));
  pM2.addEventListener('click', () => setMode(2));
  pDt.addEventListener('input', renderPlanner);
  pBl.addEventListener('input', renderPlanner);

  pTypes.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      planCur = b.getAttribute('data-r');
      pTypes.querySelectorAll('button').forEach(x => x.className = x === b ? 'on' : '');
      renderPlanner();
    });
  });

  const getName = () => ({ n: I18N.t('plannerControladaName'), t: I18N.t('plannerAmbienteName') });
  const COL = { n: '#7db3da', t: '#e3c58a', r: '#d8cec2', h: '#d0452f' };
  const getTag = () => ({ n: I18N.t('plannerControladaTag'), t: I18N.t('plannerAmbienteTag'), r: I18N.t('plannerReposoTag') });

  function fmtDate(d){
    const fmt = new Intl.DateTimeFormat(document.documentElement.lang === 'en' ? 'en-US' : 'es-ES', {
      hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'long', hour12: false
    });
    const p = fmt.formatToParts(d);
    const g = (t) => {
      const part = p.find(x => x.type === t);
      return part ? part.value : '';
    };
    return g('hour')+':'+g('minute')+', '+g('day')+' '+g('month');
  }

  function durFmt(h){
    if (h < 1) return Math.round(h * 60) + ' min';
    const num = (Math.round(h * 100) / 100);
    return document.documentElement.lang === 'es' ? num.toString().replace('.', ',') + ' h' : num + ' h';
  }

  function getD(){
    const coldH = (document.getElementById('fridgeToggle') && document.getElementById('fridgeToggle').checked) 
      ? Math.max(0, parseFloat(document.getElementById('horasFrio').value) || 0) : 0;
    const ambH = Math.max(0, parseFloat(document.getElementById('horas').value) || 0);

    let d = { bloque: { n: 0, t: 0 }, bollos: { n: 0, t: 0 } };
    if (planCur === 'b') { // solo bollos
      d.bollos.n = coldH;
      d.bollos.t = ambH;
    } else { // bloque + bollos
      if (coldH > 0) { // mixta
        d.bloque.n = coldH;
        d.bollos.t = ambH;
      } else { // todo a TA
        const tot = ambH;
        let b = parseFloat(pBl.value);
        if (isNaN(b)) b = Math.max(0.5, tot / 2);
        b = Math.min(Math.max(b, 0.5), tot - 0.5);
        d.bloque.t = b;
        d.bollos.t = tot - b;
      }
    }
    return d;
  }

  function getPhases(){
    const d = getD();
    const out = [];
    let done = false;
    
    // Si fridgeToggle off, temp = lo que haya pero asumimos >=15 por defecto si no hay nevera.
    // Wait, D.coldT in calculator is coldTempC(). We can compute it:
    let coldTVal = 4;
    const coldTempEl = document.getElementById('tempFrio');
    if (coldTempEl) {
      let v = parseFloat(coldTempEl.value);
      if (!isNaN(v)) {
        coldTVal = (U && U.isFahrenheit && U.isFahrenheit()) ? (v - 32) * 5/9 : v;
      }
    }

    ['bloque', 'bollos'].forEach(st => {
      if (st === 'bollos') {
        if (planCur === 'b' && !done && (d.bollos.n + d.bollos.t) > 0) {
          done = true;
          out.push(['f', I18N.t('plannerReposoPhase'), 0.5, 'r']);
        }
        out.push(['h', I18N.t('plannerFormarPhase')]);
      }
      ['n', 't'].forEach(w => {
        const h = d[st][w];
        if (!h) return;
        if (w === 'n' && coldTVal < 15 && !done) {
          done = true;
          out.push(['f', I18N.t('plannerReposoPhase'), 0.5, 'r']);
        }
        const stageName = st === 'bloque' ? I18N.t('plannerBloque') : I18N.t('plannerBollos');
        // 5.º elemento = etapa (bloque / bollos): lo usa el paso a paso para asignar
        // a cada paso la fase (temperatura y rango horario) que de verdad le corresponde.
        out.push(['f', stageName + getName()[w], h, w, st]);
      });
    });
    return out;
  }

  // Fases estructuradas del plan (misma fuente que la línea de tiempo) para el paso a paso:
  // [{ kind:'ferment', stage:'bloque'|'bollos', w:'n'|'t'|'r', hours, start, end }, { kind:'shape', start }].
  // startMs = null cuando no hay fecha elegida (entonces no hay rangos horarios, solo horas).
  function buildSegments(startMs){
    let t = startMs;
    const list = [];
    getPhases().forEach(x => {
      if (x[0] === 'h') {
        list.push({ kind: 'shape', start: t == null ? null : new Date(t) });
        return;
      }
      const seg = { kind: 'ferment', stage: x[4] || null, w: x[3], hours: x[2], start: t == null ? null : new Date(t), end: null };
      if (t != null) { t += x[2] * 36e5; seg.end = new Date(t); }
      list.push(seg);
    });
    return { list: list, bakeAt: t == null ? null : new Date(t) };
  }
  // Siempre se reconstruye con las fases actuales y el último inicio calculado por el
  // planificador (null si no hay fecha elegida).
  window.__getPlannerSegments = function(){ return buildSegments(window.__plannerStartMs == null ? null : window.__plannerStartMs); };

  window.__getPlannerD = getD;
  window.__triggerPlanner = renderPlanner;
  function renderPlanner(){
    if (!pDt) return;
    const isMixta = (document.getElementById('fridgeToggle') && document.getElementById('fridgeToggle').checked) 
      ? (parseFloat(document.getElementById('horasFrio').value) > 0) : false;
      
    const showBl = (planCur === 'a' && !isMixta);
    pBlWrap.style.display = showBl ? 'block' : 'none';
    if (showBl) {
      const dd0 = getD();
      pBlHint.textContent = I18N.t('plannerBlHint').replace('{h}', durFmt(dd0.bollos.t));
    }
    
    const v = pDt.value;
    const pIntro = document.getElementById('plannerIntroNote');
    if (!v) {
      pTl.innerHTML = '';
      pTotal.textContent = '';
      if (pIntro) pIntro.style.display = 'none';
      window.__plannerPlanText = '';
      window.__plannerTimeline = [];
      window.__plannerStartMs = null;
      if (window.__updateStepByStep) window.__updateStepByStep();
      if (window.__updatePlannerNotifications) window.__updatePlannerNotifications();
      return;
    }
    if (pIntro) pIntro.style.display = '';
    
    const ph = getPhases();
    const tot = ph.reduce((a, x) => a + (x[0] === 'f' ? x[2] : 0), 0);
    const dtDate = new Date(v);
    let t = (planMode === 1 ? dtDate : new Date(dtDate.getTime() - tot * 36e5)).getTime();
    window.__plannerStartMs = t;
    
    const items = [];
    let prevW = null;
    let prevStage = null;
    ph.forEach(x => {
      if (x[0] === 'h') {
        items.push({
          t: new Date(t),
          x: x[1],
          c: COL.h,
          g: '',
          phaseKind: 'h',
          stage: 'bollos',
          prevW: prevW,
          prevStage: prevStage
        });
      } else {
        items.push({
          t: new Date(t),
          x: x[1] + ' (' + durFmt(x[2]) + ')',
          c: COL[x[3]],
          g: getTag()[x[3]],
          phaseKind: 'f',
          hours: x[2],
          w: x[3],
          stage: x[4] || null,
          prevW: prevW,
          prevStage: prevStage
        });
        prevW = x[3];
        prevStage = x[4] || null;
        t += x[2] * 36e5;
      }
    });
    items.push({ t: new Date(t), x: I18N.t('plannerLista'), c: '#6cc17e', g: I18N.t('plannerAHornear'), isBake: true });
    
    pTl.innerHTML = items.map(s => {
      if (s.t) {
        return '<li style="--c:' + s.c + '"><span class="dot"></span><div class="when">' + fmtDate(s.t) + (s.g ? '<span class="tag">' + s.g + '</span>' : '') + '</div><div class="what">' + s.x + '</div></li>';
      }
      return '<li style="--c:' + s.c + '"><span class="dot"></span><div class="when">' + s.x + '</div></li>';
    }).join('');
    
    pTotal.textContent = I18N.t('plannerTotal') + ': ' + durFmt(tot);
    
    window.__plannerPlanText = I18N.t('plannerHeader') + ' 🕐\n' + items.map(s => {
      const txtX = s.x.replace(/<[^>]*>?/gm, '').trim();
      return s.t ? fmtDate(s.t) + ' – ' + txtX : '· ' + txtX;
    }).join('\n');

    window.__plannerTimeline = items;
    if (window.__updateStepByStep) window.__updateStepByStep();
    if (window.__updatePlannerNotifications) window.__updatePlannerNotifications();
  }
  window.__renderPlanner = renderPlanner;

  // Hook into D or global recalculation
  const origCalcular = window.calcular || function(){};
  window.calcular = function() {
    origCalcular.apply(this, arguments);
    renderPlanner();
  };
  
  // Try hook the button inputs directly if possible since calculator.js hides them.
  document.getElementById('fridgeToggle')?.addEventListener('change', renderPlanner);
  document.getElementById('horasFrio')?.addEventListener('input', renderPlanner);
  document.getElementById('horas')?.addEventListener('input', renderPlanner);
  
  // initial mode
  setTimeout(() => setMode(1), 500);

})();

// --- SECCIÓN PASO A PASO (RESULTADO) ---
(function initStepByStep() {
  const stepToggle = document.getElementById('stepByStepToggle');
  const stepBody = document.getElementById('stepByStepBody');
  const container = document.getElementById('stepList');
  if (!stepToggle || !stepBody || !container) return;

  stepToggle.addEventListener('click', () => {
    const isClosed = (stepBody.style.display === 'none' || !stepBody.style.display);
    stepBody.style.display = isClosed ? 'block' : 'none';
    stepToggle.setAttribute('aria-expanded', String(isClosed));
  });

  function fmtPlannerTime(d, isEn) {
    if (!d) return '';
    const dateObj = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dateObj.getTime())) return '';
    const fmt = new Intl.DateTimeFormat(isEn ? 'en-US' : 'es-ES', {
      hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', hour12: false
    });
    const parts = fmt.formatToParts(dateObj);
    const getPart = (type) => {
      const p = parts.find(x => x.type === type);
      return p ? p.value : '';
    };
    const hour = getPart('hour');
    const minute = getPart('minute');
    const day = getPart('day');
    const month = getPart('month');
    if (!hour || !minute) return '';
    const timeStr = `${hour}:${minute}`;
    if (day && month) {
      return isEn ? `${timeStr} on ${month} ${day}` : `${timeStr} del ${day} ${month}`;
    }
    return timeStr;
  }

  function renderStepByStep() {
    if (!container || !window.__getRecipeInputs) return;
    const inputs = window.__getRecipeInputs();
    const D = window.PizzaDough;
    const U = window.PizzaUnits;
    if (!D || !U) return;

    const isEn = (document.documentElement.lang === 'en');
    const tempC = inputs.tempC;
    const horas = inputs.horas;
    const coldH = inputs.coldH;
    const coldT = inputs.coldT;
    const numPizzas = inputs.numPizzas;
    const pesoBola = inputs.pesoG;
    const flours = inputs.flours || [];
    const flourName = inputs.flourName || (id => id);

    const hidInput = document.getElementById('hidratacion');
    const hidVal = hidInput ? (parseFloat(hidInput.value) || 65) : 65;

    const rec = (inputs.lastRecipe && isFinite(inputs.lastRecipe.harinaTotal)) ? inputs.lastRecipe : D.computeRecipe({
      numPizzas: numPizzas, pesoG: pesoBola,
      ambTemp: tempC, ambHours: horas, coldHours: coldH, coldTemp: coldT,
      hidPct: hidVal,
      salGL: inputs.salGL, salPctFlour: inputs.saltIsFlour ? inputs.salPctFlour : null,
      levPorKgHarina: (inputs.yeastMode === 'manual') ? inputs.manualYeastPerKg : inputs.autoYeastGkg,
      flours: flours
    });

    const rawHarina = (rec && rec.harinaTotal != null) ? rec.harinaTotal : (rec ? rec.harina : NaN);
    const rawAgua = (rec && rec.aguaTotal != null) ? rec.aguaTotal : (rec ? rec.agua : NaN);
    const rawSal = (rec && rec.salTotal != null) ? rec.salTotal : (rec ? rec.sal : NaN);
    const rawLev = (rec && rec.levaduraFresca != null) ? rec.levaduraFresca : (rec ? rec.levadura : NaN);

    const harinaTotal = Math.round(rawHarina);
    const aguaTotal = Math.round(rawAgua);
    const agua80 = Math.round(aguaTotal * 0.8);
    const aguaRestante = aguaTotal - agua80;
    const aguaMitad = Math.round(aguaRestante / 2);
    const aguaFinal = aguaRestante - aguaMitad;

    const salTotal = Math.round(rawSal);
    const levNum = (typeof rawLev === 'number') ? rawLev : parseFloat(rawLev);
    const levTotal = (isFinite(levNum) && levNum >= 0) ? U.formatNumber(levNum, levNum < 1 ? 2 : 1) : '';

    const numPizzasVal = parseInt(numPizzas, 10);
    const pesoBolaVal = Math.round(pesoBola);

    // Validación estricta: si alguna variable requerida es NaN, undefined o no finita,
    // no se pinta el paso a paso y se avisa por consola.
    const checkVars = {
      harinaTotal,
      aguaTotal,
      agua80,
      aguaMitad,
      aguaFinal,
      salTotal,
      levNum,
      numPizzas: numPizzasVal,
      pesoBola: pesoBolaVal
    };

    let hasInvalidVar = false;
    for (const [key, val] of Object.entries(checkVars)) {
      if (val === undefined || val === null || Number.isNaN(val) || !Number.isFinite(val)) {
        console.warn(`[Paso a paso] Variable inválida detectada: ${key} = ${val}`);
        hasInvalidVar = true;
      }
    }

    if (!levTotal || levTotal === 'NaN' || levTotal === 'undefined') {
      console.warn(`[Paso a paso] Levadura formateada inválida: "${levTotal}"`);
      hasInvalidVar = true;
    }

    if (hasInvalidVar) {
      container.innerHTML = '';
      return;
    }

    // Lista de harinas para el paso 3
    let flourText = '';
    if (flours.length > 1) {
      const flourParts = flours.map(f => {
        const g = Math.round(harinaTotal * (f.pct / 100));
        return isEn
          ? `${g} g of ${flourName(f.flourId)} (${U.formatNumber(f.pct)}%)`
          : `${g} g de ${flourName(f.flourId)} (${U.formatNumber(f.pct)}%)`;
      });
      const lastPart = flourParts.pop();
      const joined = flourParts.length > 0
        ? (flourParts.join(', ') + (isEn ? ' and ' : ' y ') + lastPart)
        : lastPart;
      flourText = isEn
        ? `Since you have multiple flours, pre-mix them: ${joined}.`
        : `Si tienes varias harinas, mézclalas previamente: ${joined}.`;
    } else if (flours.length === 1) {
      const fName = flourName(flours[0].flourId);
      flourText = isEn
        ? `Weigh the ${harinaTotal} g of ${fName}.`
        : `Pesa los ${harinaTotal} g de ${fName}.`;
    }

    // Fases reales del planificador (única fuente de verdad). Cada fase trae su etapa
    // (bloque / bollos), su tipo (n = nevera, t = temperatura ambiente), sus horas y, si hay
    // fecha elegida, su rango horario. Así cada paso coge la fase (temperatura y horas) que
    // de verdad le corresponde, en cualquier idioma, sin depender de textos traducidos.
    const segData = window.__getPlannerSegments ? window.__getPlannerSegments() : null;
    const segs = (segData && segData.list) ? segData.list : [];
    const fermSegs = segs.filter(s => s.kind === 'ferment' && (s.w === 'n' || s.w === 't'));
    const bloqueSegs = fermSegs.filter(s => s.stage === 'bloque');
    const bollosSegs = fermSegs.filter(s => s.stage === 'bollos');
    const shapeSeg = segs.find(s => s.kind === 'shape');

    const horaBoleado = (shapeSeg && shapeSeg.start) ? fmtPlannerTime(shapeSeg.start, isEn) : '';
    const horaHornear = (segData && segData.bakeAt) ? fmtPlannerTime(segData.bakeAt, isEn) : '';

    const tempCVal = isFinite(tempC) ? tempC : 23;
    const coldTVal = isFinite(coldT) ? coldT : 4;
    const fmtH = (h) => U.formatNumber(h, 1);
    const sumHours = (list) => list.reduce((a, s) => a + s.hours, 0);
    // Rango "de X a Y" de un grupo de fases consecutivas (null si no hay fecha elegida).
    const segRange = (list) => {
      const first = list[0];
      const last = list[list.length - 1];
      if (first && last && first.start && last.end) {
        return { from: fmtPlannerTime(first.start, isEn), to: fmtPlannerTime(last.end, isEn) };
      }
      return null;
    };
    // "19 h en la nevera a 10 °C" / "5 h a 23 °C", según el tipo de cada fase.
    const describeSegs = (list) => list.map(s => {
      if (s.w === 'n') {
        return isEn
          ? `${fmtH(s.hours)} h in the fridge at ${coldTVal} °C`
          : `${fmtH(s.hours)} h en la nevera a ${coldTVal} °C`;
      }
      return isEn
        ? `${fmtH(s.hours)} h at ${tempCVal} °C`
        : `${fmtH(s.hours)} h a ${tempCVal} °C`;
    }).join(' + ');

    const steps = [];

    // 1. Agua
    steps.push({
      group: 'masa',
      theme: 'terracota',
      tag: null,
      title: isEn ? "Start with the water." : "Empieza por el agua.",
      body: isEn
        ? `You'll use ${aguaTotal} grams, as cold as possible. Begin by pouring in 80% of the total (${agua80} g). In summer or if kneading a large batch, replace part of the water with ice so the mixer doesn't overheat the dough.`
        : `Vas a usar ${aguaTotal} gramos, y lo más fría posible. Empieza echando el 80% del total (${agua80} g). En verano o si amasas mucha cantidad, cambia parte del agua por hielo para que la amasadora no sobrecaliente la masa.`
    });

    // 2. Levadura
    steps.push({
      group: 'masa',
      theme: 'terracota',
      tag: null,
      title: isEn ? "Dissolve the yeast." : "Disuelve la levadura.",
      body: isEn
        ? `Dissolve the ${levTotal} g of yeast directly in the water. You can do this with your fingers.`
        : `Deshaz los ${levTotal} g de levadura directamente en el agua. Puedes hacerlo con los dedos.`
    });

    // 3. Harina
    steps.push({
      group: 'masa',
      theme: 'terracota',
      tag: null,
      title: isEn ? "Time for the flour." : "Turno de la harina.",
      body: isEn
        ? `Add the flour to the water with the yeast and knead until well combined. ${flourText} Add a couple of extra grams of flour because some dough is always lost on the bowl and hands. Use half of the remaining water (${aguaMitad} g) to help the flour incorporate well.`
        : `Añade la harina al agua con la levadura y amasa hasta que esté bien integrada. ${flourText} Añade un par de gramos de harina extra porque siempre se pierde algo de masa en el bol y en las manos. Usa la mitad del agua restante (${aguaMitad} g) para ayudar a que se integre bien la harina.`
    });

    // 4. Amasado
    steps.push({
      group: 'masa',
      theme: 'terracota',
      tag: null,
      title: isEn ? "Knead." : "Amasa.",
      body: isEn
        ? `Incorporate the ingredients well. If using a mixer, start at low speed.`
        : `Integra bien los ingredientes. Si usas amasadora, empieza a velocidad baja.`
    });

    // 5. Sal
    steps.push({
      group: 'masa',
      theme: 'terracota',
      tag: null,
      title: isEn ? "Add the salt." : "Incorpora la sal.",
      body: isEn
        ? `When the flour and water are already combined and the dough looks uniform, add ${salTotal} g of salt. It helps tighten the gluten network, but it also tends to warm up the dough, so be careful. Pour in the remaining water (${aguaFinal} g) to help dissolve the salt.`
        : `Cuando la harina y el agua ya estén integradas y la masa tenga un aspecto uniforme, añade ${salTotal} g de sal. Ayuda a tensar la malla de gluten, pero también tiende a calentar la masa, ten cuidado. Echa el agua restante (${aguaFinal} g) para ayudar a disolver la sal.`
    });

    // 6. Amasado continuo
    steps.push({
      group: 'masa',
      theme: 'terracota',
      tag: null,
      title: isEn ? "Knead." : "Amasa.",
      body: isEn
        ? `Continue until the dough stops sticking to the bowl walls, is smooth, and its internal temperature is around 23–25 °C (73–77 °F). Don't watch the clock.`
        : `Sigue hasta que la masa deje de pegarse a las paredes del bol, esté lisa y su temperatura interior ronde los 23–25 °C. No te guíes por tiempos.`
    });

    // 7. Reposo
    steps.push({
      group: 'fermentacion',
      theme: 'ambar',
      tag: '20–30 min',
      title: isEn ? "Bulk rest." : "Reposo en bloque.",
      body: isEn
        ? `Take the dough out, build tension by shaping a large ball, and let it rest 20-30 minutes covered with a bowl or a damp cloth. Don't worry if it isn't completely smooth.`
        : `Saca la masa, dale tensión formando una bola grande y déjala reposar 20-30 minutos tapada con un bol o un paño húmedo. No te preocupes si no está del todo lisa.`
    });

    // 8. Fermentación en bloque (solo si el plan tiene fase de bloque). Toma la fase de
    // bloque del planificador: nevera (n) o temperatura ambiente (t), con su temperatura,
    // horas y rango horario propios. Mismo formato en español e inglés.
    const bulkFridge = bloqueSegs.filter(s => s.w === 'n');
    const hasBulkFridge = bulkFridge.length > 0;
    if (bloqueSegs.length > 0) {
      const blockDesc = describeSegs(bloqueSegs);
      const blockRange = segRange(bloqueSegs);
      let blockPlanText = blockDesc;
      if (blockRange) {
        blockPlanText = isEn
          ? `from ${blockRange.from} to ${blockRange.to} (${blockDesc})`
          : `de ${blockRange.from} a ${blockRange.to} (${blockDesc})`;
      }
      const blockH = fmtH(sumHours(bloqueSegs));
      const blockT = Math.round(U.tempValue(hasBulkFridge ? coldTVal : tempCVal));
      const blockTag = `${blockH} h · ${blockT} ${U.tempUnit()}`;
      steps.push({
        group: 'fermentacion',
        theme: hasBulkFridge ? 'azul' : 'ambar',
        tag: blockTag,
        title: isEn ? "Bulk fermentation." : "Fermentación en bloque.",
        body: isEn
          ? `After the previous rest, the dough has already gained a lot of strength. Give it a bit more tension again, you'll see it becomes smoother. Let the whole dough ferment, tightly sealed in a container: ${blockPlanText}. It doesn't need to double: once it has grown 50 to 70% it's ready to ball.`
          : `Tras el reposo anterior, la masa ya ha ganado mucha fuerza. Vuelve a darle algo de tensión, verás que se vuelve más lisa. Deja fermentar la masa entera, bien tapada y hermética en un recipiente: ${blockPlanText}. No hace falta que doble: con que crezca entre un 50 y un 70 % está lista para bolear.`
      });
    }

    // 9. Boleado: si el bloque fermentó en la nevera, la masa sale del frío en este
    // paso ("Saca la masa de la nevera a las 16:00 y divídela en...").
    let boleadoPlanText = horaBoleado ? (isEn ? ` at ${horaBoleado}` : ` a las ${horaBoleado}`) : '';
    const ballsWord = numPizzasVal === 1 ? (isEn ? 'ball' : 'bola') : (isEn ? 'balls' : 'bolas');
    let boleadoBody = '';
    if (hasBulkFridge) {
      boleadoBody = isEn
        ? `Take the dough out of the fridge${boleadoPlanText} and divide it into ${numPizzasVal} ${ballsWord} of ${pesoBolaVal} g. Shape each with tension.`
        : `Saca la masa de la nevera${boleadoPlanText} y divídela en ${numPizzasVal} ${ballsWord} de ${pesoBolaVal} g. Forma cada una con tensión.`;
    } else {
      boleadoBody = isEn
        ? `Divide the dough into ${numPizzasVal} ${ballsWord} of ${pesoBolaVal} g and shape each with tension${boleadoPlanText}.`
        : `Divide la masa en ${numPizzasVal} ${ballsWord} de ${pesoBolaVal} g y forma cada una con tensión${boleadoPlanText}.`;
    }
    steps.push({
      group: 'fermentacion',
      theme: 'ambar',
      tag: null,
      title: isEn ? "Ball shaping." : "Boleado.",
      body: boleadoBody
    });

    // 10. Fermentación de las bolas: toma la fase de bollos del planificador (nevera o
    // temperatura ambiente, con su temperatura, horas y rango horario propios).
    const bollosFridge = bollosSegs.filter(s => s.w === 'n');
    const bollosAmbient = bollosSegs.filter(s => s.w === 't');
    const hasBollosFridge = bollosFridge.length > 0;
    if (hasBollosFridge) {
      const fr = segRange(bollosFridge);
      const fridgePlanText = fr
        ? (isEn ? ` (from ${fr.from} to ${fr.to})` : ` (de ${fr.from} a ${fr.to})`)
        : '';
      const fridgeHours = fmtH(sumHours(bollosFridge));
      const fridgeTagT = Math.round(U.tempValue(coldTVal));
      steps.push({
        group: 'fermentacion',
        theme: 'azul',
        tag: `${fridgeHours} h · ${fridgeTagT} ${U.tempUnit()}`,
        title: isEn ? "Ball fermentation." : "Fermentación de las bolas.",
        body: isEn
          ? `Place the balls in an airtight container. Store the balls in the fridge at ${coldTVal} °C for ${fridgeHours} h${fridgePlanText}. Leave them out at room temperature for a while beforehand so the yeast wakes up.`
          : `Coloca las bolas en un recipiente tapado y hermético. Guarda las bolas en la nevera a ${coldTVal} °C durante ${fridgeHours} h${fridgePlanText}. Déjalas antes un rato fuera a temperatura ambiente para que la levadura despierte.`
      });
    } else if (bollosAmbient.length > 0) {
      const ar = segRange(bollosAmbient);
      const ballsPlanText = ar
        ? (isEn ? ` (from ${ar.from} to ${ar.to})` : ` (de ${ar.from} a ${ar.to})`)
        : '';
      const ambientHours = fmtH(sumHours(bollosAmbient));
      const ambientTagT = Math.round(U.tempValue(tempCVal));
      steps.push({
        group: 'fermentacion',
        theme: 'ambar',
        tag: `${ambientHours} h · ${ambientTagT} ${U.tempUnit()}`,
        title: isEn ? "Ball fermentation." : "Fermentación de las bolas.",
        body: isEn
          ? `Place the balls in an airtight container. Leave them at room temperature (${tempCVal} °C) for ${ambientHours} h${ballsPlanText}.`
          : `Coloca las bolas en un recipiente tapado y hermético. Déjalas a temperatura ambiente (${tempCVal} °C) durante ${ambientHours} h${ballsPlanText}.`
      });
    }

    // 11. Sácalas (solo si las bolas estuvieron en la nevera). En "Solo bollos" con
    // nevera, las bolas van al frío y luego atemperan fuera. En "Bloque + bollos" con
    // nevera, lo que va al frío es el bloque y sale para bolear (paso 9), por lo que
    // las bolas nunca entran en la nevera y no hay paso "Sácalas".
    if (bollosFridge.length > 0) {
      const lastFridge = bollosFridge[bollosFridge.length - 1];
      const hoursAfterFridge = sumHours(fermSegs.slice(fermSegs.indexOf(lastFridge) + 1));
      const sacarAt = lastFridge.end ? fmtPlannerTime(lastFridge.end, isEn) : '';
      let hoursBeforeTxt = '';
      if (hoursAfterFridge > 0) {
        const n = fmtH(hoursAfterFridge);
        const one = (hoursAfterFridge === 1);
        hoursBeforeTxt = isEn
          ? `${n} ${one ? 'hour' : 'hours'} before baking`
          : `${n} ${one ? 'hora' : 'horas'} antes de hornear`;
      }
      let sacarPlanText = '';
      if (sacarAt) {
        sacarPlanText = isEn
          ? ` at ${sacarAt}${hoursBeforeTxt ? ` (${hoursBeforeTxt})` : ''}`
          : ` a las ${sacarAt}${hoursBeforeTxt ? ` (${hoursBeforeTxt})` : ''}`;
      } else if (hoursBeforeTxt) {
        sacarPlanText = ` ${hoursBeforeTxt}`;
      }
      const sacarTag = hoursAfterFridge > 0
        ? `${fmtH(hoursAfterFridge)} h ${isEn ? 'before' : 'antes'}`
        : (sacarAt || null);
      steps.push({
        group: 'hornear',
        theme: 'verde',
        tag: sacarTag,
        title: isEn ? "Take them out." : "Sácalas.",
        body: isEn
          ? `Take the dough balls out of the fridge${sacarPlanText} so they temper well and finish fermenting.`
          : `Sácalas de la nevera${sacarPlanText} para que se atemperen bien y terminen de fermentar.`
      });
    }

    // 12. Hora de cocinar
    let cocinarPlanText = horaHornear ? (isEn ? ` at ${horaHornear}` : ` a las ${horaHornear}`) : '';
    const ovenTempStr = U.isImperial() ? '850–930 °F' : '450–500 °C';
    let cookTag = ovenTempStr;
    if (segData && segData.bakeAt) {
      try {
        const bakeTimeOnly = new Intl.DateTimeFormat(isEn ? 'en-US' : 'es-ES', {
          hour: '2-digit', minute: '2-digit', hour12: false
        }).format(new Date(segData.bakeAt));
        if (bakeTimeOnly) cookTag = `${bakeTimeOnly} · ${ovenTempStr}`;
      } catch (e) {}
    }
    steps.push({
      group: 'hornear',
      theme: 'verde',
      tag: cookTag,
      title: isEn ? "Time to cook." : "Hora de cocinar.",
      body: isEn
        ? `With your pizza balls ready, just stretch the dough, top it, and slide it into the oven${cocinarPlanText}.`
        : `Con las bolas de pizza ya listas, solo tienes que estirar la masa, poner los ingredientes y meterla en el horno${cocinarPlanText}.`
    });

    // Comprobación de seguridad final: si algún paso renderizado contiene "NaN" o "undefined",
    // no se pinta nada y se avisa por consola.
    for (const s of steps) {
      if (s.title.includes('NaN') || s.title.includes('undefined') ||
          s.body.includes('NaN') || s.body.includes('undefined')) {
        console.warn('[Paso a paso] Texto con NaN o undefined detectado:', s);
        container.innerHTML = '';
        return;
      }
    }

    // Grupos por fases con mini-título en mayúsculas pequeñas.
    // Solo aparecen si ese grupo tiene pasos en el modo activo.
    const groupDefs = [
      { id: 'masa', title: isEn ? "THE DOUGH" : "LA MASA" },
      { id: 'fermentacion', title: isEn ? "REST AND FERMENTATION" : "REPOSO Y FERMENTACIÓN" },
      { id: 'hornear', title: isEn ? "BAKE TIME" : "A HORNEAR" }
    ];

    let html = '';
    groupDefs.forEach(g => {
      const gSteps = steps.filter(s => s.group === g.id);
      if (gSteps.length === 0) return;

      html += `<li class="step-group-header" role="presentation"><span class="step-group-title">${g.title}</span></li>`;
      gSteps.forEach(s => {
        const idx = steps.indexOf(s);
        const isLastInGroup = (gSteps.indexOf(s) === gSteps.length - 1);
        const tagHtml = s.tag ? `<span class="step-tag">${s.tag}</span> ` : '';
        html += `<li class="step-item step-item--${s.theme}${isLastInGroup ? ' is-last-in-group' : ''}"><div class="step-marker" aria-hidden="true"><span class="step-pill">${idx + 1}<span class="step-dot">.</span></span> </div><div class="step-content"><div class="step-head"><strong class="step-title">${s.title}</strong> ${tagHtml}</div><p class="step-body">${s.body}</p></div></li>`;
      });
    });

    container.innerHTML = html;
  }

  window.__updateStepByStep = renderStepByStep;
  window.addEventListener('pizzaLangChange', renderStepByStep);
  window.addEventListener('pizzaUnitsChange', renderStepByStep);
  setTimeout(renderStepByStep, 400);
})();

// --- NOTIFICACIONES LOCALES DEL PLANIFICADOR ---
(function initPlannerNotifications() {
  const btn = document.getElementById('btnPlannerNotify');
  const txt = document.getElementById('btnPlannerNotifyText');
  const status = document.getElementById('plannerNotifyStatus');
  const activeContainer = document.getElementById('plannerActiveNotifs');
  const activeTitle = document.getElementById('plannerActiveTitle');
  const activeList = document.getElementById('plannerActiveList');
  const diffNotice = document.getElementById('plannerDiffRecipeNotice');
  const btnCancelDiff = document.getElementById('btnPlannerCancelDiffRecipe');
  if (!btn || !txt) return;

  let activeTimersMap = {};

  if (btnCancelDiff) {
    btnCancelDiff.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelAllNotifications(true);
    });
  }

  function getSavedRemindersMeta() {
    try {
      const raw = localStorage.getItem('pizza_scheduled_notifs');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
      return null;
    } catch(e) {
      return null;
    }
  }

  function getSavedReminders() {
    try {
      const raw = localStorage.getItem('pizza_scheduled_notifs');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.list)) return parsed.list;
      return [];
    } catch(e) {
      return [];
    }
  }

  function saveReminders(list, extraMeta) {
    try {
      if (!list || list.length === 0) {
        localStorage.removeItem('pizza_scheduled_notifs');
      } else {
        const curActive = (typeof window.getActiveRecipe === 'function') ? window.getActiveRecipe() : null;
        const curRecipeId = curActive ? String(curActive.id) : null;
        const curRecipeName = getActiveRecipeName();
        const meta = extraMeta || {};
        localStorage.setItem('pizza_scheduled_notifs', JSON.stringify({
          count: list.length,
          createdAt: meta.createdAt || Date.now(),
          recipeName: meta.recipeName || (list[0] && list[0].recipeName) || curRecipeName,
          recipeId: meta.recipeId !== undefined ? meta.recipeId : (list[0] && list[0].recipeId !== undefined ? list[0].recipeId : curRecipeId),
          list: list
        }));
      }
    } catch(e) {}
  }

  function getActiveRecipeName() {
    const I18N = window.PizzaI18N;
    if (typeof window.getActiveRecipe === 'function') {
      try {
        const active = window.getActiveRecipe();
        if (active && active.name && active.name.trim()) return active.name.trim();
      } catch(e) {}
    }
    if (window.__sharedRecipeName && window.__sharedRecipeName.trim()) {
      return window.__sharedRecipeName.trim();
    }
    const numPanEl = document.getElementById('numPaneteos');
    const pesoPanEl = document.getElementById('pesoPaneto');
    if (numPanEl) {
      const num = Math.max(1, parseDecimal(numPanEl.value) || 0);
      const peso = Math.round(parseDecimal(pesoPanEl ? pesoPanEl.value : null) || 280);
      const pizzaLabel = I18N ? I18N.t(num === 1 ? 'recipePizzaOne' : 'recipePizzas') : (num === 1 ? 'pizza' : 'pizzas');
      const ofLabel = I18N ? I18N.t('recipeOf') : 'de';
      return `${num} ${pizzaLabel.toLowerCase()} ${ofLabel} ${peso} g`;
    }
    return I18N ? I18N.t('recipeHeader') : 'Masa de pizza';
  }

  function formatReminderTime(timestamp) {
    const d = new Date(timestamp);
    const now = new Date();
    const isEn = (document.documentElement.lang || '').startsWith('en');

    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const timeStr = `${hh}:${mm}`;

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const targetDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((targetDay - today) / (86400000));

    if (diffDays === 0) {
      return (isEn ? 'Today at ' : 'Hoy a las ') + timeStr;
    } else if (diffDays === 1) {
      return (isEn ? 'Tomorrow at ' : 'Mañana a las ') + timeStr;
    } else {
      const day = d.getDate();
      const monthsEs = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = (isEn ? monthsEn : monthsEs)[d.getMonth()];
      return `${day} ${month}, ${timeStr}`;
    }
  }

  function armTimers(list) {
    Object.keys(activeTimersMap).forEach(id => {
      clearTimeout(activeTimersMap[id]);
    });
    activeTimersMap = {};

    const now = Date.now();
    list.forEach(m => {
      if (m.time > now) {
        const delay = m.time - now;
        const tid = setTimeout(() => {
          triggerNotification(m.title, m.body);
          removeSingleReminder(m.id, false);
        }, delay);
        activeTimersMap[m.id] = tid;
      }
    });
  }

  function removeSingleReminder(id, showToastMsg) {
    if (activeTimersMap[id]) {
      clearTimeout(activeTimersMap[id]);
      delete activeTimersMap[id];
    }
    const current = getSavedReminders();
    const meta = getSavedRemindersMeta();
    const filtered = current.filter(m => String(m.id) !== String(id) && m.time > Date.now());
    saveReminders(filtered, meta);
    updateUI();
    if (showToastMsg) {
      const I18N = window.PizzaI18N;
      if (I18N) window.showToast?.(I18N.t('plannerNoticeCancelledSingle'));
    }
  }

  function cancelAllNotifications(showToastMsg) {
    const I18N = window.PizzaI18N;
    Object.keys(activeTimersMap).forEach(id => {
      clearTimeout(activeTimersMap[id]);
    });
    activeTimersMap = {};
    saveReminders([]);
    updateUI();
    if (showToastMsg && I18N) window.showToast?.(I18N.t('plannerNotifyCancelledToast'));
  }

  function isDifferentRecipe(validSaved) {
    if (!validSaved || validSaved.length === 0) return false;
    const meta = getSavedRemindersMeta();
    const savedRecipeId = (meta && meta.recipeId != null) ? String(meta.recipeId) : (validSaved[0] && validSaved[0].recipeId != null ? String(validSaved[0].recipeId) : null);
    const savedRecipeName = (meta && meta.recipeName) || (validSaved[0] && validSaved[0].recipeName) || '';

    const curActive = (typeof window.getActiveRecipe === 'function') ? window.getActiveRecipe() : null;
    const curRecipeId = curActive ? String(curActive.id) : null;
    const curRecipeName = getActiveRecipeName();

    if (savedRecipeId) {
      if (curRecipeId) {
        return curRecipeId !== savedRecipeId;
      }
      return true;
    }

    if (curRecipeId) {
      return true;
    }

    if (savedRecipeName && curRecipeName) {
      return savedRecipeName.trim().toLowerCase() !== curRecipeName.trim().toLowerCase();
    }

    return false;
  }

  function updateUI() {
    const I18N = window.PizzaI18N;
    if (!I18N) return;
    if (unsupportedShown) renderUnsupportedWarning();

    const now = Date.now();
    const allSaved = getSavedReminders();
    const validSaved = allSaved.filter(m => m.time > now);
    if (validSaved.length !== allSaved.length) {
      saveReminders(validSaved);
    }

    if (validSaved.length > 0) {
      btn.classList.add('is-active');
      txt.textContent = I18N.t('plannerNotifyCancelBtn');
      if (status) {
        status.style.display = 'block';
        status.textContent = I18N.t('plannerNotifyScheduled').replace('{n}', validSaved.length);
      }
      if (activeContainer && activeList) {
        activeContainer.style.display = 'flex';
        if (activeTitle) {
          activeTitle.textContent = `${I18N.t('plannerActiveTitle')} (${validSaved.length})`;
        }
        if (diffNotice) {
          const isDiff = isDifferentRecipe(validSaved);
          diffNotice.style.display = isDiff ? 'flex' : 'none';
        }
        activeList.innerHTML = '';
        validSaved.forEach(m => {
          const li = document.createElement('li');
          li.className = 'planner-active-item';

          const left = document.createElement('div');
          left.className = 'pan-left';

          const badge = document.createElement('span');
          badge.className = 'pan-badge';
          badge.textContent = '🍕 ' + (m.recipeName || I18N.t('recipeHeader'));
          badge.title = m.recipeName || '';

          const step = document.createElement('span');
          step.className = 'pan-step';
          step.textContent = m.title;

          const time = document.createElement('span');
          time.className = 'pan-time';
          time.textContent = formatReminderTime(m.time);

          left.appendChild(badge);
          left.appendChild(step);
          left.appendChild(time);

          const delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'pan-del-btn';
          delBtn.setAttribute('aria-label', I18N.t('plannerCancelSingleAria') || 'Cancelar este aviso');
          delBtn.title = I18N.t('plannerCancelSingleAria') || 'Cancelar este aviso';
          delBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
          delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeSingleReminder(m.id, true);
          });

          li.appendChild(left);
          li.appendChild(delBtn);
          activeList.appendChild(li);
        });
      }
    } else {
      btn.classList.remove('is-active');
      txt.textContent = I18N.t('plannerNotifyBtn');
      if (status) status.style.display = 'none';
      if (diffNotice) diffNotice.style.display = 'none';
      if (activeContainer) activeContainer.style.display = 'none';
      if (activeList) activeList.innerHTML = '';
    }
  }

  // Dispara una notificación inmediata de un hito del planificador.
  function triggerNotification(title, body) {
    const notifOptions = {
      body: body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      vibrate: [200, 100, 200]
    };

    function fallbackNotification() {
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(title, { body: body, icon: './icon-192.png' });
        }
      } catch (err) {
        console.warn('Error showing fallback notification:', err);
      }
    }

    try {
      if (navigator.serviceWorker && typeof navigator.serviceWorker.getRegistration === 'function') {
        navigator.serviceWorker.getRegistration().then(reg => {
          if (reg && reg.active && typeof reg.showNotification === 'function') {
            reg.showNotification(title, notifOptions).catch(fallbackNotification);
          } else {
            fallbackNotification();
          }
        }).catch(() => {
          fallbackNotification();
        });
      } else {
        fallbackNotification();
      }
    } catch(e) {
      console.warn('Error showing notification:', e);
      fallbackNotification();
    }
  }

  const warnEl = document.getElementById('plannerNotifyWarn');
  let unsupportedShown = false;
  function renderUnsupportedWarning() {
    const I18N = window.PizzaI18N;
    if (!warnEl || !I18N) return;
    warnEl.textContent = I18N.t('plannerNotifyNoSupport');
    warnEl.style.display = 'block';
  }
  function showUnsupportedWarning() {
    unsupportedShown = true;
    renderUnsupportedWarning();
  }

  async function scheduleNotifications() {
    const I18N = window.PizzaI18N;
    const inIframe = (function() {
      try { return window.self !== window.top; } catch(e) { return true; }
    })();

    if (typeof Notification === 'undefined' && !inIframe) {
      showUnsupportedWarning();
      return;
    }

    let perm = 'granted';
    if (!inIframe && typeof Notification !== 'undefined') {
      perm = Notification.permission;
      if (perm !== 'granted') {
        try {
          perm = await Notification.requestPermission();
        } catch(e) {}
      }
      if (perm !== 'granted') {
        if (I18N) window.showToast?.(I18N.t('plannerNotifyPermissionDenied'));
        return;
      }
    }

    const pDt = document.getElementById('plannerDt');
    if ((!pDt || !pDt.value || !window.__plannerTimeline || window.__plannerTimeline.length === 0) && typeof window.__renderPlanner === 'function') {
      if (pDt && !pDt.value) {
        const n = new Date();
        n.setMinutes(0, 0, 0);
        n.setHours(n.getHours() + 1);
        const o = new Date(n.getTime() - n.getTimezoneOffset() * 6e4);
        pDt.value = o.toISOString().slice(0, 16);
      }
      window.__renderPlanner();
    }

    const items = window.__plannerTimeline || [];
    const now = Date.now();
    const futureMilestones = [];
    const recipeName = getActiveRecipeName();
    const curActive = (typeof window.getActiveRecipe === 'function') ? window.getActiveRecipe() : null;
    const recipeId = curActive ? String(curActive.id) : null;
    const seenTimes = new Set();

    items.forEach((it, idx) => {
      if (!it.t || it.t.getTime() <= now) return;
      // Si dos pasos coinciden en hora, que se cree un solo aviso
      const minuteKey = Math.floor(it.t.getTime() / 60000);
      if (seenTimes.has(minuteKey)) return;

      const desc = (it.x || '').toLowerCase();
      const tag = (it.g || '').toLowerCase();
      let title = '';
      let body = '';

      if (it.isBake || desc.includes('lista') || desc.includes('ready') || tag.includes('hornear') || tag.includes('bake')) {
        title = I18N.t('notifHornearTitle');
        body = I18N.t('notifHornearBody');
      } else if (it.w === 'r' || (it.phaseKind !== 'h' && (tag.includes('reposo') || desc.includes('reposo')))) {
        title = I18N.t('notifRestTitle');
        body = I18N.t('notifRestBody');
      } else if ((it.w === 'n' && it.stage === 'bloque') || ((tag.includes('nevera') || tag.includes('fridge') || desc.includes('controlada')) && (desc.includes('bloque') || desc.includes('bulk')))) {
        title = I18N.t('notifMasaNeveraTitle');
        body = I18N.t('notifMasaNeveraBody');
      } else if ((it.stage === 'bollos' && it.w === 't' && it.prevW === 'n') || (desc.includes('saca') && (desc.includes('nevera') || desc.includes('fridge')))) {
        title = I18N.t('notifNeveraTitle');
        body = I18N.t('notifNeveraBody');
      } else if (it.phaseKind === 'h' || desc.includes('formar') || desc.includes('shape') || tag.includes('bole') || (desc.includes('bollo') && !desc.includes('temperatura ambiente') && !desc.includes('controlada'))) {
        title = I18N.t('notifBolearTitle');
        if (it.prevW === 'n' && it.prevStage === 'bloque') {
          body = I18N.t('notifBolearFromFridgeBody');
        } else {
          body = I18N.t('notifBolearBody');
        }
      } else if (tag.includes('nevera') || tag.includes('fridge') || desc.includes('controlada')) {
        if (desc.includes('bloque') || desc.includes('bulk')) {
          title = I18N.t('notifMasaNeveraTitle');
          body = I18N.t('notifMasaNeveraBody');
        } else {
          title = I18N.t('notifNeveraTitle');
          body = I18N.t('notifNeveraBody');
        }
      } else {
        title = it.x.replace(/<[^>]*>?/gm, '').replace(/\s*\([^)]*\)/, '').trim();
        body = it.x.replace(/<[^>]*>?/gm, '').trim();
      }

      if (title) {
        seenTimes.add(minuteKey);
        futureMilestones.push({
          id: 'notif-' + it.t.getTime() + '-' + idx,
          recipeName: recipeName,
          recipeId: recipeId,
          title: title,
          body: body,
          time: it.t.getTime()
        });
      }
    });

    if (futureMilestones.length === 0) {
      if (I18N) window.showToast?.(I18N.t('plannerNotifyNoFuture'));
      return;
    }

    cancelAllNotifications(false);

    saveReminders(futureMilestones, { recipeName: recipeName, recipeId: recipeId });
    armTimers(futureMilestones);

    updateUI();
    if (I18N) window.showToast?.(I18N.t('plannerNotifyScheduledToast').replace('{n}', futureMilestones.length));
  }

  btn.addEventListener('click', async () => {
    try {
      const current = getSavedReminders().filter(m => m.time > Date.now());
      if (current.length > 0) {
        cancelAllNotifications(true);
      } else {
        await scheduleNotifications();
      }
    } catch(err) {
      console.error('Error on btnPlannerNotify click:', err);
    }
  });

  // Re-armar avisos futuros pendientes de localStorage al arrancar
  const initial = getSavedReminders().filter(m => m.time > Date.now());
  saveReminders(initial);
  if (initial.length > 0) {
    armTimers(initial);
  }

  window.__updatePlannerNotifications = updateUI;
  window.addEventListener('pizzaLangChange', updateUI);
  updateUI();

  // Asegurar que tras la carga completa del DOM y ejecución de app.js (applyStaticDom)
  // el botón refleje el estado real de los avisos guardados.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateUI);
  } else {
    setTimeout(updateUI, 0);
  }
  setTimeout(updateUI, 100);
})();
