const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadEngineWithPdf, loadSkinAssets, ROOT } = require('./helpers/load-engine.js');

const engine = loadEngineWithPdf();
const { parseAsc, convertSceneToPdf, convertSceneToTikz, texEscape, tikzNum } = engine;

const example = (name) => fs.readFileSync(path.join(ROOT, 'ASC Examples', name), 'latin1');

const emptyAssets = () => ({ svgStrings: new Map(), fontBase64: null });

async function toTikz(asc, { assets, options } = {}) {
    return convertSceneToTikz(
        parseAsc(asc),
        assets || emptyAssets(),
        'test',
        options || { overrideAnchors: true }
    );
}

// Body statements: everything the sink emitted, minus preamble and the bounding box.
const statements = (tex) =>
    tex.split('\n').filter((l) => /^\s{2}\\(path|node)\b/.test(l));

test('the export is a compilable standalone document', async () => {
    const tex = await toTikz(example('01- Resistors and wires.asc'));

    assert.match(tex, /^% TikZ export/, 'should open with the generated-by banner');
    assert.match(tex, /\\documentclass\[border=0pt\]\{standalone\}/);
    assert.match(tex, /\\usepackage\{tikz\}/);
    assert.match(tex, /\\usepackage\{lmodern\}/, 'text is positioned with Latin Modern metrics');

    // Environments open and close exactly once, in the right order.
    for (const env of ['document', 'tikzpicture']) {
        const opens = tex.split(`\\begin{${env}}`).length - 1;
        const closes = tex.split(`\\end{${env}}`).length - 1;
        assert.strictEqual(opens, 1, `\\begin{${env}} should appear once`);
        assert.strictEqual(closes, 1, `\\end{${env}} should appear once`);
        assert.ok(tex.indexOf(`\\begin{${env}}`) < tex.indexOf(`\\end{${env}}`));
    }

    assert.ok(statements(tex).length > 0, 'nothing was drawn');
    for (const line of statements(tex)) {
        assert.ok(line.trimEnd().endsWith(';'), `unterminated TikZ command: ${line}`);
    }
});

test('the picture is pinned to the same page the PDF export produces', async () => {
    // Both renderers run the same bounds pass, so the two must agree exactly —
    // otherwise the .tex crops differently from the PDF next to it.
    const asc = example('09- Drawing.asc');
    const opts = { overrideAnchors: true };

    const pdf = await convertSceneToPdf(parseAsc(asc), emptyAssets(), 'test', opts);
    const raw = new TextDecoder('latin1').decode(new Uint8Array(pdf));
    const mediaBox = raw.match(/\/MediaBox\s*\[([\d.\s-]+)\]/);
    assert.ok(mediaBox, 'no /MediaBox in the PDF');
    const [, , w, h] = mediaBox[1].trim().split(/\s+/).map(Number);

    const tex = await toTikz(asc, { options: opts });
    const box = tex.match(/\\useasboundingbox \(0,0\) rectangle \((-?[\d.]+),(-?[\d.]+)\);/);
    assert.ok(box, 'no \\useasboundingbox');
    assert.ok(Math.abs(Number(box[1]) - w) < 0.01, `width ${box[1]} != PDF ${w}`);
    assert.ok(Math.abs(Number(box[2]) + h) < 0.01, `height ${box[2]} != PDF -${h}`);
});

test('every emitted coordinate falls inside the bounding box', async () => {
    const tex = await toTikz(example('01- Resistors and wires.asc'));
    const box = tex.match(/\\useasboundingbox \(0,0\) rectangle \((-?[\d.]+),(-?[\d.]+)\);/);
    const w = Number(box[1]);
    const h = -Number(box[2]);

    // A generous slack: round joins and half a line width can legitimately poke
    // out, and rough_pen's freehand strokes wander a little further.
    const SLACK = 8;
    for (const line of statements(tex)) {
        for (const m of line.matchAll(/\((-?[\d.]+),(-?[\d.]+)\)/g)) {
            const x = Number(m[1]);
            const y = -Number(m[2]);
            assert.ok(x >= -SLACK && x <= w + SLACK, `x=${x} outside 0..${w} in: ${line}`);
            assert.ok(y >= -SLACK && y <= h + SLACK, `y=${y} outside 0..${h} in: ${line}`);
        }
    }
});

test('y is negated so the drawing is not upside down', async () => {
    // A single wire running down the sheet must run down the page too: in the
    // emitted (maths-oriented) frame that means a decreasing y.
    const asc = 'Version 4\nSHEET 1 880 680\nWIRE 100 100 100 300\n';
    const tex = await toTikz(asc);
    const wire = statements(tex).find((l) => l.includes(' -- '));
    assert.ok(wire, 'the wire was not drawn');
    const pts = [...wire.matchAll(/\((-?[\d.]+),(-?[\d.]+)\)/g)].map((m) => Number(m[2]));
    assert.ok(pts[0] > pts[1], `expected a downward wire, got ${pts.join(' -> ')}`);
});

test('text becomes a node anchored the way jsPDF placed it', async () => {
    const asc = 'Version 4\nSHEET 1 880 680\nTEXT 100 100 Left 2 ;hello\n';
    const tex = await toTikz(asc);
    const node = statements(tex).find((l) => l.includes('\\node'));
    assert.ok(node, 'the label was not drawn');
    assert.match(node, /anchor=base west/, 'jsPDF draws left-aligned on the alphabetic baseline');
    assert.match(node, /inner sep=0pt/);
    // bp, not pt: TeX's pt is 1/72.27in, a PDF point is 1/72in.
    assert.match(node, /font=\\fontsize\{20bp\}\{24bp\}\\selectfont/, 'font size index 2 is 20bp');
    assert.ok(node.endsWith('{hello};'), node);
});

test('vertical text carries the same rotation the PDF applies', async () => {
    const asc = 'Version 4\nSHEET 1 880 680\nTEXT 200 200 VLeft 2 ;up\n';
    const tex = await toTikz(asc);
    const node = statements(tex).find((l) => l.includes('\\node'));
    assert.match(node, /rotate=90/, 'LTSpice vertical text reads bottom-to-top');
});

test('LaTeX-significant characters are escaped', () => {
    assert.strictEqual(texEscape('a_b'), 'a\\_b');
    assert.strictEqual(texEscape('50%'), '50\\%');
    assert.strictEqual(texEscape('R&D'), 'R\\&D');
    assert.strictEqual(texEscape('#1'), '\\#1');
    assert.strictEqual(texEscape('$V$'), '\\$V\\$');
    assert.strictEqual(texEscape('{x}'), '\\{x\\}');
    assert.strictEqual(texEscape('a\\b'), 'a\\textbackslash{}b');
    assert.strictEqual(texEscape('x^2'), 'x\\textasciicircum{}2');
    assert.strictEqual(texEscape('~n'), '\\textasciitilde{}n');
    assert.strictEqual(texEscape(''), '');
    assert.strictEqual(texEscape(null), '');
});

test('the units this renderer generates survive as TeX commands', () => {
    // getWindowText appends U+03A9 to resistor values; .asc files carry U+00B5.
    assert.strictEqual(texEscape('10k\u03A9'), '10k\\textohm{}');
    assert.strictEqual(texEscape('10k\u2126'), '10k\\textohm{}');
    assert.strictEqual(texEscape('4.7\u00B5F'), '4.7\\textmu{}F');
    assert.strictEqual(texEscape('4.7\u03BCF'), '4.7\\textmu{}F');
    assert.strictEqual(texEscape('25\u00B0C'), '25\\textdegree{}C');
});

test('a resistor value reaches the .tex as \\textohm, never as a raw glyph', async () => {
    const asc = [
        'Version 4',
        'SHEET 1 880 680',
        'SYMBOL res 100 100 R0',
        'SYMATTR InstName R1',
        'SYMATTR Value 10k',
        '',
    ].join('\n');
    const tex = await toTikz(asc);
    assert.ok(tex.includes('10k\\textohm{}'), 'the ohm sign was not converted');
    assert.ok(!/\u03A9|\u2126/.test(tex), 'a raw ohm glyph leaked into the output');
});

test('numbers never come out in exponent notation or as -0', () => {
    assert.strictEqual(tikzNum(0), '0');
    assert.strictEqual(tikzNum(-0), '0');
    assert.strictEqual(tikzNum(-0.0001), '0');
    assert.strictEqual(tikzNum(1000), '1000');
    assert.strictEqual(tikzNum(1.23456), '1.235');
    assert.strictEqual(tikzNum(NaN), '0');
    assert.strictEqual(tikzNum(Infinity), '0');
});

test('an empty scene returns null, exactly like the PDF export', async () => {
    const asc = 'Version 4\nSHEET 1 880 680\n';
    assert.strictEqual(await toTikz(asc), null);
    assert.strictEqual(
        await convertSceneToPdf(parseAsc(asc), emptyAssets(), 'test', {}),
        null
    );
});

test('dashed line styles become TikZ dash patterns', async () => {
    const asc = 'Version 4\nSHEET 1 880 680\nLINE Normal 100 100 300 100 2\n';
    const tex = await toTikz(asc);
    const line = statements(tex).find((l) => l.includes(' -- '));
    assert.match(line, /dash pattern=on 2bp off 5bp/, 'LTSpice style 2 is a dotted pen');
});

test('skin artwork and the .asy fallback both produce output', async () => {
    const asc = [
        'Version 4',
        'SHEET 1 880 680',
        'WIRE 100 100 100 200',
        'SYMBOL res 100 100 R0',
        'SYMATTR InstName R1',
        'SYMATTR Value 1k',
        '',
    ].join('\n');

    const skinned = await toTikz(asc, { assets: loadSkinAssets(['res', 'intersection']) });
    const native = await toTikz(asc, { assets: emptyAssets() });

    assert.ok(statements(skinned).length > 0, 'the Default skin drew nothing');
    assert.ok(statements(native).length > 0, 'the .asy fallback drew nothing');
    assert.match(skinned, /Skin: skin SVGs/);
    assert.match(native, /Skin: ASY geometry/);
});

test('the PDF export is unaffected by the docFactory seam', async () => {
    const asc = example('01- Resistors and wires.asc');
    const pdf = await convertSceneToPdf(parseAsc(asc), emptyAssets(), 'test', { overrideAnchors: true });
    const head = new TextDecoder('latin1').decode(new Uint8Array(pdf.slice(0, 8)));
    assert.match(head, /^%PDF-/, 'the default document is still a real PDF');
});
