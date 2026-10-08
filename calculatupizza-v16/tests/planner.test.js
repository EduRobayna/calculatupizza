const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const floursSrc = fs.readFileSync(path.join(__dirname, '../pizza/js/flours.js'), 'utf8');
const i18nSrc = fs.readFileSync(path.join(__dirname, '../pizza/js/i18n.js'), 'utf8');
const unitsSrc = fs.readFileSync(path.join(__dirname, '../pizza/js/units.js'), 'utf8');
const doughSrc = fs.readFileSync(path.join(__dirname, '../pizza/js/dough.js'), 'utf8');
const calcSrc = fs.readFileSync(path.join(__dirname, '../pizza/js/calculator.js'), 'utf8');

test('Planner calculations', async (t) => {
  const domElements = {};
  const listeners = {};
  
  function getEl(id) {
    if (!domElements[id]) {
      domElements[id] = { 
        id, value: '1', checked: false, style: {}, className: '',
        textContent: '', innerHTML: '',
        classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
        addEventListener: (event, callback) => {
          if(!listeners[id]) listeners[id] = {};
          listeners[id][event] = callback;
        }, 
        querySelectorAll: () => [], addEventListener: () => {}, querySelector: () => null, querySelector: () => null, appendChild: () => {}, getAttribute: () => 'b', setAttribute: () => {}, removeAttribute: () => {},
        click: function() { if(listeners[id] && listeners[id].click) listeners[id].click(); },
        parentElement: {
          classList: { toggle: () => {} },
          querySelectorAll: () => []
        }
      };
    }
    return domElements[id];
  }

  const mockWindow = { 
    calcular: () => {}, 
    __plannerPlanText: '', __triggerPlanner: null,
    setTimeout: (fn) => fn(), addEventListener: () => {},
    navigator: { language: 'es-ES', clipboard: { writeText: () => {} } }
  };
  
  const mockLocalStorage = { getItem: () => null, setItem: () => {} };
  const mockDoc = { 
    documentElement: { lang: 'es', classList: { toggle: () => {} } }, 
    getElementById: getEl, 
    querySelectorAll: () => [], addEventListener: () => {}, querySelector: () => null, 
    createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {}, toggle: () => {} } }), 
    body: { appendChild: () => {}, classList: { add: () => {}, remove: () => {}, toggle: () => {} } } 
  };

  const sandbox = {
    document: mockDoc, localStorage: mockLocalStorage,
    parseFloat, isNaN, Math, Date, Intl, console, setTimeout, clearTimeout, encodeURIComponent, fetch: () => {}
  };
  sandbox.window = sandbox;
  sandbox.navigator = mockWindow.navigator; sandbox.addEventListener = () => {}; sandbox.matchMedia = () => ({matches: false, addEventListener: () => {}});
  
  const context = vm.createContext(sandbox);

  vm.runInContext(floursSrc, context);
  vm.runInContext(i18nSrc, context);
  vm.runInContext(unitsSrc, context);
  vm.runInContext(doughSrc, context);
  
  const elTypes = getEl('plannerTypes');
  elTypes.querySelectorAll = () => [
    { className: '', getAttribute: () => 'a', addEventListener: (ev, cb) => { listeners['btn_a'] = cb; } },
    { className: '', getAttribute: () => 'b', addEventListener: (ev, cb) => { listeners['btn_b'] = cb; } }
  ];
  getEl('plannerDt').value = '2026-10-10T20:00'; 

  vm.runInContext(calcSrc, context);

  await t.test('TA only (24h), modo bollos', () => {
    if (listeners['btn_b']) listeners['btn_b']();
    
    getEl('fridgeToggle').checked = false;
    getEl('horas').value = '24';
    getEl('horasFrio').value = '0';
    getEl('tempFrio').value = '4';
    context.window.__triggerPlanner();
    
    const output = context.window.__plannerPlanText;
    assert.match(output, /Bollos a temperatura ambiente \(24 h\)/);
  });

  await t.test('Mixta (24h TA + 24h Nevera), modo bollos', () => {
    if (listeners['btn_b']) listeners['btn_b']();
    
    getEl('fridgeToggle').checked = true;
    getEl('horas').value = '24';
    getEl('horasFrio').value = '24';
    getEl('tempFrio').value = '4';
    context.window.__triggerPlanner();
    
    const output = context.window.__plannerPlanText;
    assert.match(output, /Bollos a temperatura ambiente \(24 h\)/);
    assert.match(output, /Bollos a temperatura controlada \(24 h\)/);
  });
  
  await t.test('TA only (24h), modo bloque+bollos', () => {
    if (listeners['btn_a']) listeners['btn_a']();
    
    getEl('fridgeToggle').checked = false;
    getEl('horas').value = '24';
    getEl('horasFrio').value = '0';
    getEl('tempFrio').value = '4';
    
    getEl('plannerBl').value = '12';
    
    context.window.__triggerPlanner();
    
    const output = context.window.__plannerPlanText;
    assert.match(output, /Bloque a temperatura ambiente \(12 h\)/);
    assert.match(output, /Bollos a temperatura ambiente \(12 h\)/);
  });
  
  await t.test('Mixta (24h TA + 24h Nevera), modo bloque+bollos', () => {
    if (listeners['btn_a']) listeners['btn_a']();
    
    getEl('fridgeToggle').checked = true;
    getEl('horas').value = '24';
    getEl('horasFrio').value = '24';
    getEl('tempFrio').value = '4';
    
    context.window.__triggerPlanner();
    
    const output = context.window.__plannerPlanText;
    assert.match(output, /Bloque a temperatura controlada \(24 h\)/);
    assert.match(output, /Bollos a temperatura ambiente \(24 h\)/);
  });
});
