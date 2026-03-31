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
├── desktop/            # Neutralino desktop build scripts
├── tools/              # Dev tools (window alignment tuner)
└── debug_web/          # Canvas-based debug renderer
```

---

## Running locally

**Web version** — serve from repo root:
```
python -m http.server 8000
```
Then open `http://localhost:8000`.

**Desktop app (dev mode)**:
```
npx @neutralinojs/neu run
```

**Build standalone `.exe`**:
```
npm run build
```
Output lands in `dist/`. See [`desktop/README.md`](desktop/README.md) for full build instructions.

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
