// engine/tikz_renderer.js
//
// Exports the schematic as TikZ source instead of a PDF.
//
// It does NOT re-implement the renderer. convertSceneToPdf() owns everything
// that is hard — bounds, orientations, WINDOW placement, pin labels, flags, the
// SVG skin parser, the rough pen — and it touches its output document through a
// small, stable surface (line/rect/ellipse/lines/text, a path builder, and the
// graphics state). So this file supplies a different document: one that speaks
// TikZ. Every fix to the PDF path lands in the .tex for free, and the two cannot
// drift apart.
//
// Coordinate system: convertSceneToPdf has already subtracted minX/minY, so this
// sink receives page coordinates in PostScript points with the origin top-left
// and y growing DOWNWARD. Emitting (x, -y) into a picture with x=1bp,y=1bp puts
// the drawing back into the usual maths orientation, which is what makes
// rotations come out right: jsPDF's `angle` is counter-clockwise on screen, and
// so is TikZ's `rotate` once y is negated.
//
// The unit is bp, NOT pt — for every length, radius and font size. TeX's pt is
// 1/72.27in while a PDF point is 1/72in, so emitting pt compiles to a figure
// 0.374% smaller than the PDF export of the same schematic.

// Rounded to 3 decimals. Everything here sits between 0.001 and ~10000, so
// String() never reaches exponent notation (which TeX could not read).
function tikzNum(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '0';
    let v = Math.round(n * 1000) / 1000;
    if (Object.is(v, -0)) v = 0;
    return String(v);
}

// Characters LaTeX would otherwise read as markup, plus the handful of non-ASCII
// glyphs this pipeline actually produces — getWindowText appends "Ω" to every
// resistor value, and .asc files routinely carry µ, ° and ±.
const TEX_UNICODE = {
    'Ω': '\\textohm{}',            // GREEK CAPITAL LETTER OMEGA
    'Ω': '\\textohm{}',            // OHM SIGN
    'µ': '\\textmu{}',             // MICRO SIGN
    'μ': '\\textmu{}',             // GREEK SMALL LETTER MU
    '°': '\\textdegree{}',
    '±': '\\textpm{}',
    '×': '\\texttimes{}',
    '÷': '\\textdiv{}',
    '·': '\\textperiodcentered{}',
    '–': '\\textendash{}',
    '—': '\\textemdash{}',
    '≤': '\\ensuremath{\\leq}',
    '≥': '\\ensuremath{\\geq}',
    '≠': '\\ensuremath{\\neq}',
    '∞': '\\ensuremath{\\infty}',
};

function texEscape(str) {
    if (str === undefined || str === null) return '';
    let out = '';
    for (const ch of String(str)) {
        const mapped = TEX_UNICODE[ch];
        if (mapped !== undefined) { out += mapped; continue; }
        switch (ch) {
            case '\\': out += '\\textbackslash{}'; break;
            case '{':  out += '\\{'; break;
            case '}':  out += '\\}'; break;
            case '$':  out += '\\$'; break;
            case '&':  out += '\\&'; break;
            case '#':  out += '\\#'; break;
            case '_':  out += '\\_'; break;
            case '%':  out += '\\%'; break;
            case '^':  out += '\\textasciicircum{}'; break;
            case '~':  out += '\\textasciitilde{}'; break;
            // Neither survives inside a \node body.
            case '\n': case '\r': case '\t': out += ' '; break;
            default:   out += ch;
        }
    }
    return out;
}

// Declared once on the tikzpicture; anything matching is left off the individual
// paths, which keeps the file readable.
const TIKZ_DEFAULT_CAP = 1;   // round
const TIKZ_DEFAULT_JOIN = 1;  // round

/**
 * A drop-in replacement for the jsPDF document convertSceneToPdf draws into.
 *
 * `spec` is what the renderer's docFactory hands over:
 *   { width, height, filename, assets, options }
 */
function createTikzDoc(spec) {
    const width = spec.width;
    const height = spec.height;
    const filename = spec.filename || 'Schematic';
    const assets = spec.assets || {};

    const body = [];

    // Hidden jsPDF used ONLY to measure strings. drawLTSpiceText and drawSvgText
    // resolve Center/Right/vertical alignment with doc.getTextWidth(), so the
    // .tex only lands text where the PDF does if the widths come from the same
    // font metrics. The preamble loads lmodern, the same family as the embedded
    // lmroman10, so LaTeX then sets it at the same width.
    let meter = null;
    try {
        if (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) {
            meter = new window.jspdf.jsPDF({ unit: 'pt', format: [10, 10] });
        }
    } catch (e) {
        console.warn('[TIKZ] no jsPDF for text metrics, falling back to an estimate:', e && e.message);
    }

    const state = {
        lineWidth: 0.200025,   // jsPDF's own default
        drawColor: [0, 0, 0],
        fillColor: [0, 0, 0],
        textColor: [0, 0, 0],
        lineCap: 0,
        lineJoin: 0,
        dash: [],
        fontSize: 16,
    };

    const clamp255 = (n) => Math.max(0, Math.min(255, Math.round(Number(n) || 0)));

    const hexToRgbLocal = (hexStr) => {
        const s = String(hexStr).trim();
        if (s === 'white') return [255, 255, 255];
        if (s === 'black') return [0, 0, 0];
        let hex = s.replace('#', '');
        if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        if (hex.length === 6) {
            return [parseInt(hex.substring(0, 2), 16),
                    parseInt(hex.substring(2, 4), 16),
                    parseInt(hex.substring(4, 6), 16)];
        }
        return [0, 0, 0];
    };

    // Accepts every shape jsPDF's colour setters take, plus the array this
    // document's own getters hand back (drawDebugSquare saves and restores).
    const toColor = (a, b, c) => {
        if (Array.isArray(a)) return [clamp255(a[0]), clamp255(a[1]), clamp255(a[2])];
        if (typeof a === 'string') return hexToRgbLocal(a);
        if (b === undefined || b === null) { const g = clamp255(a); return [g, g, g]; }
        return [clamp255(a), clamp255(b), clamp255(c)];
    };

    const colorSpec = (rgb) => {
        if (rgb[0] === 0 && rgb[1] === 0 && rgb[2] === 0) return 'black';
        if (rgb[0] === 255 && rgb[1] === 255 && rgb[2] === 255) return 'white';
        return '{rgb,255:red,' + rgb[0] + ';green,' + rgb[1] + ';blue,' + rgb[2] + '}';
    };

    const CAP_NAMES = { 0: 'butt', 1: 'round', 2: 'rect' };
    const JOIN_NAMES = { 0: 'miter', 1: 'round', 2: 'bevel' };

    const dashOption = () => {
        const d = state.dash;
        if (!d || d.length === 0) return null;
        const parts = [];
        for (let i = 0; i < d.length; i += 2) {
            parts.push('on ' + tikzNum(d[i]) + 'bp');
            if (i + 1 < d.length) parts.push('off ' + tikzNum(d[i + 1]) + 'bp');
        }
        return 'dash pattern=' + parts.join(' ');
    };

    const strokeOpts = () => {
        const opts = ['draw=' + colorSpec(state.drawColor),
                      'line width=' + tikzNum(state.lineWidth) + 'bp'];
        const dash = dashOption();
        if (dash) opts.push(dash);
        if (state.lineCap !== TIKZ_DEFAULT_CAP) opts.push('line cap=' + (CAP_NAMES[state.lineCap] || 'butt'));
        if (state.lineJoin !== TIKZ_DEFAULT_JOIN) opts.push('line join=' + (JOIN_NAMES[state.lineJoin] || 'miter'));
        return opts;
    };

    // jsPDF style chars: 'S' stroke, 'F'/'f' fill, 'FD'/'DF' both.
    const modeFlags = (style) => {
        const s = String(style === undefined || style === null ? 'S' : style).toUpperCase();
        if (s === 'F') return { fill: true, stroke: false };
        if (s === 'FD' || s === 'DF') return { fill: true, stroke: true };
        return { fill: false, stroke: true };
    };

    const pt = (x, y) => '(' + tikzNum(x) + ',' + tikzNum(-y) + ')';

    const emit = (pathBody, style, evenOdd) => {
        const flags = modeFlags(style);
        const opts = [];
        if (flags.stroke) opts.push(...strokeOpts());
        if (flags.fill) {
            opts.push('fill=' + colorSpec(state.fillColor));
            if (evenOdd) opts.push('even odd rule');
        }
        body.push('  \\path[' + opts.join(', ') + '] ' + pathBody + ';');
    };

    // ── Path builder (moveTo / lineTo / close, then a fill or stroke operator) ─
    // Kept as ONE \path with several subpaths: a filled <path> with multiple
    // contours is a single shape, and splitting it would flood its holes.
    let subpaths = [];
    let current = null;

    const flushPath = (style, evenOdd) => {
        const chunks = [];
        for (const sub of subpaths) {
            if (sub.pts.length < 2) continue;
            let s = pt(sub.pts[0][0], sub.pts[0][1]);
            for (let i = 1; i < sub.pts.length; i++) s += ' -- ' + pt(sub.pts[i][0], sub.pts[i][1]);
            if (sub.closed) s += ' -- cycle';
            chunks.push(s);
        }
        subpaths = [];
        current = null;
        if (chunks.length === 0) return;
        emit(chunks.join(' '), style, evenOdd);
    };

    const doc = {
        // ── Graphics state ───────────────────────────────────────────────────
        setLineWidth(w) { state.lineWidth = Number(w) || 0; return doc; },
        setLineCap(c) { state.lineCap = Number(c) || 0; return doc; },
        setLineJoin(j) { state.lineJoin = Number(j) || 0; return doc; },
        setLineDashPattern(pattern) { state.dash = Array.isArray(pattern) ? pattern.slice() : []; return doc; },
        setDrawColor(a, b, c) { state.drawColor = toColor(a, b, c); return doc; },
        setFillColor(a, b, c) { state.fillColor = toColor(a, b, c); return doc; },
        setTextColor(a, b, c) { state.textColor = toColor(a, b, c); return doc; },
        getDrawColor() { return state.drawColor.slice(); },
        getFillColor() { return state.fillColor.slice(); },

        // ── Font plumbing: forwarded so getTextWidth measures the real font ──
        setFontSize(size) {
            state.fontSize = Number(size) || 0;
            if (meter) meter.setFontSize(state.fontSize);
            return doc;
        },
        setFont(name, style) {
            if (meter) { try { meter.setFont(name, style); } catch (e) { /* keep default metrics */ } }
            return doc;
        },
        addFont(file, name, style) {
            if (meter) { try { meter.addFont(file, name, style); } catch (e) { /* keep default metrics */ } }
            return doc;
        },
        addFileToVFS(file, data) {
            if (meter) { try { meter.addFileToVFS(file, data); } catch (e) { /* keep default metrics */ } }
            return doc;
        },
        setProperties() { return doc; },

        getTextWidth(text) {
            if (meter) return meter.getTextWidth(text);
            // The ~0.6em average advance the bounds pass uses when no document exists.
            return String(text || '').length * state.fontSize * 0.6;
        },

        // ── Primitives ───────────────────────────────────────────────────────
        line(x1, y1, x2, y2) {
            emit(pt(x1, y1) + ' -- ' + pt(x2, y2), 'S');
            return doc;
        },

        rect(x, y, w, h, style) {
            emit(pt(x, y) + ' rectangle ' + pt(x + w, y + h), style);
            return doc;
        },

        ellipse(cx, cy, rx, ry, style) {
            emit(pt(cx, cy) + ' ellipse[x radius=' + tikzNum(Math.abs(rx)) +
                 'bp, y radius=' + tikzNum(Math.abs(ry)) + 'bp]', style);
            return doc;
        },

        // jsPDF's `lines`: relative segments from (x, y), scaled by `scale`.
        // 2 numbers is a line delta, 6 is a relative cubic (both control points
        // then the endpoint). The renderer only ever emits the 2-form — arcs and
        // SVG curves are already flattened — but the 6-form is cheap to honour.
        lines(segments, x, y, scale, style, closed) {
            const sx = (scale && scale[0] !== undefined) ? scale[0] : 1;
            const sy = (scale && scale[1] !== undefined) ? scale[1] : 1;
            let cx = x, cy = y;
            let path = pt(cx, cy);
            let drew = false;
            for (const seg of (segments || [])) {
                if (!seg) continue;
                if (seg.length === 2) {
                    cx += seg[0] * sx; cy += seg[1] * sy;
                    path += ' -- ' + pt(cx, cy);
                    drew = true;
                } else if (seg.length === 6) {
                    const c1x = cx + seg[0] * sx, c1y = cy + seg[1] * sy;
                    const c2x = cx + seg[2] * sx, c2y = cy + seg[3] * sy;
                    cx += seg[4] * sx; cy += seg[5] * sy;
                    path += ' .. controls ' + pt(c1x, c1y) + ' and ' + pt(c2x, c2y) +
                            ' .. ' + pt(cx, cy);
                    drew = true;
                } else {
                    console.warn('[TIKZ] unsupported lines() segment of length ' + seg.length + ' - skipped.');
                }
            }
            if (!drew) return doc;
            if (closed) path += ' -- cycle';
            emit(path, style);
            return doc;
        },

        moveTo(x, y) { current = { pts: [[x, y]], closed: false }; subpaths.push(current); return doc; },
        lineTo(x, y) { if (current) current.pts.push([x, y]); return doc; },
        close() { if (current) current.closed = true; return doc; },
        stroke() { flushPath('S', false); return doc; },
        fill() { flushPath('F', false); return doc; },
        fillEvenOdd() { flushPath('F', true); return doc; },
        fillStroke() { flushPath('FD', false); return doc; },
        fillStrokeEvenOdd() { flushPath('FD', true); return doc; },

        text(str, x, y, opts) {
            const content = texEscape(str);
            if (!content) return doc;
            const o = opts || {};
            const angle = Number(o.angle) || 0;

            // align/baseline map straight onto a TikZ anchor. The renderer always
            // asks for left + alphabetic, having already resolved Center/Right by
            // shifting x with getTextWidth().
            const horiz = o.align === 'center' ? '' : o.align === 'right' ? ' east' : ' west';
            const vert = o.baseline === 'top' ? 'north'
                       : o.baseline === 'bottom' ? 'south'
                       : o.baseline === 'middle' ? 'mid'
                       : 'base';
            const anchor = (vert + horiz).trim() || 'base';

            const size = tikzNum(state.fontSize);
            const nodeOpts = ['anchor=' + anchor, 'inner sep=0pt', 'outer sep=0pt'];
            if (angle) nodeOpts.push('rotate=' + tikzNum(angle));
            const tc = colorSpec(state.textColor);
            if (tc !== 'black') nodeOpts.push('text=' + tc);
            nodeOpts.push('font=\\fontsize{' + size + 'bp}{' +
                          tikzNum(state.fontSize * 1.2) + 'bp}\\selectfont');

            body.push('  \\node[' + nodeOpts.join(', ') + '] at ' + pt(x, y) + ' {' + content + '};');
            return doc;
        },

        // ── Output ───────────────────────────────────────────────────────────
        // convertSceneToPdf ends with `return doc.output('arraybuffer')`; the
        // argument is meaningless here — the .tex source is the result.
        output() {
            const safeName = String(filename).replace(/[\r\n]+/g, ' ');
            const skin = assets.rough ? 'TC2_Rough'
                       : (assets.skinName ||
                          (assets.svgStrings && assets.svgStrings.size ? 'skin SVGs' : 'ASY geometry'));

            const head = [
                '% TikZ export of an LTSpice schematic — generated by LTSpice to PDF (ASC-Parser).',
                '% Source: ' + safeName + '.asc   Skin: ' + String(skin).replace(/[\r\n]+/g, ' '),
                '%',
                '% Compile on its own:   pdflatex "' + safeName + '.tex"',
                '% Or drop it into a document:',
                '%     \\usepackage{standalone}',
                '%     ...',
                '%     \\includestandalone{' + safeName + '}',
                '%',
                '% Lengths are in bp (PDF points), so this matches the PDF export 1:1.',
                '\\documentclass[border=0pt]{standalone}',
                '\\usepackage[T1]{fontenc}',
                '\\usepackage[utf8]{inputenc}',
                '\\usepackage{lmodern}',
                '\\usepackage{textcomp}',
                '\\usepackage{tikz}',
                '\\begin{document}',
                '\\begin{tikzpicture}[x=1bp, y=1bp, line cap=round, line join=round]',
                // Pins the figure to exactly the page the PDF export produces,
                // margins included, so both renderings crop identically.
                '  \\useasboundingbox ' + pt(0, 0) + ' rectangle ' + pt(width, height) + ';',
            ];
            const tail = [
                '\\end{tikzpicture}',
                '\\end{document}',
            ];
            return head.concat(body, tail).join('\n') + '\n';
        },
    };

    return doc;
}

/**
 * Renders `scene` to standalone TikZ source.
 *
 * Same signature and same contract as convertSceneToPdf — including returning
 * null for a scene with nothing drawable — because it IS convertSceneToPdf,
 * drawing into a different document.
 */
async function convertSceneToTikz(scene, assets, filename = 'Schematic', options = {}) {
    if (typeof convertSceneToPdf !== 'function') {
        throw new Error('Engine modules not loaded');
    }
    return await convertSceneToPdf(scene, assets, filename, {
        ...options,
        docFactory: (spec) => createTikzDoc(spec),
    });
}
