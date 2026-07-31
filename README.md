# Calcula tu pizza 🍕

Calculadora web para masa de pizza napolitana. Ajusta el número de pizzas,
el peso, la hidratación, la sal y tu propia mezcla de harinas, y obtén al
instante las cantidades exactas de harina, agua, sal y levadura (fresca o seca)
en función de la temperatura ambiente.

Es una **PWA** (Progressive Web App) sin dependencias ni paso de compilación:
solo HTML, CSS y JavaScript estáticos. Funciona offline y se puede instalar en
el móvil o el escritorio.

🌐 Producción: https://calculatupizza.com
🧪 Beta (pruebas): rama `beta` (despliegue de vista previa en Cloudflare Pages)

## Entornos

| Entorno | Rama | Hosts | Indexable | PWA instalable |
|---------|------|-------|-----------|----------------|
| Producción | `main` | `calculatupizza.com`, `www.calculatupizza.com` | Sí | Sí (con service worker) |
| Beta | `beta` | `*.pages.dev` y `beta.calculatupizza.com` (si se configura) | No (`noindex`) | No (sin service worker; siempre desde el navegador) |

La app detecta el entorno por **hostname en tiempo de ejecución** (script en el
`<head>` de `index.html`): en cualquier host que no sea producción añade la clase
`beta-mode` al `<html>` y una etiqueta `robots: noindex`. Por eso el distintivo
**BETA**, la marca de agua y la desactivación de la instalación (no se registra el
service worker) solo actúan fuera de producción, y este código puede fusionarse a
`main` sin activarse nunca en `calculatupizza.com`.

## Estructura del proyecto

```
calculatupizza/
├── README.md
├── package.json            # Solo scripts (tests). Sin dependencias.
├── tests/                  # Banco de pruebas (Node, sin dependencias)
│   ├── dough.test.js
│   ├── units.test.js
│   └── recipe-both-systems.test.js
└── pizza/                  # Raíz del sitio publicado
    ├── index.html          # Solo marcado + script anti-parpadeo del tema
    ├── css/
    │   └── styles.css      # Todos los estilos (incluye modo claro/oscuro)
    ├── js/
    │   ├── i18n.js         # Textos ES/EN y API de traducción (window.PizzaI18N)
    │   ├── units.js        # Sistema de unidades métrico/imperial (window.PizzaUnits)
    │   ├── dough.js        # Fórmula de la masa, PURA y sin DOM (window.PizzaDough)
    │   ├── calculator.js   # Glue con el DOM: harinas, recetas guardadas, copiar
    │   └── app.js          # Panel de ajustes, tema, idioma, instalación PWA y SW
    ├── sw.js               # Service worker (cache "red primero")
    ├── manifest.json       # Manifiesto de la PWA
    ├── _headers            # Cabeceras de caché (Cloudflare/Netlify)
    ├── logo.png
    ├── icon-192.png
    └── icon-512.png
```

### Orden de carga de los scripts

`index.html` carga los módulos al final del `<body>` en este orden, que es
importante porque cada uno depende de los anteriores:

1. `js/i18n.js` — define `window.PizzaI18N`.
2. `js/units.js` — define `window.PizzaUnits` (conversión y formato de unidades).
3. `js/dough.js` — define `window.PizzaDough` (la fórmula; módulo puro).
4. `js/calculator.js` — usa los anteriores; monta la calculadora y las recetas.
5. `js/app.js` — conecta el panel de ajustes, idioma/tema y la PWA.

El pequeño script que fija el tema guardado sigue **inline en el `<head>`** de
forma intencionada: debe ejecutarse antes de pintar para evitar el parpadeo
(FOUC) al entrar en modo oscuro.

## Pruebas

La fórmula de la masa vive en `pizza/js/dough.js` (módulo puro, sin DOM) y las
conversiones de unidades en `pizza/js/units.js`. Ambos se usan tanto en la app
como en el banco de pruebas, así que los tests validan **el mismo código** que
corre en producción. Se ejecutan con el runner integrado de Node (sin instalar
nada):

```bash
npm test          # equivale a: node --test "tests/**/*.test.js"
```

Cubre: la fórmula (`computeRecipe`, conservación de masa, tabla de levadura,
casos límite), las conversiones (g↔oz, °C↔°F, %↔g/l) y que **el cálculo es
idéntico en métrico e imperial** (solo cambia la presentación).

> Ejecuta `npm test` antes de publicar, sobre todo si tocas `dough.js`,
> `units.js` o cualquier cosa relacionada con las fórmulas o las unidades.

## Cómo ejecutar en local

Al ser archivos estáticos basta con servir la carpeta `pizza/` desde un servidor
HTTP (el service worker y los módulos no funcionan abriendo el archivo con
`file://`). Por ejemplo:

```bash
cd pizza
python -m http.server 8000
# Abre http://localhost:8000
```

## Cómo publicar una nueva versión

1. Edita el HTML, CSS o JS correspondiente.
2. Sube el número de versión de la caché en [`pizza/sw.js`](pizza/sw.js)
   (`CACHE_NAME`, p. ej. `pizza-calc-v4` → `pizza-calc-v5`) para que los usuarios
   reciban el aviso de actualización. Mantén sincronizada la versión que muestra
   el distintivo BETA: `.beta-badge__ver` en [`pizza/index.html`](pizza/index.html)
   (p. ej. `v47`).
3. Despliega el contenido de `pizza/`.

## Créditos

- Calculadora: Edu Robayna
- Logo: Mónica Pozo

## Licencia

[MIT](LICENSE) © 2026 Edu Robayna
