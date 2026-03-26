# LTSpice .asy File Format Reference

The `.asy` file defines a custom or special component symbol. When an `.asc` file references a special component (e.g., `SYMBOL TCLib\Special\arrow_curve`), the parser looks for this `.asy` file in `Assets\Component Symbols\` to extract default parameters and window positions.

## Structure

```
Version 4
SymbolType CELL
LINE Normal -176 0 -80 48
...
WINDOW 3 -159 48 Left 1
SYMATTR Value K = 10
...
PIN -176 48 NONE 0
```

### 1. Header Information

- `Version X` - File format version.
- `SymbolType <type>` - Typically `CELL` or `BLOCK`.

### 2. Graphic Elements
Like `.asc` files, `.asy` files can contain graphic primitives to draw the component symbol. If an `.svg` file is not available for the component, the renderer must fall back to drawing these primitives.

```
LINE Normal <x1> <y1> <x2> <y2> [style]
RECTANGLE Normal <x1> <y1> <x2> <y2> [style]
CIRCLE Normal <x1> <y1> <x2> <y2> [style]
ARC Normal <x1> <y1> <x2> <y2> <xs> <ys> <xe> <ye> [style]
TEXT <x> <y> <alignment> <fontSize> <content>
```

**Key Differences from `.asc`:**
- `TEXT` content does **not** begin with a semicolon (`;`). The text string starts immediately after the `fontSize` argument.
- These primitives are drawn centered around the component's anchor point `(0,0)`, and must be rotated/mirrored according to the component's orientation code.

### 3. WINDOW Directives

```
WINDOW <index> <ox> <oy> <alignment> <fontSize>
```

Defines the default position, alignment, and size for a specific text label (e.g., `InstName`, `Value`, `SpiceLine`).
The index mapping is the same as in `.asc` files:
- `0`: InstName
- `3`: Value
- `39`: SpiceLine
- `40`: SpiceLine2
- `123`: Value2

If an `.asc` file explicitly defines a `WINDOW` for a given index, the `.asc` definition completely overrides the default found in the `.asy` file.

### 4. SYMATTR Directives

```
SYMATTR <attributeName> <value>
```

What we need to find is any of the following relevant attributes for text rendering. Examples include:
- `SYMATTR Value K=1`
- `SYMATTR Value2 200`
- `SYMATTR SpiceLine C=2`
- `SYMATTR SpiceLine2 Other`

These act as the fallback values if the `.asc` file does not provide a corresponding `SYMATTR`.
