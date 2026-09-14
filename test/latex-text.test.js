const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadEngine, ROOT } = require('./helpers/load-engine.js');

const {
    parseLatexLabel, layoutLatexLabel, drawLatexBox,
    latexVisualLength, latexSpans, LATEX_SYMBOLS, drawLTSpiceText,
} = loadEngine();

// Same shape as the probe in text-layout.test.js: a fixed advance per character
// keeps the geometry predictable.
const CHAR_W = 6;
function probe(fonts) {
    const calls = [];
    return {
        calls,
        __ltFonts: fonts || { text: null, math: null },
        _size: 0,
        _font: null,
        setFontSize(n) { this._size = n; },
        setFont(name) { this._font = name; },
        setLineWidth() {},
        getTextWidth(t) { return t.length * CHAR_W; },
        text(str, x, y, opts) { calls.push({ k: 'text', str, x, y, size: this._size, font: this._font, ...opts }); },
        rect(x, y, w, h, style) { calls.push({ k: 'rect', x, y, w, h, style }); },
        line(x1, y1, x2, y2) { calls.push({ k: 'line', x1, y1, x2, y2 }); },
    };
}

// The engine runs inside a vm sandbox, so its objects carry that realm's
// prototypes and deepStrictEqual would reject them on identity alone.
const plain = (v) => JSON.parse(JSON.stringify(v));
const kinds = (nodes) => plain(nodes).map((n) => n.t);

// ── Parsing ──────────────────────────────────────────────────────────────────

test('plain text takes the fast path in every mode', () => {
    for (const mode of ['literal', 'dollar', 'all']) {
        const r = parseLatexLabel('100k', mode);
        assert.strictEqual(r.plain, true, mode);
        assert.deepStrictEqual(plain(r.nodes), [{ t: 'text', s: '100k' }], mode);
    }
});

test('dollar mode only interprets the spans between the delimiters', () => {
    const r = parseLatexLabel('gain is $R_1$ ohms', 'dollar');
    assert.strictEqual(r.plain, false);
    assert.strictEqual(r.nodes[0].t, 'text');
    assert.strictEqual(r.nodes[0].s, 'gain is ');
    assert.strictEqual(r.nodes[1].t, 'script');
    assert.strictEqual(r.nodes[r.nodes.length - 1].s, ' ohms');
});

test('an unbalanced $ leaves the whole label literal and says so', () => {
    const r = parseLatexLabel('costs $5 to build', 'dollar');
    assert.strictEqual(r.plain, true);
    assert.deepStrictEqual(plain(r.nodes), [{ t: 'text', s: 'costs $5 to build' }]);
    assert.ok(r.warnings.some((w) => w.includes('$')), r.warnings.join('|'));
});

test('all mode drops the delimiters so a typed $ still works', () => {
    const withDollars = parseLatexLabel('$R_1$', 'all');
    const without = parseLatexLabel('R_1', 'all');
    assert.deepStrictEqual(kinds(withDollars.nodes), kinds(without.nodes));
    assert.strictEqual(withDollars.nodes[0].t, 'script');
});

test('literal mode never interprets anything', () => {
    const r = parseLatexLabel('$V_{CC}$', 'literal');
    assert.strictEqual(r.plain, true);
    assert.strictEqual(r.nodes[0].s, '$V_{CC}$');
});

test('scripts bind to the last character, not the whole run', () => {
    const r = parseLatexLabel('$abc_1$', 'dollar');
    // "ab" stays a run; only "c" takes the subscript.
    assert.deepStrictEqual(kinds(r.nodes), ['text', 'script']);
    assert.strictEqual(r.nodes[0].s, 'ab');
    assert.strictEqual(r.nodes[1].base.s, 'c');
});

test('a braced script argument is taken whole', () => {
    const r = parseLatexLabel('$V_{CC}$', 'dollar');
    assert.strictEqual(r.nodes[0].t, 'script');
    assert.strictEqual(r.nodes[0].sub.t, 'group');
    assert.strictEqual(r.nodes[0].sub.kids[0].s, 'CC');
});

test('sub and superscript on one base share a single node', () => {
    const r = parseLatexLabel('$i_{DS}^2$', 'dollar');
    assert.strictEqual(r.nodes.length, 1);
    assert.strictEqual(r.nodes[0].t, 'script');
    assert.ok(r.nodes[0].sub);
    assert.ok(r.nodes[0].sup);
});

test('\\frac and \\sqrt parse with their arguments', () => {
    const frac = parseLatexLabel('$\\frac{1}{2}$', 'dollar').nodes[0];
    assert.strictEqual(frac.t, 'frac');
    assert.strictEqual(frac.num.kids[0].s, '1');
    assert.strictEqual(frac.den.kids[0].s, '2');

    const sqrt = parseLatexLabel('$\\sqrt{LC}$', 'dollar').nodes[0];
    assert.strictEqual(sqrt.t, 'sqrt');
});

test('a control word swallows the space after it, as TeX does', () => {
    // Without this "\mu F" sets as "µ F" rather than "µF".
    const r = parseLatexLabel('$4.7\\,\\mu F$', 'dollar');
    const texts = r.nodes.filter((n) => n.t === 'text').map((n) => n.s);
    assert.ok(texts.includes('F'), texts.join('|'));
    assert.ok(!texts.some((s) => s.startsWith(' ')), 'a leading space survived: ' + texts.join('|'));
});

test('an unknown command is shown verbatim and reported', () => {
    const r = parseLatexLabel('$\\foobar$', 'dollar');
    assert.ok(r.warnings.some((w) => w.includes('\\foobar')), r.warnings.join('|'));
    assert.ok(r.nodes.some((n) => n.t === 'text' && n.s === '\\foobar'));
});

test('an unclosed brace is reported instead of swallowing the label', () => {
    const r = parseLatexLabel('$V_{CC$', 'dollar');
    assert.ok(r.warnings.length > 0);
});

// ── Maths spacing ────────────────────────────────────────────────────────────

test('relations get air around them even when the source space was eaten', () => {
    const r = parseLatexLabel('$\\tau = RC$', 'dollar');
    const spaces = r.nodes.filter((n) => n.t === 'space');
    // Exactly one gap either side of "=", never the inserted gap PLUS the
    // literal space that followed it.
    assert.strictEqual(spaces.length, 2, kinds(r.nodes).join(','));
});

test('a space the author asked for is not doubled by the automatic gap', () => {
    const withSpaces = parseLatexLabel('$a = b$', 'dollar');
    const without = parseLatexLabel('$a=b$', 'dollar');
    assert.deepStrictEqual(kinds(withSpaces.nodes), kinds(without.nodes));
});

test('a leading minus is a sign, not a subtraction', () => {
    // "-\frac{R_2}{R_1}" must not be padded on its left.
    const r = parseLatexLabel('$-\\frac{R_2}{R_1}$', 'dollar');
    assert.notStrictEqual(r.nodes[0].t, 'space');
});

// ── Layout ───────────────────────────────────────────────────────────────────

test('a label with no markup lays out as one run at the origin', () => {
    const doc = probe();
    const box = layoutLatexLabel(doc, 'R1', 20, 'dollar');
    assert.strictEqual(box.plain, true);
    assert.strictEqual(box.items.length, 1);
    assert.strictEqual(box.items[0].x, 0);
    assert.strictEqual(box.items[0].y, 0);
    assert.strictEqual(box.width, 2 * CHAR_W);
});

test('the composed width is far below the raw string width', () => {
    // This is the whole point: measuring "$V_{CC}$" as 8 characters would push
    // every Center and Right aligned label out of place.
    const doc = probe();
    const box = layoutLatexLabel(doc, '$V_{CC}$', 20, 'dollar');
    assert.ok(box.width < 8 * CHAR_W, `composed ${box.width} vs raw ${8 * CHAR_W}`);
    assert.ok(box.width > CHAR_W, 'the base glyph is missing');
});

test('a subscript sits below the baseline and a superscript above', () => {
    const doc = probe();
    const box = layoutLatexLabel(doc, '$x_1^2$', 20, 'dollar');
    const ys = box.items.map((i) => i.y);
    assert.ok(ys.some((y) => y > 0), 'no subscript below the baseline');
    assert.ok(ys.some((y) => y < 0), 'no superscript above the baseline');
});

test('a fraction draws its bar and stacks the two halves', () => {
    const doc = probe();
    const box = layoutLatexLabel(doc, '$\\frac{1}{2}$', 20, 'dollar');
    const rules = box.items.filter((i) => i.k === 'rule');
    assert.strictEqual(rules.length, 1, 'expected exactly one fraction bar');
    const texts = box.items.filter((i) => i.k === 'text');
    assert.strictEqual(texts.length, 2);
    assert.ok(texts[0].y < rules[0].y, 'the numerator should sit above the bar');
    assert.ok(texts[1].y > rules[0].y, 'the denominator should sit below the bar');
});

test('a nested radical is translated with its parent', () => {
    // The surd is a filled outline, whose vertices are not the x/y a generic
    // translate touches — it used to be stranded at the outer box's left edge.
    const doc = probe();
    const box = layoutLatexLabel(doc, '$\\frac{1}{\\sqrt{LC}}$', 20, 'dollar');
    const polys = box.items.filter((i) => i.k === 'poly');
    assert.ok(polys.length >= 1, 'the radical was not drawn');
    for (const p of polys) {
        for (const [px] of p.pts) assert.ok(px > 0.5, `radical stranded at x=${px}`);
    }
});

test('the surd is one filled outline, bar included', () => {
    // Computer Modern's radical tapers and ends in a point. A stroke of one
    // width cannot, and the renderer's round caps would blob both ends.
    const doc = probe();
    const box = layoutLatexLabel(doc, '$\\sqrt{2}$', 20, 'dollar');
    assert.strictEqual(box.items.filter((i) => i.k === 'line').length, 0);
    assert.strictEqual(box.items.filter((i) => i.k === 'rule').length, 0,
        'the overbar is part of the same outline, so its corner mitres correctly');
    const polys = box.items.filter((i) => i.k === 'poly');
    assert.strictEqual(polys.length, 1);
    // Five centreline points stroked as four segments, offset down both sides.
    assert.ok(polys[0].pts.length >= 10, `only ${polys[0].pts.length} vertices`);
});

test('a mitre that would spike is bevelled instead', () => {
    // Two almost-opposed segments put the crossing of their offset lines a long
    // way from the joint. Left alone, that is a spike shooting off the glyph.
    const { strokeOutline } = loadEngine();
    for (const [px, py] of strokeOutline([[0, 0], [100, 0], [0, 1]], [10, 10], 8)) {
        assert.ok(Math.abs(px) < 400 && Math.abs(py) < 400, `runaway vertex ${px},${py}`);
    }
});

test('the radical widens as its content grows taller', () => {
    // An extensible radical is not a fixed glyph: a fixed hook looks squat under
    // anything tall.
    const doc = probe();
    const short = layoutLatexLabel(doc, '$\\sqrt{2}$', 20, 'dollar');
    const tall = layoutLatexLabel(doc, '$\\sqrt{\\frac{L}{C}}$', 20, 'dollar');
    const hookOf = (b) => Math.max(...b.items.filter((i) => i.k === 'poly')
        .flatMap((p) => p.pts.map((q) => q[0])));
    assert.ok(hookOf(tall) > hookOf(short), 'the tall radical should have a wider hook');
    assert.ok(tall.height > short.height);
});

test('a symbol needing the maths font falls back visibly when it is absent', () => {
    const doc = probe({ text: null, math: null });
    const box = layoutLatexLabel(doc, '$\\omega$', 20, 'dollar');
    assert.strictEqual(box.items[0].s, '\\omega');
    assert.ok(box.warnings.some((w) => w.includes('\\omega')));
});

test('the maths font is selected only for the glyphs the text font lacks', () => {
    const doc = probe({ text: 'TextFace', math: 'MathFace' });
    const box = layoutLatexLabel(doc, '$\\omega\\Omega$', 20, 'dollar');
    const fonts = box.items.filter((i) => i.k === 'text').map((i) => i.font);
    assert.ok(fonts.includes('MathFace'), 'lowercase omega must come from the maths face');
    assert.ok(fonts.includes('TextFace'), 'uppercase Omega is already in the text face');
});

// ── Drawing ──────────────────────────────────────────────────────────────────

test('drawing a plain label is a single text call at the given origin', () => {
    const doc = probe();
    const box = layoutLatexLabel(doc, 'R1', 20, 'dollar');
    doc.calls.length = 0;
    drawLatexBox(doc, box, 100, 50, 0);
    assert.strictEqual(doc.calls.length, 1);
    assert.deepStrictEqual(
        { str: doc.calls[0].str, x: doc.calls[0].x, y: doc.calls[0].y, angle: doc.calls[0].angle },
        { str: 'R1', x: 100, y: 50, angle: 0 }
    );
});

test('a rotated label turns each piece about the same origin', () => {
    const doc = probe();
    const box = layoutLatexLabel(doc, '$x_1$', 20, 'dollar');
    doc.calls.length = 0;
    drawLatexBox(doc, box, 100, 50, 90);
    assert.ok(doc.calls.length >= 2);
    for (const c of doc.calls) assert.strictEqual(c.angle, 90);
    // 90° CCW: a piece to the RIGHT of the origin must end up ABOVE it.
    const sub = doc.calls[doc.calls.length - 1];
    assert.ok(sub.y < 50, `expected the script above the origin, got y=${sub.y}`);
});

// ── Integration with the label placer ────────────────────────────────────────

test('drawLTSpiceText defaults to literal, so nothing existing changes', () => {
    const doc = probe();
    drawLTSpiceText(doc, '$V_{CC}$', 100, 50, 'Left', 20);
    assert.strictEqual(doc.calls.length, 1);
    assert.strictEqual(doc.calls[0].str, '$V_{CC}$');
});

test('a document that typesets for itself gets the raw source and a true anchor', () => {
    const seen = [];
    const doc = probe();
    doc.drawLatexLabel = (...args) => seen.push(args);
    drawLTSpiceText(doc, '$V_{CC}$', 100, 50, 'Right', 20, 'dollar');
    assert.strictEqual(doc.calls.length, 0, 'nothing should have been drawn here');
    assert.strictEqual(seen.length, 1);
    const [str, x, , baseAlign, angle] = seen[0];
    assert.strictEqual(str, '$V_{CC}$');
    assert.strictEqual(x, 100, 'Right alignment must hand over the anchor, not a shifted edge');
    assert.strictEqual(baseAlign, 'Right');
    assert.strictEqual(angle, 0);
});

// ── Bounds estimate ──────────────────────────────────────────────────────────

test('the bounds estimate counts glyphs shown, not characters typed', () => {
    assert.strictEqual(latexVisualLength('100k', 'dollar'), 4);
    assert.strictEqual(latexVisualLength('$V_{CC}$', 'literal'), 8);
    assert.ok(latexVisualLength('$V_{CC}$', 'dollar') < 8);
    assert.ok(latexVisualLength('$\\frac{1}{2\\pi RC}$', 'dollar') < 18);
});

// ── Span splitting, for the .tex export ──────────────────────────────────────

test('latexSpans keeps the LaTeX source intact for a real TeX', () => {
    const spans = latexSpans('gain $\\frac{1}{2}$ max', 'dollar');
    assert.deepStrictEqual(plain(spans), [
        { latex: false, text: 'gain ' },
        { latex: true, text: '\\frac{1}{2}' },
        { latex: false, text: ' max' },
    ]);
    assert.deepStrictEqual(plain(latexSpans('R1', 'literal')), [{ latex: false, text: 'R1' }]);
    assert.deepStrictEqual(plain(latexSpans('$R_1$', 'all')), [{ latex: true, text: 'R_1' }]);
});

// ── The generated font ───────────────────────────────────────────────────────

test('the maths font carries every glyph the symbol table promises', () => {
    const file = path.join(ROOT, 'Assets', 'Fonts', 'lmmath-subset.ttf');
    assert.ok(fs.existsSync(file), 'run: node tools/build_math_font.js');

    const b = fs.readFileSync(file);
    assert.strictEqual(b.readUInt32BE(0), 0x00010000, 'must be TrueType — jsPDF cannot read CFF outlines');

    const numTables = b.readUInt16BE(4);
    const tags = [];
    let cmapOff = null;
    for (let i = 0; i < numTables; i++) {
        const o = 12 + i * 16;
        const tag = b.toString('latin1', o, o + 4);
        tags.push(tag);
        if (tag === 'cmap') cmapOff = b.readUInt32BE(o + 8);
    }
    // A glyf without a loca is unreadable: every outline lookup fails.
    assert.ok(tags.includes('glyf'), 'no glyf table');
    assert.ok(tags.includes('loca'), 'no loca table');

    const covered = new Set();
    const n = b.readUInt16BE(cmapOff + 2);
    for (let i = 0; i < n; i++) {
        const sub = cmapOff + b.readUInt32BE(cmapOff + 4 + i * 8 + 4);
        if (b.readUInt16BE(sub) !== 4) continue;
        const segX2 = b.readUInt16BE(sub + 6);
        const endO = sub + 14;
        const startO = endO + segX2 + 2;
        for (let s = 0; s < segX2 / 2; s++) {
            const end = b.readUInt16BE(endO + s * 2);
            const start = b.readUInt16BE(startO + s * 2);
            if (start === 0xFFFF) continue;
            for (let c = start; c <= end; c++) covered.add(c);
        }
    }

    const missing = [];
    for (const [cmd, def] of Object.entries(LATEX_SYMBOLS)) {
        if (def.font !== 'math') continue;
        if (!covered.has(def.cp)) missing.push(cmd);
    }
    assert.deepStrictEqual(missing, [], 'regenerate with: node tools/build_math_font.js');

    // jsPDF encodes a whole string against one face and stops at the first
    // codepoint it cannot map, so a maths run containing a space needs U+0020.
    assert.ok(covered.has(0x20), 'the space glyph is missing');
});

test('every maths symbol declares where its glyph comes from', () => {
    for (const [cmd, def] of Object.entries(LATEX_SYMBOLS)) {
        assert.ok(def.cp > 0, cmd + ' has no codepoint');
        assert.ok(def.font === 'text' || def.font === 'math', cmd + ' has no font role');
        if (def.font === 'math') assert.ok(def.cp <= 0xFFFF, cmd + ' must map onto the BMP');
    }
});

// ── Reporting ────────────────────────────────────────────────────────────────

test('what the reader could not parse is reported against its label', () => {
    const { loadEngineWithPdf } = require('./helpers/load-engine.js');
    const eng = loadEngineWithPdf();
    const BS = String.fromCharCode(92);

    const asc = [
        'Version 4',
        'SHEET 1 880 680',
        `TEXT 16 32 Left 2 ;$${BS}A_0$`,
    ].join('\n');

    const assets = { svgStrings: new Map(), fontBase64: null };
    return eng.convertSceneToPdf(eng.parseAsc(asc), assets, 'test', { latexMode: 'dollar' })
        .then(() => {
            assert.ok(Array.isArray(assets.latexWarnings), 'no warnings channel');
            assert.strictEqual(assets.latexWarnings.length, 1);
            assert.match(assets.latexWarnings[0], /\A/, assets.latexWarnings[0]);
            assert.match(assets.latexWarnings[0], /A_0/, 'the offending label should be named');
        });
});

test('a clean schematic reports nothing', () => {
    const { loadEngineWithPdf } = require('./helpers/load-engine.js');
    const eng = loadEngineWithPdf();
    const asc = ['Version 4', 'SHEET 1 880 680', 'TEXT 16 32 Left 2 ;plain label'].join('\n');
    const assets = { svgStrings: new Map(), fontBase64: null };
    return eng.convertSceneToPdf(eng.parseAsc(asc), assets, 'test', { latexMode: 'dollar' })
        .then(() => assert.deepStrictEqual(plain(assets.latexWarnings), []));
});

// ── Maths italic ─────────────────────────────────────────────────────────────

test('letters in maths are variables and get the italic face', () => {
    // "$g_{m1}$" must read as a formula, not as a word: g and m slanted, 1 upright.
    const doc = probe({ text: 'TextFace', math: 'MathFace' });
    const box = layoutLatexLabel(doc, '$g_{m1}$', 20, 'dollar');
    const byText = {};
    for (const it of box.items) if (it.k === 'text') byText[it.s] = it.font;
    assert.strictEqual(byText['g'], 'MathFace', 'the variable should be italic');
    assert.strictEqual(byText['m'], 'MathFace', 'a subscript letter is a variable too');
    assert.strictEqual(byText['1'], 'TextFace', 'digits stay upright');
});

test('text outside the delimiters keeps the upright face', () => {
    const doc = probe({ text: 'TextFace', math: 'MathFace' });
    const box = layoutLatexLabel(doc, 'gain is $R$', 20, 'dollar');
    const upright = box.items.find((i) => i.s === 'gain is ');
    const italic = box.items.find((i) => i.s === 'R');
    assert.strictEqual(upright.font, 'TextFace');
    assert.strictEqual(italic.font, 'MathFace');
});

test('the upright commands opt back out of the italic', () => {
    // A literal backslash built at runtime: it does not survive every editing
    // path, and in a JS string "\t" would silently become a tab.
    const BSL = String.fromCharCode(92);
    const doc = probe({ text: 'TextFace', math: 'MathFace' });
    const box = layoutLatexLabel(doc, '$R_{' + BSL + 'text{load}}$', 20, 'dollar');
    const load = box.items.find((i) => i.s === 'load');
    assert.ok(load, 'the argument of the upright command was lost');
    assert.strictEqual(load.font, 'TextFace', '\\text exists to escape the maths italic');
});

test('without the maths face the letters fall back to upright', () => {
    const doc = probe({ text: 'TextFace', math: null });
    const box = layoutLatexLabel(doc, '$g$', 20, 'dollar');
    assert.strictEqual(box.items[0].font, 'TextFace');
});

test('the italic alphabet is mapped onto plain ASCII', () => {
    const { mathItalicCodepoint } = loadEngine();
    assert.strictEqual(mathItalicCodepoint('A'), 0x1D434);
    assert.strictEqual(mathItalicCodepoint('a'), 0x1D44E);
    // Unicode had already assigned the italic small h as PLANCK CONSTANT, so the
    // Mathematical Italic block has a hole where it would have been.
    assert.strictEqual(mathItalicCodepoint('h'), 0x210E);
    assert.strictEqual(mathItalicCodepoint('1'), null);
});

test('the maths font carries the whole italic alphabet', () => {
    const file = path.join(ROOT, 'Assets', 'Fonts', 'lmmath-subset.ttf');
    const b = fs.readFileSync(file);
    const numTables = b.readUInt16BE(4);
    let cmapOff = null;
    for (let i = 0; i < numTables; i++) {
        const o = 12 + i * 16;
        if (b.toString('latin1', o, o + 4) === 'cmap') cmapOff = b.readUInt32BE(o + 8);
    }
    const covered = new Set();
    const n = b.readUInt16BE(cmapOff + 2);
    for (let i = 0; i < n; i++) {
        const sub = cmapOff + b.readUInt32BE(cmapOff + 4 + i * 8 + 4);
        if (b.readUInt16BE(sub) !== 4) continue;
        const segX2 = b.readUInt16BE(sub + 6);
        const endO = sub + 14;
        const startO = endO + segX2 + 2;
        for (let s = 0; s < segX2 / 2; s++) {
            const end = b.readUInt16BE(endO + s * 2);
            const start = b.readUInt16BE(startO + s * 2);
            if (start === 0xFFFF) continue;
            for (let c = start; c <= end; c++) covered.add(c);
        }
    }
    const missing = [];
    for (let c = 0x41; c <= 0x5A; c++) if (!covered.has(c)) missing.push(String.fromCharCode(c));
    for (let c = 0x61; c <= 0x7A; c++) if (!covered.has(c)) missing.push(String.fromCharCode(c));
    assert.deepStrictEqual(missing, [], 'regenerate with: node tools/build_math_font.js');
});
