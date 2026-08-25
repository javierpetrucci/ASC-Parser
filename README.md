<div align="center">

# LTSpice to PDF

**High-fidelity vector PDF export for LTSpice schematics**

Convert `.asc` schematic files to clean, print-ready vector PDFs — directly in your browser or as a standalone desktop app.

[**Try it online →**](https://javierpetrucci.github.io/ASC-Parser/) &nbsp;·&nbsp; [**Download Desktop App**](https://github.com/javierpetrucci/ASC-Parser/raw/main/dist/LTSpice_to_PDF/LTSpice_to_PDF-win_x64.exe) &nbsp;·&nbsp; [**Format Specification**](LTSpice_ASC_ASY_Format_Specification.md)

</div>

---

## What it does

LTSpice saves schematics as plain-text `.asc` files with no official export format. This tool parses them and renders a pixel-accurate vector PDF — preserving component symbols, wire routing, text labels, and all orientations.

- Drag & drop an `.asc` file → instant PDF preview in the browser
- Download the PDF or batch-convert entire folders (desktop app)
- Switchable skin profiles for different visual styles
- No server, no upload — everything runs locally

---

## How it works

```
.asc file  →  Parser  →  Scene graph  →  PDF Renderer  →  vector PDF
                ↑
           .asy files (component symbol definitions, fetched on demand)
```

The engine is pure JavaScript with no build step. It runs identically in the browser and in the Neutralino desktop wrapper.

---

## Project structure

```
/
├── index.html          # Web app entry point (GitHub Pages)
├── app.js              # UI controller
├── style.css
├── engine/             # Core rendering engine
│   ├── parser.js           # ASC/ASY text → scene graph
│   ├── analyzer.js         # Fetches and parses .asy symbol files
│   ├── component_defaults.js  # Hardcoded label positions per component
│   ├── pdf_renderer.js     # Scene graph → vector PDF (jsPDF)
│   └── index.js            # Public API: LTSpiceEngine.parse / .render
├── Assets/             # Component symbols (.asy), skins (.svg), fonts
├── vendor/             # jsPDF, vendored so the desktop app works offline
├── desktop/            # Neutralino desktop build scripts
├── tools/              # Dev server, window tuner, generators
├── test/               # Test suite (node:test, no dependencies)
└── LTSpice_to_PDF.bat  # Windows launcher — double-click for a menu
```

---

## Running locally

Node.js is the only prerequisite.

**On Windows**, double-click `LTSpice_to_PDF.bat` for a menu covering everything
below — dev server, desktop app, builds, and the generators.

**Web version** — serve from the repo root:
```
npm run serve
```
Opens `http://localhost:8000` in your browser. Pass a port to change it:
`node tools/serve.js 8080`.

**Desktop app (dev mode)**:
```
npm start
```
(equivalent to `npx @neutralinojs/neu run`)

**Build the standalone `.exe`**:
```
npm run build
```
Produces `dist/LTSpice_to_PDF/LTSpice_to_PDF-win_x64.exe` (~15 MB). Only the
Windows target is built by default, because `neu build` emits one executable per
runtime binary it finds and the other six are rarely needed. To build them all
(~300 MB):
```
npm run build:all
```
Individual targets: `node desktop/build_desktop.js --targets mac_arm64,linux_x64`.

See [`desktop/README.md`](desktop/README.md) for full build instructions.

---

## Tests

The suite runs on Node's built-in test runner — no dependencies, nothing to
install:
```
npm test
```

It covers the ASC/ASY parser, the orientation transforms (all 8 orientations ×
10 alignment keywords against a fixed table), value resolution and unit
formatting, the SVG path renderer, text layout, file-encoding detection, and the
full parse-to-PDF pipeline — including a check that **every schematic in
`ASC Examples/` renders without throwing**. A further group asserts project
invariants: skin completeness, the specification tables matching the engine, and
the build configuration.

A failure names the check, what it expected and what it got:
```
✖ transistors never inherit the bare type-name placeholder from the .asy
    actual:   'NPN'
    expected: ''
```

Worth running after editing anything under `engine/` or `app.js`, and before
building an `.exe` you intend to distribute. GitHub Actions also runs it on every
push and pull request.

---

## Generated files

Two files are derived from the source of truth and must be regenerated rather
than hand-edited:

```
npm run spec         # section 9 of the specification, from engine/component_defaults.js
npm run components   # the tuner's component dropdown, from Assets/Component Symbols/
```

Run `npm run spec` after changing label positions in `component_defaults.js`, and
`npm run components` after adding or removing a `.asy`. `npm run spec:check`
fails if the specification has drifted — CI runs it, so a stale table is caught
automatically.

### Window Tuner

`tools/dev_window_tuner.html` is where those label positions come from. It draws
one component in all 8 orientations through the **same engine the site uses**,
lets you drag the `InstName` and `Value` labels until they sit correctly, and
emits the JSON block to paste into `engine/component_defaults.js`.

Start the dev server (`npm run serve`) and open:

```
http://localhost:8000/tools/dev_window_tuner.html
```

Its component dropdown is generated by `npm run components`, so a newly added
`.asy` will not appear there until you re-run it.

---

## Format specification

The `.asc` and `.asy` formats have no official documentation. Everything here was reverse-engineered from real files and validated against LTSpice's own rendering.

The full specification — covering file encoding, coordinate system, every directive, the orientation/transform model, text rendering math, and all discovered quirks — is published here:

**[→ LTSpice ASC/ASY Format Specification](LTSpice_ASC_ASY_Format_Specification.md)**

---

## Skins

Component symbols are rendered from SVG skin files in `Assets/Skins/`. The skin can be switched at runtime from the UI. Selecting **None** falls back to native `.asy` geometry rendering.

To add a skin, create a folder under `Assets/Skins/` with one SVG per component, and add the folder name to `Assets/Skins/skins.txt`.

---

## Credits

Developed at [TC-II / ITBA](https://tc-ii.github.io) by Santiago López and Javier Petrucci.

Licensed under MIT.
