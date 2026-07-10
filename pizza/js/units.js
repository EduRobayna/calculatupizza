// ==================== SISTEMA DE UNIDADES (Métrico / Imperial) ====================
// Expone window.PizzaUnits: el sistema de unidades elegido y los helpers de
// formato. Los cálculos internos SIEMPRE van en gramos y °C; aquí solo se
// convierte para MOSTRAR. Depende de window.PizzaI18N para el separador decimal
// según el idioma. Al cambiar de sistema emite el evento 'pizzaUnitsChange'.
window.PizzaUnits = (function(){
  const KEY = 'pizza-calc-units';
  const OZ_PER_GRAM = 1 / 28.349523125;
  let system = detectInitial();

  function detectInitial(){
    try {
      const s = localStorage.getItem(KEY);
      if (s === 'metric' || s === 'imperial') return s;
    } catch(e){}
    return 'metric';
  }

  function locale(){
    return (window.PizzaI18N && window.PizzaI18N.getLang() === 'en') ? 'en-US' : 'es-ES';
  }
  function nf(n, min, max){
    return n.toLocaleString(locale(), { minimumFractionDigits: min, maximumFractionDigits: max });
  }

  function get(){ return system; }
  function isImperial(){ return system === 'imperial'; }

  function set(newSystem){
    const next = (newSystem === 'imperial') ? 'imperial' : 'metric';
    if (next === system) return;
    system = next;
    try { localStorage.setItem(KEY, system); } catch(e){}
    window.dispatchEvent(new CustomEvent('pizzaUnitsChange', { detail: { system } }));
  }

  // Peso general (harina, agua, sal, masa total): entero en gramos / 1 decimal en onzas.
  function formatWeight(grams){
    if (isImperial()) return nf(grams * OZ_PER_GRAM, 1, 1) + ' oz';
    return nf(Math.round(grams), 0, 0) + ' g';
  }
  // Peso fino (levadura): 2 decimales en ambos sistemas.
  function formatWeightPrecise(grams){
    if (isImperial()) return nf(grams * OZ_PER_GRAM, 2, 2) + ' oz';
    return nf(grams, 2, 2) + ' g';
  }
  function weightUnit(){ return isImperial() ? 'oz' : 'g'; }

  // Temperatura: el valor interno es °C; en imperial se muestra en °F.
  function tempValue(celsius){ return isImperial() ? Math.round(celsius * 9 / 5 + 32) : celsius; }
  function tempUnit(){ return isImperial() ? '°F' : '°C'; }

  return { get, set, isImperial, formatWeight, formatWeightPrecise, weightUnit, tempValue, tempUnit };
})();
