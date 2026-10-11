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
  const TEMP_KEY = 'pizza-calc-temp';
  const SALT_KEY = 'pizza-calc-salt-unit';
  const OZ_PER_GRAM = 1 / 28.349523125;
  const HAS_WINDOW = (typeof window !== 'undefined');
  let system = detectInitial();
  // Unidad de temperatura, INDEPENDIENTE del sistema de peso:
  //   'auto' → sigue al peso (imperial→°F, métrico→°C)  |  'c' | 'f' (fijadas).
  let tempSystem = detectInitialTemp();
  // Cómo se INTRODUCE la sal: 'pct' = % del peso del agua | 'gl' = gramos por
  // litro de agua. Solo afecta a la PRESENTACIÓN/entrada; el canónico sigue g/L.
  let saltUnit = detectInitialSalt();

  function detectInitial(){
    try {
      const s = localStorage.getItem(KEY);
      if (s === 'metric' || s === 'imperial') return s;
    } catch(e){}
    return 'metric';
  }
  function detectInitialTemp(){
    try {
      const t = localStorage.getItem(TEMP_KEY);
      if (t === 'c' || t === 'f' || t === 'auto') return t;
    } catch(e){}
    return 'auto';
  }
  function detectInitialSalt(){
    try {
      const s = localStorage.getItem(SALT_KEY);
      if (s === 'gl' || s === 'harina') return s;
      if (s === 'pct') return 'gl'; // migración: el viejo "% agua" es la vía por agua → g/L
    } catch(e){}
    return 'gl';
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
  // Número "a secas" (porcentajes, nº de pizzas, peso por pieza) con el separador
  // decimal del idioma. Acepta número o string ("9.9", "62,5") y no fuerza
  // decimales: los enteros salen enteros. Sirve para que el texto de copiar/
  // compartir use coma en español y punto en inglés, igual que la interfaz.
  function formatNumber(value, maxDecimals){
    const n = (typeof value === 'number')
      ? value
      : parseFloat(String(value == null ? '' : value).replace(/,/g, '.'));
    if (!isFinite(n)) return String(value == null ? '' : value);
    return nf(n, 0, maxDecimals == null ? 2 : maxDecimals);
  }
  function weightUnit(){ return isImperial() ? 'oz' : 'g'; }
  function gToOz(g){ return g * OZ_PER_GRAM; }
  function ozToG(oz){ return oz / OZ_PER_GRAM; }

  // Temperatura: el valor interno SIEMPRE es °C (el slider y todo el cálculo
  // trabajan en °C). Aquí solo se decide cómo MOSTRARLO, sin tocar el cálculo.
  function isFahrenheit(){ return tempSystem === 'f' || (tempSystem === 'auto' && isImperial()); }
  function getTempSystem(){ return tempSystem; }
  function setTempSystem(next){
    const n = (next === 'c' || next === 'f') ? next : 'auto';
    if (n === tempSystem) return;
    tempSystem = n;
    try { localStorage.setItem(TEMP_KEY, tempSystem); } catch(e){}
    if (HAS_WINDOW && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('pizzaTempChange', { detail: { tempSystem: tempSystem } }));
    }
  }
  function tempValue(celsius){ return isFahrenheit() ? Math.round(celsius * 9 / 5 + 32) : celsius; }
  function tempUnit(){ return isFahrenheit() ? '°F' : '°C'; }

  // Sal: preferencia de ENTRADA. 'gl' = gramos por litro de agua (tradición
  // napolitana); 'harina' = % del peso de la harina (panadero). Cada base tiene
  // su propio cálculo (definido en dough.js): el % de harina es un % real de la
  // harina, no una conversión que derive al cambiar la hidratación.
  function getSaltUnit(){ return saltUnit; }
  function isSaltGL(){ return saltUnit === 'gl'; }
  function isSaltFlour(){ return saltUnit === 'harina'; }
  function setSaltUnit(next){
    const n = (next === 'harina') ? 'harina' : 'gl';
    if (n === saltUnit) return;
    saltUnit = n;
    try { localStorage.setItem(SALT_KEY, saltUnit); } catch(e){}
    if (HAS_WINDOW && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('pizzaSaltUnitChange', { detail: { saltUnit: saltUnit } }));
    }
  }

  return {
    get: get, set: set, isImperial: isImperial,
    formatWeight: formatWeight, formatWeightPrecise: formatWeightPrecise,
    formatNumber: formatNumber,
    weightUnit: weightUnit, gToOz: gToOz, ozToG: ozToG,
    tempValue: tempValue, tempUnit: tempUnit,
    isFahrenheit: isFahrenheit, getTempSystem: getTempSystem, setTempSystem: setTempSystem,
    getSaltUnit: getSaltUnit, isSaltGL: isSaltGL, isSaltFlour: isSaltFlour, setSaltUnit: setSaltUnit
  };
});
