# LTSpice .asc → PDF — Architecture Plan

Two independent apps powered by one shared engine.

---

## Core Constraint

The engine must be **pure JavaScript with zero environment-specific dependencies** — no `fs`, no `path`, no DOM, no `fetch`. It receives a string (file content) plus pre-loaded assets, and returns PDF bytes (`Uint8Array`). This contract makes it run identically in Node.js and the browser.

---

## Project Structure

```
Parser/
├── engine/                    ← SHARED CORE — update once, both apps change
│   ├── parser.js              ← .asc text → Scene Graph
│   ├── renderer.js            ← Scene Graph + assets → PDF bytes
│   └── index.js               ← exports { parse, render, convert }
│
├── app/
│   └── Assets/
│       ├── Fonts/
│       │   └── lmroman10-regular.ttf   ← single font used everywhere
│       └── Skins/
│           ├── skins.txt               ← one skin name per line [TO CREATE]
│           ├── Default/                ← default skin (SVG files)
│           └── Boca Jrs/              ← alternate skin (SVG files)
│
├── desktop/
│   └── index.js               ← CLI: reads .asc files, loads assets, calls engine, writes PDFs
│
└── web/
    ├── index.html
    └── app.js                 ← drag & drop UI, loads assets, calls engine, triggers download
```

---

## Engine Data Flow

```
.asc string  +  { font: ArrayBuffer, svgs: Map<name→svgString>, skin }
      │
      ▼
[ parser.js ]  →  Scene Graph
                    ├─ sheet: { width, height }
                    ├─ symbols: [ { type, x, y, orientation,
                    │               windows: [...], attrs: {...} } ]
                    ├─ wires:   [ { x1, y1, x2, y2 } ]
                    ├─ flags:   [ { x, y, name } ]
                    └─ texts:   [ { x, y, alignment, fontSize, content } ]
      │
      ▼
[ renderer.js ]  →  Uint8Array (PDF bytes)
```

Assets are loaded **outside** the engine (by the desktop or web wrapper) and passed in. The engine itself never touches the filesystem or network.

---

## Resolved Decisions

### 1. PDF Page Size
- **1 LTSpice unit = 1 pt** (1:1 scale, no scaling).
- Page dimensions = bounding box of all coordinates found in the `.asc` file (min/max X and Y across all SYMBOL, WIRE, FLAG, TEXT elements).
- *(Future: page will be defined by a special rectangle the user draws in LTSpice — rules TBD.)*

### 2. Symbol Rendering (Skins)
- Symbols are **SVG files** located in `app/Assets/Skins/<SkinName>/`.
- The default skin is the `Default/` folder.
- Available skins are listed in `app/Assets/Skins/skins.txt` (one name per line), with a corresponding subfolder for each.
- **Current skins** (from `skins.txt`): `Default`, `Boca Jrs`
- `skins.txt` already exists at `app/Assets/Skins/skins.txt` — one skin name per line.
- Symbol lookup: given a component `type` (e.g. `res`, `TCLib\\OA_param2`), strip any library path prefix and look for `<basename>.svg` in the active skin folder.
- If an SVG is not found in the selected skin, fall back to `Default/`.

### 3. Font
- Single font: `app/Assets/Fonts/lmroman10-regular.ttf`
- Used for all text rendering (labels, values, annotations).

### 4. Batch Processing (Desktop)
- The desktop app accepts **one or more file paths** as CLI arguments.
- Example: `node desktop/index.js file1.asc file2.asc` or with shell glob expansion: `node desktop/index.js *.asc`
- Shell glob expansion (e.g. `*.asc`) is handled by the OS shell — no extra Node.js library needed.
- Output: `<original-name>.pdf` written next to each source file.

---

## Engine API

```js
// engine/index.js

/** Parse .asc text into a Scene Graph */
export function parse(ascText)

/** Render a Scene Graph to PDF bytes */
export function render(scene, assets)
// assets = { font: ArrayBuffer, svgs: Map<string, string>, skin: string }

/** Convenience: parse + render in one call */
export function convert(ascText, assets)
```

---

## Asset Loading per App

### Desktop
```js
// desktop/index.js
const font = fs.readFileSync('app/Assets/Fonts/lmroman10-regular.ttf')
const skins = fs.readFileSync('app/Assets/Skins/skins.txt', 'utf8').split('\n')
const svgs  = loadSvgFolder(`app/Assets/Skins/${selectedSkin}/`)
const pdf   = engine.convert(ascText, { font, svgs, skin: selectedSkin })
fs.writeFileSync(outputPath, pdf)
```

### Web
```js
// web/app.js
// All assets are fetched once at startup (relative URLs)
const font = await fetch('app/Assets/Fonts/lmroman10-regular.ttf').then(r => r.arrayBuffer())
const skins = await fetch('app/Assets/Skins/skins.txt').then(r => r.text())
// SVGs fetched on demand per skin selection using names from skins.txt
const pdf  = engine.convert(ascText, { font, svgs, skin: selectedSkin })
triggerDownload(pdf, filename + '.pdf')
```

---

## Update Lifecycle

```
Edit engine/parser.js or engine/renderer.js
        ├──→ desktop: picks up change immediately (direct import)
        └──→ web:     picks up change immediately (ES module import)
```

No build step. No sync. One edit → both apps updated.

---

## Development Order

1. Create `app/Assets/Skins/skins.txt` (list available skins)
2. `engine/parser.js` — implement .asc parser per the format reference
3. `engine/renderer.js` — implement PDF renderer (jsPDF + SVG symbols + TTF font)
4. `engine/index.js` — wire up and export API
5. `desktop/index.js` — CLI wrapper (file I/O + asset loading)
6. `web/index.html` + `web/app.js` — UI wrapper (drag & drop + asset fetching)

---

## Open Questions

| # | Question |
|---|----------|
| 1 | RECTANGLE-based page boundary (to be documented — see format reference) |

## Resolved

| # | Question | Decision |
|---|----------|----------|
| 2 | Skin selector UI | Dropdown populated from `skins.txt` |
| 3 | Missing SVG symbol | Render a text label with the symbol name; desktop may later search local LTSpice folders for `.asy` files |
| 4 | Desktop recursive folder scan | Yes — scan subfolders recursively |
