// ==================== SISTEMA DE UNIDADES (Métrico / Imperial) ====================
// Expone PizzaUnits: el sistema de unidades elegido y los helpers de formato.
// Los cálculos internos SIEMPRE van en gramos y °C; aquí solo se convierte para
// MOSTRAR. En el navegador usa window.PizzaI18N para el separador decimal según
// el idioma y emite 'pizzaUnitsChange' al cambiar de sistema.
// Funciona también bajo Node (require) para el banco de pruebas: los accesos a
// window / localStorage están protegidos.
(function (root, factory) {
  const api = factory();
  root.PizzaUnits = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KEY = 'pizza-calc-units';
  const OZ_PER_GRAM = 1 / 28.349523125;
  const HAS_WINDOW = (typeof window !== 'undefined');
  let system = detectInitial();

  function detectInitial(){
    try {
      const s = localStorage.getItem(KEY);
      if (s === 'metric' || s === 'imperial') return s;
    } catch(e){}
    return 'metric';
  }

  function i18n(){
    const w = HAS_WINDOW ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
    return w.PizzaI18N || null;
  }
  function locale(){
    const t = i18n();
    return (t && t.getLang && t.getLang() === 'en') ? 'en-US' : 'es-ES';
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
    if (HAS_WINDOW && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('pizzaUnitsChange', { detail: { system: system } }));
    }
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
  function gToOz(g){ return g * OZ_PER_GRAM; }
  function ozToG(oz){ return oz / OZ_PER_GRAM; }

  // Temperatura: el valor interno es °C; en imperial se muestra en °F.
  function tempValue(celsius){ return isImperial() ? Math.round(celsius * 9 / 5 + 32) : celsius; }
  function tempUnit(){ return isImperial() ? '°F' : '°C'; }

  return {
    get: get, set: set, isImperial: isImperial,
    formatWeight: formatWeight, formatWeightPrecise: formatWeightPrecise,
    weightUnit: weightUnit, gToOz: gToOz, ozToG: ozToG,
    tempValue: tempValue, tempUnit: tempUnit
  };
});
