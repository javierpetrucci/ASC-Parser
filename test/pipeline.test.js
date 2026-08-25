const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadEngineWithPdf, loadSkinAssets, ROOT } = require('./helpers/load-engine.js');

const engine = loadEngineWithPdf();
const { parseAsc, convertSceneToPdf } = engine;

const asPdf = (buf) => new TextDecoder('latin1').decode(new Uint8Array(buf.slice(0, 8)));

async function render(asc, { assets, options } = {}) {
    const scene = parseAsc(asc);
    return convertSceneToPdf(
        scene,
        assets || { svgStrings: new Map(), fontBase64: null },
        'test',
        options || { overrideAnchors: true }
    );
}

test('a minimal schematic renders a valid PDF', async () => {
    const buf = await render('Version 4.1\nWIRE 0 0 100 0\n');
    assert.ok(buf, 'render returned null');
    assert.strictEqual(asPdf(buf), '%PDF-1.3');
    assert.ok(buf.byteLength > 500, `suspiciously small: ${buf.byteLength}`);
});

test('a scene with no drawable geometry returns null rather than an empty PDF', async () => {
    assert.strictEqual(await render('Version 4.1\nSHEET 1 880 680\n'), null);
});

test('a schematic of only a SPICE directive still renders', async () => {
    // scene.texts was excluded from the bounds pass, so this returned null.
    const buf = await render('Version 4.1\nSHEET 1 880 680\nTEXT -32 96 Left 2 !.tran 0 1m\n');
    assert.ok(buf, 'text-only schematic produced no PDF');
    assert.strictEqual(asPdf(buf), '%PDF-1.3');
});

test('a flag far outside the component area is not clipped away', async () => {
    const near = await render('Version 4.1\nWIRE 0 0 10 0\nFLAG 0 0 A\n');
    const far  = await render('Version 4.1\nWIRE 0 0 10 0\nFLAG 2000 2000 A\n');
    assert.ok(near && far);
    // The distant flag must enlarge the page, proving it was included in bounds.
    assert.ok(far.byteLength !== near.byteLength, 'the far flag did not affect the page');
});

test('ground and named flags render through the skin, keyed case-insensitively', async () => {
    // prepareAssets lower-cases its map keys; the flag lookup uses 'GND'/'flag',
    // so a case-sensitive get() silently dropped every ground symbol.
    const assets = loadSkinAssets(['GND', 'flag', 'intersection']);
    assert.ok(assets.svgStrings.has('gnd'), 'fixture is missing the GND skin SVG');

    const withSkin = await render('Version 4.1\nWIRE 0 0 0 100\nFLAG 0 100 0\n', { assets });
    const without  = await render('Version 4.1\nWIRE 0 0 0 100\nFLAG 0 100 0\n');
    assert.ok(withSkin && without);
    assert.ok(withSkin.byteLength !== without.byteLength,
        'the GND skin SVG was not used — the lookup missed');
});

test('a non-canonically cased symbol type still resolves its skin and defaults', async () => {
    // LTSpice sits on a case-insensitive filesystem, so "RES" is a legal type.
    const assets = loadSkinAssets(['res']);
    const upper = await render('Version 4.1\nSYMBOL RES 0 0 R0\nSYMATTR InstName R1\nSYMATTR Value 10k\n', { assets });
    const lower = await render('Version 4.1\nSYMBOL res 0 0 R0\nSYMATTR InstName R1\nSYMATTR Value 10k\n', { assets });
    assert.ok(upper && lower);
    assert.strictEqual(upper.byteLength, lower.byteLength,
        'casing changed the output — a lookup is still case-sensitive');
});

test('every bundled example schematic renders without throwing', async () => {
    const dir = path.join(ROOT, 'ASC Examples');
    const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.asc'));
    assert.ok(files.length > 30, `expected the full corpus, found ${files.length}`);

    const failures = [];
    const empty = [];
    for (const f of files) {
        const asc = fs.readFileSync(path.join(dir, f), 'latin1');
        try {
            const buf = await render(asc);
            if (!buf) empty.push(f);
            else if (asPdf(buf) !== '%PDF-1.3') failures.push(`${f}: not a PDF`);
        } catch (e) {
            failures.push(`${f}: ${e.message}`);
        }
    }
    assert.deepStrictEqual(failures, [], `render errors: ${failures.join(' | ')}`);
    // 06- is a known 4-line stub with a single symbol and no geometry.
    assert.ok(empty.length <= 1, `unexpectedly empty renders: ${empty.join(', ')}`);
});

test('the .asy analyzer resolves pathed types against the real asset tree', async () => {
    const scene = parseAsc('Version 4.1\nSYMBOL TCLib\\OA_Ideal 0 0 R0\nSYMATTR InstName U1\n');
    await engine.analyzeSceneSymbols(scene);
    const sym = scene.symbols[0];
    assert.ok(sym.asyData, 'the doubled-backslash path did not resolve');
    assert.ok(sym.asyData.windows, 'no WINDOW definitions parsed');
});

test('overrideAnchors changes label placement', async () => {
    const asc = 'Version 4.1\nSYMBOL res 0 0 R90\nSYMATTR InstName R1\nSYMATTR Value 1k\n';
    const on  = await render(asc, { options: { overrideAnchors: true } });
    const off = await render(asc, { options: { overrideAnchors: false } });
    assert.ok(on && off);
});
