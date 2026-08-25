# LTSpice ASC/ASY Format Specification
## A Reverse-Engineered Guide to Parsing and Rendering LTSpice Schematics

> This document captures everything discovered through hands-on reverse engineering of the LTSpice `.asc` and `.asy` file formats. It is intended for developers building tools that parse, render, or convert LTSpice schematics. No official format documentation exists — all rules here were derived empirically.

---

## Table of Contents

1. [Overview](#1-overview)
2. [File Encoding](#2-file-encoding)
3. [Coordinate System](#3-coordinate-system)
4. [ASC File — Schematic](#4-asc-file--schematic)
   - 4.1 [File Header](#41-file-header)
   - 4.2 [WIRE](#42-wire)
   - 4.3 [FLAG](#43-flag)
   - 4.4 [SYMBOL](#44-symbol)
   - 4.5 [WINDOW](#45-window)
   - 4.6 [SYMATTR](#46-symattr)
   - 4.7 [TEXT](#47-text)
   - 4.8 [Graphic Elements](#48-graphic-elements)
5. [ASY File — Component Symbol](#5-asy-file--component-symbol)
   - 5.1 [File Header](#51-file-header)
   - 5.2 [Graphic Elements](#52-graphic-elements)
   - 5.3 [TEXT (in ASY)](#53-text-in-asy)
   - 5.4 [WINDOW](#54-window)
   - 5.5 [SYMATTR](#55-symattr)
   - 5.6 [PIN](#56-pin)
   - 5.7 [PINATTR](#57-pinattr)
6. [Orientation System](#6-orientation-system)
   - 6.1 [Orientation Codes](#61-orientation-codes)
   - 6.2 [Transforming Offsets](#62-transforming-offsets)
   - 6.3 [Transforming Alignment](#63-transforming-alignment)
7. [Text Rendering Model](#7-text-rendering-model)
   - 7.1 [Font Size Index](#71-font-size-index)
   - 7.2 [Alignment Keywords](#72-alignment-keywords)
   - 7.3 [Anchor-Based Placement](#73-anchor-based-placement)
   - 7.4 [Vertical Text](#74-vertical-text)
8. [Rendering Pipeline](#8-rendering-pipeline)
   - 8.1 [Canvas Bounds](#81-canvas-bounds)
   - 8.2 [Draw Order](#82-draw-order)
   - 8.3 [Wire Intersections](#83-wire-intersections)
   - 8.4 [Symbol Body Rendering](#84-symbol-body-rendering)
   - 8.5 [Window Label Rendering](#85-window-label-rendering)
   - 8.6 [Pin Label Rendering](#86-pin-label-rendering)
   - 8.7 [Flag Rendering](#87-flag-rendering)
9. [Default WINDOW Positions](#9-default-window-positions)
10. [Value Formatting Rules](#10-value-formatting-rules)
11. [Line Styles](#11-line-styles)
12. [Known Edge Cases and Quirks](#12-known-edge-cases-and-quirks)

## 1. Overview

LTSpice stores schematics in plain-text `.asc` files and component symbol definitions in `.asy` files. Neither format has official public documentation. This specification was built entirely by analyzing real files and observing rendering behavior.

**`.asc` — Schematic file.** Contains wires, component placements (`SYMBOL`), net labels (`FLAG`), text annotations (`TEXT`), and graphic elements. Each `SYMBOL` block is followed by `WINDOW` and `SYMATTR` lines that configure its labels.

**`.asy` — Symbol definition file.** Defines the visual geometry of a component (lines, arcs, rectangles), its default label positions (`WINDOW`), default attribute values (`SYMATTR`), and its electrical pins (`PIN`).

The relationship between the two:
- An `.asc` file references a component by type name (e.g. `res`, `TCLib\OA_param2`).
- The renderer looks up the corresponding `.asy` file to get the component's geometry and default window positions.
- An SVG skin file can override the `.asy` geometry for visual rendering, but the `.asy` is always read for window/pin metadata.

---

## 2. File Encoding

LTSpice writes `.asc` and `.asy` files in one of two encodings depending on version and settings:

| Encoding | Detection |
|----------|-----------|
| UTF-16 LE | File starts with BOM bytes `0xFF 0xFE` |
| Windows-1252 (ANSI) | No BOM — default fallback |

```js
const bytes = new Uint8Array(buffer);
const encoding = (bytes[0] === 0xFF && bytes[1] === 0xFE) ? 'utf-16le' : 'windows-1252';
const text = new TextDecoder(encoding).decode(buffer);
```

Line endings may be `\r\n` (Windows), `\r` (old Mac/LTSpice exports), or `\n`. Split on all three:

```js
const lines = text.split(/\r\n|\r|\n/);
```

---

## 3. Coordinate System

- **Origin:** Top-left corner of the sheet.
- **X-axis:** Positive to the right.
- **Y-axis:** Positive downward.
- **Units:** LTSpice internal units. Treated as points (pt) for PDF rendering purposes.

All coordinates in both `.asc` and `.asy` files use this system. Component geometry in `.asy` files is defined relative to the component's anchor point `(0, 0)`.

---

## 4. ASC File — Schematic

### 4.1 File Header

```
Version 4.1
SHEET 1 880 680
```

- `Version` — Format version number. Ignore for parsing purposes.
- `SHEET <id> <width> <height>` — Sheet ID and nominal dimensions. The actual render canvas is determined by geometry, not these values (see [Section 8.1](#81-canvas-bounds)).

---

### 4.2 WIRE

```
WIRE <x1> <y1> <x2> <y2>
```

A straight wire segment connecting two points. Purely geometric — no electrical metadata in the line itself.

```js
{ x1: 0, y1: 0, x2: 100, y2: 0 }
```

Wires are rendered as lines. When 3 or more wire endpoints share the same coordinate, a filled dot (intersection node) is drawn at that point (see [Section 8.3](#83-wire-intersections)).

---

### 4.3 FLAG

```
FLAG <x> <y> <name>
```

Marks a named net node. Two special cases:

| `name` | Meaning | Rendered as |
|--------|---------|-------------|
| `0` | Ground | GND symbol, no text |
| anything else | Named net | Flag symbol + text label |

The orientation of the symbol and placement of the text label are derived from the direction of the wire connected to the flag (see [Section 8.7](#87-flag-rendering)).

---

### 4.4 SYMBOL

```
SYMBOL <type> <x> <y> <orientation>
```

Places a component on the schematic.

| Parameter | Description |
|-----------|-------------|
| `type` | Component identifier. May include a path (e.g. `TCLib\OA_param2`). The **base name** (last path segment, no extension) is used to look up the `.asy` and `.svg` files. |
| `x`, `y` | Anchor point on the sheet (absolute coordinates). |
| `orientation` | One of 8 rotation/mirror codes (see [Section 6.1](#61-orientation-codes)). |

`WINDOW` and `SYMATTR` lines that follow a `SYMBOL` line belong to that symbol, until the next `SYMBOL` or end of file.

---

### 4.5 WINDOW

```
WINDOW <index> <offsetX> <offsetY> <alignment> <fontSize>
```

Overrides or sets the position of a text label for the preceding `SYMBOL`.

| Parameter | Description |
|-----------|-------------|
| `index` | Which attribute to display (see table below). |
| `offsetX`, `offsetY` | Offset from the component anchor, in **local (pre-rotation) space**. Must be transformed with the component orientation before use. |
| `alignment` | Text alignment keyword (see [Section 7.2](#72-alignment-keywords)). Also in local space — must be transformed. |
| `fontSize` | Size index 0–7 (see [Section 7.1](#71-font-size-index)). |

#### WINDOW Index Mapping

| Index | Attribute | SYMATTR Key |
|-------|-----------|-------------|
| `0` | Instance name | `InstName` |
| `3` | Value | `Value` |
| `39` | SPICE parameters | `SpiceLine` |
| `40` | SPICE parameters 2 | `SpiceLine2` |
| `123` | Secondary value | `Value2` |

A `WINDOW` line in the `.asc` file **completely overrides** the corresponding window from the `.asy` file for that index.

#### Hidden Windows

A window can be hidden. Detection heuristic:

```
WINDOW 0 23 -9 Invisible 0   ← alignment keyword "Invisible" means hidden
WINDOW 3 23 9 Left 0         ← last field "0" may also indicate hidden in some versions
```

Hidden windows are parsed but not rendered.

---

### 4.6 SYMATTR

```
SYMATTR <attribute> <value>
```

Sets an attribute value for the preceding `SYMBOL`. The value extends to the end of the line.

| Attribute | Description |
|-----------|-------------|
| `InstName` | Instance designator, e.g. `R1`, `C3`. |
| `Value` | Primary component value, e.g. `10k`, `100n`. |
| `Value2` | Secondary value. |
| `SpiceLine` | Additional SPICE parameters as `key=value` pairs. |
| `SpiceLine2` | Second set of SPICE parameters. |

`.asc` values take priority over `.asy` defaults for the same attribute.

---

### 4.7 TEXT

```
TEXT <x> <y> <alignment> <fontSize> ;<content>
```

A free-floating text annotation. The content starts after the semicolon `;` delimiter (the semicolon itself is not displayed).

```
TEXT 100 200 Left 2 ;This is a comment
```

Uses the same alignment keywords and font size index as `WINDOW`. Rendered at the absolute position `(x, y)` with no component transform applied.

---

### 4.8 Graphic Elements

Schematic-level graphic elements (not inside a component symbol). All use the keyword `Normal` as a second token (purpose unknown — always present, always ignored).

```
LINE Normal <x1> <y1> <x2> <y2> [style]
RECTANGLE Normal <x1> <y1> <x2> <y2> [style]
CIRCLE Normal <x1> <y1> <x2> <y2> [style]
ARC Normal <x1> <y1> <x2> <y2> <xs> <ys> <xe> <ye> [style]
```

See [Section 11](#11-line-styles) for style values. See [Section 8.1](#81-canvas-bounds) for the special role of rectangles in defining canvas bounds.

---

## 5. ASY File — Component Symbol

### 5.1 File Header

```
Version 4
SymbolType CELL
```

- `SymbolType` — Either `CELL` or `BLOCK`. Not used for rendering.

---

### 5.2 Graphic Elements

Same syntax as `.asc` graphic elements. Coordinates are in **local component space** — relative to the component anchor `(0, 0)`. They must be rotated/mirrored according to the component's orientation before rendering.

```
LINE Normal <x1> <y1> <x2> <y2> [style]
RECTANGLE Normal <x1> <y1> <x2> <y2> [style]
CIRCLE Normal <x1> <y1> <x2> <y2> [style]
ARC Normal <x1> <y1> <x2> <y2> <xs> <ys> <xe> <ye> [style]
```

---

### 5.3 TEXT (in ASY)

```
TEXT <x> <y> <alignment> <fontSize> <content>
```

**Key difference from `.asc` TEXT:** there is **no semicolon** prefix. The content starts immediately after the fontSize field.

```js
// Parsing: skip first 5 tokens, rest is content
const match = line.match(/^\s*\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(.*)$/);
const content = match ? match[1].trim() : '';
```

Coordinates are in local component space. The alignment and position must be transformed with the component orientation before rendering.

---

### 5.4 WINDOW

Same syntax as in `.asc`. Defines the **default** position for a label index. Overridden by any matching `WINDOW` line in the `.asc` file.

```
WINDOW <index> <ox> <oy> <alignment> <fontSize>
```

---

### 5.5 SYMATTR

Same syntax as in `.asc`. Provides **default** attribute values. Overridden by `.asc` `SYMATTR` lines.

---

### 5.6 PIN

```
PIN <x> <y> <alignment> <offset>
```

Defines an electrical connection point on the component.

| Parameter | Description |
|-----------|-------------|
| `x`, `y` | Pin position in local component space. |
| `alignment` | Controls where the pin label is placed relative to the pin point (see below). `NONE` means no label is rendered. |
| `offset` | Distance in points between the pin point and the label anchor. Divide by 2 when reading — LTSpice stores it at 2× the effective rendering value. |

#### Pin Alignment

The alignment keyword describes the **direction the wire exits** the pin. The label is placed on the **same side** as the alignment keyword indicates, offset away from the pin point:

| Keyword | Wire exits | Label offset direction |
|---------|-----------|----------------------|
| `LEFT` | Left | +x (label to the right of pin) |
| `RIGHT` | Right | −x (label to the left) |
| `TOP` | Up | +y (label below) |
| `BOTTOM` | Down | −y (label above) |
| `VLEFT` | Left (vertical text) | −y |
| `VRIGHT` | Right (vertical text) | +y |
| `VTOP` | Up (vertical text) | +x |
| `VBOTTOM` | Down (vertical text) | −x |
| `NONE` | — | No label rendered |

The alignment keyword is passed **as-is** to the text rendering function (no translation needed). The offset direction vector is then rotated through the component orientation using the same `transformOffset` function used for WINDOW offsets.

```js
// Pseudocode for pin label rendering
const { textAlign, dx, dy } = pinAlignmentToTextAlignment(pin.align);
const worldPos = transformAsyPoint(pin.x, pin.y);          // local → world
const finalAlign = transformAlignment(textAlign, sym.orientation);
const offsetVec = transformOffset(dx * pin.offset, dy * pin.offset, sym.orientation);
const labelX = worldPos.x + offsetVec.x;
const labelY = worldPos.y + offsetVec.y;
drawText(labelX, labelY, finalAlign, PIN_FONT_SIZE, pin.attrs.PinName);
```

Pin font size is always size index 1.5 → **19.5 pt**.

---

### 5.7 PINATTR

```
PINATTR <attribute> <value>
```

Attributes for the preceding `PIN`. The two relevant ones:

| Attribute | Description |
|-----------|-------------|
| `PinName` | The label displayed next to the pin. |
| `SpiceOrder` | Pin ordering for SPICE netlist generation (not used for rendering). |

---

## 6. Orientation System

### 6.1 Orientation Codes

Eight codes describe all possible component orientations:

| Code | Rotation | Mirror |
|------|----------|--------|
| `R0` | 0° | No |
| `R90` | 90° CW | No |
| `R180` | 180° | No |
| `R270` | 270° CW | No |
| `M0` | 0° | Yes (horizontal) |
| `M90` | 90° CW | Yes |
| `M180` | 180° | Yes |
| `M270` | 270° CW | Yes |

**Transform order:** Rotate first, then mirror. This is critical — applying mirror before rotation produces wrong results.

---

### 6.2 Transforming Offsets

Local-space offsets (from `WINDOW`, `PIN`, etc.) must be rotated and mirrored to get world-space positions.

```js
function transformOffset(ox, oy, orientation) {
    const isMirrored = orientation.startsWith('M');
    const rot = isMirrored ? 'R' + orientation.slice(1) : orientation;

    // Step 1: Rotate
    let rx, ry;
    switch (rot) {
        case 'R0':   rx =  ox; ry =  oy; break;
        case 'R90':  rx = -oy; ry =  ox; break;
        case 'R180': rx = -ox; ry = -oy; break;
        case 'R270': rx =  oy; ry = -ox; break;
    }

    // Step 2: Mirror (flip X)
    if (isMirrored) rx = -rx;

    return { x: rx, y: ry };
}
```

---

### 6.3 Transforming Alignment

Text alignment keywords are also in local space and must be transformed with the component orientation.

**Atomic 90° CW rotation rule** (apply once per 90° of rotation):

| Input | Output |
|-------|--------|
| `Left` | `VRight` |
| `Right` | `VLeft` |
| `Top` | `VBottom` |
| `Bottom` | `VTop` |
| `Center` | `VCenter` |
| `VLeft` | `Left` |
| `VRight` | `Right` |
| `VTop` | `Top` |
| `VBottom` | `Bottom` |
| `VCenter` | `Center` |

**Mirror rule** (apply after rotation for M-codes):

| Input | Output |
|-------|--------|
| `Left` ↔ `Right` | swap |
| `VTop` ↔ `VBottom` | swap |
| all others | unchanged |

```js
function transformAlignment(alignment, orientation) {
    const isMirrored = orientation.startsWith('M');
    const deg = parseInt(orientation.match(/\d+/)?.[0] ?? '0', 10);
    let a = alignment;
    for (let i = 0; i < deg / 90; i++) a = rotate90(a);
    if (isMirrored) a = mirror(a);
    return a;
}
```

#### Full Transformation Table

| R0 | R90 | R180 | R270 | M0 | M90 | M180 | M270 |
|----|-----|------|------|----|-----|------|------|
| `Left` | `VRight` | `Right` | `VLeft` | `Right` | `VRight` | `Left` | `VLeft` |
| `Right` | `VLeft` | `Left` | `VRight` | `Left` | `VLeft` | `Right` | `VRight` |
| `Center` | `VCenter` | `Center` | `VCenter` | `Center` | `VCenter` | `Center` | `VCenter` |
| `Top` | `VBottom` | `Bottom` | `VTop` | `Top` | `VTop` | `Bottom` | `VBottom` |
| `Bottom` | `VTop` | `Top` | `VBottom` | `Bottom` | `VBottom` | `Top` | `VTop` |
| `VLeft` | `Left` | `VRight` | `Right` | `VLeft` | `Right` | `VRight` | `Left` |
| `VRight` | `Right` | `VLeft` | `Left` | `VRight` | `Left` | `VLeft` | `Right` |
| `VCenter` | `Center` | `VCenter` | `Center` | `VCenter` | `Center` | `VCenter` | `Center` |
| `VTop` | `Top` | `VBottom` | `Bottom` | `VBottom` | `Top` | `VTop` | `Bottom` |
| `VBottom` | `Bottom` | `VTop` | `Top` | `VTop` | `Bottom` | `VBottom` | `Top` |

---

## 7. Text Rendering Model

### 7.1 Font Size Index

LTSpice uses an integer index (0–7) for font sizes. The mapping to points was determined empirically:

| Index | Points (pt) | Canvas pixels (approx) |
|-------|-------------|------------------------|
| 0 | 8 | ~2 (renders tiny) |
| 1 | 13 | 91 |
| 2 | 20 | 140 |
| 3 | 26 | 182 |
| 4 | 32 | 224 |
| 5 | 46 | 322 |
| 6 | 65 | 455 |
| 7 | 92 | 644 |

For canvas rendering, pixel size = `fontSize * 7` (except index 0 which renders at 2px).

---

### 7.2 Alignment Keywords

Ten keywords control text anchor placement:

**Horizontal text:**

| Keyword | Anchor X | Anchor Y |
|---------|----------|----------|
| `Left` | Left edge of text | Vertical center |
| `Right` | Right edge of text | Vertical center |
| `Center` | Horizontal center | Vertical center |
| `Top` | Horizontal center | Top of cell |
| `Bottom` | Horizontal center | Bottom of cell |

**Vertical text** (rotated 90° CCW, reads bottom-to-top):

| Keyword | Anchor X | Anchor Y |
|---------|----------|----------|
| `VLeft` | Left edge | Vertical center |
| `VRight` | Right edge | Vertical center |
| `VCenter` | Horizontal center | Vertical center |
| `VTop` | Horizontal center | Top of cell |
| `VBottom` | Horizontal center | Bottom of cell |

---

### 7.3 Anchor-Based Placement

LTSpice uses Windows GDI font metrics internally. The rendering approximates this with:

```
H = ptSize          // full cell height
A = ptSize * 0.8    // ascent (distance from top of cell to baseline)
w = measureTextWidth(text, ptSize)
```

Given anchor point `(x, y)` and alignment:

```js
function computeTextPosition(x, y, alignment, ptSize, textWidth) {
    const H = ptSize;
    const A = ptSize * 0.8;
    const w = textWidth;
    const isVertical = alignment.startsWith('V');
    const base = isVertical ? alignment.slice(1) : alignment;

    let Lx, By; // left edge X, baseline Y

    if (base === 'Left')   { Lx = x;         By = y - H/2 + A; }
    if (base === 'Right')  { Lx = x - w;     By = y - H/2 + A; }
    if (base === 'Center') { Lx = x - w/2;   By = y - H/2 + A; }
    if (base === 'Top')    { Lx = x - w/2;   By = y + A + H * 0.225; }
    if (base === 'Bottom') { Lx = x - w/2;   By = y - H * 0.225; }

    return { Lx, By };
}
```

> The `H * 0.225` offsets for `Top` and `Bottom` are empirical corrections to match LTSpice's GDI placement. They are not derivable from standard font metrics.

---

### 7.4 Vertical Text

Vertical text (`V`-prefixed alignments) is rendered by:

1. Computing the horizontal position `(Lx, By)` as if the text were horizontal.
2. Rotating that point 90° CCW **around the anchor point** `(x, y)`.
3. Calling the PDF text function with `angle: 90`.

```js
if (isVertical) {
    const relX = Lx - x;
    const relY = By - y;
    // 90° CCW rotation: (rx, ry) = (relY, -relX)
    const pdfX = x + relY;
    const pdfY = y - relX;
    doc.text(text, pdfX, pdfY, { angle: 90, align: 'left', baseline: 'alphabetic' });
} else {
    doc.text(text, Lx, By, { angle: 0, align: 'left', baseline: 'alphabetic' });
}
```

---

## 8. Rendering Pipeline

### 8.1 Canvas Bounds

**If a `RECTANGLE` exists in the file:** The largest rectangle by area defines the canvas. It is not drawn — it is only used as the bounding box. All other rectangles are drawn normally.

```
area = |x2 - x1| * |y2 - y1|
```

**If no rectangle exists:** Compute the bounding box of all geometry (wires, symbols, lines, circles, arcs) and add a margin of 100 units on each side.

---

### 8.2 Draw Order

Elements are drawn in this order (painter's model — later items appear on top):

1. Graphic elements (rectangles, lines, circles, arcs)
2. Wires
3. Wire intersection dots
4. Component bodies (SVG or ASY fallback)
5. Component window labels (InstName, Value, etc.)
6. Pin labels
7. Standalone TEXT annotations
8. Flags (GND and named nets)

---

### 8.3 Wire Intersections

A filled dot is drawn at any coordinate where **3 or more wire endpoints** meet.

```js
// Count wire endpoint occurrences
const count = new Map();
for (const w of wires) {
    count.set(`${w.x1},${w.y1}`, (count.get(...) || 0) + 1);
    count.set(`${w.x2},${w.y2}`, (count.get(...) || 0) + 1);
}
// Draw dot at any point with count >= 3
```

---

### 8.4 Symbol Body Rendering

For each `SYMBOL`:

1. **Try SVG skin:** Look up `<basename>.svg` in the active skin folder. If found, parse and render it (see SVG rendering notes below).
2. **Fallback to ASY geometry:** If no SVG, render the `.asy` graphic elements (lines, rectangles, circles, arcs, texts) in local space, then apply the component transform.

The component transform (rotate then mirror) is applied as a canvas/PDF transform centered on the component anchor `(sym.x, sym.y)`.

**SVG rendering:** SVG files use a custom parser (not a browser SVG renderer) that extracts `rect`, `line`, `circle`, `polygon`, `polyline`, and `path` elements and draws them using PDF primitives. CSS class-based styles and inline styles are both supported. The SVG coordinate origin `(0,0)` maps to the component anchor point.

---

### 8.5 Window Label Rendering

For each symbol, build an **effective windows map** (index → position/alignment/fontSize):

**Priority stack (highest wins):**
1. Explicit `WINDOW` lines from the `.asc` file
2. `WINDOW` lines from the `.asy` file
3. Hardcoded defaults from `component_defaults` (only when override mode is active)

A window is only rendered if:
- It has a defined position (from one of the above sources)
- Its text value is non-empty
- It is not marked hidden

```js
// Pseudocode
for (const [index, win] of effectiveWindows) {
    const text = getWindowText(sym, index);  // reads from sym.attrs or asyData.attrs
    if (!text || win.isHidden) continue;

    const rotatedOffset = transformOffset(win.ox, win.oy, sym.orientation);
    const worldX = sym.x + rotatedOffset.x - canvasMinX;
    const worldY = sym.y + rotatedOffset.y - canvasMinY;
    const finalAlign = transformAlignment(win.align, sym.orientation);
    const ptSize = FONT_SIZE_MAP[win.fontSize] ?? 13;

    drawText(worldX, worldY, finalAlign, ptSize, text);
}
```

**Special case — Inductor alignment override:** For `ind` components at orientations `R0`, `R180`, `M0`, `M180`, window indices 0 and 3 always use `Right` alignment, regardless of what the file specifies.

---

### 8.6 Pin Label Rendering

Pin labels are always rendered (regardless of whether the body uses SVG or ASY geometry), as long as the `.asy` data is available.

Skip if: `pin.attrs.PinName` is empty, or `pin.align` is `NONE`.

Font size: always **19.5 pt** (size index 1.5 × 13 pt base).

```js
for (const pin of sym.asyData.graphics.pins) {
    if (!pin.attrs.PinName || pin.align.toUpperCase() === 'NONE') continue;

    const { textAlign, dx, dy } = pinAlignmentToTextAlignment(pin.align);
    const worldPos = transformAsyPoint(pin.x, pin.y);  // local → world
    const finalAlign = transformAlignment(textAlign, sym.orientation);
    const offsetVec = transformOffset(dx * pin.offset, dy * pin.offset, sym.orientation);

    drawText(worldPos.x + offsetVec.x, worldPos.y + offsetVec.y, finalAlign, 19.5, pin.attrs.PinName);
}
```

---

### 8.7 Flag Rendering

**Step 1 — Determine wire direction:**

Find the wire connected to the flag's `(x, y)`. When multiple wires connect, place the label in the first available empty direction using this priority: top → bottom → left → right.

```js
function findIncomingWireDirection(x, y, wires) {
    const incoming = new Set();
    for (const w of wires) {
        if endpoint matches (x,y): add direction of other endpoint
    }
    if (incoming.size <= 1) return incoming[0] ?? 'top';
    // Multi-wire: find empty side
    if (!incoming.has('top'))    return 'bottom';  // place label at top
    if (!incoming.has('bottom')) return 'top';
    if (!incoming.has('left'))   return 'right';
    return 'left';
}
```

**Step 2 — GND symbol (name = `0`):**

Rotate the GND symbol based on wire direction:

| Wire direction | GND rotation |
|----------------|-------------|
| top | R0 (0°) |
| right | R90 |
| bottom | R180 |
| left | R270 |

No text label is rendered.

**Step 3 — Named flag (name ≠ `0`):**

Render the flag symbol at R0. Place the text label using:

| Wire direction | Text alignment | Offset direction |
|----------------|---------------|-----------------|
| top | `Top` | +y |
| bottom | `Bottom` | −y |
| left | `Left` | +x |
| right | `Right` | −x |

Flag text font size: **13 pt** (size index 1).

---

## 9. Default WINDOW Positions

When a component has no `WINDOW` lines in either the `.asc` or `.asy` file, the
positions below are used.

<!-- BEGIN GENERATED: component-defaults -->

> This section is generated from `engine/component_defaults.js` by
> `tools/generate_spec_defaults.js`. Do not edit it by hand — run the
> generator instead, or CI will flag it as stale.

Components with a defaults entry: **64**.

**How to read these numbers.** `offsetX`/`offsetY`/`Alignment` are in the
component's LOCAL (pre-rotation) frame, even inside a per-orientation row.
The renderer always passes them through `transformOffset` and
`transformAlignment` with the symbol's orientation. Two rotations holding
identical values therefore do NOT render identically, and a horizontal
keyword such as `Left` inside an R90 row is normal — it becomes a vertical
one after the transform.

Mirrored orientations (M0–M270) reuse the matching `Rxx` row and then apply
the mirror transform.

#### `74HCU04 Not`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 14 | 22 | Left |
| R0 | 3 (Value) | 14 | 106 | Left |
| R90 | 0 (InstName) | 40 | 34 | VLeft |
| R90 | 3 (Value) | 40 | 88 | VRight |
| R180 | 0 (InstName) | 14 | 22 | Left |
| R180 | 3 (Value) | 14 | 106 | Left |
| R270 | 0 (InstName) | 40 | 34 | VLeft |
| R270 | 3 (Value) | 40 | 88 | VRight |

#### `Amp_Current`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 18 | 17 | Left |
| R0 | 3 (Value) | 18 | 94 | Left |
| R90 | 0 (InstName) | 24 | 90 | VRight |
| R90 | 3 (Value) | 24 | 22 | VLeft |
| R180 | 0 (InstName) | 18 | 94 | Left |
| R180 | 3 (Value) | 18 | 17 | Left |
| R270 | 0 (InstName) | 24 | 20 | VLeft |
| R270 | 3 (Value) | 24 | 90 | VRight |

#### `Amp_Transimpedance`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 18 | 17 | Left |
| R0 | 3 (Value) | 18 | 94 | Left |
| R90 | 0 (InstName) | 24 | 90 | VRight |
| R90 | 3 (Value) | 24 | 22 | VLeft |
| R180 | 0 (InstName) | 18 | 94 | Left |
| R180 | 3 (Value) | 18 | 17 | Left |
| R270 | 0 (InstName) | 24 | 20 | VLeft |
| R270 | 3 (Value) | 24 | 90 | VRight |

#### `ampmeter`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 13 | 70 | Left |
| R90 | 0 (InstName) | 24 | 56 | VRight |
| R180 | 0 (InstName) | 13 | 70 | Left |
| R270 | 0 (InstName) | 24 | 56 | VRight |

#### `arrow`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 3 (Value) | 26 | -9 | Bottom |
| R90 | 3 (Value) | 26 | -9 | Bottom |
| R180 | 3 (Value) | 26 | -9 | Bottom |
| R270 | 3 (Value) | 26 | -9 | Bottom |

#### `arrow_curve`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 3 (Value) | 71 | 59 | Left |
| R90 | 3 (Value) | 65 | 57 | VTop |
| R180 | 3 (Value) | 71 | 59 | Left |
| R270 | 3 (Value) | 65 | 57 | VTop |

#### `arrow_Z`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 3 (Value) | 32 | -14 | Right |
| R90 | 3 (Value) | 27 | -14 | VLeft |
| R180 | 3 (Value) | 32 | -14 | Right |
| R270 | 3 (Value) | 27 | -14 | VLeft |

#### `arrow_Z2`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 3 (Value) | -19 | 11 | Right |
| R90 | 3 (Value) | -22 | 19 | VLeft |
| R180 | 3 (Value) | -19 | 11 | Right |
| R270 | 3 (Value) | -22 | 19 | VLeft |

#### `bi`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 26 | 0 | Left |
| R0 | 3 (Value) | 26 | 80 | Left |
| R90 | 0 (InstName) | -33 | 40 | VBottom |
| R90 | 3 (Value) | 31 | 40 | VTop |
| R180 | 0 (InstName) | 26 | 80 | Left |
| R180 | 3 (Value) | 26 | 0 | Left |
| R270 | 0 (InstName) | 31 | 40 | VTop |
| R270 | 3 (Value) | -33 | 40 | VBottom |

#### `bi2`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 26 | 0 | Left |
| R0 | 3 (Value) | 26 | 80 | Left |
| R90 | 0 (InstName) | -33 | 40 | VBottom |
| R90 | 3 (Value) | 31 | 40 | VTop |
| R180 | 0 (InstName) | 26 | 80 | Left |
| R180 | 3 (Value) | 26 | 0 | Left |
| R270 | 0 (InstName) | 31 | 40 | VTop |
| R270 | 3 (Value) | -33 | 40 | VBottom |

#### `bv`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 26 | 0 | Left |
| R0 | 3 (Value) | 26 | 80 | Left |
| R90 | 0 (InstName) | -33 | 40 | VBottom |
| R90 | 3 (Value) | 31 | 40 | VTop |
| R180 | 0 (InstName) | 26 | 80 | Left |
| R180 | 3 (Value) | 26 | 0 | Left |
| R270 | 0 (InstName) | 31 | 40 | VTop |
| R270 | 3 (Value) | -33 | 40 | VBottom |

#### `cap`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 33 | 5 | Left |
| R0 | 3 (Value) | 33 | 59 | Left |
| R90 | 0 (InstName) | -11 | 32 | VBottom |
| R90 | 3 (Value) | 40 | 32 | VTop |
| R180 | 0 (InstName) | 33 | 56 | Left |
| R180 | 3 (Value) | 33 | 6 | Left |
| R270 | 0 (InstName) | 43 | 32 | VTop |
| R270 | 3 (Value) | -8 | 32 | VBottom |

#### `cell`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 25 | 0 | Left |
| R0 | 3 (Value) | 25 | 62 | Left |
| R90 | 0 (InstName) | -44 | 30 | VBottom |
| R90 | 3 (Value) | 40 | 30 | VTop |
| R180 | 0 (InstName) | 25 | 62 | Left |
| R180 | 3 (Value) | 25 | 0 | Left |
| R270 | 0 (InstName) | -44 | 30 | VBottom |
| R270 | 3 (Value) | 40 | 30 | VTop |

#### `current`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 26 | 0 | Left |
| R0 | 3 (Value) | 26 | 80 | Left |
| R90 | 0 (InstName) | -33 | 40 | VBottom |
| R90 | 3 (Value) | 31 | 40 | VTop |
| R180 | 0 (InstName) | 26 | 80 | Left |
| R180 | 3 (Value) | 26 | 0 | Left |
| R270 | 0 (InstName) | 31 | 40 | VTop |
| R270 | 3 (Value) | -33 | 40 | VBottom |

#### `diode`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 32 | 0 | Left |
| R0 | 3 (Value) | 32 | 64 | Left |
| R90 | 0 (InstName) | -10 | 32 | VBottom |
| R90 | 3 (Value) | 39 | 32 | VTop |
| R180 | 0 (InstName) | 32 | 64 | Left |
| R180 | 3 (Value) | 32 | 0 | Left |
| R270 | 0 (InstName) | 41 | 32 | VTop |
| R270 | 3 (Value) | -8 | 32 | VBottom |

#### `diode_45`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 43 | 49 | Left |
| R0 | 3 (Value) | 43 | 72 | Left |
| R90 | 0 (InstName) | 43 | 49 | VRight |
| R90 | 3 (Value) | 66 | 49 | VRight |
| R180 | 0 (InstName) | 43 | 49 | Left |
| R180 | 3 (Value) | 43 | 72 | Left |
| R270 | 0 (InstName) | 43 | 49 | VRight |
| R270 | 3 (Value) | 66 | 49 | VRight |

#### `e`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 18 | 17 | Left |
| R0 | 3 (Value) | 18 | 94 | Left |
| R90 | 0 (InstName) | 24 | 90 | VRight |
| R90 | 3 (Value) | 24 | 22 | VLeft |
| R180 | 0 (InstName) | 18 | 94 | Left |
| R180 | 3 (Value) | 18 | 17 | Left |
| R270 | 0 (InstName) | 24 | 20 | VLeft |
| R270 | 3 (Value) | 24 | 90 | VRight |

#### `e2`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 18 | 17 | Left |
| R0 | 3 (Value) | 18 | 94 | Left |
| R90 | 0 (InstName) | 24 | 90 | VRight |
| R90 | 3 (Value) | 24 | 22 | VLeft |
| R180 | 0 (InstName) | 18 | 94 | Left |
| R180 | 3 (Value) | 18 | 17 | Left |
| R270 | 0 (InstName) | 24 | 20 | VLeft |
| R270 | 3 (Value) | 24 | 90 | VRight |

#### `f`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 26 | 0 | Left |
| R0 | 3 (Value) | 26 | 80 | Left |
| R90 | 0 (InstName) | -33 | 40 | VBottom |
| R90 | 3 (Value) | 31 | 40 | VTop |
| R180 | 0 (InstName) | 26 | 80 | Left |
| R180 | 3 (Value) | 26 | 0 | Left |
| R270 | 0 (InstName) | 31 | 40 | VTop |
| R270 | 3 (Value) | -33 | 40 | VBottom |

#### `g`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 18 | 17 | Left |
| R0 | 3 (Value) | 18 | 94 | Left |
| R90 | 0 (InstName) | 24 | 90 | VRight |
| R90 | 3 (Value) | 24 | 22 | VLeft |
| R180 | 0 (InstName) | 18 | 94 | Left |
| R180 | 3 (Value) | 18 | 17 | Left |
| R270 | 0 (InstName) | 24 | 20 | VLeft |
| R270 | 3 (Value) | 24 | 90 | VRight |

#### `g2`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 18 | 17 | Left |
| R0 | 3 (Value) | 18 | 94 | Left |
| R90 | 0 (InstName) | 24 | 90 | VRight |
| R90 | 3 (Value) | 24 | 22 | VLeft |
| R180 | 0 (InstName) | 18 | 94 | Left |
| R180 | 3 (Value) | 18 | 17 | Left |
| R270 | 0 (InstName) | 24 | 20 | VLeft |
| R270 | 3 (Value) | 24 | 90 | VRight |

#### `Gain_Block`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 3 (Value) | -139 | 48 | Center |
| R90 | 3 (Value) | -139 | 48 | Center |
| R180 | 3 (Value) | -139 | 48 | Center |
| R270 | 3 (Value) | -139 | 48 | Center |

#### `h`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 26 | 17 | Left |
| R0 | 3 (Value) | 26 | 97 | Left |
| R90 | 0 (InstName) | -35 | 55 | VBottom |
| R90 | 3 (Value) | 34 | 55 | VTop |
| R180 | 0 (InstName) | 26 | 97 | Left |
| R180 | 3 (Value) | 26 | 17 | Left |
| R270 | 0 (InstName) | 34 | 55 | VTop |
| R270 | 3 (Value) | -35 | 55 | VBottom |

#### `Ideal_Comp`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | -120 | 0 | Left |
| R90 | 0 (InstName) | -102 | 9 | VLeft |
| R180 | 0 (InstName) | -120 | 0 | Left |
| R270 | 0 (InstName) | -102 | 9 | Left |

#### `ind`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | -2 | 40 | Right |
| R0 | 3 (Value) | -2 | 72 | Right |
| R90 | 0 (InstName) | -2 | 56 | VBottom |
| R90 | 3 (Value) | 37 | 56 | VTop |
| R180 | 0 (InstName) | -2 | 72 | Right |
| R180 | 3 (Value) | -2 | 40 | Right |
| R270 | 0 (InstName) | 38 | 56 | VTop |
| R270 | 3 (Value) | 1 | 56 | VBottom |

#### `ind2`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | -2 | 40 | Right |
| R0 | 3 (Value) | -2 | 72 | Right |
| R90 | 0 (InstName) | -2 | 56 | VBottom |
| R90 | 3 (Value) | 37 | 56 | VTop |
| R180 | 0 (InstName) | -2 | 72 | Right |
| R180 | 3 (Value) | -2 | 40 | Right |
| R270 | 0 (InstName) | 38 | 56 | VTop |
| R270 | 3 (Value) | 1 | 56 | VBottom |

#### `L_Tap`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 45 | 165 | Left |
| R0 | 3 (Value) | 45 | 68 | Left |
| R0 | 123 (Value2) | 45 | 121 | Left |
| R90 | 0 (InstName) | 40 | 183 | VRight |
| R90 | 3 (Value) | 52 | 112 | VRight |
| R90 | 123 (Value2) | 52 | 83 | VLeft |
| R180 | 0 (InstName) | 45 | 165 | Left |
| R180 | 3 (Value) | 45 | 121 | Left |
| R180 | 123 (Value2) | 45 | 68 | Left |
| R270 | 0 (InstName) | 40 | 183 | VRight |
| R270 | 3 (Value) | 52 | 82 | VLeft |
| R270 | 123 (Value2) | 52 | 112 | VRight |

#### `LF398`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | -109 | 85 | Left |
| R0 | 3 (Value) | -109 | 14 | Left |
| R90 | 0 (InstName) | -92 | 74 | VRight |
| R90 | 3 (Value) | -92 | 19 | VLeft |
| R180 | 0 (InstName) | -109 | 85 | Left |
| R180 | 3 (Value) | -109 | 14 | Left |
| R270 | 0 (InstName) | -92 | 74 | VRight |
| R270 | 3 (Value) | -92 | 19 | VLeft |

#### `LM311`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | -109 | 85 | Left |
| R0 | 3 (Value) | -109 | 14 | Left |
| R90 | 0 (InstName) | -92 | 74 | VRight |
| R90 | 3 (Value) | -92 | 19 | VLeft |
| R180 | 0 (InstName) | -109 | 85 | Left |
| R180 | 3 (Value) | -109 | 14 | Left |
| R270 | 0 (InstName) | -92 | 74 | VRight |
| R270 | 3 (Value) | -92 | 19 | VLeft |

#### `LM324`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | -109 | 85 | Left |
| R0 | 3 (Value) | -109 | 14 | Left |
| R90 | 0 (InstName) | -92 | 74 | VRight |
| R90 | 3 (Value) | -92 | 19 | VLeft |
| R180 | 0 (InstName) | -109 | 85 | Left |
| R180 | 3 (Value) | -109 | 14 | Left |
| R270 | 0 (InstName) | -92 | 74 | VRight |
| R270 | 3 (Value) | -92 | 19 | VLeft |

#### `LM741`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | -109 | 85 | Left |
| R0 | 3 (Value) | -109 | 14 | Left |
| R90 | 0 (InstName) | -92 | 74 | VRight |
| R90 | 3 (Value) | -92 | 19 | VLeft |
| R180 | 0 (InstName) | -109 | 85 | Left |
| R180 | 3 (Value) | -109 | 14 | Left |
| R270 | 0 (InstName) | -92 | 74 | VRight |
| R270 | 3 (Value) | -92 | 19 | VLeft |

#### `LM833`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | -109 | 85 | Left |
| R0 | 3 (Value) | -109 | 14 | Left |
| R90 | 0 (InstName) | -92 | 74 | VRight |
| R90 | 3 (Value) | -92 | 19 | VLeft |
| R180 | 0 (InstName) | -109 | 85 | Left |
| R180 | 3 (Value) | -109 | 14 | Left |
| R270 | 0 (InstName) | -92 | 74 | VRight |
| R270 | 3 (Value) | -92 | 19 | VLeft |

#### `njf`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 75 | 48 | Right |
| R0 | 3 (Value) | 56 | 101 | Left |
| R90 | 0 (InstName) | 50 | 49 | VTop |
| R90 | 3 (Value) | 81 | 49 | VTop |
| R180 | 0 (InstName) | 75 | 48 | Right |
| R180 | 3 (Value) | 56 | 101 | Left |
| R270 | 0 (InstName) | 50 | 49 | VTop |
| R270 | 3 (Value) | 81 | 49 | VTop |

#### `nm_nobulk`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 75 | 35 | Right |
| R0 | 3 (Value) | 56 | 101 | Left |
| R90 | 0 (InstName) | 50 | 49 | VTop |
| R90 | 3 (Value) | 81 | 49 | VTop |
| R180 | 0 (InstName) | 75 | 34 | Right |
| R180 | 3 (Value) | 56 | 101 | Left |
| R270 | 0 (InstName) | 53 | 49 | VTop |
| R270 | 3 (Value) | 81 | 49 | VTop |

#### `nmos`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 75 | 35 | Right |
| R0 | 3 (Value) | 56 | 101 | Left |
| R90 | 0 (InstName) | 50 | 49 | VTop |
| R90 | 3 (Value) | 81 | 49 | VTop |
| R180 | 0 (InstName) | 75 | 34 | Right |
| R180 | 3 (Value) | 56 | 101 | Left |
| R270 | 0 (InstName) | 53 | 49 | VTop |
| R270 | 3 (Value) | 81 | 49 | VTop |

#### `nmos4`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 75 | 35 | Right |
| R0 | 3 (Value) | 56 | 101 | Left |
| R90 | 0 (InstName) | 50 | 49 | VTop |
| R90 | 3 (Value) | 81 | 49 | VTop |
| R180 | 0 (InstName) | 75 | 34 | Right |
| R180 | 3 (Value) | 56 | 101 | Left |
| R270 | 0 (InstName) | 53 | 49 | VTop |
| R270 | 3 (Value) | 81 | 49 | VTop |

#### `npn`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 91 | 48 | Right |
| R0 | 3 (Value) | 74 | 101 | Left |
| R90 | 0 (InstName) | 61 | 49 | VTop |
| R90 | 3 (Value) | 96 | 49 | VTop |
| R180 | 0 (InstName) | 91 | 48 | Right |
| R180 | 3 (Value) | 74 | 101 | Left |
| R270 | 0 (InstName) | 61 | 49 | VTop |
| R270 | 3 (Value) | 96 | 49 | VTop |

#### `NPN_ideal`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 0 | 0 | Left |
| R0 | 3 (Value) | 80 | -9 | Left |
| R0 | 39 (SpiceLine) | 80 | 134 | Left |
| R0 | 123 (Value2) | 80 | 106 | Left |
| R90 | 0 (InstName) | 0 | 11 | VLeft |
| R90 | 3 (Value) | 80 | -9 | VLeft |
| R90 | 39 (SpiceLine) | 114 | 100 | VRight |
| R90 | 123 (Value2) | 87 | 100 | VRight |
| R180 | 0 (InstName) | 0 | 0 | Left |
| R180 | 3 (Value) | 80 | -9 | Left |
| R180 | 39 (SpiceLine) | 80 | 134 | Left |
| R180 | 123 (Value2) | 80 | 106 | Left |
| R270 | 0 (InstName) | 0 | 11 | VLeft |
| R270 | 3 (Value) | 80 | -9 | VLeft |
| R270 | 39 (SpiceLine) | 114 | 100 | VRight |
| R270 | 123 (Value2) | 87 | 100 | VRight |

#### `OA_Ideal`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | -109 | 85 | Left |
| R0 | 3 (Value) | -171 | 111 | Left |
| R0 | 123 (Value2) | -171 | 136 | Left |
| R90 | 0 (InstName) | -92 | 82 | VRight |
| R90 | 3 (Value) | -119 | -12 | VLeft |
| R90 | 123 (Value2) | -92 | 9 | VLeft |
| R180 | 0 (InstName) | -109 | 85 | Left |
| R180 | 3 (Value) | -171 | 111 | Left |
| R180 | 123 (Value2) | -171 | 136 | Left |
| R270 | 0 (InstName) | -92 | 82 | VRight |
| R270 | 3 (Value) | -119 | -12 | VLeft |
| R270 | 123 (Value2) | -92 | 9 | VLeft |

#### `OA_param`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | -109 | 85 | Left |
| R0 | 3 (Value) | -171 | 111 | Left |
| R0 | 123 (Value2) | -171 | 136 | Left |
| R90 | 0 (InstName) | -92 | 82 | VRight |
| R90 | 3 (Value) | -119 | -12 | VLeft |
| R90 | 123 (Value2) | -92 | 9 | VLeft |
| R180 | 0 (InstName) | -109 | 85 | Left |
| R180 | 3 (Value) | -171 | 111 | Left |
| R180 | 123 (Value2) | -171 | 136 | Left |
| R270 | 0 (InstName) | -92 | 82 | VRight |
| R270 | 3 (Value) | -119 | -12 | VLeft |
| R270 | 123 (Value2) | -92 | 9 | VLeft |

#### `OA_Signal`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 221 | 39 | Left |
| R0 | 3 (Value) | 36 | -42 | Left |
| R0 | 39 (SpiceLine) | 110 | 33 | Left |
| R0 | 123 (Value2) | 148 | -11 | Bottom |
| R90 | 0 (InstName) | 237 | 35 | VRight |
| R90 | 3 (Value) | 51 | -4 | VLeft |
| R90 | 39 (SpiceLine) | 80 | -5 | VLeft |
| R90 | 123 (Value2) | 149 | 12 | Top |
| R180 | 0 (InstName) | 221 | 39 | Left |
| R180 | 3 (Value) | 36 | -42 | Left |
| R180 | 39 (SpiceLine) | 110 | 33 | Left |
| R180 | 123 (Value2) | 148 | -11 | Bottom |
| R270 | 0 (InstName) | 237 | 35 | VRight |
| R270 | 3 (Value) | 51 | -4 | VLeft |
| R270 | 39 (SpiceLine) | 80 | -5 | VLeft |
| R270 | 123 (Value2) | 149 | 12 | Top |

#### `OA_Signal2`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 221 | 39 | Left |
| R0 | 3 (Value) | 36 | -42 | Left |
| R0 | 39 (SpiceLine) | 110 | 33 | Left |
| R0 | 123 (Value2) | 148 | -11 | Bottom |
| R90 | 0 (InstName) | 237 | 35 | VRight |
| R90 | 3 (Value) | 51 | -4 | VLeft |
| R90 | 39 (SpiceLine) | 80 | -5 | VLeft |
| R90 | 123 (Value2) | 149 | 12 | Top |
| R180 | 0 (InstName) | 221 | 39 | Left |
| R180 | 3 (Value) | 36 | -42 | Left |
| R180 | 39 (SpiceLine) | 110 | 33 | Left |
| R180 | 123 (Value2) | 148 | -11 | Bottom |
| R270 | 0 (InstName) | 237 | 35 | VRight |
| R270 | 3 (Value) | 51 | -4 | VLeft |
| R270 | 39 (SpiceLine) | 80 | -5 | VLeft |
| R270 | 123 (Value2) | 149 | 12 | Top |

#### `pjf`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 75 | 48 | Right |
| R0 | 3 (Value) | 56 | 101 | Left |
| R90 | 0 (InstName) | 50 | 49 | VTop |
| R90 | 3 (Value) | 81 | 49 | VTop |
| R180 | 0 (InstName) | 75 | 48 | Right |
| R180 | 3 (Value) | 56 | 101 | Left |
| R270 | 0 (InstName) | 50 | 49 | VTop |
| R270 | 3 (Value) | 81 | 49 | VTop |

#### `pm_nobulk`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 75 | 35 | Right |
| R0 | 3 (Value) | 56 | 101 | Left |
| R90 | 0 (InstName) | 50 | 49 | VTop |
| R90 | 3 (Value) | 81 | 49 | VTop |
| R180 | 0 (InstName) | 75 | 34 | Right |
| R180 | 3 (Value) | 56 | 101 | Left |
| R270 | 0 (InstName) | 53 | 49 | VTop |
| R270 | 3 (Value) | 81 | 49 | VTop |

#### `pmos`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 75 | 35 | Right |
| R0 | 3 (Value) | 56 | 101 | Left |
| R90 | 0 (InstName) | 50 | 49 | VTop |
| R90 | 3 (Value) | 81 | 49 | VTop |
| R180 | 0 (InstName) | 75 | 34 | Right |
| R180 | 3 (Value) | 56 | 101 | Left |
| R270 | 0 (InstName) | 53 | 49 | VTop |
| R270 | 3 (Value) | 81 | 49 | VTop |

#### `pmos4`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 75 | 35 | Right |
| R0 | 3 (Value) | 56 | 101 | Left |
| R90 | 0 (InstName) | 50 | 49 | VTop |
| R90 | 3 (Value) | 81 | 49 | VTop |
| R180 | 0 (InstName) | 75 | 34 | Right |
| R180 | 3 (Value) | 56 | 101 | Left |
| R270 | 0 (InstName) | 53 | 49 | VTop |
| R270 | 3 (Value) | 81 | 49 | VTop |

#### `pnp`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 91 | 48 | Right |
| R0 | 3 (Value) | 74 | 101 | Left |
| R90 | 0 (InstName) | 61 | 49 | VTop |
| R90 | 3 (Value) | 96 | 49 | VTop |
| R180 | 0 (InstName) | 91 | 48 | Right |
| R180 | 3 (Value) | 74 | 101 | Left |
| R270 | 0 (InstName) | 61 | 49 | VTop |
| R270 | 3 (Value) | 96 | 49 | VTop |

#### `PNP_ideal`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 0 | 0 | Left |
| R0 | 3 (Value) | 80 | -9 | Left |
| R0 | 39 (SpiceLine) | 80 | 134 | Left |
| R0 | 123 (Value2) | 80 | 106 | Left |
| R90 | 0 (InstName) | 0 | 11 | VLeft |
| R90 | 3 (Value) | 80 | -9 | VLeft |
| R90 | 39 (SpiceLine) | 114 | 100 | VRight |
| R90 | 123 (Value2) | 87 | 100 | VRight |
| R180 | 0 (InstName) | 0 | 0 | Left |
| R180 | 3 (Value) | 80 | -9 | Left |
| R180 | 39 (SpiceLine) | 80 | 134 | Left |
| R180 | 123 (Value2) | 80 | 106 | Left |
| R270 | 0 (InstName) | 0 | 11 | VLeft |
| R270 | 3 (Value) | 80 | -9 | VLeft |
| R270 | 39 (SpiceLine) | 114 | 100 | VRight |
| R270 | 123 (Value2) | 87 | 100 | VRight |

#### `res`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 36 | 40 | Left |
| R0 | 3 (Value) | 36 | 76 | Left |
| R90 | 0 (InstName) | 2 | 56 | VBottom |
| R90 | 3 (Value) | 29 | 56 | VTop |
| R180 | 0 (InstName) | 36 | 71 | Left |
| R180 | 3 (Value) | 36 | 37 | Left |
| R270 | 0 (InstName) | 30 | 56 | VTop |
| R270 | 3 (Value) | 3 | 56 | VBottom |

#### `res_45`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 63 | 0 | Left |
| R0 | 3 (Value) | 63 | 25 | Left |
| R90 | 0 (InstName) | 63 | 25 | VLeft |
| R90 | 3 (Value) | 88 | 25 | VLeft |
| R180 | 0 (InstName) | 63 | 25 | Left |
| R180 | 3 (Value) | 63 | 0 | Left |
| R270 | 0 (InstName) | 88 | 25 | VLeft |
| R270 | 3 (Value) | 63 | 25 | VLeft |

#### `res_45_spring`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 63 | 0 | Left |
| R0 | 3 (Value) | 63 | 25 | Left |
| R90 | 0 (InstName) | 63 | 25 | VLeft |
| R90 | 3 (Value) | 88 | 25 | VLeft |
| R180 | 0 (InstName) | 63 | 25 | Left |
| R180 | 3 (Value) | 63 | 0 | Left |
| R270 | 0 (InstName) | 88 | 25 | VLeft |
| R270 | 3 (Value) | 63 | 25 | VLeft |

#### `res_60`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 73 | 30 | Left |
| R0 | 3 (Value) | 73 | 56 | Left |
| R90 | 0 (InstName) | 63 | 39 | VLeft |
| R90 | 3 (Value) | 88 | 39 | VLeft |
| R180 | 0 (InstName) | 73 | 56 | Left |
| R180 | 3 (Value) | 73 | 30 | Left |
| R270 | 0 (InstName) | 88 | 39 | VLeft |
| R270 | 3 (Value) | 63 | 39 | VLeft |

#### `res_60_spring`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 73 | 30 | Left |
| R0 | 3 (Value) | 73 | 56 | Left |
| R90 | 0 (InstName) | 63 | 39 | VLeft |
| R90 | 3 (Value) | 88 | 39 | VLeft |
| R180 | 0 (InstName) | 73 | 56 | Left |
| R180 | 3 (Value) | 73 | 30 | Left |
| R270 | 0 (InstName) | 88 | 39 | VLeft |
| R270 | 3 (Value) | 63 | 39 | VLeft |

#### `res_pipe`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 0 | 0 | Right |
| R0 | 3 (Value) | 0 | 25 | Right |
| R90 | 0 (InstName) | 0 | 0 | VLeft |
| R90 | 3 (Value) | 25 | 0 | VLeft |
| R180 | 0 (InstName) | 0 | 25 | Right |
| R180 | 3 (Value) | 0 | 0 | Right |
| R270 | 0 (InstName) | 25 | 0 | VLeft |
| R270 | 3 (Value) | 0 | 0 | VLeft |

#### `res_rec`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 36 | 40 | Left |
| R0 | 3 (Value) | 36 | 76 | Left |
| R90 | 0 (InstName) | 2 | 56 | VBottom |
| R90 | 3 (Value) | 29 | 56 | VTop |
| R180 | 0 (InstName) | 36 | 71 | Left |
| R180 | 3 (Value) | 36 | 37 | Left |
| R270 | 0 (InstName) | 30 | 56 | VTop |
| R270 | 3 (Value) | 3 | 56 | VBottom |

#### `res_spring`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 36 | 40 | Left |
| R0 | 3 (Value) | 36 | 76 | Left |
| R90 | 0 (InstName) | 2 | 56 | VBottom |
| R90 | 3 (Value) | 29 | 56 | VTop |
| R180 | 0 (InstName) | 36 | 71 | Left |
| R180 | 3 (Value) | 36 | 37 | Left |
| R270 | 0 (InstName) | 30 | 56 | VTop |
| R270 | 3 (Value) | 3 | 56 | VBottom |

#### `res2`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 36 | 40 | Left |
| R0 | 3 (Value) | 36 | 76 | Left |
| R90 | 0 (InstName) | 2 | 56 | VBottom |
| R90 | 3 (Value) | 29 | 56 | VTop |
| R180 | 0 (InstName) | 36 | 71 | Left |
| R180 | 3 (Value) | 36 | 37 | Left |
| R270 | 0 (InstName) | 30 | 56 | VTop |
| R270 | 3 (Value) | 3 | 56 | VBottom |

#### `schottky`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 32 | 0 | Left |
| R0 | 3 (Value) | 32 | 64 | Left |
| R90 | 0 (InstName) | -10 | 32 | VBottom |
| R90 | 3 (Value) | 39 | 32 | VTop |
| R180 | 0 (InstName) | 32 | 64 | Left |
| R180 | 3 (Value) | 32 | 0 | Left |
| R270 | 0 (InstName) | 41 | 32 | VTop |
| R270 | 3 (Value) | -8 | 32 | VBottom |

#### `signal`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 24 | 16 | Left |
| R0 | 3 (Value) | 24 | 104 | Left |
| R90 | 0 (InstName) | -32 | 56 | VBottom |
| R90 | 3 (Value) | 32 | 56 | VTop |
| R180 | 0 (InstName) | 24 | 104 | Left |
| R180 | 3 (Value) | 24 | 16 | Left |
| R270 | 0 (InstName) | 32 | 56 | VTop |
| R270 | 3 (Value) | -32 | 56 | VBottom |

#### `TL082`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | -109 | 85 | Left |
| R0 | 3 (Value) | -109 | 14 | Left |
| R90 | 0 (InstName) | -92 | 74 | VRight |
| R90 | 3 (Value) | -92 | 19 | VLeft |
| R180 | 0 (InstName) | -109 | 85 | Left |
| R180 | 3 (Value) | -109 | 14 | Left |
| R270 | 0 (InstName) | -92 | 74 | VRight |
| R270 | 3 (Value) | -92 | 19 | VLeft |

#### `Vcc`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 3 (Value) | 27 | 16 | Left |
| R90 | 3 (Value) | 20 | 16 | VTop |
| R180 | 3 (Value) | 27 | 16 | Left |
| R270 | 3 (Value) | 22 | 16 | VTop |

#### `voltage`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 24 | 16 | Left |
| R0 | 3 (Value) | 24 | 96 | Left |
| R90 | 0 (InstName) | -32 | 56 | VBottom |
| R90 | 3 (Value) | 30 | 56 | VTop |
| R180 | 0 (InstName) | 24 | 96 | Left |
| R180 | 3 (Value) | 24 | 16 | Left |
| R270 | 0 (InstName) | 32 | 56 | VTop |
| R270 | 3 (Value) | -30 | 56 | VBottom |

#### `voltage2`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 24 | 16 | Left |
| R0 | 3 (Value) | 24 | 96 | Left |
| R90 | 0 (InstName) | -32 | 56 | VBottom |
| R90 | 3 (Value) | 30 | 56 | VTop |
| R180 | 0 (InstName) | 24 | 96 | Left |
| R180 | 3 (Value) | 24 | 16 | Left |
| R270 | 0 (InstName) | 32 | 56 | VTop |
| R270 | 3 (Value) | -30 | 56 | VBottom |

#### `zener`

| Orientation | Index | offsetX | offsetY | Alignment |
|-------------|-------|---------|---------|-----------|
| R0 | 0 (InstName) | 32 | 0 | Left |
| R0 | 3 (Value) | 32 | 64 | Left |
| R90 | 0 (InstName) | -10 | 32 | VBottom |
| R90 | 3 (Value) | 39 | 32 | VTop |
| R180 | 0 (InstName) | 32 | 64 | Left |
| R180 | 3 (Value) | 32 | 0 | Left |
| R270 | 0 (InstName) | 41 | 32 | VTop |
| R270 | 3 (Value) | -8 | 32 | VBottom |

**Fall-through rule:** a component with no entry above uses the `WINDOW`
lines from its own `.asy` file.

<!-- END GENERATED: component-defaults -->

---

## 10. Value Formatting Rules

For `res`, `cap`, and `ind`, the `Value` attribute is reformatted before display:

**Resistor (`res`):** Append `Ω` suffix.
```
"10k"  → "10kΩ"
"1000" → "1000Ω"
"R"    → "R"  (default placeholder, no suffix)
```

**Capacitor (`cap`):** Strip trailing `F` or `f` from source, append `F`.
```
"100nF" → "100nF"
"100n"  → "100nF"
"C"     → "C"
```

**Inductor (`ind`):** Strip trailing `H`, `h`, `Hy`, `hy` from source, append `Hy`.
```
"10mH"  → "10mHy"
"10m"   → "10mHy"
"L"     → "L"
```

**Suffix normalization (all three):**
- `meg` (case-insensitive) → `M`
- `m` or `M` → `m` (LTSpice treats both as milli)


### Attribute resolution

An explicit `SYMATTR` line in the `.asc` always wins, **even when its value is
empty**. LTSpice writes `SYMATTR Value ""` when the user clears the field, and
that means "render nothing" - not "fall back to the symbol default". The `.asy`
value is consulted only when the attribute is absent from the `.asc` entirely.

### Transistors

`npn`, `pnp`, `nmos`, `pmos`, `njf`, `pjf` (and the `npn2/3/4`, `pnp2/4`,
`nmos4`, `pmos4`, `nm_nobulk`, `pm_nobulk` variants) each ship a bare type name
as their `.asy` default - `npn.asy` contains `SYMATTR Value NPN`. That label
only repeats what the symbol shape already shows, so for these components the
`.asy` value is **never** used as a fallback: only a `SYMATTR Value` line
present in the `.asc` is displayed.

```
SYMBOL npn 0 0 R0
SYMATTR InstName Q1               ; renders "Q1", no value label

SYMBOL npn 0 0 R0
SYMATTR InstName Q1
SYMATTR Value 2N2222              ; renders "Q1" and "2N2222"
```

Parts whose default carries real information are unaffected: `lpnp` (`LPNP`),
the Darlingtons (`DNPN`/`DPNP`), and `NPN_ideal`/`PNP_ideal` (`hfe=100`).
---

## 11. Line Styles

The optional `[style]` parameter on graphic elements:

| Value | Style |
|-------|-------|
| omitted | Solid |
| `1` | Dashed (10, 5) |
| `2` | Dotted (2, 5) |
| `3` | Dash-dot (10, 5, 2, 5) |
| `4` | Dash-dot-dot (10, 5, 2, 5, 2, 5) |

---

## 12. Known Edge Cases and Quirks

### ARC start/end are swapped

In the `ARC` directive, `(xs, ys)` is the **end** point and `(xe, ye)` is the **start** point — the opposite of what the parameter names suggest. This was discovered empirically.

### Font metrics are approximated

LTSpice uses Windows GDI for text rendering, which uses device-specific font metrics. The `Top` and `Bottom` alignment offsets (`H * 0.225`) are manual corrections that approximate GDI behavior. They may not be pixel-perfect on all text strings.

### fontSize = 0 renders tiny, not invisible

A `fontSize` of `0` maps to 8 pt (PDF) or 2 px (canvas). It is not suppressed — it renders at a very small but non-zero size.

### Pin offset is stored at 2× in the file

The `offset` field in `PIN` lines is stored at twice the effective rendering value. Always divide by 2 when reading:
```js
offset: parseFloat(parts[4]) / 2
```

### Symbol type paths — only the base name matters

`SYMBOL TCLib\OA_param2 ...` and `SYMBOL OA_param2 ...` both resolve to `OA_param2.svg` / `OA_param2.asy`. The directory path is stripped.

### Mirrored orientations use R0 defaults in Group 1

For Group 1 components, mirrored orientations (`M0`–`M270`) use the same offset table as their non-mirrored equivalent (`R0`–`R270`). The mirror effect on alignment is applied separately via `transformAlignment`.

### Wire direction for multi-wire flags

When a named flag has 2+ wires, the label is placed in the first **empty** direction using priority: top space → bottom space → left space → right space. "Empty" means no wire arrives from that direction.

### Hidden windows

A window is hidden if its alignment field is `Invisible`, or in some file versions if the last field is `0`. Hidden windows are parsed but never rendered.

### SVG coordinate origin

SVG skin files use `(0, 0)` as the component anchor point. The SVG `viewBox` may have negative coordinates — the renderer must expand the viewBox to cover all geometry before rendering.

---

*This specification was produced by reverse engineering LTSpice file output and iteratively validating against rendered results. Contributions and corrections are welcome.*
