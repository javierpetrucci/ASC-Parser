// engine/pdf_renderer.js

// Transform functions (same as canvas renderer)
function transformOffset(ox, oy, orientation) {
    const isMirrored = orientation.startsWith('M');
    const rot = isMirrored ? 'R' + orientation.slice(1) : orientation;
    let rx, ry;
    switch (rot) {
        case 'R0': rx = ox; ry = oy; break;
        case 'R90': rx = -oy; ry = ox; break;
        case 'R180': rx = -ox; ry = -oy; break;
        case 'R270': rx = oy; ry = -ox; break;
        default: rx = ox; ry = oy; break;
    }
    if (isMirrored) rx = -rx;
    return { x: rx, y: ry };
}

function transformAlignment(alignment, orientation) {
    let a = alignment;

    // Extract rotation count and mirror flag
    const isMirrored = orientation.startsWith('M');
    const degMatch = orientation.match(/\d+/);
    const deg = degMatch ? parseInt(degMatch[0], 10) : 0;
    const rotCount = deg / 90;

    // Apply 90-deg CW rotation 'rotCount' times
    for (let i = 0; i < rotCount; i++) {
        a = rotate90(a);
    }

    // Apply horizontal mirror if needed
    if (isMirrored) {
        a = mirror(a);
    }

    return a;

    function rotate90(align) {
        const rules = {
            'Left': 'VRight',
            'Right': 'VLeft',
            'Bottom': 'VTop',
            'Top': 'VBottom',
            'Center': 'VCenter',
            'VLeft': 'Left',
            'VRight': 'Right',
            'VBottom': 'Bottom',
            'VTop': 'Top',
            'VCenter': 'Center'
        };
        return rules[align] || align;
    }

    function mirror(align) {
        const rules = {
            'Left': 'Right',
            'Right': 'Left',
            'Bottom': 'Bottom',
            'Top': 'Top',
            'Center': 'Center',
            'VLeft': 'VLeft',
            'VRight': 'VRight',
            'VBottom': 'VTop',
            'VTop': 'VBottom',
            'VCenter': 'VCenter'
        };
        return rules[align] || align;
    }
}

// Component window defaults are loaded from engine/component_defaults.js
// (must be included before this script in the HTML)

// Transistor-family basenames. Their .asy files carry a bare type-name
// placeholder as the default SYMATTR Value (e.g. npn.asy → "NPN"), which
// conveys nothing the symbol shape doesn't already show. For these, the
// .asy Value is never used as a fallback — only an explicit SYMATTR Value
// line in the .asc counts as a real, user-supplied value.
const TRANSISTOR_BASENAMES = new Set([
    'npn', 'npn2', 'npn3', 'npn4',
    'pnp', 'pnp2', 'pnp4',
    'nmos', 'nmos4', 'nm_nobulk',
    'pmos', 'pmos4', 'pm_nobulk',
    'njf',
    'pjf',
]);

// Resolves a SYMATTR attribute's display value. An explicit SYMATTR line in
// the .asc always wins, even when its value is empty — an explicitly empty
// value means the user intentionally cleared it, and should render as
// nothing rather than falling back to the .asy default. The .asy value is
// only used as a fallback when the attribute was never set in the .asc.
function resolveAttrValue(sym, attrName) {
    if (attrName in sym.attrs) return sym.attrs[attrName];
    return sym.asyData?.attrs?.[attrName] || '';
}

// Formats a passive component's value the way a printed schematic shows it:
// the stored SPICE magnitude with its unit appended ("10k" → "10kΩ", "100n" →
// "100nF", "10m" → "10mHy"). Factored out of getWindowText because the pot
// exception below prints a resistance too, and a second copy of the suffix
// rules there would drift away from this one.
function formatPassiveValue(kind, val) {
    if (!val) return val;
    let workingVal = String(val).trim();

    // A value written with LaTeX carries its own units, so the automatic
    // suffix is not wanted: "$100\,\Omega$" would otherwise print the
    // ohm sign twice, and "$4.7\,\mu F$" would come out as "µFF".
    if (/[$\\]/.test(workingVal)) return val;

    // Check if it's just the default placeholder letter; if so skip unit append
    if ((kind === 'res' && workingVal.toUpperCase() === 'R') ||
        (kind === 'cap' && workingVal.toUpperCase() === 'C') ||
        (kind === 'ind' && workingVal.toUpperCase() === 'L')) {
        return workingVal;
    }

    // Step 1: Remove trailing units from source (F, H, Hy) for cap/ind
    if (kind === 'cap' && workingVal.toLowerCase().endsWith('f')) {
        workingVal = workingVal.substring(0, workingVal.length - 1).trim();
    } else if (kind === 'ind') {
        if (workingVal.toLowerCase().endsWith('hy')) {
            workingVal = workingVal.substring(0, workingVal.length - 2).trim();
        } else if (workingVal.toLowerCase().endsWith('h')) {
            workingVal = workingVal.substring(0, workingVal.length - 1).trim();
        }
    }

    // Step 2: Handle suffixes (meg -> M, M/m -> m)
    if (workingVal.toLowerCase().endsWith('meg')) {
        workingVal = workingVal.substring(0, workingVal.length - 3) + 'M';
    } else if (workingVal.toLowerCase().endsWith('m')) {
        // Both 'M' and 'm' in LTSpice mean milli
        workingVal = workingVal.substring(0, workingVal.length - 1) + 'm';
    }

    // Step 3: Append final units
    if (kind === 'res') return workingVal + 'Ω';
    if (kind === 'cap') return workingVal + 'F';
    if (kind === 'ind') return workingVal + 'Hy';
    return workingVal;
}

// "R=10K" → "10K". A value that is not written as that named parameter comes
// back untouched, so a pot whose Value was typed as a bare "10K" still formats.
function stripParamName(val, name) {
    const s = String(val).trim();
    const eq = s.indexOf('=');
    if (eq === -1) return s;
    if (s.slice(0, eq).trim().toLowerCase() !== name.toLowerCase()) return s;
    return s.slice(eq + 1).trim();
}

// ── Per-symbol text exceptions ─────────────────────────────────────────────
//
// A handful of symbols store an attribute whose raw form is not what belongs
// on a printed sheet. Rather than growing a chain of `if (basename === …)`
// inside getWindowText, each exception is one entry here: window index → a
// function mapping the resolved attribute to the string to draw. An index with
// no entry is left alone, so a rule only overrides WHAT is printed for the
// index it names — WHERE it is printed, and at what size, stays entirely in
// component_defaults.js (tunable in the Window Tuner like every other label).
//
// Keys are symbolKey() values, i.e. lower-case basenames.
const SYMBOL_TEXT_RULES = {
    // pot — the TCLib potentiometer. It is an X-prefixed subcircuit, so
    // LTSpice instantiates it as U1, U2, … and keeps its resistance in a named
    // parameter; printed verbatim the sheet would read "U1" and "R=10K".
    // On paper it should read exactly like a resistor:
    //     InstName  U1      →  P1
    //     Value     R=10K   →  10KΩ
    // Value2 ("cur=.5") is deliberately NOT rewritten — it is a genuine
    // parameter and prints as one, just smaller and off to one side (see the
    // `pot` entry in component_defaults.js).
    pot: {
        // Only a letter-run followed by digits is renumbered (U1 → P1,
        // X12 → P12). A deliberately named instance ("Rload") is left as typed.
        0: (v) => v.replace(/^[A-Za-z]+(?=\d)/, 'P'),
        3: (v) => formatPassiveValue('res', stripParamName(v, 'R')),
    },
};

function getWindowText(sym, index) {
    const text = rawWindowText(sym, index);
    if (!text) return text;
    const rule = SYMBOL_TEXT_RULES[symbolKey(sym.type)]?.[index];
    return rule ? rule(text) : text;
}

// The attribute behind each window index, before any per-symbol exception.
function rawWindowText(sym, index) {
    if (index === 0) return resolveAttrValue(sym, 'InstName');
    if (index === 3) {
        const basename = symbolKey(sym.type);
        const val = TRANSISTOR_BASENAMES.has(basename)
            ? (sym.attrs['Value'] || '')
            : resolveAttrValue(sym, 'Value');

        // Special formatting rules for res, cap, ind values (index 3)
        if (['res', 'cap', 'ind'].includes(basename) && val) return formatPassiveValue(basename, val);

        return val;
    }
    if (index === 39) return resolveAttrValue(sym, 'SpiceLine');
    if (index === 40) return resolveAttrValue(sym, 'SpiceLine2');
    if (index === 123) return resolveAttrValue(sym, 'Value2');
    return '';
}

// Resolves WHICH window labels a symbol shows, WHERE, and at what size — the
// three-layer priority stack described at the draw site further down.
//
// It lives in its own function because TWO passes need the answer: the one that
// draws the labels and the one that sizes the page. A label the page was not
// sized for is a label hanging off the sheet, so the two must agree exactly —
// and the only way to guarantee that is to ask the same code.
function resolveEffectiveWindows(sym, overrideAnchors) {
    const effectiveWindows = new Map();
    const table = lookupComponentDefaults(symbolBasename(sym.type));
    const useOverride = overrideAnchors && !!table;

    if (useOverride) {
        // Override mode: component_defaults.js is the COMPLETE contract.
        // Only indexes explicitly listed there will be rendered.
        // Intentionally omitting an index (e.g. 0/InstName) suppresses it.
        const exactKey = sym.orientation;
        const rotEquiv = sym.orientation.startsWith('M')
            ? 'R' + sym.orientation.slice(1)
            : sym.orientation;
        const defaults = table[exactKey] || table[rotEquiv] || table['R0'];
        if (defaults) {
            for (const [idxStr, def] of Object.entries(defaults)) {
                const idx = parseInt(idxStr);
                let isHidden = false;

                const asyWin = sym.asyData?.windows?.[idx];
                if (asyWin && asyWin.isHidden) isHidden = true;

                const ascWin = sym.windows.find(w => w.index === idx);
                if (ascWin) isHidden = ascWin.isHidden;

                // Size 2 is LTSpice's normal label size and stays the default;
                // an entry may name its own (pot's "cur=" parameter is set in
                // a smaller size so it reads as an annotation, not a value).
                const fontSize = (typeof def.fontSize === 'number') ? def.fontSize : 2;
                effectiveWindows.set(idx, { ox: def.ox, oy: def.oy, align: def.align, fontSize: fontSize, isHidden: isHidden });
            }
        }
    } else {
        // Normal mode: position-driven. Only windows with an explicitly defined
        // position are added. No implicit defaults or (0,0) placeholders.

        // Layer 1: ASY WINDOW positions (base)
        if (sym.asyData && sym.asyData.windows) {
            for (const [idxStr, asyWin] of Object.entries(sym.asyData.windows)) {
                const idx = parseInt(idxStr);
                effectiveWindows.set(idx, { ox: asyWin.ox, oy: asyWin.oy, align: asyWin.align, fontSize: asyWin.fontSize, isHidden: asyWin.isHidden });
            }
        }
        // Layer 2: ASC explicit WINDOW lines override ASY positions (or add new ones)
        for (const win of sym.windows) {
            effectiveWindows.set(win.index, { ox: win.offsetX, oy: win.offsetY, align: win.alignment, fontSize: win.fontSize, isHidden: win.isHidden });
        }
    }

    // Inductor special-case alignment override. Compare the basename, not the
    // full type: a pathed reference such as Misc\ind (or a differently-cased
    // one) used to skip this exception.
    if (symbolKey(sym.type) === 'ind' && ['R0', 'R180', 'M0', 'M180'].includes(sym.orientation)) {
        if (effectiveWindows.has(0)) effectiveWindows.get(0).align = 'Right';
        if (effectiveWindows.has(3)) effectiveWindows.get(3).align = 'Right';
    }

    return effectiveWindows;
}

// The box a symbol's artwork occupies in its own LOCAL (pre-rotation) frame.
// Built from the .asy geometry, which is what the ASY fallback draws and what
// every skin SVG mirrors. Returns null when the .asy never resolved.
function symbolLocalBox(graphics) {
    if (!graphics) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y) => {
        if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) return;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y);
        x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    };
    // Rectangles, circles and arcs are all stored as their own bounding box.
    for (const l of graphics.lines || []) { add(l.x1, l.y1); add(l.x2, l.y2); }
    for (const r of graphics.rectangles || []) { add(r.x1, r.y1); add(r.x2, r.y2); }
    for (const c of graphics.circles || []) { add(c.x1, c.y1); add(c.x2, c.y2); }
    for (const a of graphics.arcs || []) { add(a.x1, a.y1); add(a.x2, a.y2); }
    for (const p of graphics.pins || []) add(p.x, p.y);
    for (const t of graphics.texts || []) add(t.x, t.y);
    return x0 === Infinity ? null : { x0, y0, x1, y1 };
}

// Same, from a skin SVG's viewBox — the artwork actually drawn when a skin is
// in play, and the only size available for a symbol whose .asy did not resolve.
function svgViewBoxLocalBox(svgText) {
    const m = svgText && svgText.match(/viewBox="([^"]+)"/);
    if (!m) return null;
    const [vx, vy, vw, vh] = m[1].trim().split(/[\s,]+/).map(Number);
    if (![vx, vy, vw, vh].every(Number.isFinite)) return null;
    return { x0: vx, y0: vy, x1: vx + vw, y1: vy + vh };
}

function applyPdfLineStyle(doc, style) {
    if (style === '1') doc.setLineDashPattern([10, 5], 0);
    else if (style === '2') doc.setLineDashPattern([2, 5], 0);
    else if (style === '3') doc.setLineDashPattern([10, 5, 2, 5], 0);
    else if (style === '4') doc.setLineDashPattern([10, 5, 2, 5, 2, 5], 0);
    else doc.setLineDashPattern([], 0); // Solid
}

// ── SVG Parsing ────────────────────────────────────────────────────────
function drawSvgToPdf(doc, svgText, symX, symY, orientation, minX, minY, scale = 1) {
    if (!svgText) return;
    doc.setLineDashPattern([], 0); // Always default to solid stroke for SVGs unless explicitly styled

    // 1. Calculate SVG bounds (identical logic to `prepareSvg` from canvas renderer)
    const vbMatch = svgText.match(/viewBox="([^"]+)"/);
    let vx = 0, vy = 0, vw = 32, vh = 32;
    const xs = [], ys = [];
    if (vbMatch) {
        [vx, vy, vw, vh] = vbMatch[1].trim().split(/[\s,]+/).map(Number);
        xs.push(vx, vx + vw); ys.push(vy, vy + vh);
    }
    for (const m of svgText.matchAll(/\b(?:x|x1|x2)="(-?[\d.]+)"/g)) xs.push(parseFloat(m[1]));
    for (const m of svgText.matchAll(/\b(?:y|y1|y2)="(-?[\d.]+)"/g)) ys.push(parseFloat(m[1]));
    for (const m of svgText.matchAll(/<circle[^>]*>/g)) {
        const cx = parseFloat((m[0].match(/cx="(-?[\d.]+)"/) || [])[1] ?? 0);
        const cy = parseFloat((m[0].match(/cy="(-?[\d.]+)"/) || [])[1] ?? 0);
        const r = parseFloat((m[0].match(/\br="([\d.]+)"/) || [])[1] ?? 0);
        xs.push(cx - r, cx + r); ys.push(cy - r, cy + r);
    }
    for (const m of svgText.matchAll(/points="([^"]+)"/g)) {
        const nums = m[1].trim().split(/[\s,]+/).map(Number);
        for (let i = 0; i < nums.length; i += 2) {
            xs.push(nums[i]);
            if (i + 1 < nums.length) ys.push(nums[i + 1]);
        }
    }
    // We intentionally DO NOT calculate or subtract svgMinX/svgMinY here. 
    // LTSpice SVG primitives are already in local coordinate space relative to the component's (0,0) anchor.

    // 2. Setup transforms
    const isMirrored = orientation.startsWith('M');
    const rotPart = isMirrored ? 'R' + orientation.slice(1) : orientation;
    let angleRad = 0;
    if (rotPart === 'R90') angleRad = Math.PI / 2;
    else if (rotPart === 'R180') angleRad = Math.PI;
    else if (rotPart === 'R270') angleRad = -Math.PI / 2;

    const baseTx = symX - minX;
    const baseTy = symY - minY;

    // Coordinate mapping function: Rotate THEN Mirror
    function transformPoint(px, py) {
        // SVG coordinates are inherently anchored to (0,0) as the component anchor.
        let lx = px;
        let ly = py;

        // 1. Rotate
        const cosA = Math.cos(angleRad), sinA = Math.sin(angleRad);
        let rx = lx * cosA - ly * sinA;
        let ry = lx * sinA + ly * cosA;

        // 2. Mirror
        if (isMirrored) rx = -rx;

        // 3. Translate
        return { x: baseTx + rx, y: baseTy + ry };
    }

    doc.setDrawColor(0, 0, 0); // Stroke color inside SVG is usually black
    doc.setLineCap(1);
    doc.setLineJoin(1);

    // CSS Parsing for stroke widths, fills, and strokes
    const cssStyles = {};
    const styleMatch = svgText.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    if (styleMatch) {
        const cssRules = styleMatch[1].match(/([^{]+)\{([^}]+)\}/g) || [];
        for (const rule of cssRules) {
            const sm = rule.match(/([^{]+)\{([^}]+)\}/);
            if (sm) {
                const selectors = sm[1].split(',').map(s => s.trim().replace('.', ''));
                let sw = null, fill = null, stroke = null, fontSize = null, fillRule = null;
                const fsMatch = sm[2].match(/font-size\s*:\s*([\d.]+)px/);
                if (fsMatch) fontSize = parseFloat(fsMatch[1]);
                const swMatch = sm[2].match(/stroke-width\s*:\s*([\d.]+)px/);
                const fillMatch = sm[2].match(/(?:^|;)\s*fill\s*:\s*([^;}\/]+)/);
                const strokeMatch = sm[2].match(/(?:^|;)\s*stroke\s*:\s*([^;}\/]+)/);
                const ruleMatch = sm[2].match(/fill-rule\s*:\s*([a-z-]+)/);
                if (ruleMatch) fillRule = ruleMatch[1].trim();
                if (swMatch) sw = parseFloat(swMatch[1]);
                if (fillMatch) fill = fillMatch[1].trim();
                if (strokeMatch) stroke = strokeMatch[1].trim();

                for (const sel of selectors) {
                    if (!cssStyles[sel]) cssStyles[sel] = {};
                    if (sw !== null) cssStyles[sel].strokeWidth = sw;
                    if (fontSize !== null) cssStyles[sel].fontSize = fontSize;
                    if (fill !== null) cssStyles[sel].fill = fill;
                    if (stroke !== null) cssStyles[sel].stroke = stroke;
                    if (fillRule !== null) cssStyles[sel].fillRule = fillRule;
                }
            }
        }
    }

    // Helper to parse Hex color to array [r, g, b]
    const hexToRgb = (hexStr) => {
        let hex = hexStr.replace('#', '');
        if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        if (hex.length === 6) {
            return [parseInt(hex.substring(0, 2), 16), parseInt(hex.substring(2, 4), 16), parseInt(hex.substring(4, 6), 16)];
        }
        if (hexStr === 'white') return [255, 255, 255];
        return [0, 0, 0]; // default back to black
    };

    // Returns { fill, hasStroke, strokeColor } for the element
    const applySvgStyle = (elementStr) => {
        const clsMatch = elementStr.match(/class="([^"]+)"/);
        const cls = clsMatch ? cssStyles[clsMatch[1]] : null;

        // 1. Stroke width
        let lw = 1.5;
        if (cls && cls.strokeWidth !== undefined) lw = cls.strokeWidth;
        const inlineSw = elementStr.match(/stroke-width="([\d.]+)"/);
        if (inlineSw) lw = parseFloat(inlineSw[1]);
        doc.setLineWidth(lw);

        // 2. Fill value
        let fill = undefined;
        if (cls && cls.fill !== undefined) fill = cls.fill;
        const inlineFill = elementStr.match(/fill="([^"]+)"/);
        if (inlineFill) fill = inlineFill[1];

        // SVG's initial fill-rule is nonzero; only an explicit evenodd changes it.
        let fillRule = (cls && cls.fillRule) || 'nonzero';
        const inlineRule = elementStr.match(/fill-rule="([a-z-]+)"/);
        if (inlineRule) fillRule = inlineRule[1];

        // 3. Explicit stroke logic.
        // `strokeDisabled` tracks stroke="none" specifically, which is NOT the
        // same as "no stroke declared anywhere". Many skins put the stroke on a
        // parent <g class="..."> that this flat scan does not see, and those
        // elements rely on the stroke fallback below. Only an explicit `none`
        // means "draw nothing".
        let hasStroke = false;
        let strokeDisabled = false;
        let strokeColor = '#000000';
        if (cls && cls.stroke !== undefined) {
            if (cls.stroke === 'none') strokeDisabled = true;
            else { hasStroke = true; strokeColor = cls.stroke; }
        }
        const inlineStroke = elementStr.match(/stroke="([^"]+)"/);
        if (inlineStroke) {
            // An inline attribute overrides the class in both directions.
            if (inlineStroke[1] === 'none') { strokeDisabled = true; hasStroke = false; }
            else { strokeDisabled = false; hasStroke = true; strokeColor = inlineStroke[1]; }
        }

        if (hasStroke) {
            const rgb = hexToRgb(strokeColor);
            doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
        } else {
            doc.setDrawColor(0, 0, 0); // fallback stroke
        }

        return { fill, hasStroke, strokeDisabled, fillRule };
    };

    // Converts fill/stroke info + shape-type into a jsPDF draw action.
    // Returns 'skip' for an element that is deliberately invisible.
    const resolveDrawMode = (fill, hasStroke, isClosedByDefault, strokeDisabled = false) => {
        let effectiveFill = fill;
        if (effectiveFill === undefined && isClosedByDefault) effectiveFill = '#000';

        const wantFill = effectiveFill !== undefined && effectiveFill !== 'none';

        // fill="none" together with stroke="none" paints nothing. This used to
        // fall through to 'S' and stroke the geometry in black — which is how a
        // disabled rough.js hachure layer ended up rendered as diagonal shading
        // across TC2_Rough symbols.
        if (!wantFill && strokeDisabled) return 'skip';

        if (wantFill) {
            const rgb = hexToRgb(effectiveFill);
            doc.setFillColor(rgb[0], rgb[1], rgb[2]);
        }

        if (wantFill && hasStroke) return 'FD-stroke';
        if (wantFill) return 'F-only';
        return 'S';
    };

    // Execute the final draw call for a built path
    const executeDraw = (mode) => {
        if (mode === 'FD-stroke') doc.fillStroke();
        else if (mode === 'F-only') doc.fill();
        else doc.stroke();
    };

    // 3. Draw Elements in Order (Painter's Model)
    const elementRegex = /<(rect|line|circle|path|polygon|polyline)[^>]*>/g;
    for (const m of svgText.matchAll(elementRegex)) {
        const fullTag = m[0];
        const tagName = m[1];

        // Parse SVG transform="..." attribute
        const tMatch = fullTag.match(/transform="([^"]+)"/);
        let txA = 1, txB = 0, txC = 0, txD = 1, txE = 0, txF = 0;
        if (tMatch) {
            const regex = /([a-z]+)\s*\(([^)]+)\)/g;
            let match;
            while ((match = regex.exec(tMatch[1]))) {
                const cmd = match[1];
                const args = match[2].trim().split(/[\s,]+/).map(Number);
                if (cmd === 'translate') {
                    const tx = args[0] || 0, ty = args[1] !== undefined ? args[1] : 0;
                    txE += txA * tx + txC * ty;
                    txF += txB * tx + txD * ty;
                } else if (cmd === 'rotate') {
                    const angle = (args[0] || 0) * Math.PI / 180;
                    const cx = args[1] || 0, cy = args[2] || 0;
                    if (cx || cy) { txE += txA * cx + txC * cy; txF += txB * cx + txD * cy; }
                    const cosA = Math.cos(angle), sinA = Math.sin(angle);
                    const na = txA * cosA + txC * sinA, nb = txB * cosA + txD * sinA;
                    const nc = -txA * sinA + txC * cosA, nd = -txB * sinA + txD * cosA;
                    txA = na; txB = nb; txC = nc; txD = nd;
                    if (cx || cy) { txE -= txA * cx + txC * cy; txF -= txB * cx + txD * cy; }
                } else if (cmd === 'scale') {
                    const sx = args[0] || 1, sy = args[1] !== undefined ? args[1] : sx;
                    txA *= sx; txB *= sx; txC *= sy; txD *= sy;
                } else if (cmd === 'matrix') {
                    const [ma, mb, mc, md, me, mf] = args;
                    const na = txA * ma + txC * mb, nb = txB * ma + txD * mb;
                    const nc = txA * mc + txC * md, nd = txB * mc + txD * md;
                    txE += txA * me + txC * mf; txF += txB * me + txD * mf;
                    txA = na; txB = nb; txC = nc; txD = nd;
                }
            }
        }

        const localTransformPoint = (px, py) => {
            if (txA !== 1 || txB !== 0 || txC !== 0 || txD !== 1 || txE !== 0 || txF !== 0) {
                const npx = txA * px + txC * py + txE;
                const npy = txB * px + txD * py + txF;
                return transformPoint(npx, npy);
            }
            return transformPoint(px, py);
        };

        if (tagName === 'rect') {
            const { fill, hasStroke, strokeDisabled } = applySvgStyle(fullTag);
            const mode = resolveDrawMode(fill, hasStroke, true, strokeDisabled);
            if (mode === 'skip') continue;
            const lStyle = mode === 'FD-stroke' ? 'FD' : mode === 'F-only' ? 'F' : 'S';
            const rx = parseFloat((fullTag.match(/x="(-?[\d.]+)"/) || [])[1] ?? 0);
            const ry = parseFloat((fullTag.match(/y="(-?[\d.]+)"/) || [])[1] ?? 0);
            const rw = parseFloat((fullTag.match(/width="(-?[\d.]+)"/) || [])[1] ?? 0);
            const rh = parseFloat((fullTag.match(/height="(-?[\d.]+)"/) || [])[1] ?? 0);
            const p1 = localTransformPoint(rx, ry);
            const p2 = localTransformPoint(rx + rw, ry);
            const p3 = localTransformPoint(rx + rw, ry + rh);
            const p4 = localTransformPoint(rx, ry + rh);
            doc.lines([[p2.x - p1.x, p2.y - p1.y], [p3.x - p2.x, p3.y - p2.y], [p4.x - p3.x, p4.y - p3.y], [p1.x - p4.x, p1.y - p4.y]], p1.x, p1.y, [1, 1], lStyle);
        } else if (tagName === 'line') {
            const { strokeDisabled } = applySvgStyle(fullTag);
            // A line has no interior, so stroke="none" makes it invisible.
            if (strokeDisabled) continue;
            const x1 = parseFloat((fullTag.match(/x1="(-?[\d.]+)"/) || [])[1] ?? 0);
            const y1 = parseFloat((fullTag.match(/y1="(-?[\d.]+)"/) || [])[1] ?? 0);
            const x2 = parseFloat((fullTag.match(/x2="(-?[\d.]+)"/) || [])[1] ?? 0);
            const y2 = parseFloat((fullTag.match(/y2="(-?[\d.]+)"/) || [])[1] ?? 0);
            const p1 = localTransformPoint(x1, y1);
            const p2 = localTransformPoint(x2, y2);
            doc.line(p1.x, p1.y, p2.x, p2.y);
        } else if (tagName === 'circle') {
            const { fill, hasStroke, strokeDisabled } = applySvgStyle(fullTag);
            const mode = resolveDrawMode(fill, hasStroke, true, strokeDisabled);
            if (mode === 'skip') continue;
            const ellipseStyle = mode === 'FD-stroke' ? 'FD' : mode === 'F-only' ? 'F' : 'S';
            const cx = parseFloat((fullTag.match(/cx="(-?[\d.]+)"/) || [])[1] ?? 0);
            const cy = parseFloat((fullTag.match(/cy="(-?[\d.]+)"/) || [])[1] ?? 0);
            const r = parseFloat((fullTag.match(/r="(-?[\d.]+)"/) || [])[1] ?? 0);
            const cCenter = localTransformPoint(cx, cy);
            doc.ellipse(cCenter.x, cCenter.y, r, r, ellipseStyle);
        } else if (tagName === 'polygon' || tagName === 'polyline') {
            const { fill, hasStroke, strokeDisabled } = applySvgStyle(fullTag);
            const isClosed = tagName === 'polygon';
            const mode = resolveDrawMode(fill, hasStroke, isClosed, strokeDisabled);
            if (mode === 'skip') continue;
            const lStyle = mode === 'FD-stroke' ? 'FD' : mode === 'F-only' ? 'F' : 'S';
            const ptsMatch = fullTag.match(/points="([^"]+)"/);
            if (ptsMatch) {
                const nums = ptsMatch[1].trim().split(/[\s,]+/).map(Number);
                const pts = [];
                for (let i = 0; i < nums.length; i += 2) {
                    pts.push(localTransformPoint(nums[i], nums[i + 1]));
                }
                if (pts.length > 1) {
                    const start = pts[0];
                    const lines = [];
                    for (let i = 1; i < pts.length; i++) {
                        lines.push([pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y]);
                    }
                    if (isClosed) {
                        lines.push([start.x - pts[pts.length - 1].x, start.y - pts[pts.length - 1].y]);
                    }
                    doc.lines(lines, start.x, start.y, [1, 1], lStyle);
                }
            }
        } else if (tagName === 'path') {
            const { fill, hasStroke, strokeDisabled, fillRule } = applySvgStyle(fullTag);
            // \b so this cannot match the d in id="..." when id precedes d.
            const dMatch = fullTag.match(/\bd="([^"]+)"/);
            if (dMatch) {
                const tokens = [];
                const regex = /([A-Za-z])|(-?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)/g;
                let tMatch;
                while ((tMatch = regex.exec(dMatch[1]))) {
                    tokens.push(tMatch[0]);
                }

                // Accumulate points per SUBPATH (absolute PDF coords). A single
                // <path> may contain several subpaths, each introduced by M/m.
                // They must stay separate: collecting them into one flat list
                // made jsPDF draw a connecting line from the end of one subpath
                // to the start of the next, and let a single Z close across them.
                let curX = 0, curY = 0;
                let startX = 0, startY = 0;
                let pathStarted = false;
                let lastCp2X = null, lastCp2Y = null;
                const subpaths = [];      // [{ points: [{x,y}], closed: bool }]
                let current = null;       // subpath currently being built
                let i = 0;

                const beginSubpath = () => {
                    current = { points: [], closed: false };
                    subpaths.push(current);
                };

                const addPoint = (svgX, svgY) => {
                    if (!current) beginSubpath();
                    current.points.push(localTransformPoint(svgX, svgY));
                };

                while (i < tokens.length) {
                    const cmd = tokens[i++];
                    let isCurveCommand = false;

                    if (cmd === 'M' || cmd === 'm') {
                        const nx = parseFloat(tokens[i++]);
                        const ny = parseFloat(tokens[i++]);
                        const absX = (cmd === 'm' ? curX + nx : nx) || 0;
                        const absY = (cmd === 'm' ? curY + ny : ny) || 0;
                        curX = absX; curY = absY;
                        startX = curX; startY = curY;
                        pathStarted = true;
                        beginSubpath();
                        addPoint(curX, curY);
                        while (i + 1 < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
                            const extraX = parseFloat(tokens[i++]);
                            const extraY = parseFloat(tokens[i++]);
                            const ax = (cmd === 'm' ? curX + extraX : extraX) || 0;
                            const ay = (cmd === 'm' ? curY + extraY : extraY) || 0;
                            addPoint(ax, ay);
                            curX = ax; curY = ay;
                        }
                    } else if (cmd === 'L' || cmd === 'l') {
                        while (i + 1 < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
                            const nx = parseFloat(tokens[i++]);
                            const ny = parseFloat(tokens[i++]);
                            const absX = (cmd === 'l' ? curX + nx : nx) || 0;
                            const absY = (cmd === 'l' ? curY + ny : ny) || 0;
                            if (pathStarted) addPoint(absX, absY);
                            curX = absX; curY = absY;
                        }
                    } else if (cmd === 'H' || cmd === 'h') {
                        while (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
                            const nx = parseFloat(tokens[i++]);
                            const absX = (cmd === 'h' ? curX + nx : nx) || 0;
                            if (pathStarted) addPoint(absX, curY);
                            curX = absX;
                        }
                    } else if (cmd === 'V' || cmd === 'v') {
                        while (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
                            const ny = parseFloat(tokens[i++]);
                            const absY = (cmd === 'v' ? curY + ny : ny) || 0;
                            if (pathStarted) addPoint(curX, absY);
                            curY = absY;
                        }
                    } else if (cmd === 'C' || cmd === 'c') {
                        isCurveCommand = true;
                        while (i + 5 < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
                            const isRel = cmd === 'c';
                            const cp1x = parseFloat(tokens[i++]) + (isRel ? curX : 0);
                            const cp1y = parseFloat(tokens[i++]) + (isRel ? curY : 0);
                            const cp2x = parseFloat(tokens[i++]) + (isRel ? curX : 0);
                            const cp2y = parseFloat(tokens[i++]) + (isRel ? curY : 0);
                            const ex = parseFloat(tokens[i++]) + (isRel ? curX : 0);
                            const ey = parseFloat(tokens[i++]) + (isRel ? curY : 0);
                            const STEPS = 12;
                            for (let step = 1; step <= STEPS; step++) {
                                const t = step / STEPS;
                                const mt = 1 - t;
                                const bx = mt * mt * mt * curX + 3 * mt * mt * t * cp1x + 3 * mt * t * t * cp2x + t * t * t * ex;
                                const by = mt * mt * mt * curY + 3 * mt * mt * t * cp1y + 3 * mt * t * t * cp2y + t * t * t * ey;
                                if (pathStarted) addPoint(bx, by);
                            }
                            curX = ex; curY = ey;
                            lastCp2X = cp2x; lastCp2Y = cp2y;
                        }
                    } else if (cmd === 'S' || cmd === 's') {
                        isCurveCommand = true;
                        while (i + 3 < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
                            const isRel = cmd === 's';
                            let cp1x = curX, cp1y = curY;
                            if (lastCp2X !== null && lastCp2Y !== null) {
                                cp1x = curX * 2 - lastCp2X;
                                cp1y = curY * 2 - lastCp2Y;
                            }
                            const cp2x = parseFloat(tokens[i++]) + (isRel ? curX : 0);
                            const cp2y = parseFloat(tokens[i++]) + (isRel ? curY : 0);
                            const ex = parseFloat(tokens[i++]) + (isRel ? curX : 0);
                            const ey = parseFloat(tokens[i++]) + (isRel ? curY : 0);
                            const STEPS = 12;
                            for (let step = 1; step <= STEPS; step++) {
                                const t = step / STEPS;
                                const mt = 1 - t;
                                const bx = mt * mt * mt * curX + 3 * mt * mt * t * cp1x + 3 * mt * t * t * cp2x + t * t * t * ex;
                                const by = mt * mt * mt * curY + 3 * mt * mt * t * cp1y + 3 * mt * t * t * cp2y + t * t * t * ey;
                                if (pathStarted) addPoint(bx, by);
                            }
                            curX = ex; curY = ey;
                            lastCp2X = cp2x; lastCp2Y = cp2y;
                        }
                    } else if (cmd === 'Z' || cmd === 'z') {
                        // Closes the CURRENT subpath only, not the whole element.
                        if (current) current.closed = true;
                        curX = startX; curY = startY;
                    } else if (!/^[0-9.+-]/.test(cmd)) {
                        // A (arcs) and Q/T (quadratics) have no branch here, so their
                        // numeric arguments are never consumed and the segment is
                        // dropped. Say so instead of failing silently.
                        console.warn(`[SVG] Unsupported path command "${cmd}" - segment skipped.`);
                    }
                    if (!isCurveCommand) { lastCp2X = null; lastCp2Y = null; }
                }

                const drawable = [];
                for (const sub of subpaths) {
                    const pts = sub.points;
                    if (pts.length < 2) continue;
                    const start = pts[0];
                    const end = pts[pts.length - 1];
                    // Treat a subpath whose ends coincide as closed even without Z.
                    const looksClosed = sub.closed ||
                        (Math.abs(start.x - end.x) < 0.001 && Math.abs(start.y - end.y) < 0.001);
                    drawable.push({ pts, start, end, closed: sub.closed, looksClosed });
                }

                // A FILLED <path> with several subpaths is one shape, not several.
                // Every diode's triangle is an outer and an inner contour wound in
                // opposite directions, which the fill rule turns into a hollow ring
                // (diode.asy draws that triangle with plain LINEs). Filling each
                // subpath on its own floods the middle solid and buries anything
                // underneath - which is how the coloured Boca Jrs diodes came out
                // black. Strokes still get one call each, so separate pen strokes
                // stay separate.
                const anyClosed = drawable.some((s) => s.looksClosed);
                const joinedMode = resolveDrawMode(fill, hasStroke, anyClosed, strokeDisabled);
                const joined = drawable.length > 1 && typeof doc.moveTo === 'function' &&
                    (joinedMode === 'F-only' || joinedMode === 'FD-stroke');

                if (joined) {
                    for (const s of drawable) {
                        doc.moveTo(s.start.x, s.start.y);
                        for (let j = 1; j < s.pts.length; j++) doc.lineTo(s.pts[j].x, s.pts[j].y);
                        doc.close();
                    }
                    const eo = fillRule === 'evenodd';
                    if (joinedMode === 'FD-stroke') {
                        if (eo) doc.fillStrokeEvenOdd(); else doc.fillStroke();
                    } else if (eo) {
                        doc.fillEvenOdd();
                    } else {
                        doc.fill();
                    }
                } else {
                    // One draw call per subpath, so separate strokes stay separate.
                    for (const sub of drawable) {
                        const pts = sub.pts;
                        const start = sub.start;
                        const end = sub.end;

                        const mode = resolveDrawMode(fill, hasStroke, sub.looksClosed, strokeDisabled);
                        if (mode === 'skip') continue;
                        const lStyle = mode === 'FD-stroke' ? 'FD' : mode === 'F-only' ? 'F' : 'S';

                        const segments = [];
                        for (let j = 1; j < pts.length; j++) {
                            segments.push([pts[j].x - pts[j - 1].x, pts[j].y - pts[j - 1].y]);
                        }
                        // Close the subpath for filled shapes
                        if (sub.closed) {
                            segments.push([start.x - end.x, start.y - end.y]);
                        }
                        doc.lines(segments, start.x, start.y, [1, 1], lStyle, sub.closed);
                    }
                }
            }
        }
    }

    // ── <text> pass ────────────────────────────────────────────────────────
    // The element scan above only handles shapes, so SVG text used to vanish
    // from the PDF entirely. Drawn after the shapes (painter's model: labels on
    // top), which is also where a schematic wants them.
    for (const m of svgText.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
        const attrs = m[1];
        // Flatten any <tspan> wrappers and collapse whitespace.
        const content = m[2]
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!content) continue;

        const attr = (name) => {
            const hit = attrs.match(new RegExp('\\b' + name + '="([^"]*)"'));
            return hit ? hit[1] : null;
        };

        const tx = parseFloat(attr('x') ?? '0') || 0;
        const ty = parseFloat(attr('y') ?? '0') || 0;

        // font-size from the attribute, else from the element's CSS class.
        let fontPx = parseFloat(attr('font-size') ?? '');
        if (!Number.isFinite(fontPx)) {
            const cls = attr('class');
            fontPx = (cls && cssStyles[cls] && cssStyles[cls].fontSize) || 12;
        }

        // text-anchor maps onto the same keywords drawLTSpiceText understands.
        const anchorAttr = (attr('text-anchor') || 'start').toLowerCase();
        const align = anchorAttr === 'middle' ? 'Center'
                    : anchorAttr === 'end' ? 'Right'
                    : 'Left';

        const fillAttr = attr('fill');
        const rgb = fillAttr && fillAttr !== 'none' ? hexToRgb(fillAttr) : [0, 0, 0];
        doc.setTextColor(rgb[0], rgb[1], rgb[2]);

        // Lettering inside a skin is lettering on the symbol, so it obeys the
        // same rule as a .asy TEXT or a pin name: LTSpice never prints a label
        // upside down or mirrored. It turns the ANCHOR through the symbol's
        // orientation and then draws the glyphs either upright or rotated 90° —
        // which is precisely what transformAlignment + drawLTSpiceText do.
        // Spinning the glyphs by the raw symbol angle (what this did before) put
        // them on their head at R180: the "k" of a flipped pot, for one.
        //
        // SVG anchors text on its BASELINE while drawLTSpiceText anchors on the
        // vertical centre of the cell, so shift by (H/2 − A) = 0.3em first, in
        // LOCAL space — before the rotation, so the shift turns with the symbol.
        const p = transformPoint(tx, ty - fontPx * 0.3);
        drawLTSpiceText(doc, content, p.x, p.y, transformAlignment(align, orientation), fontPx);
    }
}

function findIncomingWireDirection(x, y, wires) {
    const incoming = new Set();
    for (const w of wires) {
        if (w.x1 === x && w.y1 === y) {
            if (w.x2 < x) incoming.add('left');
            else if (w.x2 > x) incoming.add('right');
            else if (w.y2 < y) incoming.add('top');
            else if (w.y2 > y) incoming.add('bottom');
        }
        if (w.x2 === x && w.y2 === y) {
            if (w.x1 < x) incoming.add('left');
            else if (w.x1 > x) incoming.add('right');
            else if (w.y1 < y) incoming.add('top');
            else if (w.y1 > y) incoming.add('bottom');
        }
    }

    if (incoming.size <= 1) {
        return incoming.values().next().value || 'top';
    }

    // When 2 or more wires are present, place the flag away from the incoming wires.
    // Empty space priority: Top space -> Bottom space -> Left space -> Right space.
    // (Note: To place text at Top space, we act as if the wire came from 'bottom')
    if (!incoming.has('top')) return 'bottom';
    if (!incoming.has('bottom')) return 'top';
    if (!incoming.has('left')) return 'right';
    return 'left';
}

// Normalizes a PIN alignment keyword to the canonical mixed-case form used by
// drawLTSpiceText, and returns the offset direction vector for that alignment.
// The pin alignment is used as-is — no semantic translation is applied.
//
// Offset direction (away from anchor, in world space):
//   Left   → +x,  Right  → -x,  Top    → +y,  Bottom → -y
//   VLeft  → +x,  VRight → -x,  VTop   → +y,  VBottom→ -y
function pinAlignmentToTextAlignment(pinAlign) {
    switch (pinAlign.toUpperCase()) {
        case 'LEFT':    return { textAlign: 'Left',    dx:  1, dy:  0 };
        case 'RIGHT':   return { textAlign: 'Right',   dx: -1, dy:  0 };
        case 'TOP':     return { textAlign: 'Top',     dx:  0, dy:  1 };
        case 'BOTTOM':  return { textAlign: 'Bottom',  dx:  0, dy: -1 };
        case 'VLEFT':   return { textAlign: 'VLeft',   dx:  0, dy: -1 };
        case 'VRIGHT':  return { textAlign: 'VRight',  dx:  0, dy:  1 };
        case 'VTOP':    return { textAlign: 'VTop',    dx:  1, dy:  0 };
        case 'VBOTTOM': return { textAlign: 'VBottom', dx: -1, dy:  0 };
        default:        return { textAlign: 'Left',    dx:  0, dy:  0 };
    }
}

// Records what the LaTeX reader could not make sense of, against the label it
// came from. Without this the reader's complaints went nowhere and a mistyped
// command just produced quiet nonsense in the middle of a schematic.
function noteLatexWarnings(doc, text, warnings) {
    if (!warnings || warnings.length === 0) return;
    if (!doc.__ltWarnings) doc.__ltWarnings = [];
    const label = String(text).length > 40 ? String(text).slice(0, 37) + '...' : String(text);
    for (const w of warnings) doc.__ltWarnings.push(`${w} — en "${label}"`);
}

// `mode` decides whether the label may carry LaTeX:
//   'literal' — never (pin names, .asy artwork). The default, so every existing
//               caller and every test keeps the exact behaviour it had.
//   'dollar'  — only the spans between $...$
//   'all'     — the whole label
function drawLTSpiceText(doc, text, x, y, alignment, ptSize, mode = 'literal') {
    if (!text) return;
    doc.setFontSize(ptSize);

    // LTSpice (Windows GDI) bases vertical placement on standard font metrics.
    // We approximate standard vector proportions used by LTSpice:
    const H = ptSize;        // Full cell height
    const A = ptSize * 0.8;  // Ascent (Baseline offset from top)
    const isVertical = alignment.startsWith('V');
    const baseAlign = isVertical ? alignment.substring(1) : alignment;

    // 1a. The BASELINE, which never depends on the text width — only the
    // horizontal placement below does. That split is what lets a document able
    // to typeset for itself (the TikZ sink) take over the measuring: it gets an
    // exact anchor point and picks the matching TikZ anchor.
    let By;
    if (baseAlign === 'Left' || baseAlign === 'Right' || baseAlign === 'Center') {
        By = y - H / 2 + A;
    } else if (baseAlign === 'Top') {
        //By = y + A; // GDI places anchor at cell Top
        By = y + A + (H * 0.225); // Manual offset to match spice position relative to component
    } else if (baseAlign === 'Bottom') {
        //By = y; // GDI uses TA_BASELINE for Bottom, anchor explicitly at Baseline
        By = y - (H * 0.225); //Manually increased baseline to match spice placement.
    } else {
        By = y;
    }

    if (mode !== 'literal' && typeof doc.drawLatexLabel === 'function') {
        if (typeof parseLatexLabel === 'function') {
            noteLatexWarnings(doc, text, parseLatexLabel(text, mode).warnings);
        }
        // Rotating the baseline point about the anchor drops the width term, so
        // the point handed over is exact for every alignment.
        const px = isVertical ? x + (By - y) : x;
        const py = isVertical ? y : By;
        doc.drawLatexLabel(text, px, py, baseAlign, isVertical ? 90 : 0, ptSize, mode);
        return;
    }

    // Otherwise the label is laid out into a box before anything is drawn,
    // because the alignment below needs the COMPOSED width. Measuring the raw
    // string would misplace every Center/Right/vertical label the moment it
    // carries markup: "$V_{CC}$" is 9 characters and about 3 wide.
    const box = (mode !== 'literal' && typeof layoutLatexLabel === 'function')
        ? layoutLatexLabel(doc, text, ptSize, mode)
        : null;
    if (box) noteLatexWarnings(doc, text, box.warnings);

    const w = box ? box.width : doc.getTextWidth(text);

    // 1b. Horizontal placement: the left edge, given the width.
    let Lx;
    if (baseAlign === 'Right') Lx = x - w;
    else if (baseAlign === 'Center' || baseAlign === 'Top' || baseAlign === 'Bottom') Lx = x - w / 2;
    else Lx = x; // Left, and anything unrecognised

    if (isVertical) {
        // 2. Rotate the calculated baseline point 90 degrees CCW AROUND the anchor (x,y)
        // This is exactly what LTSpice's affine transformation matrix does for vertical text.
        const relX = Lx - x;
        const relY = By - y;

        // CCW 90 degree rotation matrix applied to relative coordinates
        const rotX = relY;
        const rotY = -relX;

        const pdfX = x + rotX;
        const pdfY = y + rotY;

        if (box) drawLatexBox(doc, box, pdfX, pdfY, 90);
        else doc.text(text, pdfX, pdfY, { angle: 90, align: 'left', baseline: 'alphabetic' });
    } else {
        if (box) drawLatexBox(doc, box, Lx, By, 0);
        else doc.text(text, Lx, By, { angle: 0, align: 'left', baseline: 'alphabetic' });
    }
}

// Utility to draw a small red square at a specific coordinate for debugging alignment
function drawDebugSquare(doc, x, y, color = [255, 0, 0]) {
    const oldDraw = doc.getDrawColor();
    const oldFill = doc.getFillColor();
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(x - 1, y - 1, 2, 2, 'F');
    doc.setDrawColor(oldDraw);
    doc.setFillColor(oldFill);
}

// Utility to generate path segments for an LTSpice ARC (defined by bounding box + start/end coordinates)
function drawPdfArc(doc, x1, y1, x2, y2, xs, ys, xe, ye, transformer = null) {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const rx = Math.abs(x2 - x1) / 2;
    const ry = Math.abs(y2 - y1) / 2;
    if (rx === 0 || ry === 0) return;

    // Angles for the start and end coordinates relative to the ellipse center
    let sa = Math.atan2(ys - cy, xs - cx);
    let ea = Math.atan2(ye - cy, xe - cx);

    // LTSpice (via Windows GDI) draws arcs visually Counter-Clockwise from start to end.
    // Because Y increases downwards on screen, a visually CCW rotation corresponds to a decreasing mathematical angle.
    let sweep = ea - sa;
    if (sweep > 0) sweep -= 2 * Math.PI;

    const segments = 32;
    const step = sweep / segments;
    const pts = [];
    for (let i = 0; i <= segments; i++) {
        const a = sa + i * step;
        let px = cx + rx * Math.cos(a);
        let py = cy + ry * Math.sin(a);
        if (transformer) {
            const tr = transformer(px, py);
            px = tr.x;
            py = tr.y;
        }
        pts.push({ x: px, y: py });
    }

    const lines = [];
    const startObj = pts[0];
    for (let i = 1; i < pts.length; i++) {
        lines.push([pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y]);
    }
    doc.lines(lines, startObj.x, startObj.y, [1, 1], 'S', false);
}


// Main Library export

// GND, flag and the junction dot are drawn AROUND the anchor rather than ending
// on it, and carry no PIN of their own. (0,0) is where the wire arrives.
const SKIN_ANCHOR_PIN = [[0, 0]];

/**
 * The skin SVG to draw for one placement.
 *
 * With the procedural TC2_Rough skin active, Default's artwork is redrawn
 * freehand by rough_pen.js right here, seeded from the placement so two
 * resistors on the same sheet are not identical copies, and cached so a repeat
 * of the same placement costs nothing.
 *
 * `pins` come from the .asy, which analyzer.js parses for every symbol whatever
 * the skin, so the freehand strokes still land exactly on the terminals the
 * wires meet. Any failure falls back to the clean artwork rather than dropping
 * the component.
 */
function skinSvgFor(assets, key, seed, pins) {
    const svgText = assets.svgStrings.get(key);
    if (!assets.rough || !svgText || typeof RoughPen === 'undefined') return svgText;

    if (!assets.roughCache) assets.roughCache = new Map();
    const cacheKey = key + '|' + seed;
    if (assets.roughCache.has(cacheKey)) return assets.roughCache.get(cacheKey);

    let out = svgText;
    try {
        // Forward the same pen the wires use, or an assets.roughOptions override
        // would thicken the wires and leave every symbol behind.
        const opt = roughOptionsFor(assets) || {};
        out = RoughPen.roughen(svgText,
            Object.assign({}, opt, { pins: pins || [], seed: seed })).svg;
    } catch (e) {
        console.warn(`[SKIN] could not redraw ${key} freehand:`, e && e.message);
    }
    assets.roughCache.set(cacheKey, out);
    return out;
}

// The pen settings a rough render uses. assets.roughOptions is an override hook
// for callers that want to tune without editing the module.
function roughOptionsFor(assets) {
    if (typeof RoughPen === 'undefined') return null;
    if (!assets.roughOptions) return RoughPen.DEFAULTS;
    const merged = {};
    for (const k in RoughPen.DEFAULTS) merged[k] = RoughPen.DEFAULTS[k];
    for (const k in assets.roughOptions) {
        if (assets.roughOptions[k] !== undefined) merged[k] = assets.roughOptions[k];
    }
    return merged;
}

/**
 * One wire, redrawn freehand, as the vertices of a polyline.
 *
 * BOTH ends are anchored, so they stay exactly where the .asc put them. That is
 * not cosmetic: junction dots, flag placement and every symbol pin are
 * positioned from the original wire coordinates, and all of them have to keep
 * meeting the line. The anchor taper also means a wire shorter than about twice
 * `lock` simply stays straight, which is right — nobody's hand wobbles over 8pt.
 *
 * Returns null if anything is unavailable, so the caller falls back to a
 * straight line rather than dropping the wire.
 */
function roughWirePoints(x1, y1, x2, y2, seed, opt) {
    if (!opt) return null;
    try {
        const rand = RoughPen.mulberry32(RoughPen.fnv1a(seed));
        const warp = RoughPen.makeWarp(rand, opt.warp, opt.warpPeriod);
        const ends = [[x1, y1], [x2, y2]];
        const taper = RoughPen.makeTaper(ends, opt.lock);
        const pts = RoughPen.penStroke(ends, rand, opt, warp, taper, false);
        return pts && pts.length > 1 ? pts : null;
    } catch (e) {
        console.warn('[SKIN] could not redraw a wire freehand:', e && e.message);
        return null;
    }
}

async function convertSceneToPdf(scene, assets, filename = 'Schematic', options = {}) {
    const optCanvasBasedOnRect = options.canvasBasedOnRectangle || false;

    // 'literal' | 'dollar' | 'all' — how the labels the user types are read.
    // Only reaches the fields written in the schematic; pin names and the .asy
    // artwork stay literal because they belong to the symbol, not the sheet.
    // Resolved up here because the bounds pass below already needs it.
    const labelMode = options.latexMode === 'all' ? 'all'
                    : options.latexMode === 'literal' ? 'literal'
                    : 'dollar';

    // Resolve each symbol's .asy (cached and deduplicated by type)
    if (typeof analyzeSceneSymbols === 'function') {
        await analyzeSceneSymbols(scene);
    }

    // 1. Calculate Bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const expand = (x, y) => {
        if (isNaN(x) || isNaN(y)) return;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    };

    // Approximate glyph box for a standalone TEXT, grown in the direction the
    // alignment makes the text run. doc.getTextWidth() is unavailable here (the
    // jsPDF document does not exist yet), so this uses the same pt sizes the
    // renderer will apply with a ~0.6em average advance.
    const BOUNDS_FONT_PT = { 0: 8, 1: 13, 2: 20, 3: 26, 4: 32, 5: 46, 6: 65, 7: 92 };
    const expandText = (t) => {
        if (isNaN(t.x) || isNaN(t.y)) return;
        const pt = BOUNDS_FONT_PT[t.fontSize] || 8;
        const w = (typeof latexVisualLength === 'function'
            ? latexVisualLength(t.content, labelMode)
            : String(t.content || '').length) * pt * 0.6;
        const align = t.alignment || 'Left';
        const vertical = align.startsWith('V');
        const base = vertical ? align.slice(1) : align;

        expand(t.x, t.y);
        if (vertical) {
            // Vertical text reads bottom-to-top from the anchor.
            const up = base === 'Right' ? 0 : w;
            const down = base === 'Right' ? w : 0;
            expand(t.x - pt, t.y - (base === 'Center' ? w / 2 : up));
            expand(t.x + pt, t.y + (base === 'Center' ? w / 2 : down));
        } else {
            const right = base === 'Right' ? 0 : (base === 'Center' ? w / 2 : w);
            const left = base === 'Left' ? 0 : (base === 'Center' ? w / 2 : w);
            expand(t.x - left, t.y - pt);
            expand(t.x + right, t.y + pt);
        }
    };

    // A flag draws a GND/label glyph plus its text around the anchor.
    const FLAG_EXTENT = 40;
    const expandFlag = (f) => {
        if (isNaN(f.x) || isNaN(f.y)) return;
        expand(f.x - FLAG_EXTENT, f.y - FLAG_EXTENT);
        expand(f.x + FLAG_EXTENT, f.y + FLAG_EXTENT);
    };

    let largestRectIndex = -1;
    if (optCanvasBasedOnRect && scene.rectangles && scene.rectangles.length > 0) {
        let maxArea = -1;
        for (let i = 0; i < scene.rectangles.length; i++) {
            const r = scene.rectangles[i];
            if (isNaN(r.x1) || isNaN(r.y1) || isNaN(r.x2) || isNaN(r.y2)) continue;
            const area = Math.abs(r.x2 - r.x1) * Math.abs(r.y2 - r.y1);
            if (area > maxArea) { maxArea = area; largestRectIndex = i; }
        }
        if (largestRectIndex !== -1) {
            const r = scene.rectangles[largestRectIndex];
            minX = Math.min(r.x1, r.x2); maxX = Math.max(r.x1, r.x2);
            minY = Math.min(r.y1, r.y2); maxY = Math.max(r.y1, r.y2);
        }
    }

    // A symbol covers whatever its artwork covers, turned through its
    // orientation, plus the labels hanging off it. This used to be a flat
    // `sym.x..sym.x+100` box, which is wrong twice over: a symbol wider or
    // taller than 100 (the LF398 block is 256x224) spilled past the page, and
    // at R180/R270 the artwork grows UP and LEFT of the anchor while the box
    // still pointed down and right — so the box and the symbol barely
    // overlapped. Half a component ended up off the sheet.
    const expandSymbol = (sym) => {
        if (isNaN(sym.x) || isNaN(sym.y)) return;

        // Union of what the two draw paths can put on the page: the .asy
        // geometry and, when a skin is in play, its viewBox.
        const boxes = [symbolLocalBox(sym.asyData && sym.asyData.graphics)];
        if (assets.svgStrings) {
            boxes.push(svgViewBoxLocalBox(assets.svgStrings.get(symbolKey(sym.type))));
        }
        const known = boxes.filter(Boolean);
        // Nothing resolved (no .asy, no skin): keep a box, but a symmetric one —
        // without knowing the artwork, the anchor is as likely to sit at its
        // centre as at a corner.
        const local = known.length
            ? {
                x0: Math.min(...known.map(b => b.x0)), y0: Math.min(...known.map(b => b.y0)),
                x1: Math.max(...known.map(b => b.x1)), y1: Math.max(...known.map(b => b.y1)),
            }
            : { x0: -100, y0: -100, x1: 100, y1: 100 };

        for (const [lx, ly] of [[local.x0, local.y0], [local.x1, local.y0],
                                [local.x1, local.y1], [local.x0, local.y1]]) {
            const p = transformOffset(lx, ly, sym.orientation);
            expand(sym.x + p.x, sym.y + p.y);
        }

        // The labels. Same resolution the draw loop uses, measured with the
        // same approximation as a standalone TEXT.
        for (const [idx, win] of resolveEffectiveWindows(sym, options.overrideAnchors)) {
            if (win.isHidden) continue;
            const content = getWindowText(sym, idx);
            if (!content) continue;
            const rotated = transformOffset(win.ox, win.oy, sym.orientation);
            expandText({
                x: sym.x + rotated.x, y: sym.y + rotated.y, content: content,
                fontSize: win.fontSize,
                alignment: transformAlignment(win.align, sym.orientation),
            });
        }
    };

    if (minX === Infinity) {
        for (const w of scene.wires) { expand(w.x1, w.y1); expand(w.x2, w.y2); }
        for (const sym of scene.symbols) { expandSymbol(sym); }
        for (const r of scene.rectangles) { expand(r.x1, r.y1); expand(r.x2, r.y2); }
        for (const l of scene.lines) { expand(l.x1, l.y1); expand(l.x2, l.y2); }
        for (const c of scene.circles) { expand(c.x1, c.y1); expand(c.x2, c.y2); }
        for (const a of scene.arcs) { expand(a.x1, a.y1); expand(a.x2, a.y2); }

        // Standalone text and flags were excluded, so a SPICE directive or a net
        // label placed outside the component area got clipped off the page — and
        // a schematic made only of directives/labels fell through to `return null`.
        for (const t of scene.texts) { expandText(t); }
        for (const f of scene.flags) { expandFlag(f); }

        if (minX === Infinity) return null; // empty scene
        const MARGIN = 100;
        minX -= MARGIN; minY -= MARGIN; maxX += MARGIN; maxY += MARGIN;
    }

    const width = maxX - minX;
    const height = maxY - minY;

    // 2. Initialize jsPDF
    if (!window.jspdf || !window.jspdf.jsPDF) {
        throw new Error('jsPDF failed to load — check your connection or the local vendored copy.');
    }
    // Every draw below goes through this one object, and it is touched through a
    // small, stable surface (line/rect/ellipse/lines/text/path + graphics state).
    // `options.docFactory` swaps in a different sink — that is how the TikZ
    // exporter reuses this whole renderer instead of duplicating it.
    const makeDoc = options.docFactory || ((spec) => new window.jspdf.jsPDF({
        orientation: spec.width > spec.height ? 'l' : 'p',
        unit: 'pt',
        format: [spec.width, spec.height],
        putOnlyUsedFonts: false // Disable subsetting where possible to ensure full font embedding
    }));
    const doc = makeDoc({ width, height, filename, assets, options });
    doc.setProperties({ title: filename });

    // 3. Register Font (if passed through assets)
    if (assets.fontBase64) {
        // Embed the full font name and match PostScript Name to ensure Illustrator compatibility
        // Using "LMRoman10-Regular" to match the system's font metadata requirements
        doc.addFileToVFS('lmroman10.ttf', assets.fontBase64);
        doc.addFont('lmroman10.ttf', 'LMRoman10-Regular', 'normal');
        doc.setFont('LMRoman10-Regular', 'normal'); // Required second parameter
    }

    // The maths face, for the glyphs lmroman10 genuinely lacks — every lowercase
    // Greek letter, and the relations and big operators. Built by
    // tools/build_math_font.js. Optional: without it those commands fall back to
    // showing their own name rather than an empty box.
    if (assets.mathFontBase64) {
        doc.addFileToVFS('lmmath.ttf', assets.mathFontBase64);
        doc.addFont('lmmath.ttf', 'LMMath', 'normal');
    }

    // Which face is which, carried on the document so the label layout can
    // switch between them without any module-level state going stale.
    doc.__ltFonts = {
        text: assets.fontBase64 ? 'LMRoman10-Regular' : null,
        math: assets.mathFontBase64 ? 'LMMath' : null,
    };

    // Set line width defaults
    doc.setLineWidth(2);
    doc.setDrawColor(0, 0, 0); // Black (was LTSpice Blue)
    doc.setLineCap(1);         // Round cap
    doc.setLineJoin(1);        // Round join

    // 4. Draw Geometries
    for (let i = 0; i < scene.rectangles.length; i++) {
        // Only skip the bounding rectangle if we are explicitly using it as the canvas
        if (optCanvasBasedOnRect && i === largestRectIndex) continue;
        const r = scene.rectangles[i];
        applyPdfLineStyle(doc, r.style);

        const rx = Math.min(r.x1, r.x2) - minX;
        const ry = Math.min(r.y1, r.y2) - minY;
        const rw = Math.abs(r.x2 - r.x1);
        const rh = Math.abs(r.y2 - r.y1);

        if (isNaN(rx) || isNaN(ry) || isNaN(rw) || isNaN(rh)) {
            console.error('[PDF_RENDERER] Invalid rect geometry detected:', r, { rx, ry, rw, rh, minX, minY });
            continue;
        }

        doc.rect(rx, ry, rw, rh, 'S');
    }

    for (const l of scene.lines) {
        if (isNaN(l.x1) || isNaN(l.y1) || isNaN(l.x2) || isNaN(l.y2)) continue;
        applyPdfLineStyle(doc, l.style);
        doc.line(l.x1 - minX, l.y1 - minY, l.x2 - minX, l.y2 - minY);
    }

    for (const c of scene.circles) {
        if (isNaN(c.x1) || isNaN(c.y1) || isNaN(c.x2) || isNaN(c.y2)) continue;
        applyPdfLineStyle(doc, c.style);
        const cx = (c.x1 + c.x2) / 2 - minX;
        const cy = (c.y1 + c.y2) / 2 - minY;
        const rRadius = Math.abs(c.x2 - c.x1) / 2;
        doc.ellipse(cx, cy, rRadius, rRadius, 'S');
    }

    for (const a of scene.arcs) {
        if (isNaN(a.x1) || isNaN(a.y1) || isNaN(a.x2) || isNaN(a.y2)) continue;
        applyPdfLineStyle(doc, a.style);
        drawPdfArc(doc, a.x1, a.y1, a.x2, a.y2, a.xs, a.ys, a.xe, a.ye, (px, py) => {
            return { x: px - minX, y: py - minY };
        });
    }

    // 4.5 Draw Wires and Intersections
    doc.setLineDashPattern([], 0); // Reset dash style
    doc.setLineWidth(1.5);
    doc.setDrawColor(0, 0, 0); // Black (was #000080)

    const wirePointsCount = new Map();

    // Only the procedural rough skin redraws wires; every other skin, and None,
    // takes the straight-line path below exactly as before.
    const wireOpt = assets.rough ? roughOptionsFor(assets) : null;

    // One pen draws the whole sheet, wires included, so penWidth has to reach
    // here too — the symbols already honour it and a wire at a different weight
    // gives the hand away. Restored below so nothing downstream inherits it.
    if (wireOpt && wireOpt.penWidth > 0) doc.setLineWidth(wireOpt.penWidth);

    for (const w of scene.wires) {
        if (isNaN(w.x1) || isNaN(w.y1) || isNaN(w.x2) || isNaN(w.y2)) continue;

        const rough = wireOpt && roughWirePoints(
            w.x1 - minX, w.y1 - minY, w.x2 - minX, w.y2 - minY,
            `wire|${w.x1},${w.y1}|${w.x2},${w.y2}`, wireOpt);

        if (rough) {
            const segments = [];
            for (let i = 1; i < rough.length; i++) {
                segments.push([rough[i][0] - rough[i - 1][0], rough[i][1] - rough[i - 1][1]]);
            }
            doc.lines(segments, rough[0][0], rough[0][1], [1, 1], 'S', false);
        } else {
            doc.line(w.x1 - minX, w.y1 - minY, w.x2 - minX, w.y2 - minY);
        }

        const p1 = `${w.x1},${w.y1}`;
        const p2 = `${w.x2},${w.y2}`;
        wirePointsCount.set(p1, (wirePointsCount.get(p1) || 0) + 1);
        wirePointsCount.set(p2, (wirePointsCount.get(p2) || 0) + 1);
    }

    if (wireOpt && wireOpt.penWidth > 0) doc.setLineWidth(1.5);

    // Draw an intersection dot for any coordinate shared by >= 3 wire endpoints
    if (assets.svgStrings && assets.svgStrings.has('intersection')) {
        const intersectionSvg = assets.svgStrings.get('intersection');
        for (const [key, count] of wirePointsCount.entries()) {
            if (count >= 3) {
                const [xStr, yStr] = key.split(',');
                const x = parseFloat(xStr);
                const y = parseFloat(yStr);
                drawSvgToPdf(doc, skinSvgFor(assets, 'intersection', `${x},${y}`, SKIN_ANCHOR_PIN),
                    x, y, 'R0', minX, minY);
            }
        }
    } else {
        // Fallback natively drawn square if the SVG is explicitly missing
        doc.setFillColor(0, 0, 0);
        for (const [key, count] of wirePointsCount.entries()) {
            if (count >= 3) {
                const [xStr, yStr] = key.split(',');
                const x = parseFloat(xStr) - minX;
                const y = parseFloat(yStr) - minY;
                // 8pt diameter -> radius 4pt
                doc.ellipse(x, y, 4, 4, 'F');
            }
        }
    }

    // 5. Draw Symbols & SVGs
    doc.setLineDashPattern([], 0); // Reset dash style
    for (const sym of scene.symbols) {
        doc.setLineDashPattern([], 0); // Reset for each symbol to prevent state leakage
        const key = symbolKey(sym.type);

        // Build the ASY-space → PDF-space transform for this symbol.
        // Used for both ASY-fallback body drawing AND pin label rendering.
        const symIsMirrored = sym.orientation.startsWith('M');
        const symRotPart = symIsMirrored ? 'R' + sym.orientation.slice(1) : sym.orientation;
        let symAngleRad = 0;
        if (symRotPart === 'R90') symAngleRad = Math.PI / 2;
        else if (symRotPart === 'R180') symAngleRad = Math.PI;
        else if (symRotPart === 'R270') symAngleRad = -Math.PI / 2;
        const symBaseTx = sym.x - minX;
        const symBaseTy = sym.y - minY;
        const transformAsyPoint = (px, py) => {
            const cosA = Math.cos(symAngleRad), sinA = Math.sin(symAngleRad);
            let rx = px * cosA - py * sinA;
            let ry = px * sinA + py * cosA;
            if (symIsMirrored) rx = -rx;
            return { x: symBaseTx + rx, y: symBaseTy + ry };
        };

        // Draw the body (via SVG String Native Parser or ASY geometry)
        if (assets.svgStrings && assets.svgStrings.has(key)) {
            const pins = (sym.asyData && sym.asyData.graphics && sym.asyData.graphics.pins)
                ? sym.asyData.graphics.pins.map(p => [p.x, p.y]) : [];
            const svgText = skinSvgFor(assets, key, `${key}|${sym.x}|${sym.y}`, pins);
            drawSvgToPdf(doc, svgText, sym.x, sym.y, sym.orientation, minX, minY);
        } else if (sym.asyData && sym.asyData.graphics) {
            // Natively draw fallback ASY components using jsPDF
            const g = sym.asyData.graphics;
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(1.5);
            doc.setLineCap(1);
            doc.setLineJoin(1);


            for (const r of g.rectangles) {
                applyPdfLineStyle(doc, r.style);
                const p1 = transformAsyPoint(r.x1, r.y1);
                const p2 = transformAsyPoint(r.x2, r.y1);
                const p3 = transformAsyPoint(r.x2, r.y2);
                const p4 = transformAsyPoint(r.x1, r.y2);
                doc.lines([[p2.x - p1.x, p2.y - p1.y], [p3.x - p2.x, p3.y - p2.y], [p4.x - p3.x, p4.y - p3.y], [p1.x - p4.x, p1.y - p4.y]], p1.x, p1.y, [1, 1]);
            }
            for (const l of g.lines) {
                applyPdfLineStyle(doc, l.style);
                const p1 = transformAsyPoint(l.x1, l.y1);
                const p2 = transformAsyPoint(l.x2, l.y2);
                doc.line(p1.x, p1.y, p2.x, p2.y);
            }
            for (const c of g.circles) {
                applyPdfLineStyle(doc, c.style);
                const cx = (c.x1 + c.x2) / 2, cy = (c.y1 + c.y2) / 2;
                const rRadius = Math.abs(c.x2 - c.x1) / 2;
                const cp = transformAsyPoint(cx, cy);
                doc.ellipse(cp.x, cp.y, rRadius, rRadius);
            }
            for (const a of g.arcs) {
                applyPdfLineStyle(doc, a.style);
                drawPdfArc(doc, a.x1, a.y1, a.x2, a.y2, a.xs, a.ys, a.xe, a.ye, transformAsyPoint);
            }
            for (const t of g.texts) {
                doc.setTextColor(0, 0, 0);
                const FONT_SIZE_MAP = { 0: 8, 1: 13, 2: 20, 3: 26, 4: 32, 5: 46, 6: 65, 7: 92 };
                const ptSize = FONT_SIZE_MAP[t.fontSize] || 8;
                const finalAlign = transformAlignment(t.align, sym.orientation);
                const p = transformAsyPoint(t.x, t.y);
                if (options.showTextAnchors) drawDebugSquare(doc, p.x, p.y);
                drawLTSpiceText(doc, t.content, p.x, p.y, finalAlign, ptSize);
            }


        }

        // ── PIN Labels (always rendered, regardless of SVG or ASY body) ──────
        if (sym.asyData && sym.asyData.graphics && sym.asyData.graphics.pins) {
            for (const pin of sym.asyData.graphics.pins) {
                if (!pin.attrs.PinName) continue;
                if (pin.align.toUpperCase() === 'NONE') continue;

                doc.setTextColor(0, 0, 0);
                const PIN_PT_SIZE = 19.5; // size 1.5 → 1.5 * 13pt

                // Convert pin wire-direction alignment → general text alignment + offset direction
                const { textAlign, dx, dy } = pinAlignmentToTextAlignment(pin.align);

                // Apply component orientation to both the pin position and the text alignment
                const p = transformAsyPoint(pin.x, pin.y);
                const finalAlign = transformAlignment(textAlign, sym.orientation);

                // dx/dy are in local (ASY) space — rotate them through the component orientation.
                const offsetVec = transformOffset(dx * pin.offset * 3, dy * pin.offset * 3, sym.orientation);
                const tx = p.x + offsetVec.x;
                const ty = p.y + offsetVec.y;

                if (options.showTextAnchors) drawDebugSquare(doc, tx, ty);
                drawLTSpiceText(doc, pin.attrs.PinName, tx, ty, finalAlign, PIN_PT_SIZE);
            }
        }

        // ── Window (text label) Resolution ─────────────────────────────────
        //
        // Priority rules (per the ASC format spec):
        //
        //   WHAT to render:    Determined by the ASY file. Every WINDOW index
        //                      declared in the .asy is a candidate, plus any
        //                      extra indexes added explicitly in the .asc.
        //
        //   WHERE to render:   Three-layer priority stack:
        //
        //     If "Override Text Anchors" (overrideAnchors) is ON and the
        //     component has an entry in component_defaults.js:
        //       → Use ONLY the component_defaults.js coordinates. ASY and
        //         ASC coordinates are ignored for that component.
        //
        //     Otherwise (normal mode):
        //       Layer 1 (lowest priority): ASY file WINDOW coordinates
        //       Layer 2 (mid priority):    ASC file explicit WINDOW lines
        //       (component_defaults.js is NOT used in normal mode)
        //
        // An index is only rendered if it has a non-empty text value to show.

        // --- Step 1 & 2: Resolve which windows to render and where ---
        //
        // A window is ONLY rendered if its position is explicitly defined in one of:
        //   - The ASY file's WINDOW declarations
        //   - The ASC file's explicit WINDOW lines
        //   - component_defaults.js (override mode only)
        //
        // Merely having a SYMATTR (e.g. InstName) is NOT sufficient — the component
        // must also declare a WINDOW position for that index.

        // (The resolution itself lives in resolveEffectiveWindows, because the
        // bounds pass has to reach exactly the same answer to size the page.)
        const effectiveWindows = resolveEffectiveWindows(sym, options.overrideAnchors);

        // --- Step 4: Render each window that has a non-empty text value ---
        for (const [idx, win] of effectiveWindows.entries()) {
            if (win.isHidden) continue; // Skip permanently hidden windows
            const text = getWindowText(sym, idx);
            if (!text) continue; // Skip indexes with no value to display

            const FONT_SIZE_MAP = { 0: 8, 1: 13, 2: 20, 3: 26, 4: 32, 5: 46, 6: 65, 7: 92 };
            const ptSize = FONT_SIZE_MAP[win.fontSize] || 13;

            const rotated = transformOffset(win.ox, win.oy, sym.orientation);
            const wx = sym.x + rotated.x - minX;
            const wy = sym.y + rotated.y - minY;
            const finalAlign = transformAlignment(win.align, sym.orientation);

            if (options.showTextAnchors) {
                drawDebugSquare(doc, wx, wy);
            }
            doc.setTextColor(0, 0, 0);

            drawLTSpiceText(doc, text, wx, wy, finalAlign, ptSize, labelMode);
        }
    }

    // 6. Draw Standalone Texts
    doc.setLineDashPattern([], 0); // Reset dash style
    doc.setTextColor(0, 0, 0);
    for (const t of scene.texts) {
        const FONT_SIZE_MAP = { 0: 8, 1: 13, 2: 20, 3: 26, 4: 32, 5: 46, 6: 65, 7: 92 };
        const ptSize = FONT_SIZE_MAP[t.fontSize] || 8;

        let tx = t.x - minX;
        let ty = t.y - minY;

        if (options.showTextAnchors) {
            drawDebugSquare(doc, tx, ty);
        }

        drawLTSpiceText(doc, t.content, tx, ty, t.alignment, ptSize, labelMode);
    }

    // 7. Draw Flags
    doc.setDrawColor(0, 0, 0);
    for (const flag of scene.flags) {
        const isGround = flag.name === '0';
        const type = isGround ? 'GND' : 'flag';
        const dir = findIncomingWireDirection(flag.x, flag.y, scene.wires);

        // svgStrings is keyed lower-case (see prepareAssets), so normalise here too.
        const typeKey = type.toLowerCase();
        if (assets.svgStrings && assets.svgStrings.has(typeKey)) {
            let flagOrientation = 'R0';
            if (isGround) {
                if (dir === 'right') flagOrientation = 'R90';
                if (dir === 'bottom') flagOrientation = 'R180';
                if (dir === 'left') flagOrientation = 'R270';
            }
            drawSvgToPdf(doc,
                skinSvgFor(assets, typeKey, `${typeKey}|${flag.x}|${flag.y}`, SKIN_ANCHOR_PIN),
                flag.x, flag.y, flagOrientation, minX, minY);

            if (!isGround) {
                doc.setTextColor(0, 0, 0); // Black
                doc.setFontSize(20); // Size 2 default mapping

                let align = 'Top';
                let ox = 0, oy = 0;
                if (dir === 'top') { align = 'Top'; oy = 8; }
                else if (dir === 'bottom') { align = 'Bottom'; oy = -8; }
                else if (dir === 'left') { align = 'Left'; ox = 8; }
                else if (dir === 'right') { align = 'Right'; ox = -8; }

                const finalX = flag.x - minX + ox;
                const finalY = flag.y - minY + oy;

                if (options.showTextAnchors) drawDebugSquare(doc, finalX, finalY);
                drawLTSpiceText(doc, flag.name, finalX, finalY, align, 20, labelMode);
            }
        } else {
            // Native fallback for ASY/None skin
            const fx = flag.x - minX;
            const fy = flag.y - minY;
            doc.setLineWidth(1.5);

            if (isGround) {
                let fOr = 'R0';
                if (dir === 'right') fOr = 'R90';
                else if (dir === 'bottom') fOr = 'R180';
                else if (dir === 'left') fOr = 'R270';

                // LTSpice GND.asy exact coordinates
                const gndLines = [
                    [-16, 16, 16, 16],
                    [-16, 16, 0, 32],
                    [16, 16, 0, 32],
                    [0, 0, 0, 16]
                ];

                for (const l of gndLines) {
                    const pt1 = transformOffset(l[0], l[1], fOr);
                    const pt2 = transformOffset(l[2], l[3], fOr);
                    doc.line(fx + pt1.x, fy + pt1.y, fx + pt2.x, fy + pt2.y);
                }
            } else {
                // Draw named node native fallback (small cirsle + text)
                doc.setFillColor(255, 255, 255);
                doc.setDrawColor(0, 0, 0);
                doc.ellipse(fx, fy, 4, 4, 'FD');

                doc.setTextColor(0, 0, 0);
                doc.setFontSize(20); // Size 2 default mapping

                let align = 'Top';
                let ox = 0, oy = 0;
                if (dir === 'top') { align = 'Top'; oy = 8; }
                else if (dir === 'bottom') { align = 'Bottom'; oy = -8; }
                else if (dir === 'left') { align = 'Left'; ox = 8; }
                else if (dir === 'right') { align = 'Right'; ox = -8; }

                if (options.showTextAnchors) drawDebugSquare(doc, fx + ox, fy + oy);
                drawLTSpiceText(doc, flag.name, fx + ox, fy + oy, align, 13, labelMode);
            }
        }
    }

    // 8. Build output byte array
    // Surfaced through assets so the caller can show them: the UI prints them in
    // the sidebar console, and they are visible in devtools either way.
    const latexWarnings = [...new Set(doc.__ltWarnings || [])];
    assets.latexWarnings = latexWarnings;
    if (latexWarnings.length) {
        console.warn('[LATEX] ' + latexWarnings.length + ' aviso(s):\n  ' + latexWarnings.join('\n  '));
    }

    return doc.output('arraybuffer');
}

// NOTE: the public API is defined once, in engine/index.js (loaded after
// this file). A second assignment used to live here and was silently
// overwritten, taking its `defaults` key with it.
