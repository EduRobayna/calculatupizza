// ==================== SISTEMA DE IDIOMA (ES / EN) ====================
// Expone window.PizzaI18N con el diccionario de textos y la API para cambiar
// de idioma y volcar las traducciones al DOM (atributos data-i18n*).
window.PizzaI18N = (function(){
  const DICT = {
    es: {
      title: "Calculadora de Masa de Pizza Napolitana · Edu Robayna",
      metaDescription: "Calculadora exacta para masa de pizza napolitana (24h). Ajusta hidratación, sal y tu propia mezcla de harinas.",
      heroLogoAlt: "Logo de Edu Robayna",
      h1: 'Calculadora de <em>masa</em> de pizza napolitana',
      sub: "Para hacer la auténtica pizza napolitana solo necesitas cuatro ingredientes: harina, agua, sal y levadura. El objetivo de esta calculadora es ahorrarte trabajo y ayudarte si te estás iniciando. Ajusta las cantidades y parámetros según tu preferencia. Por defecto está puesta la receta que yo utilizo habitualmente para 22-24 horas de fermentación a temperatura ambiente. La cantidad de levadura depende de la temperatura que tengas en casa o lugar de amasado.",
      section1Title: "Tamaño de la tanda",
      numPizzasLabel: "Número de pizzas",
      restarPizza: "Restar una pizza",
      sumarPizza: "Añadir una pizza",
      pesoPizzaLabel: "Peso por pizza",
      restar10g: "Restar 10 gramos",
      sumar10g: "Añadir 10 gramos",
      pesoPizzaAria: "Peso por pizza en gramos",
      section2Title: "Entorno",
      temperaturaLabel: "Temperatura ambiente",
      temperaturaAria: "Temperatura ambiente en grados centígrados",
      section3Title: "Parámetros de la masa",
      hidratacionLabel: "Hidratación",
      restarHidra: "Restar 0,5% de hidratación",
      sumarHidra: "Añadir 0,5% de hidratación",
      hidratacionAria: "Hidratación en porcentaje",
      salLabel: "Sal",
      restarSal: "Restar 1 gramo de sal por kilo de agua",
      sumarSal: "Añadir 1 gramo de sal por kilo de agua",
      salAria: "Sal en gramos por litro de agua",
      salUnit: "g/l agua",
      section4Title: "Mezcla de harinas",
      totalMezcla: "TOTAL MEZCLA:",
      equilibrado: "100% (EQUILIBRADO)",
      tePasas: "TE PASAS",
      falta: "FALTA",
      flourHeaderTipo: "TIPO DE HARINA",
      flourHeaderAccion: "ACCIÓN",
      addFlourBtn: "Añadir otra harina",
      autoBalanceBtn: "Auto-balancear",
      resetBtn: "Restablecer receta original",
      warningText: "La suma de los porcentajes de harina debe ser exactamente 100%.",
      resultsTitle: "Resultado",
      resultsBadgeReady: "Listo",
      resultsBadgeBlocked: "Bloqueado",
      headlineLabel: "de masa total",
      statHarinaTotal: "Harina total",
      statAgua: "Agua",
      statSal: "Sal",
      statLevaduraFresca: "Levadura fresca",
      statLevaduraSeca: "Levadura seca",
      disabledTitle: "Cálculo deshabilitado",
      disabledText: "Corrige el porcentaje de harinas para ver el desglose.",
      copiarReceta: "Copiar receta",
      copiado: "¡Copiada al portapapeles! ✅",
      copyError: "No se pudo copiar automáticamente.",
      iosInstallTitle: "Instalar en iPhone / iPad",
      iosInstallStep1: "Para instalar la app, abre esta web en",
      iosInstallStep2: "pulsa el botón Compartir",
      iosInstallStep3: "en el menú inferior y selecciona",
      iosInstallStep4: '"Añadir a la pantalla de inicio"',
      instalarBtn: "Instalar Calculadora",
      fermentTitle: "Consejos sobre la fermentación",
      fermentLi1: "Haz <b>doble fermentación</b>: una primera en bloque (toda la masa junta) y una segunda ya con los bollos formados.",
      fermentLi2: "Si sigues mi receta, la fermentación se hace a <b>temperatura ambiente</b>. Si lo prefieres, puedes meter la masa en bloque en la nevera (4 °C) o vinoteca (15-18 °C).",
      fermentLi3Head: "Tiempos orientativos:",
      fermentLi3a: "En bloque: 14-18 h (invierno/nevera: 14 h | verano: 18 h).",
      fermentLi3b: "En bollos: 6-10 h (invierno/nevera: 10 h | verano: 6 h).",
      fermentLiNevera: "Antes de meter la masa en la nevera, déjala fermentar al menos una hora a temperatura ambiente para que la levadura se active.",
      fermentLi4: "<b>¿Tienes prisa?</b> Si necesitas acortar el tiempo de fermentación (aunque no lo recomiendo, merece la pena esperar), aumenta la levadura multiplicando el resultado de la calculadora según las horas:",
      updateBannerText: "Hay una nueva versión de la calculadora disponible.",
      updateBtn: "Actualizar ahora",
      updateBtnUpdating: "Actualizando…",
      footerCredit: "CALCULADORA CREADA POR EDU ROBAYNA",
      logoCredit: "Logo: Mónica Pozo",
      themeToggleToDark: "Cambiar a modo oscuro",
      themeToggleToLight: "Cambiar a modo claro",
      recipeHeader: "🍕 RECETA MASA NAPOLITANA (Edu Robayna)",
      recipePizzas: "Pizzas",
      recipeOf: "de",
      recipeHydration: "Hidratación",
      recipeSalt: "Sal",
      recipeTotals: "TOTALES:",
      recipeTotalFlour: "Harina Total",
      recipeWater: "Agua",
      recipeSalt2: "Sal",
      recipeFreshYeast: "Levadura fresca",
      recipeDryYeast: "o Seca",
      recipeFlourMix: "MEZCLA DE HARINAS:",
      myRecipesTitle: "Mis recetas",
      savedRecipesEmpty: "No tienes recetas guardadas",
      savedRecipesSelectAria: "Recetas guardadas",
      loadBtn: "Cargar receta seleccionada",
      deleteBtn: "Eliminar receta seleccionada",
      saveRecipeBtn: "Guardar receta actual",
      saveModalTitle: "Guardar receta",
      saveModalSub: "Ponle un nombre para encontrarla luego.",
      saveModalPlaceholder: "Nombre de la receta",
      modalCancel: "Cancelar",
      modalSave: "Guardar",
      modalDelete: "Eliminar",
      modalConfirmDefault: "Aceptar",
      recipeSavedToast: "Receta guardada ✅",
      recipeLoadedToast: "Receta cargada ✅",
      recipeDeletedToast: "Receta eliminada",
      confirmDeleteRecipe: "¿Eliminar esta receta guardada? No se puede deshacer.",
      emptyNameAlert: "Ponle un nombre a la receta antes de guardar.",
      modalUpdate: "Actualizar",
      modalSaveAsNew: "Guardar como nueva",
      saveModalSubEdit: "Actualiza «{name}» con los valores actuales o guárdala como una receta nueva.",
      recipeUpdatedToast: "Receta actualizada ✅",
      exportBtn: "Exportar",
      importBtn: "Importar",
      recipesExportedToast: "Recetas exportadas ✅",
      recipesImportedToast: "Recetas importadas: {n} ✅",
      importNothingNew: "No había recetas nuevas que importar.",
      importError: "No se pudo importar. ¿Es un archivo de recetas válido?",
      noRecipesToExport: "No tienes recetas para exportar.",
      importedRecipeName: "Receta importada",
      duplicateNameError: "Ya existe una receta con ese nombre.",
      notesLabel: "Notas de la receta",
      notesPlaceholder: "Notas (opcional): horno, hidratación, cómo quedó, ajustes para la próxima…",
      statusSaved: "Guardada",
      statusUnsaved: "Sin guardar",
      readMore: "Leer más",
      readLess: "Leer menos",
      summaryFlour: "Harina",
      summaryWater: "Agua",
      summarySalt: "Sal",
      summaryYeast: "Levadura",
      summaryBlocked: "Corrige el % de harinas",
      summaryAria: "Ver el resultado completo",
      lockFlourTitle: "Fijar este porcentaje al auto-balancear",
      unlockFlourTitle: "Dejar de fijar este porcentaje",
      deleteFlourAria: "Eliminar esta harina",
      settingsTitle: "Configuración",
      settingsToggleAria: "Abrir configuración",
      settingsLanguage: "Idioma",
      settingsTheme: "Tema",
      settingsUnits: "Sistema de unidades",
      unitsMetric: "Métrico (g, °C)",
      unitsImperial: "Imperial (oz, °F)",
      settingsRecipes: "Recetas",
      settingsClose: "Cerrar",
      settingsDone: "Hecho"
    },
    en: {
      title: "Neapolitan Pizza Dough Calculator · Edu Robayna",
      metaDescription: "Precise calculator for Neapolitan pizza dough (24h). Adjust hydration, salt and your own flour blend.",
      heroLogoAlt: "Edu Robayna logo",
      h1: 'Neapolitan pizza <em>dough</em> calculator',
      sub: "To make authentic Neapolitan pizza you only need four ingredients: flour, water, salt and yeast. This calculator aims to save you work and help you if you're just starting out. Adjust the amounts and parameters to your liking. By default it's set to the recipe I usually use for 22-24 hours of fermentation at room temperature. The amount of yeast depends on the temperature in your home or kneading space.",
      section1Title: "Batch size",
      numPizzasLabel: "Number of pizzas",
      restarPizza: "Subtract one pizza",
      sumarPizza: "Add one pizza",
      pesoPizzaLabel: "Weight per pizza",
      restar10g: "Subtract 10 grams",
      sumar10g: "Add 10 grams",
      pesoPizzaAria: "Weight per pizza in grams",
      section2Title: "Environment",
      temperaturaLabel: "Room temperature",
      temperaturaAria: "Room temperature in degrees Celsius",
      section3Title: "Dough parameters",
      hidratacionLabel: "Hydration",
      restarHidra: "Subtract 0.5% hydration",
      sumarHidra: "Add 0.5% hydration",
      hidratacionAria: "Hydration percentage",
      salLabel: "Salt",
      restarSal: "Subtract 1 gram of salt per kilo of water",
      sumarSal: "Add 1 gram of salt per kilo of water",
      salAria: "Salt in grams per liter of water",
      salUnit: "g/l water",
      section4Title: "Flour blend",
      totalMezcla: "TOTAL BLEND:",
      equilibrado: "100% (BALANCED)",
      tePasas: "TOO MUCH",
      falta: "MISSING",
      flourHeaderTipo: "FLOUR TYPE",
      flourHeaderAccion: "ACTION",
      addFlourBtn: "Add another flour",
      autoBalanceBtn: "Auto-balance",
      resetBtn: "Reset to original recipe",
      warningText: "The flour percentages must add up to exactly 100%.",
      resultsTitle: "Result",
      resultsBadgeReady: "Ready",
      resultsBadgeBlocked: "Blocked",
      headlineLabel: "total dough",
      statHarinaTotal: "Total flour",
      statAgua: "Water",
      statSal: "Salt",
      statLevaduraFresca: "Fresh yeast",
      statLevaduraSeca: "Dry yeast",
      disabledTitle: "Calculation disabled",
      disabledText: "Fix the flour percentages to see the breakdown.",
      copiarReceta: "Copy recipe",
      copiado: "Copied to clipboard! ✅",
      copyError: "Couldn't copy automatically.",
      iosInstallTitle: "Install on iPhone / iPad",
      iosInstallStep1: "To install the app, open this site in",
      iosInstallStep2: "tap the Share button",
      iosInstallStep3: "in the bottom menu and select",
      iosInstallStep4: '"Add to Home Screen"',
      instalarBtn: "Install Calculator",
      fermentTitle: "Fermentation tips",
      fermentLi1: "Do a <b>double fermentation</b>: a first one in bulk (all the dough together) and a second one once the dough balls are shaped.",
      fermentLi2: "If you follow my recipe, fermentation happens at <b>room temperature</b>. If you prefer, you can put the bulk dough in the fridge (4 °C) or a wine cooler (15-18 °C).",
      fermentLi3Head: "Rough timings:",
      fermentLi3a: "In bulk: 14-18 h (winter/fridge: 14 h | summer: 18 h).",
      fermentLi3b: "As dough balls: 6-10 h (winter/fridge: 10 h | summer: 6 h).",
      fermentLiNevera: "Before putting the dough in the fridge, let it ferment at least one hour at room temperature so the yeast activates.",
      fermentLi4: "<b>In a hurry?</b> If you need to shorten the fermentation time (although I don't recommend it, it's worth the wait), increase the yeast by multiplying the calculator's result according to the hours:",
      updateBannerText: "A new version of the calculator is available.",
      updateBtn: "Update now",
      updateBtnUpdating: "Updating…",
      footerCredit: "CALCULATOR CREATED BY EDU ROBAYNA",
      logoCredit: "Logo: Mónica Pozo",
      themeToggleToDark: "Switch to dark mode",
      themeToggleToLight: "Switch to light mode",
      recipeHeader: "🍕 NEAPOLITAN DOUGH RECIPE (Edu Robayna)",
      recipePizzas: "Pizzas",
      recipeOf: "of",
      recipeHydration: "Hydration",
      recipeSalt: "Salt",
      recipeTotals: "TOTALS:",
      recipeTotalFlour: "Total Flour",
      recipeWater: "Water",
      recipeSalt2: "Salt",
      recipeFreshYeast: "Fresh yeast",
      recipeDryYeast: "or Dry",
      recipeFlourMix: "FLOUR BLEND:",
      myRecipesTitle: "My recipes",
      savedRecipesEmpty: "You have no saved recipes",
      savedRecipesSelectAria: "Saved recipes",
      loadBtn: "Load selected recipe",
      deleteBtn: "Delete selected recipe",
      saveRecipeBtn: "Save current recipe",
      saveModalTitle: "Save recipe",
      saveModalSub: "Give it a name so you can find it later.",
      saveModalPlaceholder: "Recipe name",
      modalCancel: "Cancel",
      modalSave: "Save",
      modalDelete: "Delete",
      modalConfirmDefault: "OK",
      recipeSavedToast: "Recipe saved ✅",
      recipeLoadedToast: "Recipe loaded ✅",
      recipeDeletedToast: "Recipe deleted",
      confirmDeleteRecipe: "Delete this saved recipe? This can't be undone.",
      emptyNameAlert: "Give the recipe a name before saving.",
      modalUpdate: "Update",
      modalSaveAsNew: "Save as new",
      saveModalSubEdit: "Update «{name}» with the current values, or save it as a new recipe.",
      recipeUpdatedToast: "Recipe updated ✅",
      exportBtn: "Export",
      importBtn: "Import",
      recipesExportedToast: "Recipes exported ✅",
      recipesImportedToast: "Recipes imported: {n} ✅",
      importNothingNew: "No new recipes to import.",
      importError: "Couldn't import. Is it a valid recipes file?",
      noRecipesToExport: "You have no recipes to export.",
      importedRecipeName: "Imported recipe",
      duplicateNameError: "A recipe with that name already exists.",
      notesLabel: "Recipe notes",
      notesPlaceholder: "Notes (optional): oven, hydration, how it turned out, tweaks for next time…",
      statusSaved: "Saved",
      statusUnsaved: "Unsaved",
      readMore: "Read more",
      readLess: "Read less",
      summaryFlour: "Flour",
      summaryWater: "Water",
      summarySalt: "Salt",
      summaryYeast: "Yeast",
      summaryBlocked: "Fix the flour %",
      summaryAria: "See the full result",
      lockFlourTitle: "Lock this percentage when auto-balancing",
      unlockFlourTitle: "Unlock this percentage",
      deleteFlourAria: "Remove this flour",
      settingsTitle: "Settings",
      settingsToggleAria: "Open settings",
      settingsLanguage: "Language",
      settingsTheme: "Theme",
      settingsUnits: "Unit system",
      unitsMetric: "Metric (g, °C)",
      unitsImperial: "Imperial (oz, °F)",
      settingsRecipes: "Recipes",
      settingsClose: "Close",
      settingsDone: "Done"
    }
  };

  const LANG_KEY = 'pizza-calc-lang';
  let lang = 'es';

  function detectInitial(){
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === 'es' || saved === 'en') return saved;
    } catch(e){}
    const nav = (navigator.language || 'es').toLowerCase();
    return nav.startsWith('en') ? 'en' : 'es';
  }

  function t(key){
    return (DICT[lang] && DICT[lang][key]) || (DICT.es[key]) || key;
  }

  function applyStaticDom(){
    document.documentElement.setAttribute('lang', lang);
    document.title = t('title');
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', t('metaDescription'));

    document.querySelectorAll('[data-i18n]').forEach(elm => {
      elm.textContent = t(elm.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-html]').forEach(elm => {
      elm.innerHTML = t(elm.getAttribute('data-i18n-html'));
    });
    document.querySelectorAll('[data-i18n-alt]').forEach(elm => {
      elm.setAttribute('alt', t(elm.getAttribute('data-i18n-alt')));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(elm => {
      elm.setAttribute('aria-label', t(elm.getAttribute('data-i18n-aria')));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(elm => {
      elm.setAttribute('title', t(elm.getAttribute('data-i18n-title')));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(elm => {
      elm.setAttribute('placeholder', t(elm.getAttribute('data-i18n-placeholder')));
    });

    document.querySelectorAll('.lang-toggle .lang-opt').forEach(opt => {
      opt.classList.toggle('active', opt.getAttribute('data-lang-opt') === lang);
    });
  }

  function setLang(newLang){
    lang = (newLang === 'en') ? 'en' : 'es';
    try { localStorage.setItem(LANG_KEY, lang); } catch(e){}
    applyStaticDom();
    window.dispatchEvent(new CustomEvent('pizzaLangChange', { detail: { lang } }));
  }

  lang = detectInitial();

  return { t, setLang, getLang: () => lang, applyStaticDom };
})();
