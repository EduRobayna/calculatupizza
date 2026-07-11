// ==================== APP: IDIOMA, TEMA, PWA Y SERVICE WORKER ====================
// Cablea los controles globales de la interfaz (toggle de idioma y de tema),
// la instalación como PWA y el registro/actualización del service worker.
// Depende de window.PizzaI18N (js/i18n.js).
(function(){
  let deferredPrompt;
  const btnInstalar = document.getElementById('btnInstalar');
  const iosInstallBanner = document.getElementById('iosInstallBanner');
  const I18N = window.PizzaI18N;

  // El anillo de foco de teclado ahora lo gestiona :focus-visible en el CSS.

  // Idioma ES / EN
  I18N.applyStaticDom();
  const langToggle = document.getElementById('langToggle');
  langToggle.addEventListener('click', () => {
    I18N.setLang(I18N.getLang() === 'es' ? 'en' : 'es');
  });

  // Intro plegable (móvil): "Leer más / Leer menos"
  const heroSub = document.getElementById('heroSub');
  const subToggle = document.getElementById('subToggle');
  function syncSubToggle(){
    if (!heroSub || !subToggle) return;
    const clamped = heroSub.classList.contains('clamped');
    subToggle.textContent = clamped ? I18N.t('readMore') : I18N.t('readLess');
    subToggle.setAttribute('aria-expanded', String(!clamped));
  }
  if (subToggle && heroSub) {
    subToggle.addEventListener('click', () => { heroSub.classList.toggle('clamped'); syncSubToggle(); });
    window.addEventListener('pizzaLangChange', syncSubToggle);
    syncSubToggle();
  }

  // Modo oscuro / claro
  const themeToggle = document.getElementById('themeToggle');
  const themeColorMeta = document.getElementById('themeColorMeta');
  const THEME_COLORS = { dark: '#17120e', light: '#f3ead9' };

  function temaActual(){
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function actualizarThemeColor(){
    if (themeColorMeta) themeColorMeta.setAttribute('content', THEME_COLORS[temaActual()]);
  }
  function actualizarAriaTheme(){
    const esOscuro = temaActual() === 'dark';
    themeToggle.setAttribute('aria-label', esOscuro ? I18N.t('themeToggleToLight') : I18N.t('themeToggleToDark'));
  }
  function aplicarTema(tema){
    if (tema === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    actualizarThemeColor();
    actualizarAriaTheme();
  }

  actualizarAriaTheme();
  window.addEventListener('pizzaLangChange', actualizarAriaTheme);

  themeToggle.addEventListener('click', () => {
    const nuevoTema = temaActual() === 'dark' ? 'light' : 'dark';
    aplicarTema(nuevoTema);
    try { localStorage.setItem('pizza-calc-theme', nuevoTema); } catch(e){}
  });

  // Reacciona en caliente a los cambios de tema del sistema, solo si el usuario
  // no ha fijado un tema manualmente.
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSchemeChange = (e) => {
      let saved = null;
      try { saved = localStorage.getItem('pizza-calc-theme'); } catch(err){}
      if (!saved) aplicarTema(e.matches ? 'dark' : 'light');
    };
    if (mq.addEventListener) mq.addEventListener('change', onSchemeChange);
    else if (mq.addListener) mq.addListener(onSchemeChange);
  }

  // ==================== PANEL DE CONFIGURACIÓN ====================
  const U = window.PizzaUnits;
  const settingsToggle = document.getElementById('settingsToggle');
  const settingsModal = document.getElementById('settingsModal');
  const settingsCloseBtn = document.getElementById('settingsCloseBtn');
  const settingsDoneBtn = document.getElementById('settingsDoneBtn');
  let lastFocusBeforeSettings = null;

  function settingsFocusables(){
    return Array.from(settingsModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.disabled && el.offsetParent !== null);
  }
  // Bloquea el scroll del fondo mientras haya cualquier modal (.modal-overlay) abierto.
  function syncScrollLock(){
    const anyOpen = Array.from(document.querySelectorAll('.modal-overlay')).some(m => m.style.display === 'flex');
    document.documentElement.classList.toggle('modal-open', anyOpen);
  }
  function openSettings(){
    lastFocusBeforeSettings = document.activeElement;
    settingsModal.style.display = 'flex';
    syncScrollLock();
    setTimeout(() => { const f = settingsFocusables()[0]; if (f) f.focus(); }, 50);
  }
  function closeSettings(){
    settingsModal.style.display = 'none';
    syncScrollLock();
    if (lastFocusBeforeSettings && typeof lastFocusBeforeSettings.focus === 'function') lastFocusBeforeSettings.focus();
    lastFocusBeforeSettings = null;
  }
  if (settingsToggle && settingsModal) {
    settingsToggle.addEventListener('click', openSettings);
    if (settingsCloseBtn) settingsCloseBtn.addEventListener('click', closeSettings);
    if (settingsDoneBtn) settingsDoneBtn.addEventListener('click', closeSettings);
    settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettings(); });
    settingsModal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeSettings(); return; }
      if (e.key !== 'Tab') return;
      const f = settingsFocusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  // Control segmentado de unidades (métrico / imperial)
  const unitsToggle = document.getElementById('unitsToggle');
  function syncUnitsUI(){
    if (!unitsToggle || !U) return;
    const cur = U.get();
    unitsToggle.querySelectorAll('.seg-opt').forEach(b => {
      const on = b.getAttribute('data-units') === cur;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }
  if (unitsToggle && U) {
    unitsToggle.querySelectorAll('.seg-opt').forEach(b => {
      b.addEventListener('click', () => U.set(b.getAttribute('data-units')));
    });
    window.addEventListener('pizzaUnitsChange', syncUnitsUI);
    syncUnitsUI();
  }

  const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  if (isStandalone) {
    btnInstalar.style.display = 'none';
    if(iosInstallBanner) iosInstallBanner.style.display = 'none';
  } else {
    if (isIos && iosInstallBanner) {
      iosInstallBanner.style.display = 'block';
    }
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!isStandalone && !isIos) {
      btnInstalar.style.display = 'block';
    }
  });

  btnInstalar.addEventListener('click', async () => {
    if (deferredPrompt !== null) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('El usuario aceptó la instalación');
      } else {
        console.log('El usuario rechazó la instalación');
      }
      deferredPrompt = null;
      btnInstalar.style.display = 'none';
    }
  });

  let newWorker;
  const updateBanner = document.getElementById('update-banner');
  const updateBtn = document.getElementById('update-btn');

  function mostrarAvisoActualizacion(){
    updateBanner.style.display = 'block';
  }

  updateBtn.addEventListener('click', () => {
    updateBtn.textContent = I18N.t('updateBtnUpdating');
    updateBtn.disabled = true;
    if (newWorker) {
      newWorker.postMessage({ action: 'skipWaiting' });
    }
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((registration) => {
          console.log('SW registrado con éxito');
          registration.update();

          registration.addEventListener('updatefound', () => {
            newWorker = registration.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('Nueva versión detectada. Mostrando aviso...');
                mostrarAvisoActualizacion();
              }
            });
          });
        })
        .catch((error) => console.log('Error al registrar el SW:', error));

      // Recarga la página una sola vez cuando el nuevo SW toma el control
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    });
  }
})();
