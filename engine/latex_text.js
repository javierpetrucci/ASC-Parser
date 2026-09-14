// engine/latex_text.js
//
// A small LaTeX typesetter for schematic labels: subscripts, superscripts,
// symbols, \frac and \sqrt. It exists so a label typed in LTSpice as
// "$V_{CC}$" or "$100\,\Omega$" comes out set, not printed verbatim.
//
// Two modes:
//   'dollar' (default) — only the spans between $...$ are LaTeX.
//   'all'              — the whole label is LaTeX (the UI checkbox).
//
// Everything is laid out into a box of absolutely-positioned draw items before
// anything is drawn. That is what lets drawLTSpiceText keep working: it needs
// the COMPOSED width up front to resolve Center/Right/vertical alignment, and
// measuring the raw string would be wrong the moment a label carries markup.
//
// Box coordinates: origin is the left edge ON the baseline, +y DOWN (the same
// screen convention as the rest of the renderer). `height` is the extent above
// the baseline and `depth` the extent below, both positive.

// ── Font roles ───────────────────────────────────────────────────────────────
// 'text' is the schematic font already embedded (lmroman10). 'math' is the
// subset of Latin Modern Math built by tools/build_math_font.js — it carries the
// glyphs lmroman10 genuinely does not have.
//
// This split is not a guess: the cmap of lmroman10-regular.ttf was read. It has
// the UPPERCASE Greek (upright, which is where TeX takes it from too) and lacks
// every lowercase one — exactly like the LaTeX text fonts, which is why $\Omega$
// is upright and $\omega$ is italic in a real document.
//
// `src` is where the glyph is pulled from in latinmodern-math.otf. Lowercase
// Greek is taken from the Mathematical Italic block (U+1D6FC…) because that is
// what TeX renders for \alpha…\omega, then re-mapped onto the plain BMP
// codepoint so no surrogate pair ever reaches jsPDF.
const LATEX_SYMBOLS = {
    // Lowercase Greek — math italic, remapped to BMP.
    '\\alpha':   { cp: 0x03B1, font: 'math', src: 0x1D6FC },
    '\\beta':    { cp: 0x03B2, font: 'math', src: 0x1D6FD },
    '\\gamma':   { cp: 0x03B3, font: 'math', src: 0x1D6FE },
    '\\delta':   { cp: 0x03B4, font: 'math', src: 0x1D6FF },
    '\\varepsilon': { cp: 0x03B5, font: 'math', src: 0x1D700 },
    '\\zeta':    { cp: 0x03B6, font: 'math', src: 0x1D701 },
    '\\eta':     { cp: 0x03B7, font: 'math', src: 0x1D702 },
    '\\theta':   { cp: 0x03B8, font: 'math', src: 0x1D703 },
    '\\iota':    { cp: 0x03B9, font: 'math', src: 0x1D704 },
    '\\kappa':   { cp: 0x03BA, font: 'math', src: 0x1D705 },
    '\\lambda':  { cp: 0x03BB, font: 'math', src: 0x1D706 },
    '\\mu':      { cp: 0x03BC, font: 'math', src: 0x1D707 },
    '\\nu':      { cp: 0x03BD, font: 'math', src: 0x1D708 },
    '\\xi':      { cp: 0x03BE, font: 'math', src: 0x1D709 },
    '\\pi':      { cp: 0x03C0, font: 'math', src: 0x1D70B },
    '\\rho':     { cp: 0x03C1, font: 'math', src: 0x1D70C },
    '\\sigma':   { cp: 0x03C3, font: 'math', src: 0x1D70E },
    '\\tau':     { cp: 0x03C4, font: 'math', src: 0x1D70F },
    '\\upsilon': { cp: 0x03C5, font: 'math', src: 0x1D710 },
    '\\varphi':  { cp: 0x03C6, font: 'math', src: 0x1D711 },
    '\\chi':     { cp: 0x03C7, font: 'math', src: 0x1D712 },
    '\\psi':     { cp: 0x03C8, font: 'math', src: 0x1D713 },
    '\\omega':   { cp: 0x03C9, font: 'math', src: 0x1D714 },
    // TeX's \epsilon and \phi are the "symbol" shapes; \var… are the plain ones.
    '\\epsilon': { cp: 0x03F5, font: 'math', src: 0x1D716 },
    '\\vartheta':{ cp: 0x03D1, font: 'math', src: 0x1D717 },
    '\\phi':     { cp: 0x03D5, font: 'math', src: 0x1D719 },
    '\\varrho':  { cp: 0x03F1, font: 'math', src: 0x1D71A },
    '\\varpi':   { cp: 0x03D6, font: 'math', src: 0x1D71B },

    // Uppercase Greek — upright, already in the schematic font.
    '\\Gamma':   { cp: 0x0393, font: 'text' },
    '\\Delta':   { cp: 0x0394, font: 'text' },
    '\\Theta':   { cp: 0x0398, font: 'text' },
    '\\Lambda':  { cp: 0x039B, font: 'text' },
    '\\Xi':      { cp: 0x039E, font: 'text' },
    '\\Pi':      { cp: 0x03A0, font: 'text' },
    '\\Sigma':   { cp: 0x03A3, font: 'text' },
    '\\Upsilon': { cp: 0x03A5, font: 'text' },
    '\\Phi':     { cp: 0x03A6, font: 'text' },
    '\\Psi':     { cp: 0x03A8, font: 'text' },
    '\\Omega':   { cp: 0x03A9, font: 'text' },

    // Operators and relations already present in the schematic font.
    '\\pm':      { cp: 0x00B1, font: 'text' },
    '\\times':   { cp: 0x00D7, font: 'text' },
    '\\div':     { cp: 0x00F7, font: 'text' },
    '\\cdot':    { cp: 0x00B7, font: 'text' },
    '\\degree':  { cp: 0x00B0, font: 'text' },
    '\\infty':   { cp: 0x221E, font: 'text' },
    '\\leftarrow':  { cp: 0x2190, font: 'text' },
    '\\rightarrow': { cp: 0x2192, font: 'text' },
    '\\uparrow':    { cp: 0x2191, font: 'text' },
    '\\downarrow':  { cp: 0x2193, font: 'text' },
    // The micro sign, for people who want an upright µ in "1 µF".
    '\\micro':   { cp: 0x00B5, font: 'text' },

    // Only in the math font.
    '\\leq':     { cp: 0x2264, font: 'math', src: 0x2264 },
    '\\geq':     { cp: 0x2265, font: 'math', src: 0x2265 },
    '\\neq':     { cp: 0x2260, font: 'math', src: 0x2260 },
    '\\approx':  { cp: 0x2248, font: 'math', src: 0x2248 },
    '\\ll':      { cp: 0x226A, font: 'math', src: 0x226A },
    '\\gg':      { cp: 0x226B, font: 'math', src: 0x226B },
    '\\propto':  { cp: 0x221D, font: 'math', src: 0x221D },
    '\\partial': { cp: 0x2202, font: 'math', src: 0x1D715 },
    '\\int':     { cp: 0x222B, font: 'math', src: 0x222B },
    '\\sum':     { cp: 0x2211, font: 'math', src: 0x2211 },
    '\\prod':    { cp: 0x220F, font: 'math', src: 0x220F },
    '\\mp':      { cp: 0x2213, font: 'math', src: 0x2213 },
    '\\cong':    { cp: 0x2245, font: 'math', src: 0x2245 },
    '\\angle':   { cp: 0x2220, font: 'math', src: 0x2220 },
    '\\parallel':{ cp: 0x2225, font: 'math', src: 0x2225 },
    '\\ldots':   { cp: 0x2026, font: 'math', src: 0x2026 },
};

// In maths a Latin letter is a variable, and TeX sets variables in math italic:
// that is why "$g_{m1}$" comes out slanted while the "1" stays upright. The
// glyphs live in Unicode's Mathematical Italic block and are remapped onto plain
// ASCII inside the subset, so a run of letters is simply drawn with the maths
// face.
function mathItalicCodepoint(ch) {
    const c = ch.codePointAt(0);
    if (c >= 0x41 && c <= 0x5A) return 0x1D434 + (c - 0x41); // A–Z
    // The italic small h is not in that block — Unicode had already assigned it
    // as PLANCK CONSTANT, leaving a hole at U+1D455.
    if (c === 0x68) return 0x210E;
    if (c >= 0x61 && c <= 0x7A) return 0x1D44E + (c - 0x61); // a–z
    return null;
}

// What the maths subset must carry for those letters, as { src, dst } pairs.
// Read by tools/build_math_font.js so the font cannot fall behind this file.
function mathItalicLetters() {
    const out = [];
    for (let c = 0x41; c <= 0x5A; c++) out.push({ cmd: String.fromCharCode(c), src: mathItalicCodepoint(String.fromCharCode(c)), dst: c });
    for (let c = 0x61; c <= 0x7A; c++) out.push({ cmd: String.fromCharCode(c), src: mathItalicCodepoint(String.fromCharCode(c)), dst: c });
    return out;
}

// Outline of a polyline stroked at a constant width PER SEGMENT, mitred at the
// joins. Returns one closed polygon, ready to fill.
//
// This is what the radical is built from. Its strokes do not taper — each is a
// plain constant-width bar — and everything that gives the surd its character
// happens where two of them meet: the sharp point at the bottom comes from the
// mitre on the outside of a very tight turn, and the corner under the overbar
// from the mitre against a horizontal segment.
//
// `widths[i]` applies to the segment pts[i] → pts[i+1].
function strokeOutline(pts, widths, miterLimit = 8) {
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
        const dx = pts[i + 1][0] - pts[i][0];
        const dy = pts[i + 1][1] - pts[i][1];
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        // Left-hand normal.
        segs.push({ ux, uy, nx: -uy, ny: ux, h: widths[i] / 2 });
    }
    if (segs.length === 0) return [];

    // Where the two offset lines through a joint cross.
    const meet = (p, a, b, sign) => {
        const a0x = p[0] + sign * a.nx * a.h, a0y = p[1] + sign * a.ny * a.h;
        const b0x = p[0] + sign * b.nx * b.h, b0y = p[1] + sign * b.ny * b.h;
        const den = a.ux * b.uy - a.uy * b.ux;
        // Near-parallel, or a mitre so long it would shoot off into a spike:
        // bevel it instead by keeping both offset points.
        if (Math.abs(den) < 1e-9) return [[a0x, a0y], [b0x, b0y]];
        const t = ((b0x - a0x) * b.uy - (b0y - a0y) * b.ux) / den;
        const mx = a0x + a.ux * t, my = a0y + a.uy * t;
        const reach = Math.hypot(mx - p[0], my - p[1]);
        if (reach > miterLimit * Math.max(a.h, b.h)) return [[a0x, a0y], [b0x, b0y]];
        return [[mx, my]];
    };

    const side = (sign) => {
        const out = [[pts[0][0] + sign * segs[0].nx * segs[0].h,
                      pts[0][1] + sign * segs[0].ny * segs[0].h]];
        for (let i = 1; i < segs.length; i++) out.push(...meet(pts[i], segs[i - 1], segs[i], sign));
        const last = segs[segs.length - 1];
        const end = pts[pts.length - 1];
        out.push([end[0] + sign * last.nx * last.h, end[1] + sign * last.ny * last.h]);
        return out;
    };

    return side(1).concat(side(-1).reverse());
}

// Splits a maths run into stretches of letters (set italic) and everything else
// (digits, operators and punctuation, which stay upright).
function splitMathRuns(s) {
    const runs = [];
    let buf = '';
    let letter = null;
    for (const ch of s) {
        const isLetter = /[A-Za-z]/.test(ch);
        if (letter === null || isLetter === letter) { buf += ch; letter = isLetter; continue; }
        runs.push({ s: buf, italic: letter });
        buf = ch;
        letter = isLetter;
    }
    if (buf) runs.push({ s: buf, italic: !!letter });
    return runs;
}

// Horizontal spacing commands, in em of the current size.
const LATEX_SPACES = {
    '\\,': 3 / 18,
    '\\:': 4 / 18,
    '\\;': 5 / 18,
    '\\!': -3 / 18,
    '\\ ': 6 / 18,
    '\\quad': 1,
    '\\qquad': 2,
};

// `\{` and friends: a backslash before one of these means the literal character.
const LATEX_ESCAPES = new Set(['{', '}', '$', '&', '#', '_', '%', '\\']);

// TeX-ish proportions, all in em of the size in force at that point.
const SCRIPT_RATIO = 0.7;     // one script level down
const MIN_SCRIPT_PT = 4;      // below this glyphs stop being legible
const AXIS = 0.25;            // maths axis above the baseline
const RULE_THICK = 0.055;     // fraction bar / radical bar
const SUP_SHIFT = 0.42;
const SUB_SHIFT = 0.20;

// ── Parsing ──────────────────────────────────────────────────────────────────

// Splits on unescaped `$`. Returns a list of { latex: bool, text } spans.
// An odd number of delimiters means the label is not really marked up, so the
// whole thing stays literal rather than half of it silently changing meaning.
function splitDollarSpans(str) {
    const spans = [];
    let buf = '';
    let inMath = false;
    let count = 0;
    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (ch === '\\' && i + 1 < str.length) { buf += ch + str[i + 1]; i++; continue; }
        if (ch === '$') {
            count++;
            spans.push({ latex: inMath, text: buf });
            buf = '';
            inMath = !inMath;
            continue;
        }
        buf += ch;
    }
    spans.push({ latex: inMath, text: buf });
    if (count % 2 !== 0) return null; // unbalanced — caller falls back to literal
    return spans.filter((s) => s.text.length > 0);
}

// Clears the maths flag through a subtree, for \text and \mathrm.
function markUpright(node) {
    if (!node) return node;
    if (node.t === 'text') return { t: 'text', s: node.s };
    if (node.t === 'group') return { t: 'group', kids: node.kids.map(markUpright) };
    return node;
}

// Tokenises and parses one LaTeX span into nodes.
function parseLatexSpan(src, warnings) {
    let i = 0;

    function parseGroup() {
        // Assumes src[i] === '{'
        i++;
        const kids = parseSeq('}');
        if (src[i] === '}') i++;
        else warnings.push('llave sin cerrar');
        return { t: 'group', kids };
    }

    // One "atom": what a script or a \frac argument binds to.
    function parseAtom() {
        const ch = src[i];
        if (ch === undefined) return null;
        if (ch === '{') return parseGroup();
        if (ch === '\\') return parseCommand();
        i++;
        return { t: 'text', s: ch, math: true };
    }

    function parseCommand() {
        i++; // the backslash
        const ch = src[i];
        if (ch === undefined) { warnings.push('barra suelta al final'); return { t: 'text', s: '\\' }; }

        if (LATEX_ESCAPES.has(ch)) { i++; return { t: 'text', s: ch }; }
        if (ch === ' ') { i++; return { t: 'space', em: LATEX_SPACES['\\ '] }; }
        if (LATEX_SPACES['\\' + ch] !== undefined) { i++; return { t: 'space', em: LATEX_SPACES['\\' + ch] }; }

        // \word
        let name = '';
        while (i < src.length && /[A-Za-z]/.test(src[i])) { name += src[i]; i++; }
        const cmd = '\\' + name;
        // TeX swallows the whitespace after a control word — without this,
        // "\mu F" sets as "µ F" instead of "µF".
        if (name) skipSpaces();

        if (LATEX_SPACES[cmd] !== undefined) return { t: 'space', em: LATEX_SPACES[cmd] };
        if (LATEX_SYMBOLS[cmd]) return { t: 'sym', cmd };
        if (cmd === '\\frac' || cmd === '\\dfrac' || cmd === '\\tfrac') {
            skipSpaces();
            const num = parseAtom();
            skipSpaces();
            const den = parseAtom();
            if (!num || !den) { warnings.push(cmd + ' sin sus dos argumentos'); return { t: 'text', s: cmd }; }
            return { t: 'frac', num, den };
        }
        if (cmd === '\\sqrt') {
            skipSpaces();
            const arg = parseAtom();
            if (!arg) { warnings.push('\\sqrt sin argumento'); return { t: 'text', s: cmd }; }
            return { t: 'sqrt', arg };
        }
        if (cmd === '\\text' || cmd === '\\mathrm' || cmd === '\\operatorname') {
            skipSpaces();
            const arg = parseAtom();
            // These commands exist precisely to opt out of the maths italic.
            return markUpright(arg) || { t: 'text', s: '' };
        }
        if (name === '') { i++; return { t: 'text', s: src[i - 1] }; } // \# style leftovers

        warnings.push('comando desconocido ' + cmd);
        return { t: 'text', s: cmd };
    }

    function skipSpaces() { while (src[i] === ' ') i++; }

    function parseSeq(stopChar) {
        const out = [];
        let run = '';
        // Everything born inside a maths span is maths: its letters are
        // variables and get set italic.
        const flush = () => { if (run) { out.push({ t: 'text', s: run, math: true }); run = ''; } };

        while (i < src.length) {
            const ch = src[i];
            if (stopChar && ch === stopChar) break;
            if (ch === '}' && !stopChar) { warnings.push('llave de cierre sobrante'); i++; continue; }

            if (ch === '\\') { flush(); out.push(parseCommand()); continue; }
            if (ch === '{') { flush(); out.push(parseGroup()); continue; }

            if (ch === '_' || ch === '^') {
                flush();
                i++;
                skipSpaces();
                const arg = parseAtom();
                if (!arg) { warnings.push('script sin argumento'); continue; }
                // Attach to the previous atom, creating the script node if needed.
                let base = out.pop() || null;
                if (base && base.t === 'text' && base.s.length > 1) {
                    // Only the last character takes the script, as in TeX.
                    out.push({ t: 'text', s: base.s.slice(0, -1), math: base.math });
                    base = { t: 'text', s: base.s.slice(-1), math: base.math };
                }
                if (base && base.t === 'script') {
                    if (ch === '_') base.sub = arg; else base.sup = arg;
                    out.push(base);
                } else {
                    out.push({ t: 'script', base, sub: ch === '_' ? arg : null, sup: ch === '^' ? arg : null });
                }
                continue;
            }

            run += ch;
            i++;
        }
        flush();
        return out;
    }

    return applyMathSpacing(parseSeq(null));
}

// Relations and binary operators get air around them in TeX — "$\tau = RC$" is
// not "τ=RC". Since a control word swallows the space after it, that spacing has
// to be put back here or "\tau = RC" would come out closed up.
const MATH_REL_CHARS = new Set(['=', '<', '>']);
const MATH_BIN_CHARS = new Set(['+']);
const REL_SPACE = 5 / 18;
const BIN_SPACE = 4 / 18;

function symbolSpacing(cmd) {
    const REL = new Set(['\\leq', '\\geq', '\\neq', '\\approx', '\\ll', '\\gg',
                         '\\propto', '\\cong', '\\parallel']);
    const BIN = new Set(['\\pm', '\\mp', '\\times', '\\div', '\\cdot']);
    if (REL.has(cmd)) return 'rel';
    if (BIN.has(cmd)) return 'bin';
    return null;
}

function applyMathSpacing(nodes) {
    // Pass 1 — pull the operators out of the text runs. Any literal space
    // touching an operator is dropped: the standard gap replaces it, so
    // "\tau = RC" and "\tau=RC" both come out spaced the same, and neither ends
    // up with the source space AND the inserted one.
    const flat = [];
    for (const node of nodes) {
        if (!node) continue;

        if (node.t === 'group') { flat.push({ t: 'group', kids: applyMathSpacing(node.kids) }); continue; }
        if (node.t === 'frac') { flat.push({ t: 'frac', num: wrapSpaced(node.num), den: wrapSpaced(node.den) }); continue; }
        if (node.t === 'sqrt') { flat.push({ t: 'sqrt', arg: wrapSpaced(node.arg) }); continue; }
        if (node.t === 'script') {
            flat.push({
                t: 'script',
                base: node.base ? wrapSpaced(node.base) : null,
                sub: node.sub ? wrapSpaced(node.sub) : null,
                sup: node.sup ? wrapSpaced(node.sup) : null,
            });
            continue;
        }
        if (node.t === 'sym') {
            const kind = symbolSpacing(node.cmd);
            if (kind) flat.push({ t: 'op', kind, node: { t: 'sym', cmd: node.cmd } });
            else flat.push(node);
            continue;
        }
        if (node.t === 'text') {
            let run = '';
            for (const ch of node.s) {
                const kind = MATH_REL_CHARS.has(ch) ? 'rel' : MATH_BIN_CHARS.has(ch) ? 'bin' : null;
                if (!kind) { run += ch; continue; }
                run = run.replace(/[ \t]+$/, '');
                if (run) { flat.push({ t: 'text', s: run, math: node.math }); run = ''; }
                flat.push({ t: 'op', kind, node: { t: 'text', s: ch } });
            }
            if (run) flat.push({ t: 'text', s: run, math: node.math });
            continue;
        }
        flat.push(node);
    }
    // Drop the space a source string left immediately after an operator.
    for (let i = 1; i < flat.length; i++) {
        if (flat[i - 1].t === 'op' && flat[i].t === 'text') {
            flat[i] = { t: 'text', s: flat[i].s.replace(/^[ \t]+/, ''), math: flat[i].math };
            if (!flat[i].s) { flat.splice(i, 1); i--; }
        }
    }

    // Pass 2 — insert the gaps, but never next to a space the author asked for.
    const out = [];
    for (let i = 0; i < flat.length; i++) {
        const item = flat[i];
        if (item.t !== 'op') { out.push(item); continue; }

        const gap = item.kind === 'rel' ? REL_SPACE : BIN_SPACE;
        const prev = out.length ? out[out.length - 1] : null;
        // A binary operator with nothing to its left is a sign, not an
        // operation: the minus in "-\frac{R_2}{R_1}" must not be padded.
        if (prev && prev.t !== 'space') out.push({ t: 'space', em: gap });
        out.push(item.node);
        const next = flat[i + 1];
        if (next && next.t !== 'space') out.push({ t: 'space', em: gap });
    }

    // Trailing padding at the very end would shift a Right-aligned label.
    while (out.length && out[out.length - 1].t === 'space') out.pop();
    return out;
}

// Applies the spacing rules inside a single-node argument.
function wrapSpaced(node) {
    if (!node) return node;
    if (node.t === 'group') return { t: 'group', kids: applyMathSpacing(node.kids) };
    const spaced = applyMathSpacing([node]);
    return spaced.length === 1 ? spaced[0] : { t: 'group', kids: spaced };
}

/**
 * Parses a label into nodes.
 * Returns { nodes, plain, warnings } — `plain` means "no markup at all", which
 * is the fast path the overwhelming majority of labels take.
 */
function parseLatexLabel(str, mode = 'dollar') {
    const text = String(str === undefined || str === null ? '' : str);
    const warnings = [];
    if (!text) return { nodes: [], plain: true, warnings };
    if (mode === 'literal') return { nodes: [{ t: 'text', s: text }], plain: true, warnings };

    if (mode === 'all') {
        // A user who types the $ anyway should still get what they meant, so the
        // delimiters are simply dropped here rather than treated as text.
        const stripped = text.replace(/(^|[^\\])\$/g, '$1');
        if (!/[\\_^{}]/.test(stripped)) return { nodes: [{ t: 'text', s: stripped }], plain: true, warnings };
        return { nodes: parseLatexSpan(stripped, warnings), plain: false, warnings };
    }

    if (text.indexOf('$') === -1) return { nodes: [{ t: 'text', s: text }], plain: true, warnings };

    const spans = splitDollarSpans(text);
    if (!spans) {
        warnings.push('$ sin cerrar — la etiqueta se deja literal');
        return { nodes: [{ t: 'text', s: text }], plain: true, warnings };
    }

    const nodes = [];
    for (const span of spans) {
        if (span.latex) nodes.push(...parseLatexSpan(span.text, warnings));
        else nodes.push({ t: 'text', s: span.text });
    }
    return { nodes, plain: false, warnings };
}

/**
 * Splits a label into literal and LaTeX spans, keeping the LaTeX ones as their
 * ORIGINAL source. For exporters that hand the markup to a real TeX instead of
 * typesetting it here — the .tex export wants `\frac{1}{2}`, not the boxes it
 * would have been broken into.
 */
function latexSpans(str, mode = 'literal') {
    const text = String(str === undefined || str === null ? '' : str);
    if (!text || mode === 'literal') return [{ latex: false, text }];
    if (mode === 'all') return [{ latex: true, text: text.replace(/(^|[^\\])\$/g, '$1') }];
    if (text.indexOf('$') === -1) return [{ latex: false, text }];
    return splitDollarSpans(text) || [{ latex: false, text }];
}

/**
 * Roughly how many glyphs a label will actually show.
 *
 * The bounds pass has to size the page before any document exists, so it cannot
 * measure anything — it counts characters and multiplies by an average advance.
 * Counting the raw string there would make "$\frac{1}{2\pi RC}$" look 19 wide
 * and inflate the sheet.
 */
function latexVisualLength(str, mode = 'literal') {
    const text = String(str === undefined || str === null ? '' : str);
    if (mode === 'literal' || !text) return text.length;

    const parsed = parseLatexLabel(text, mode);
    if (parsed.plain) return parsed.nodes.length ? parsed.nodes[0].s.length : 0;

    const walk = (nodes) => {
        let n = 0;
        for (const node of nodes) {
            if (!node) continue;
            if (node.t === 'text') n += node.s.length;
            else if (node.t === 'sym') n += 1;
            else if (node.t === 'space') n += 0.4;
            else if (node.t === 'group') n += walk(node.kids);
            else if (node.t === 'script') {
                n += walk([node.base]);
                // Sub and superscript share the same column.
                n += SCRIPT_RATIO * Math.max(walk([node.sub]), walk([node.sup]));
            } else if (node.t === 'frac') {
                n += SCRIPT_RATIO * Math.max(walk([node.num]), walk([node.den])) + 0.3;
            } else if (node.t === 'sqrt') {
                n += walk([node.arg]) + 0.7;
            }
        }
        return n;
    };
    return Math.ceil(walk(parsed.nodes));
}

// ── Layout ───────────────────────────────────────────────────────────────────

// Font names live on the document so they travel with it and no module-level
// state can go stale between renders. Absent names mean "use whatever is set",
// which is what the unit-test probes and a font-less render both want.
function latexFonts(doc) {
    const f = doc && doc.__ltFonts;
    return { text: (f && f.text) || null, math: (f && f.math) || null };
}

function useFont(doc, name, size) {
    if (typeof doc.setFontSize === 'function') doc.setFontSize(size);
    if (name && typeof doc.setFont === 'function') {
        try { doc.setFont(name, 'normal'); } catch (e) { /* keep the current face */ }
    }
}

// Lays out `nodes` at `size`, returning a box with absolutely placed items.
function layoutNodes(doc, nodes, size, ctx) {
    const items = [];
    let x = 0;
    let height = 0;
    let depth = 0;
    const grow = (h, d) => { if (h > height) height = h; if (d > depth) depth = d; };

    const place = (box, dx, dy) => {
        for (const it of box.items) {
            const copy = Object.assign({}, it);
            // A line carries endpoints, not an origin. Translating only x/y left
            // every nested radical's hook stranded at the outer box's left edge.
            if (copy.k === 'line') {
                copy.x1 += dx; copy.y1 += dy;
                copy.x2 += dx; copy.y2 += dy;
            } else if (copy.k === 'poly') {
                copy.pts = copy.pts.map((q) => [q[0] + dx, q[1] + dy]);
            } else {
                copy.x += dx;
                copy.y += dy;
            }
            items.push(copy);
        }
        grow(box.height - dy, box.depth + dy);
    };

    for (const node of nodes) {
        if (!node) continue;

        if (node.t === 'text') {
            if (!node.s) continue;
            // In maths, letters are variables and get the italic face while
            // digits and punctuation stay upright — that is what makes
            // "$g_{m1}$" read as a formula rather than as a word.
            const runs = node.math ? splitMathRuns(node.s) : [{ s: node.s, italic: false }];
            for (const r of runs) {
                const font = (r.italic && ctx.mathFont) ? ctx.mathFont : ctx.textFont;
                useFont(doc, font, size);
                const w = doc.getTextWidth(r.s);
                items.push({ k: 'text', s: r.s, x, y: 0, size, font });
                x += w;
            }
            grow(size * 0.72, size * 0.22);
            continue;
        }

        if (node.t === 'sym') {
            const sym = LATEX_SYMBOLS[node.cmd];
            // Without the math font the glyph would come out as a blank box, so
            // fall back to the command name — visible, and obviously wrong.
            const useMath = sym.font === 'math';
            if (useMath && !ctx.mathFont) {
                ctx.warnings.push(node.cmd + ' necesita la fuente matemática');
                useFont(doc, ctx.textFont, size);
                const w = doc.getTextWidth(node.cmd);
                items.push({ k: 'text', s: node.cmd, x, y: 0, size, font: ctx.textFont });
                x += w;
                grow(size * 0.72, size * 0.22);
                continue;
            }
            const font = useMath ? ctx.mathFont : ctx.textFont;
            const glyph = String.fromCodePoint(sym.cp);
            useFont(doc, font, size);
            const w = doc.getTextWidth(glyph);
            items.push({ k: 'text', s: glyph, x, y: 0, size, font });
            x += w;
            grow(size * 0.72, size * 0.22);
            continue;
        }

        if (node.t === 'space') { x += node.em * size; continue; }

        if (node.t === 'group') {
            const box = layoutNodes(doc, node.kids, size, ctx);
            place(box, x, 0);
            x += box.width;
            continue;
        }

        if (node.t === 'script') {
            const base = node.base ? layoutNodes(doc, [node.base], size, ctx) : emptyBox();
            place(base, x, 0);
            const sSize = Math.max(MIN_SCRIPT_PT, size * SCRIPT_RATIO);
            let advance = base.width;
            let scriptW = 0;

            if (node.sup) {
                const sup = layoutNodes(doc, [node.sup], sSize, ctx);
                const dy = -Math.max(SUP_SHIFT * size, base.height - 0.25 * sSize);
                place(sup, x + base.width, dy);
                scriptW = Math.max(scriptW, sup.width);
            }
            if (node.sub) {
                const sub = layoutNodes(doc, [node.sub], sSize, ctx);
                const dy = Math.max(SUB_SHIFT * size, base.depth + 0.12 * sSize);
                place(sub, x + base.width, dy);
                scriptW = Math.max(scriptW, sub.width);
            }
            x += advance + scriptW;
            continue;
        }

        if (node.t === 'frac') {
            const sSize = Math.max(MIN_SCRIPT_PT, size * SCRIPT_RATIO);
            const num = layoutNodes(doc, [node.num], sSize, ctx);
            const den = layoutNodes(doc, [node.den], sSize, ctx);
            const pad = 0.12 * size;
            const barY = -AXIS * size;
            const thick = RULE_THICK * size;
            const gap = 0.10 * size;
            const w = Math.max(num.width, den.width) + 2 * pad;

            place(num, x + (w - num.width) / 2, barY - thick / 2 - gap - num.depth);
            place(den, x + (w - den.width) / 2, barY + thick / 2 + gap + den.height);
            items.push({ k: 'rule', x: x + pad * 0.5, y: barY - thick / 2, w: w - pad, h: thick });
            grow(-barY + thick, 0);
            x += w;
            continue;
        }

        if (node.t === 'sqrt') {
            const arg = layoutNodes(doc, [node.arg], size, ctx);
            const thick = RULE_THICK * size;         // the overbar
            const gap = 0.10 * size;                 // clearance over the content
            const top = -(arg.height + gap + thick);
            // The surd is four constant-width strokes — a short tick, a
            // descender, the long ascender, and the overbar — joined with mitres.
            // Nothing tapers. All the character is in the joins: the sharp point
            // at the bottom is the mitre on the outside of a very tight turn, and
            // the corner under the bar is the mitre against a horizontal.
            //
            // The proportions below are measured off Computer Modern's glyph,
            // expressed against the radical's own height so it stays in shape at
            // any size, while the stroke weights stay tied to the rule thickness
            // the fraction bar uses.
            const bottom = arg.depth + 0.04 * size;
            const totalH = bottom - top;
            const hookW = Math.max(0.55 * size, 0.72 * totalH);
            const barX = x + hookW;
            const overhang = 0.12 * size;
            const barW = arg.width + 0.1 * size + overhang;

            place(arg, barX + 0.1 * size, 0);

            const centre = [
                [x + 0.00 * hookW, top + 0.56 * totalH],   // where the tick starts
                [x + 0.16 * hookW, top + 0.48 * totalH],   // the shoulder
                [x + 0.39 * hookW, bottom],                // the point
                [barX,             top + thick / 2],       // up under the bar
                [barX + barW,      top + thick / 2],       // and along it
            ];
            const weights = [thick * 0.6, thick * 1.3, thick * 1.6, thick];
            items.push({ k: 'poly', pts: strokeOutline(centre, weights) });

            grow(-top, arg.depth);
            x += hookW + arg.width + 0.1 * size + overhang;
            continue;
        }
    }

    return { width: x, height, depth, items };
}

function emptyBox() { return { width: 0, height: 0, depth: 0, items: [] }; }

/**
 * Measures and lays out a label.
 *
 * `box.plain` is true when the label has no markup — the caller can then take
 * the single-doc.text() path that predates all of this and is byte-identical.
 */
function layoutLatexLabel(doc, str, ptSize, mode = 'dollar') {
    const parsed = parseLatexLabel(str, mode);
    const fonts = latexFonts(doc);
    const ctx = { textFont: fonts.text, mathFont: fonts.math, warnings: parsed.warnings };

    if (parsed.plain) {
        const s = parsed.nodes.length ? parsed.nodes[0].s : '';
        useFont(doc, ctx.textFont, ptSize);
        return {
            width: s ? doc.getTextWidth(s) : 0,
            height: ptSize * 0.72, depth: ptSize * 0.22,
            items: s ? [{ k: 'text', s, x: 0, y: 0, size: ptSize, font: ctx.textFont }] : [],
            plain: true, text: s, warnings: parsed.warnings,
        };
    }

    const box = layoutNodes(doc, parsed.nodes, ptSize, ctx);
    box.plain = false;
    box.warnings = parsed.warnings;
    // Restore the size the caller had set, since layout walked through several.
    useFont(doc, ctx.textFont, ptSize);
    return box;
}

/**
 * Draws a laid-out label with its origin (left edge, baseline) at (x, y).
 * `angleDeg` is 0 or 90 — the only rotations the schematic renderer produces.
 */
function drawLatexBox(doc, box, x, y, angleDeg = 0) {
    const rot = angleDeg === 90;
    // 90° CCW on screen, matching what drawLTSpiceText does to the anchor.
    const map = (dx, dy) => (rot ? { x: x + dy, y: y - dx } : { x: x + dx, y: y + dy });

    // The fraction bar and the surd are FILLED, and the renderer leaves behind
    // whatever fill colour the last skin symbol set (drawSvgToPdf takes it from
    // the SVG). Unpinned, a label on a coloured skin would draw its bar in the
    // skin's yellow — or in white, and vanish.
    const fills = box.items.some((i) => i.k === 'rule' || i.k === 'poly');
    let savedFill = null;
    if (fills && typeof doc.setFillColor === 'function') {
        if (typeof doc.getFillColor === 'function') savedFill = doc.getFillColor();
        doc.setFillColor(0, 0, 0);
    }

    for (const it of box.items) {
        if (it.k === 'text') {
            const p = map(it.x, it.y);
            useFont(doc, it.font, it.size);
            doc.text(it.s, p.x, p.y, { angle: angleDeg, align: 'left', baseline: 'alphabetic' });
        } else if (it.k === 'rule') {
            const p = map(it.x, it.y);
            // Under a 90° turn the rule stays axis-aligned, with w and h swapped.
            if (rot) doc.rect(p.x, p.y - it.w, it.h, it.w, 'F');
            else doc.rect(p.x, p.y, it.w, it.h, 'F');
        } else if (it.k === 'poly') {
            const pts = it.pts.map((q) => map(q[0], q[1]));
            const segs = [];
            for (let i = 1; i < pts.length; i++) segs.push([pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y]);
            doc.lines(segs, pts[0].x, pts[0].y, [1, 1], 'F', true);
        } else if (it.k === 'line') {
            const a = map(it.x1, it.y1);
            const b = map(it.x2, it.y2);
            const prev = typeof doc.getLineWidth === 'function' ? doc.getLineWidth() : null;
            if (typeof doc.setLineWidth === 'function') doc.setLineWidth(it.w);
            doc.line(a.x, a.y, b.x, b.y);
            if (prev !== null && typeof doc.setLineWidth === 'function') doc.setLineWidth(prev);
        }
    }

    if (savedFill !== null) doc.setFillColor(savedFill);
}
