# LTSpice .asc File Format Reference

> [!NOTE]
> Built iteratively from manual example analysis. Each section grows as new examples are studied.

---

## 1. Coordinate System

- **Origin:** Top-left of the sheet.
- **X-axis:** Positive to the right.
- **Y-axis:** Positive downward.

---

## 2. File Header

```
Version 4.1
SHEET 1 880 680
```

- `Version` — File format version.
- `SHEET <id> <width> <height>` — Sheet dimensions. *(Details TBD.)*

---

## 3. SYMBOL

```
SYMBOL <type> <x> <y> <orientation>
```

| Parameter | Description |
|-----------|-------------|
| `type` | Component identifier ([res](file:///c:/_DATA/Desktop/ASC%20Parser/engine/pdf_renderer.js#290-309), `cap`, `TCLib\OA_param2`, …). The actual SVG file used is the base name of the type (e.g., `OA_param2.svg`). |
| `x`, `y` | Placement coordinate on the sheet |
| [orientation](file:///c:/_DATA/Desktop/ASC%20Parser/debug_web/renderer.js#232-243) | Rotation/mirror code (see below) |

### Orientation Codes

| Code | Meaning |
|------|---------|
| `R0` | No rotation, no mirror |
| `R90` | 90° clockwise |
| `R180` | 180° clockwise |
| `R270` | 270° clockwise |
| `M0` | Rotated 0°, then mirrored horizontally |
| `M90` | Rotated 90° CW, then mirrored horizontally |
| `M180` | Rotated 180° CW, then mirrored horizontally |
| `M270` | Rotated 270° CW, then mirrored horizontally |

> **Transform order for mirrored codes:** Rotate first, then mirror.

---

## 4. WINDOW

```
WINDOW <index> <offsetX> <offsetY> <alignment> <fontSize>
```

Defines the **position and style of a text label** for the preceding `SYMBOL`. **Extra windows parameters can be present for any component.**

| Parameter | Description |
|-----------|-------------|
| `index` | Which attribute this label displays (see index table) |
| `offsetX`, `offsetY` | Text offset **relative to the component's unrotated position**. These offsets undergo the same rotation/mirror transform as the component. |
| `alignment` | Alignment keyword (see table below) |
| `fontSize` | Text size. `2` = default/standard |

### WINDOW Index Values (For Any Component)

| Index | Attribute | SYMATTR Key |
|-------|-----------|-------------|
| `0` | Instance Name | `InstName` |
| `3` | Value | `Value` |
| `39` | SPICE Line | `SpiceLine` |
| `40` | SPICE Line 2 | `SpiceLine2` |
| `123` | Value 2 | `Value2` |

**Notes on WINDOWs:**
- Extra windows parameters can be present for any component (e.g. 123, 39, 40).

### Alignment Keywords

**Horizontal text:**

| Keyword | H-Align | V-Align |
|---------|---------|---------|
| `Left` | Left | Center |
| `Right` | Right | Center |
| `Center` | Center | Center |
| `Top` | Center | Top |
| `Bottom` | Center | Bottom |

**Vertical text** (rendered rotated 90°, reading **bottom-to-top**):

| Keyword | H-Align | V-Align |
|---------|---------|---------|
| `VLeft` | Left | Center |
| `VRight` | Right | Center |
| `VCenter` | Center | Center |
| `VTop` | Center | Top |
| `VBottom` | Center | Bottom |

### Mirror Effect on Alignment

When a component is mirrored, `Left` and `Right` alignment **swap** with each other. Other alignments are unaffected.

### WINDOW Offset Transformation Rule

WINDOW offsets are specified relative to the **unrotated** component. When the component is rotated/mirrored, the offsets undergo the **same transformation** as the component geometry.

---

## 5. SYMATTR

```
SYMATTR <attribute> <value>
```

| Attribute | Description |
|-----------|-------------|
| `InstName` | Instance designator (e.g. `R1`, `C1`). **Mandatory.** |
| `Value` | Component value (e.g. `1000`, `10µ`). Has defaults per type (see below). |
| `Value2` | Secondary value parameter. |
| `SpiceLine` | Additional SPICE parameters as `key=value` pairs. |
| `SpiceLine2` | Second set of additional SPICE parameters. |

### Default Values (when SYMATTR Value is omitted)

| Component Type | Default Value |
|----------------|---------------|
| [res](file:///c:/_DATA/Desktop/ASC%20Parser/engine/pdf_renderer.js#290-309) | `R` |
| `cap` | `C` |
| [ind](file:///c:/_DATA/Desktop/ASC%20Parser/engine/pdf_renderer.js#146-163) | `L` |
| `diode`, `zener` | `D` |
| `voltage`, `signal` | `V` |
| `current` | `I` |
| `e`, `e2` | `E` |
| `g`, `g2` | `G` |
| `npn` | `NPN` |
| `pnp` | `PNP` |
| `nmos` | `NMOS` |
| `pmos` | `PMOS` |
| `njf` | `NJF` |
| `pjf` | `PJF` |

---

## 6. Default WINDOW Positions per Component

When WINDOW lines are **omitted**, these defaults apply.

Components are split into two groups based on how rotated defaults are determined.

---

### Group 1 — Explicit Per-Rotation Defaults

These components have **unique default positions for each rotation** that cannot be derived by a simple rule. All 4 rotations are listed explicitly.

> **Mirrored orientations (M0–M270):** Apply horizontal mirror first (which swaps Left↔Right in alignment), then the corresponding rotation. Offsets also mirror+rotate accordingly.

### [res](file:///c:/_DATA/Desktop/ASC%20Parser/engine/pdf_renderer.js#290-309) (Resistor)

| Orientation | WINDOW | offsetX | offsetY | Alignment | Size |
|-------------|--------|---------|---------|-----------|------|
| **R0** | 0 (InstName) | 36 | 40 | Left | 2 |
| | 3 (Value) | 36 | 76 | Left | 2 |
| **R90** | 0 (InstName) | 3 | 56 | VBottom | 2 |
| | 3 (Value) | 27 | 56 | VTop | 2 |
| **R180** | 0 (InstName) | 36 | 76 | Left | 2 |
| | 3 (Value) | 36 | 40 | Left | 2 |
| **R270** | 0 (InstName) | 27 | 56 | VTop | 2 |
| | 3 (Value) | 3 | 56 | VBottom | 2 |

### `cap` (Capacitor)

| Orientation | WINDOW | offsetX | offsetY | Alignment | Size |
|-------------|--------|---------|---------|-----------|------|
| **R0** | 0 (InstName) | 24 | 8 | Left | 2 |
| | 3 (Value) | 24 | 56 | Left | 2 |
| **R90** | 0 (InstName) | 0 | 32 | VBottom | 2 |
| | 3 (Value) | 32 | 32 | VTop | 2 |
| **R180** | 0 (InstName) | 24 | 56 | Left | 2 |
| | 3 (Value) | 24 | 8 | Left | 2 |
| **R270** | 0 (InstName) | 32 | 32 | VTop | 2 |
| | 3 (Value) | 0 | 32 | VBottom | 2 |

### [ind](file:///c:/_DATA/Desktop/ASC%20Parser/engine/pdf_renderer.js#146-163) (Inductor)

| Orientation | WINDOW | offsetX | offsetY | Alignment | Size |
|-------------|--------|---------|---------|-----------|------|
| **R0** | 0 (InstName) | -2 | 40 | Right | 2 |
| | 3 (Value) | -2 | 72 | Right | 2 |
| **R90** | 0 (InstName) | 3 | 56 | VBottom | 2 |
| | 3 (Value) | 31 | 56 | VTop | 2 |
| **R180** | 0 (InstName) | -2 | 72 | Right | 2 |
| | 3 (Value) | -2 | 40 | Right | 2 |
| **R270** | 0 (InstName) | 31 | 56 | VTop | 2 |
| | 3 (Value) | 3 | 56 | VBottom | 2 |

> [!IMPORTANT]
> **Alignment Override for Inductors:** Specifically for [ind](file:///c:/_DATA/Desktop/ASC%20Parser/engine/pdf_renderer.js#146-163), when the orientation is **R0, R180, M0, or M180**, the alignment for Window 0 and Window 3 must **always be `Right`**, regardless of what is specified explicitly.

---

### Group 2 — Formula-Derived Defaults

These components have **a single R0 default**. All other orientations are **derived algorithmically** from the R0 values using the rules below.

**Fall-through Rule:** Any component that is not explicitly described in Group 1 follows the rules of Group 2. 

**Symbol Paths:** If a `SYMBOL` line specifies a type with a subdirectory path (e.g., `SYMBOL TCLib\OA_param2 896 256 R0`), regardless of what is specified (`TCLib\OA_param2`, `OA_param2`, `TCLib\\OA_param2`), the symbol that will be used is always the base name (e.g. `OA_param2.svg`).

#### R0 Default Positions

| Component | WINDOW | offsetX | offsetY | Alignment | Size |
|-----------|--------|---------|---------|-----------|------|
| `e` | 0 (InstName) | 26 | 16 | Left | 2 |
| | 3 (Value) | 26 | 96 | Left | 2 |
| `e2` | 0 (InstName) | 26 | 16 | Left | 2 |
| | 3 (Value) | 26 | 96 | Left | 2 |
| `g` | 0 (InstName) | 26 | 16 | Left | 2 |
| | 3 (Value) | 26 | 96 | Left | 2 |
| `g2` | 0 (InstName) | 26 | 16 | Left | 2 |
| | 3 (Value) | 26 | 96 | Left | 2 |
| `njf` | 0 (InstName) | 58 | 32 | Left | 2 |
| | 3 (Value) | 58 | 72 | Left | 2 |
| `nmos` | 0 (InstName) | 58 | 32 | Left | 2 |
| | 3 (Value) | 58 | 72 | Left | 2 |
| `npn` | 0 (InstName) | 58 | 32 | Left | 2 |
| | 3 (Value) | 58 | 68 | Left | 2 |
| `pjf` | 0 (InstName) | 58 | 32 | Left | 2 |
| | 3 (Value) | 58 | 72 | Left | 2 |
| `pmos` | 0 (InstName) | 58 | 32 | Left | 2 |
| | 3 (Value) | 58 | 72 | Left | 2 |
| `pnp` | 0 (InstName) | 58 | 32 | Left | 2 |
| | 3 (Value) | 58 | 68 | Left | 2 |

#### Alignment Derivation Rules

All rotated and mirrored alignments are mathematically derived by recursively applying the atomic 90° Clockwise Rotation rule, followed conditionally by the Mirror rule for M-prefixed orientations.

**Atomic 90° (Clockwise) Rotation Rule:**
*   Toggle Horizontal/Vertical paradigm (H↔V).
*   If text *was* Horizontal: Swap `Left`↔`Right` and `Top`↔`Bottom`.
*   If text *was* Vertical: Keep `Left`, `Right`, `Top`, `Bottom` unchanged.

**Atomic Mirror Rule (Horizontal):**
*   Keep H/V paradigm.
*   If text is Horizontal: Swap `Left`↔`Right`.
*   If text is Vertical: Swap `Top`↔`Bottom`.

#### Alignment Derivation Table

The full translation matrix constructed strictly from recursive composition of these two atomic rules:

| R0 Alignment | R90 | R180 | R270 | M0 | M90 | M180 | M270 |
|---|---|---|---|---|---|---|---|
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

> Offsets transform geometrically with the component rotation/mirror (see [WINDOW Offset Transformation Rule](#window-offset-transformation-rule) in Section 4).

---

## 7. WIRE

```
WIRE <x1> <y1> <x2> <y2>
```

A wire connecting two points on the schematic.

| Parameter | Description |
|-----------|-------------|
| `x1`, `y1` | Start coordinate (absolute) |
| `x2`, `y2` | End coordinate (absolute) |

> Wires are purely geometric — just a line segment from [(x1,y1)](file:///c:/_DATA/Desktop/ASC%20Parser/debug_web/renderer.js#325-329) to [(x2,y2)](file:///c:/_DATA/Desktop/ASC%20Parser/debug_web/renderer.js#325-329).

---

## 8. FLAG

```
FLAG <x> <y> <name>
```

A flag marks a named net at a specific coordinate. Rendered as a **special component**.

| Parameter | Description |
|-----------|-------------|
| `x`, `y` | Absolute position on the sheet |
| `name` | Net name |

### Rendering Rules

| Name | Component Used | Text Displayed |
|------|---------------|----------------|
| `0` | `gnd` (ground symbol) | **None** — do not display "0" |
| anything else | `flag` | The flag name (e.g. `Vcc`, `Vee`) |

### Wire Direction Detection

To determine orientation/alignment, find a **WIRE** that has one endpoint matching the FLAG coordinate [(x, y)](file:///c:/_DATA/Desktop/ASC%20Parser/debug_web/renderer.js#325-329). The wire's *other* endpoint determines the incoming direction:
- If `other_x < flag_x` → **Left**
- If `other_x > flag_x` → **Right**
- If `other_y < flag_y` → **Top**
- If `other_y > flag_y` → **Bottom**

### GND Component (name = `0`)

| Incoming Wire From | GND Rotation |
|--------------------|--------------|
| Top | 0° (no rotation) |
| Right | 90° |
| Bottom | 180° |
| Left | 270° |

### Flag Component (name ≠ `0`)

| Incoming Wire From | Text Alignment |
|--------------------|----------------|
| Top | `Top` |
| Bottom | `Bottom` |
| Left | `Left` |
| Right | `Right` |

### Example

```
WIRE 0 -100 0 80
FLAG 0 80 0          → wire comes from top (Y -100 < 80) → gnd at 0°

FLAG 752 -208 Vcc    → find wire endpoint at (752,-208), other end determines alignment
FLAG 512 96 Vee      → find wire endpoint at (512,96), other end determines alignment
```

---

## 9. TEXT

```
TEXT <x> <y> <alignment> <fontSize> ;<content>
```

A standalone text annotation (comment) on the schematic. **Not attached to any component.**

| Parameter | Description |
|-----------|-------------|
| `x`, `y` | Absolute position on the sheet |
| `alignment` | Same alignment keywords as WINDOW (see Section 4) |
| `fontSize` | Text size. Default size is `2`. A `fontSize` of `0` renders the label at a very small size (nearly invisible but not suppressed). |
| `;<content>` | The displayed text, prefixed with a semicolon `;` |

> The semicolon `;` is a delimiter — it is **not** displayed as part of the text.

### Example — All alignment variants for text "Hola"

```
TEXT -40 0 Left 2 ;Hola
TEXT 8 40 Right 2 ;Hola
TEXT -8 80 Center 2 ;Hola
TEXT -8 112 Top 2 ;Hola
TEXT -8 184 Bottom 2 ;Hola
TEXT 160 -32 VLeft 2 ;Hola
TEXT 152 -8 VRight 2 ;Hola
TEXT 208 64 VCenter 2 ;Hola
TEXT 168 136 VTop 2 ;Hola
TEXT 176 184 VBottom 2 ;Hola
```

---

## 10. Graphic Elements (RECTANGLE, LINE, CIRCLE, ARC)

These elements share a common `<style>` parameter and are drawn with a **black** stroke (`#000000`).

### Line Styles

| Value | Style |
|-------|-------|
| *(omitted)* | Solid |
| `1` | Dashed |
| `2` | Dotted |
| `3` | Dash-dot |
| `4` | Dash-dot-dot |

---

### RECTANGLE

```
RECTANGLE Normal <x1> <y1> <x2> <y2> [style]
```

Draws a rectangle defined by opposite corners [(x1,y1)](file:///c:/_DATA/Desktop/ASC%20Parser/debug_web/renderer.js#325-329) and [(x2,y2)](file:///c:/_DATA/Desktop/ASC%20Parser/debug_web/renderer.js#325-329).

### LINE

```
LINE Normal <x1> <y1> <x2> <y2> [style]
```

Draws a line from [(x1,y1)](file:///c:/_DATA/Desktop/ASC%20Parser/debug_web/renderer.js#325-329) to [(x2,y2)](file:///c:/_DATA/Desktop/ASC%20Parser/debug_web/renderer.js#325-329).

### CIRCLE

```
CIRCLE Normal <x1> <y1> <x2> <y2> [style]
```

Draws a circle (or ellipse) inscribed in the bounding box defined by [(x1,y1)](file:///c:/_DATA/Desktop/ASC%20Parser/debug_web/renderer.js#325-329) and [(x2,y2)](file:///c:/_DATA/Desktop/ASC%20Parser/debug_web/renderer.js#325-329). 

### ARC

```
ARC Normal <x1> <y1> <x2> <y2> <xs> <ys> <xe> <ye> [style]
```

Draws an arc from an ellipse defined by bounding box [(x1,y1)](file:///c:/_DATA/Desktop/ASC%20Parser/debug_web/renderer.js#325-329) and [(x2,y2)](file:///c:/_DATA/Desktop/ASC%20Parser/debug_web/renderer.js#325-329).
- `<xs>, <ys>`: Coordinate of the **END** point of the arc.
- `<xe>, <ye>`: Coordinate of the **START** point of the arc.

---

### Canvas Boundary Rule

The **largest rectangle** (by area) in the file defines the **PDF canvas** bounds and is **not drawn**. All other rectangles are rendered normally.

> **Note:** Later, the user will have an option through the UI to choose to preserve the largest rectangle (drawing it) and calculate the clipping boundaries based on the rendered elements instead of using the rectangle itself.

> Area = `|x2 − x1| × |y2 − y1|`. Corners may be given in any order.

---

## 11. Text Sizing

LTSpice uses an indexed font size system (0–7). The approximate mapping to point sizes (assuming 1 LTSpice unit = 1 pt) is as follows:

| Index | Point Size (pt) |
|---|---|
| 0 | 8 |
| 1 | 13 |
| 2 | 20 |
| 3 | 26 |
| 4 | 32 |
| 5 | 46 |
| 6 | 65 |
| 7 | 92 |

---

## 12. Examples Analyzed

### Example 1 — Single Resistor, R0

```
SYMBOL res 0 0 R0
WINDOW 0 36 40 Left 2
WINDOW 3 36 76 Left 2
SYMATTR InstName R1
SYMATTR Value 1000
```

Resistor at [(0,0)](file:///c:/_DATA/Desktop/ASC%20Parser/debug_web/renderer.js#325-329), no rotation. InstName `R1` at offset [(36,40)](file:///c:/_DATA/Desktop/ASC%20Parser/debug_web/renderer.js#325-329) left-aligned. Value `1000` at offset [(36,76)](file:///c:/_DATA/Desktop/ASC%20Parser/debug_web/renderer.js#325-329) left-aligned.

---

### Missing Parameters

Any WINDOW or SYMATTR line may be absent. The parser must tolerate partial definitions without errors.
