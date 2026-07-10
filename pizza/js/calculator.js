// ==================== CALCULADORA ====================
// Lógica central: parámetros de la masa, mezcla de harinas, cálculo de
// ingredientes, persistencia en localStorage, recetas guardadas y copiar receta.
// Depende de window.PizzaI18N (js/i18n.js), que debe cargarse antes.

// stepValue es global porque lo usan los onclick="..." de los botones +/− del HTML.
window.stepValue = function(id, delta, minVal, maxVal) {
  const input = document.getElementById(id);
  let val = parseFloat(input.value) || 0;
  val += delta;
  val = Math.round(val * 10) / 10;
  if(minVal !== undefined && val < minVal) val = minVal;
  if(maxVal !== undefined && val > maxVal) val = maxVal;
  input.value = val;
  input.dispatchEvent(new Event('input'));
};

// Stepper del peso por pizza: el paso depende de la unidad activa (10 g / 0,5 oz).
window.stepPeso = function(dir) {
  const input = document.getElementById('pesoPaneto');
  const imperial = window.PizzaUnits && window.PizzaUnits.isImperial();
  const step = imperial ? 0.5 : 10;
  const min = imperial ? 3.5 : 100;
  let v = (parseFloat(input.value) || 0) + dir * step;
  v = imperial ? Math.round(v * 10) / 10 : Math.round(v);
  if (v < min) v = min;
  input.value = v;
  input.dispatchEvent(new Event('input'));
};

// Stepper de la sal: siempre en % del agua (paso 0,1 %). Es unit-neutral.
window.stepSal = function(dir) {
  const input = document.getElementById('sal');
  let v = (parseFloat(input.value) || 0) + dir * 0.1;
  v = Math.round(v * 10) / 10;
  if (v < 0) v = 0;
  if (v > 10) v = 10;
  input.value = v;
  input.dispatchEvent(new Event('input'));
};

(function(){
  const I18N = window.PizzaI18N;
  const U = window.PizzaUnits; // formato/conversión de unidades (métrico/imperial)
  const D = window.PizzaDough; // fórmula de la masa (núcleo de cálculo, js/dough.js)
  const COLORES_HARINA = ['var(--color-h1)', 'var(--color-h2)', 'var(--color-h3)', 'var(--color-h4)', 'var(--color-h5)'];
  const STORAGE_KEY = 'edu_pizza_calc_settings_v16';

  // Catálogo de harinas bilingüe. Cada harina guarda su índice de catálogo (catalogId),
  // no el nombre, para que el nombre mostrado cambie de idioma sin perder la selección.
  const FLOUR_CATALOG = [
    { es: "Caputo Doppio Zero (Tipo 00 - Clásica)", en: "Caputo Doppio Zero (Type 00 - Classic)", w: "W220/240" },
    { es: "Caputo Pizzería (Tipo 00 - Media fuerza)", en: "Caputo Pizzeria (Type 00 - Medium strength)", w: "W260/270" },
    { es: "Caputo Nuvola (Tipo 0 - Media/Alta fuerza)", en: "Caputo Nuvola (Type 0 - Medium/High strength)", w: "W260/280" },
    { es: "Caputo Cuoco (Tipo 00 - Fuerza)", en: "Caputo Cuoco (Type 00 - Strong)", w: "W300/320" },
    { es: "Caputo Manitoba Oro (Tipo 0 - Gran fuerza)", en: "Caputo Manitoba Oro (Type 0 - Very strong)", w: "W370/390" },
    { es: "Caputo Tipo 1 (Semi-integral)", en: "Caputo Tipo 1 (Semi-wholemeal)", w: "W250/270" },
    { es: "Harina de Fuerza (Supermercado)", en: "Bread/Strong Flour (Supermarket)", w: "" },
    { es: "Harina de Trigo Común (Supermercado)", en: "All-Purpose Wheat Flour (Supermarket)", w: "" }
  ];
  function flourName(catalogId){
    const cat = FLOUR_CATALOG[catalogId] || FLOUR_CATALOG[0];
    return cat[I18N.getLang()] || cat.es;
  }

  const el = {
    numPaneteos: document.getElementById('numPaneteos'),
    pesoPaneto: document.getElementById('pesoPaneto'),
    temperatura: document.getElementById('temperatura'),
    tempValue: document.getElementById('tempValue'),
    tempUnit: document.getElementById('tempUnit'),
    hidratacion: document.getElementById('hidratacion'),
    sal: document.getElementById('sal'),
    warningBanner: document.getElementById('warningBanner'),
    resultsBody: document.getElementById('resultsBody'),
    disabledOverlay: document.getElementById('disabledOverlay'),
    resultsBadge: document.getElementById('resultsBadge'),
    totalMasa: document.getElementById('totalMasa'),
    totalHarina: document.getElementById('totalHarina'),
    totalAgua: document.getElementById('totalAgua'),
    totalSal: document.getElementById('totalSal'),
    totalLevadura: document.getElementById('totalLevadura'),
    totalLevaduraSeca: document.getElementById('totalLevaduraSeca'),
    flourBreakdown: document.getElementById('flourBreakdown'),
    flourRowsContainer: document.getElementById('flourRowsContainer'),
    progressBar: document.getElementById('progressBar'),
    progressStatus: document.getElementById('progressStatus'),
    addFlourBtn: document.getElementById('addFlourBtn'),
    autoBalanceBtn: document.getElementById('autoBalanceBtn'),
    resetBtn: document.getElementById('resetBtn')
  };

  // Barra-resumen fija (solo móvil)
  const mobileSummary = document.getElementById('mobileSummary');
  const ms = {
    harina: document.getElementById('ms-harina'),
    agua: document.getElementById('ms-agua'),
    sal: document.getElementById('ms-sal'),
    lev: document.getElementById('ms-lev')
  };

  const defaultSettings = {
    numPaneteos: 6,
    pesoPaneto: 280,
    temperatura: 18,
    hidratacion: 63,
    sal: 40,
    flours: [
      { id: 1, catalogId: 1, pct: 75, locked: false },
      { id: 2, catalogId: 4, pct: 15, locked: false },
      { id: 3, catalogId: 5, pct: 10, locked: false }
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
      numPaneteos: parseFloat(el.numPaneteos.value),
      pesoPaneto: pesoG,
      temperatura: parseInt(el.temperatura.value, 10),
      hidratacion: parseFloat(el.hidratacion.value),
      sal: salGL,
      flours: flours
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsToSave));
    } catch (e) {}
  }

  const initData = loadSettings();
  el.numPaneteos.value = initData.numPaneteos !== undefined ? initData.numPaneteos : defaultSettings.numPaneteos;
  el.temperatura.value = initData.temperatura !== undefined ? initData.temperatura : defaultSettings.temperatura;
  el.hidratacion.value = initData.hidratacion !== undefined ? initData.hidratacion : defaultSettings.hidratacion;
  // Peso por pizza y sal: valores canónicos SIEMPRE en métrico (gramos y g/L).
  // El peso se muestra en g u oz según el sistema; la sal siempre como % del agua.
  let pesoG = initData.pesoPaneto !== undefined ? initData.pesoPaneto : defaultSettings.pesoPaneto;
  let salGL = initData.sal !== undefined ? initData.sal : defaultSettings.sal;

  // Lee un campo (en su unidad visible) y lo devuelve en la unidad canónica.
  function readPesoField(){
    const v = parseFloat(el.pesoPaneto.value) || 0;
    return U.isImperial() ? U.ozToG(v) : v;    // -> gramos
  }
  function readSalField(){
    // El campo es % del agua; el canónico es g/L (definición en dough.js).
    return D.saltPctToGL(parseFloat(el.sal.value) || 0);
  }
  // Refresca los campos con unidad (peso por pizza y sal) para el sistema activo.
  function renderInputUnits(){
    const imperial = U.isImperial();
    const pesoUnitEl = document.getElementById('pesoUnit');
    const salUnitEl = document.getElementById('salUnitTag');
    // Peso por pizza: g (métrico) u oz (imperial).
    if (imperial){
      el.pesoPaneto.value = Math.round(U.gToOz(pesoG) * 10) / 10;
      el.pesoPaneto.step = '0.5'; el.pesoPaneto.min = '3.5';
    } else {
      el.pesoPaneto.value = Math.round(pesoG);
      el.pesoPaneto.step = '10'; el.pesoPaneto.min = '100';
    }
    if (pesoUnitEl) pesoUnitEl.textContent = U.weightUnit();
    // Sal: siempre como % del agua (unit-neutral, como la hidratación).
    el.sal.value = Math.round(D.saltGLToPct(salGL) * 10) / 10;
    el.sal.step = '0.1'; el.sal.min = '0'; el.sal.max = '10';
    if (salUnitEl) salUnitEl.textContent = I18N.t('salUnit');
  }
  renderInputUnits();

  let flours = initData.flours || defaultSettings.flours;
  let maxId = 0;
  flours.forEach(f => { if(f.id > maxId) maxId = f.id; });
  let flourIdCounter = maxId + 1;
  if(flourIdCounter < 1) flourIdCounter = 4;

  function renderFlours() {
    el.flourRowsContainer.innerHTML = '';

    flours.forEach((flour, index) => {
      const row = document.createElement('div');
      row.className = 'flour-row';
      const color = COLORES_HARINA[index % COLORES_HARINA.length];

      const optionsHtml = FLOUR_CATALOG.map((cat, catIdx) =>
        `<option value="${catIdx}" ${catIdx === flour.catalogId ? 'selected' : ''}>${cat[I18N.getLang()] || cat.es}</option>`
      ).join('');

      const currentCat = FLOUR_CATALOG[flour.catalogId] || {w: ''};
      const badgeHtml = currentCat.w ? `<span class="w-badge">${currentCat.w}</span>` : '';

      row.innerHTML = `
        <div class="flour-index" style="color: ${color};">[${index + 1}]</div>
        <div class="field flour-select-wrap">
          <select class="flour-type-select" data-id="${flour.id}" aria-label="${flourName(flour.catalogId)} ${index + 1}">${optionsHtml}</select>
          ${badgeHtml}
        </div>
        <div class="field unit-field">
          <input type="number" class="flour-pct-input plain-input" data-id="${flour.id}" value="${flour.pct}" min="0" max="100" step="0.5" inputmode="decimal" aria-label="%${index + 1}" ${flour.locked ? 'disabled' : ''}>
          <span class="unit-tag">%</span>
        </div>
        <div class="flour-actions">
          <button type="button" class="btn-icon toggle-lock ${flour.locked ? 'active-lock' : ''}" data-id="${flour.id}" title="${I18N.t(flour.locked ? 'unlockFlourTitle' : 'lockFlourTitle')}" aria-label="${I18N.t(flour.locked ? 'unlockFlourTitle' : 'lockFlourTitle')}">
            ${flour.locked
              ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`
              : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`
            }
          </button>
          <button type="button" class="btn-icon delete" data-id="${flour.id}" title="${I18N.t('deleteFlourAria')}" aria-label="${I18N.t('deleteFlourAria')}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      `;
      el.flourRowsContainer.appendChild(row);
    });

    attachFlourEvents();
    calcular();
  }

  function attachFlourEvents() {
    document.querySelectorAll('.flour-type-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const id = parseInt(e.target.dataset.id);
        flours.find(f => f.id === id).catalogId = parseInt(e.target.value);
        renderFlours();
      });
    });

    document.querySelectorAll('.flour-pct-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const id = parseInt(e.target.dataset.id);
        flours.find(f => f.id === id).pct = parseFloat(e.target.value) || 0;
        calcular();
      });
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
          renderFlours();
        }
      });
    });
  }

  el.addFlourBtn.addEventListener('click', () => {
    flours.push({ id: flourIdCounter++, catalogId: 0, pct: 0, locked: false });
    renderFlours();
  });

  el.autoBalanceBtn.addEventListener('click', () => {
    const lockedSum = flours.filter(f => f.locked).reduce((sum, f) => sum + f.pct, 0);
    const unlockedFlours = flours.filter(f => !f.locked);

    if(unlockedFlours.length > 0) {
      let remaining = Math.max(0, 100 - lockedSum);
      const lastUnlocked = unlockedFlours[unlockedFlours.length - 1];

      unlockedFlours.forEach(f => {
        if(f.id !== lastUnlocked.id) {
          remaining -= f.pct;
        }
      });

      lastUnlocked.pct = Math.max(0, parseFloat(remaining.toFixed(2)));
      renderFlours();
    }
  });

  el.resetBtn.addEventListener('click', () => {
    el.temperatura.value = defaultSettings.temperatura;
    el.hidratacion.value = defaultSettings.hidratacion;
    salGL = defaultSettings.sal;
    renderInputUnits();

    flours = JSON.parse(JSON.stringify(defaultSettings.flours));

    let maxId = 0;
    flours.forEach(f => { if(f.id > maxId) maxId = f.id; });
    flourIdCounter = maxId + 1;

    renderFlours();
  });

  // Hook que se dispara tras recalcular (se asigna cuando las recetas están listas).
  let onConfigChange = null;

  function calcular(){
    const numPaneteos = parseFloat(el.numPaneteos.value) || 0;
    const pesoPaneto = pesoG;
    const temp = parseInt(el.temperatura.value, 10);
    const hidratacionPct = parseFloat(el.hidratacion.value) || 0;
    const salPorKgAgua = salGL; // canónico en g/L

    el.tempValue.textContent = U.tempValue(temp);
    if (el.tempUnit) el.tempUnit.textContent = U.tempUnit();
    saveSettings();
    if (onConfigChange) onConfigChange();

    const sumaPct = flours.reduce((a, b) => a + b.pct, 0);
    const sumaRedondeada = Math.round(sumaPct * 100) / 100;
    const esValido = Math.abs(sumaRedondeada - 100) < 0.001;

    el.progressBar.innerHTML = flours.map((f, i) => {
      if(f.pct <= 0) return '';
      const color = COLORES_HARINA[i % COLORES_HARINA.length];
      return `<div class="progress-segment" style="width: ${f.pct}%; background: ${color};" title="${flourName(f.catalogId)} - ${f.pct}%">
        <div class="segment-label">
          <span class="segment-index">[${i + 1}]</span>
          <span class="segment-pct">${f.pct}%</span>
        </div>
      </div>`;
    }).join('');

    if (esValido) {
      el.progressStatus.textContent = I18N.t('equilibrado');
      el.progressStatus.className = "progress-status ok";
    } else {
      let text = sumaRedondeada > 100 ? I18N.t('tePasas') : I18N.t('falta');
      el.progressStatus.textContent = `${sumaRedondeada}% (${text})`;
      el.progressStatus.className = "progress-status";
    }

    el.warningBanner.classList.toggle('show', !esValido);

    if(!esValido){
      el.resultsBody.style.display = 'none';
      el.disabledOverlay.style.display = 'block';
      el.resultsBadge.textContent = I18N.t('resultsBadgeBlocked');
      el.resultsBadge.style.background = 'rgba(193,67,46,0.25)';
      el.resultsBadge.style.borderColor = 'rgba(193,67,46,0.5)';
      if (mobileSummary) mobileSummary.classList.add('blocked');
      return;
    }

    el.resultsBody.style.display = 'block';
    el.disabledOverlay.style.display = 'none';
    el.resultsBadge.textContent = I18N.t('resultsBadgeReady');
    el.resultsBadge.style.background = 'rgba(255,255,255,0.08)';
    el.resultsBadge.style.borderColor = 'rgba(255,255,255,0.14)';

    const r = D.computeRecipe({
      numPizzas: numPaneteos, pesoG: pesoPaneto, tempC: temp,
      hidPct: hidratacionPct, salGL: salPorKgAgua, flours: flours
    });
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
        <span class="fname"><span class="swatch" style="background:${color}"></span>${flourName(f.catalogId)}</span>
        <span class="fval">${U.formatWeight(gramos)}</span>
      </div>`;
    }).join('');

    el.totalMasa.textContent = U.formatWeight(pesoTotalMasa);
    el.totalHarina.textContent = U.formatWeight(harinaTotal);
    el.totalAgua.textContent = U.formatWeight(aguaTotal);
    el.totalSal.textContent = U.formatWeight(salTotal);
    el.totalLevadura.textContent = U.formatWeightPrecise(levaduraTotal);
    el.totalLevaduraSeca.textContent = U.formatWeightPrecise(levaduraSecaTotal);

    if (mobileSummary) {
      mobileSummary.classList.remove('blocked');
      ms.harina.textContent = U.formatWeight(harinaTotal);
      ms.agua.textContent = U.formatWeight(aguaTotal);
      ms.sal.textContent = U.formatWeight(salTotal);
      ms.lev.textContent = U.formatWeightPrecise(levaduraTotal);
    }
  }

  [el.numPaneteos, el.temperatura, el.hidratacion].forEach(input => {
    input.addEventListener('input', calcular);
  });
  // Peso por pizza y sal actualizan primero su valor canónico (métrico) y luego recalculan.
  el.pesoPaneto.addEventListener('input', () => { pesoG = readPesoField(); calcular(); });
  el.sal.addEventListener('input', () => { salGL = readSalField(); calcular(); });

  renderFlours();

  // Al hacer foco/tap en cualquier input numérico, selecciona su contenido
  // para que el usuario pueda escribir encima sin tener que borrar antes.
  document.addEventListener('focus', (e) => {
    if (e.target.matches('input[type="number"]')) {
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

  // Vuelve a pintar las harinas y los textos calculados cuando cambia el idioma
  window.addEventListener('pizzaLangChange', () => {
    renderInputUnits();
    renderFlours();
    populateSavedRecipesSelect();
  });

  // Recalcula (reformatea pesos y temperatura) al cambiar métrico ↔ imperial.
  window.addEventListener('pizzaUnitsChange', () => { renderInputUnits(); calcular(); });

  // ==================== RECETAS GUARDADAS (con nombre) ====================
  const SAVED_RECIPES_KEY = 'edu_pizza_saved_recipes_v1';
  const savedRecipesSelect = document.getElementById('savedRecipesSelect');
  const loadRecipeBtn = document.getElementById('loadRecipeBtn');
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
    const flours = (d.flours || []).map(f => f.catalogId + ':' + f.pct + ':' + (f.locked ? 1 : 0)).join(',');
    return [d.numPaneteos, d.pesoPaneto, d.temperatura, d.hidratacion, d.sal, flours].join('|');
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

  function populateSavedRecipesSelect() {
    const list = getSavedRecipes();
    const previousValue = savedRecipesSelect.value;
    savedRecipesSelect.innerHTML = '';

    if (list.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = I18N.t('savedRecipesEmpty');
      savedRecipesSelect.appendChild(opt);
      loadRecipeBtn.disabled = true;
      deleteRecipeBtn.disabled = true;
      if (exportRecipesBtn) exportRecipesBtn.disabled = true;
      return;
    }

    list.slice().reverse().forEach(recipe => {
      const opt = document.createElement('option');
      opt.value = recipe.id;
      opt.textContent = recipe.name;
      savedRecipesSelect.appendChild(opt);
    });

    if (list.some(r => String(r.id) === previousValue)) {
      savedRecipesSelect.value = previousValue;
    }
    loadRecipeBtn.disabled = false;
    deleteRecipeBtn.disabled = false;
    if (exportRecipesBtn) exportRecipesBtn.disabled = false;
  }

  // Muestra las notas de la receta seleccionada (si tiene) bajo el selector.
  function updateNotesDisplay() {
    if (!recipeNotesDisplay) return;
    const id = savedRecipesSelect.value;
    const recipe = id ? getSavedRecipes().find(r => String(r.id) === String(id)) : null;
    const notes = recipe && recipe.notes ? String(recipe.notes).trim() : '';
    recipeNotesDisplay.textContent = notes;
    recipeNotesDisplay.style.display = notes ? '' : 'none';
  }

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
      if (t) t.focus();
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
    const recipes = getSavedRecipes();
    const selId = savedRecipesSelect.value;
    const seleccionada = selId ? recipes.find(r => String(r.id) === String(selId)) : null;
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
    openModal(saveRecipeModal, saveRecipeNameInput);
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
      numPaneteos: parseFloat(el.numPaneteos.value),
      pesoPaneto: pesoG,
      temperatura: parseInt(el.temperatura.value, 10),
      hidratacion: parseFloat(el.hidratacion.value),
      sal: salGL,
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
    // Cerramos el modal en cuanto la receta está guardada, antes de repintar el
    // select, para que el cierre nunca dependa de pasos de UI posteriores.
    closeSaveModal();
    populateSavedRecipesSelect();
    savedRecipesSelect.value = String(targetId);
    updateNotesDisplay();
    updateRecipeStatus();
    showToast(existente ? I18N.t('recipeUpdatedToast') : I18N.t('recipeSavedToast'));
  }

  saveRecipeConfirmBtn.addEventListener('click', () => guardarReceta({ overwriteId: editingRecipeId }));
  saveRecipeNewBtn.addEventListener('click', () => guardarReceta({ overwriteId: null }));

  loadRecipeBtn.addEventListener('click', () => {
    const id = savedRecipesSelect.value;
    if (!id) return;
    const list = getSavedRecipes();
    const recipe = list.find(r => String(r.id) === id);
    if (!recipe) return;

    const d = recipe.data;
    el.numPaneteos.value = d.numPaneteos;
    pesoG = d.pesoPaneto;
    el.temperatura.value = d.temperatura;
    el.hidratacion.value = d.hidratacion;
    salGL = d.sal;
    renderInputUnits();
    flours = JSON.parse(JSON.stringify(d.flours));
    let maxIdLoaded = 0;
    flours.forEach(f => { if (f.id > maxIdLoaded) maxIdLoaded = f.id; });
    flourIdCounter = maxIdLoaded + 1;

    renderFlours();
    showToast(I18N.t('recipeLoadedToast'));
  });

  deleteRecipeBtn.addEventListener('click', async () => {
    const id = savedRecipesSelect.value;
    if (!id) return;
    const confirmado = await showConfirm(I18N.t('confirmDeleteRecipe'), I18N.t('modalDelete'));
    if (!confirmado) return;
    let list = getSavedRecipes();
    list = list.filter(r => String(r.id) !== id);
    setSavedRecipes(list);
    populateSavedRecipesSelect();
    updateNotesDisplay();
    updateRecipeStatus();
    showToast(I18N.t('recipeDeletedToast'));
  });

  savedRecipesSelect.addEventListener('change', updateNotesDisplay);

  // ---- Exportar / Importar recetas (JSON) ----
  function recipesToJSON() {
    return JSON.stringify({
      app: 'calculatupizza', type: 'recipes', version: 1,
      exportedAt: new Date().toISOString(),
      recipes: getSavedRecipes()
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
    const flours = d.flours.map((f, i) => ({
      id: parseInt(f && f.id, 10) || (i + 1),
      catalogId: parseInt(f && f.catalogId, 10) || 0,
      pct: num(f && f.pct, 0),
      locked: !!(f && f.locked)
    }));
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
        hidratacion: num(d.hidratacion, 63),
        sal: num(d.sal, 40),
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
        populateSavedRecipesSelect();
        updateNotesDisplay();
        updateRecipeStatus();
        showToast(I18N.t('recipesImportedToast').replace('{n}', added));
      }
      importRecipesInput.value = ''; // permite reimportar el mismo archivo
    };
    reader.onerror = () => { showToast(I18N.t('importError')); importRecipesInput.value = ''; };
    reader.readAsText(file);
  });

  populateSavedRecipesSelect();
  updateNotesDisplay();
  onConfigChange = updateRecipeStatus; // a partir de aquí, cada recálculo refresca el estado
  updateRecipeStatus();

  // Lógica Copiar Receta
  document.getElementById('btnCopiarReceta').addEventListener('click', function() {
    const harinaT = D.computeRecipe({
      numPizzas: parseFloat(el.numPaneteos.value) || 0, pesoG: pesoG,
      tempC: parseInt(el.temperatura.value, 10), hidPct: parseFloat(el.hidratacion.value),
      salGL: salGL, flours: flours
    }).harinaTotal;

    const text = `${I18N.t('recipeHeader')}
${I18N.t('recipePizzas')}: ${el.numPaneteos.value} ${I18N.t('recipeOf')} ${el.pesoPaneto.value} ${U.weightUnit()}
${I18N.t('recipeHydration')}: ${el.hidratacion.value}% | ${I18N.t('recipeSalt')}: ${el.sal.value}%

${I18N.t('recipeTotals')}
- ${I18N.t('recipeTotalFlour')}: ${el.totalHarina.textContent}
- ${I18N.t('recipeWater')}: ${el.totalAgua.textContent}
- ${I18N.t('recipeSalt2')}: ${el.totalSal.textContent}
- ${I18N.t('recipeFreshYeast')}: ${el.totalLevadura.textContent}
- (${I18N.t('recipeDryYeast')}: ${el.totalLevaduraSeca.textContent})

${I18N.t('recipeFlourMix')}
${flours.map(f => `- ${flourName(f.catalogId)}: ${U.formatWeight(harinaT * (f.pct/100))} (${f.pct}%)`).join('\n')}`;

    const btn = this;
    const showCopied = () => {
      const originalHtml = btn.innerHTML;
      btn.innerHTML = I18N.t('copiado');
      btn.style.background = 'var(--basilico)';
      btn.style.color = 'white';
      setTimeout(() => {
        btn.innerHTML = originalHtml;
        btn.style.background = 'rgba(255,255,255,0.06)';
        btn.style.color = 'var(--farina)';
      }, 2500);
    };

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

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(showCopied)
        .catch(() => {
          if (fallbackCopy(text)) showCopied();
          else showToast(I18N.t('copyError'));
        });
    } else if (fallbackCopy(text)) {
      showCopied();
    } else {
      showToast(I18N.t('copyError'));
    }
  });

})();
