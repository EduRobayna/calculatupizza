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

(function(){
  const I18N = window.PizzaI18N;
  const TABLA_LEVADURA = { 17:1.3, 18:1.0, 19:0.9, 20:0.7, 21:0.6, 22:0.5, 23:0.4, 24:0.3, 25:0.2 };
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
      pesoPaneto: parseFloat(el.pesoPaneto.value),
      temperatura: parseInt(el.temperatura.value, 10),
      hidratacion: parseFloat(el.hidratacion.value),
      sal: parseFloat(el.sal.value),
      flours: flours
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsToSave));
    } catch (e) {}
  }

  const initData = loadSettings();
  el.numPaneteos.value = initData.numPaneteos !== undefined ? initData.numPaneteos : defaultSettings.numPaneteos;
  el.pesoPaneto.value = initData.pesoPaneto !== undefined ? initData.pesoPaneto : defaultSettings.pesoPaneto;
  el.temperatura.value = initData.temperatura !== undefined ? initData.temperatura : defaultSettings.temperatura;
  el.hidratacion.value = initData.hidratacion !== undefined ? initData.hidratacion : defaultSettings.hidratacion;
  el.sal.value = initData.sal !== undefined ? initData.sal : defaultSettings.sal;

  let flours = initData.flours || defaultSettings.flours;
  let maxId = 0;
  flours.forEach(f => { if(f.id > maxId) maxId = f.id; });
  let flourIdCounter = maxId + 1;
  if(flourIdCounter < 1) flourIdCounter = 4;

  function fmtInt(n) { return Math.round(n).toLocaleString(I18N.getLang() === 'en' ? 'en-US' : 'es-ES'); }
  function fmt2(n) { return n.toLocaleString(I18N.getLang() === 'en' ? 'en-US' : 'es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

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
          <button type="button" class="btn-icon toggle-lock ${flour.locked ? 'active-lock' : ''}" data-id="${flour.id}">
            ${flour.locked
              ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`
              : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`
            }
          </button>
          <button type="button" class="btn-icon delete" data-id="${flour.id}">
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
    el.sal.value = defaultSettings.sal;

    flours = JSON.parse(JSON.stringify(defaultSettings.flours));

    let maxId = 0;
    flours.forEach(f => { if(f.id > maxId) maxId = f.id; });
    flourIdCounter = maxId + 1;

    renderFlours();
  });

  function calcular(){
    const numPaneteos = parseFloat(el.numPaneteos.value) || 0;
    const pesoPaneto = parseFloat(el.pesoPaneto.value) || 0;
    const temp = parseInt(el.temperatura.value, 10);
    const hidratacionPct = parseFloat(el.hidratacion.value) || 0;
    const salPorKgAgua = parseFloat(el.sal.value) || 0;

    el.tempValue.textContent = temp;
    saveSettings();

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
      return;
    }

    el.resultsBody.style.display = 'block';
    el.disabledOverlay.style.display = 'none';
    el.resultsBadge.textContent = I18N.t('resultsBadgeReady');
    el.resultsBadge.style.background = 'rgba(255,255,255,0.08)';
    el.resultsBadge.style.borderColor = 'rgba(255,255,255,0.14)';

    const pesoTotalMasa = numPaneteos * pesoPaneto;
    const levaduraPorKgHarina = TABLA_LEVADURA[temp] || 1.0;
    const h = hidratacionPct / 100;
    const harinaTotal = pesoTotalMasa / (1 + h);
    const aguaTotal = harinaTotal * h;
    const salTotal = aguaTotal * (salPorKgAgua / 1000);
    const levaduraTotal = harinaTotal * (levaduraPorKgHarina / 1000);
    const levaduraSecaTotal = levaduraTotal / 3;

    el.flourBreakdown.innerHTML = flours.map((f, idx) => {
      const gramos = harinaTotal * (f.pct / 100);
      const color = COLORES_HARINA[idx % COLORES_HARINA.length];
      return `<div class="flour-sub">
        <span class="fname"><span class="swatch" style="background:${color}"></span>${flourName(f.catalogId)}</span>
        <span class="fval">${fmtInt(gramos)} g</span>
      </div>`;
    }).join('');

    el.totalMasa.textContent = fmtInt(pesoTotalMasa);
    el.totalHarina.textContent = fmtInt(harinaTotal) + ' g';
    el.totalAgua.textContent = fmtInt(aguaTotal) + ' g';
    el.totalSal.textContent = fmtInt(salTotal) + ' g';
    el.totalLevadura.textContent = fmt2(levaduraTotal) + ' g';
    el.totalLevaduraSeca.textContent = fmt2(levaduraSecaTotal) + ' g';
  }

  [el.numPaneteos, el.pesoPaneto, el.temperatura, el.hidratacion, el.sal].forEach(input => {
    input.addEventListener('input', calcular);
  });

  renderFlours();

  // Al hacer foco/tap en cualquier input numérico, selecciona su contenido
  // para que el usuario pueda escribir encima sin tener que borrar antes.
  document.addEventListener('focus', (e) => {
    if (e.target.matches('input[type="number"]')) {
      e.target.select();
    }
  }, true);

  // Vuelve a pintar las harinas y los textos calculados cuando cambia el idioma
  window.addEventListener('pizzaLangChange', () => {
    renderFlours();
    populateSavedRecipesSelect();
  });

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

  function getSavedRecipes() {
    try {
      const raw = localStorage.getItem(SAVED_RECIPES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function setSavedRecipes(list) {
    try { localStorage.setItem(SAVED_RECIPES_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function showToast(message) {
    const toast = document.createElement('div');
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
  }

  function openSaveModal() {
    saveRecipeNameInput.value = '';
    saveRecipeModal.style.display = 'flex';
    setTimeout(() => saveRecipeNameInput.focus(), 50);
  }
  function closeSaveModal() {
    saveRecipeModal.style.display = 'none';
  }

  saveRecipeBtn.addEventListener('click', openSaveModal);
  saveRecipeCancelBtn.addEventListener('click', closeSaveModal);
  saveRecipeModal.addEventListener('click', (e) => {
    if (e.target === saveRecipeModal) closeSaveModal();
  });
  saveRecipeNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveRecipeConfirmBtn.click();
    if (e.key === 'Escape') closeSaveModal();
  });

  saveRecipeConfirmBtn.addEventListener('click', () => {
    const name = saveRecipeNameInput.value.trim();
    if (!name) {
      alert(I18N.t('emptyNameAlert'));
      saveRecipeNameInput.focus();
      return;
    }
    const list = getSavedRecipes();
    list.push({
      id: Date.now(),
      name: name,
      savedAt: new Date().toISOString(),
      data: {
        numPaneteos: parseFloat(el.numPaneteos.value),
        pesoPaneto: parseFloat(el.pesoPaneto.value),
        temperatura: parseInt(el.temperatura.value, 10),
        hidratacion: parseFloat(el.hidratacion.value),
        sal: parseFloat(el.sal.value),
        flours: JSON.parse(JSON.stringify(flours))
      }
    });
    setSavedRecipes(list);
    populateSavedRecipesSelect();
    savedRecipesSelect.value = String(list[list.length - 1].id);
    closeSaveModal();
    showToast(I18N.t('recipeSavedToast'));
  });

  loadRecipeBtn.addEventListener('click', () => {
    const id = savedRecipesSelect.value;
    if (!id) return;
    const list = getSavedRecipes();
    const recipe = list.find(r => String(r.id) === id);
    if (!recipe) return;

    const d = recipe.data;
    el.numPaneteos.value = d.numPaneteos;
    el.pesoPaneto.value = d.pesoPaneto;
    el.temperatura.value = d.temperatura;
    el.hidratacion.value = d.hidratacion;
    el.sal.value = d.sal;
    flours = JSON.parse(JSON.stringify(d.flours));
    let maxIdLoaded = 0;
    flours.forEach(f => { if (f.id > maxIdLoaded) maxIdLoaded = f.id; });
    flourIdCounter = maxIdLoaded + 1;

    renderFlours();
    showToast(I18N.t('recipeLoadedToast'));
  });

  deleteRecipeBtn.addEventListener('click', () => {
    const id = savedRecipesSelect.value;
    if (!id) return;
    if (!confirm(I18N.t('confirmDeleteRecipe'))) return;
    let list = getSavedRecipes();
    list = list.filter(r => String(r.id) !== id);
    setSavedRecipes(list);
    populateSavedRecipesSelect();
    showToast(I18N.t('recipeDeletedToast'));
  });

  populateSavedRecipesSelect();

  // Lógica Copiar Receta
  document.getElementById('btnCopiarReceta').addEventListener('click', function() {
    const masaT = parseFloat(el.numPaneteos.value) * parseFloat(el.pesoPaneto.value);
    const hyd = parseFloat(el.hidratacion.value) / 100;
    const harinaT = masaT / (1 + hyd);

    const text = `${I18N.t('recipeHeader')}
${I18N.t('recipePizzas')}: ${el.numPaneteos.value} ${I18N.t('recipeOf')} ${el.pesoPaneto.value}g
${I18N.t('recipeHydration')}: ${el.hidratacion.value}% | ${I18N.t('recipeSalt')}: ${el.sal.value}g/L

${I18N.t('recipeTotals')}
- ${I18N.t('recipeTotalFlour')}: ${el.totalHarina.textContent}
- ${I18N.t('recipeWater')}: ${el.totalAgua.textContent}
- ${I18N.t('recipeSalt2')}: ${el.totalSal.textContent}
- ${I18N.t('recipeFreshYeast')}: ${el.totalLevadura.textContent}
- (${I18N.t('recipeDryYeast')}: ${el.totalLevaduraSeca.textContent})

${I18N.t('recipeFlourMix')}
${flours.map(f => `- ${flourName(f.catalogId)}: ${Math.round(harinaT * (f.pct/100))}g (${f.pct}%)`).join('\n')}`;

    navigator.clipboard.writeText(text).then(() => {
      const originalHtml = this.innerHTML;
      this.innerHTML = I18N.t('copiado');
      this.style.background = 'var(--basilico)';
      this.style.color = 'white';
      setTimeout(() => {
        this.innerHTML = originalHtml;
        this.style.background = 'rgba(255,255,255,0.06)';
        this.style.color = 'var(--farina)';
      }, 2500);
    });
  });

})();
