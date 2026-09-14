const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROOT } = require('./helpers/load-engine.js');

const PdfCanvas = require(path.join(ROOT, 'tools', 'pdf_canvas.js'));
const RoughPen = require(path.join(ROOT, 'engine', 'rough_pen.js'));

const SKIN = path.join(ROOT, 'Assets', 'Skins', 'Default');
const skinFiles = fs.readdirSync(SKIN).filter((f) => f.toLowerCase().endsWith('.svg'));

// The contact sheet draws every panel through the SHIPPING renderer, so the
// preview cannot drift from the exporter the way an SVG-in-the-browser preview
// did. That only holds while pdf_canvas.js covers everything drawSvgToPdf calls.

// Loads pdf_renderer.js the way the preview page does: on its own, with no
// other engine file present.
function loadRendererAlone() {
    const sandbox = { console };
    sandbox.self = sandbox;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'engine', 'rough_pen.js'), 'utf8'),
        sandbox, { filename: 'rough_pen.js' });
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'engine', 'pdf_renderer.js'), 'utf8'),
        sandbox, { filename: 'pdf_renderer.js' });
    return sandbox;
}

// Every doc.* member drawSvgToPdf reaches for, over the whole skin, clean and
// roughened.
function rendererApiSurface(drawSvgToPdf) {
    const used = new Set();
    const recorder = new Proxy({}, {
        get(_t, k) {
            if (typeof k === 'string') used.add(k);
            return () => 0;
        },
    });
    for (const file of skinFiles) {
        const raw = fs.readFileSync(path.join(SKIN, file), 'utf8');
        drawSvgToPdf(recorder, raw, 0, 0, 'R0', 0, 0);
        drawSvgToPdf(recorder, RoughPen.roughen(raw, { pins: [], seed: file }).svg,
            0, 0, 'R0', 0, 0);
    }
    return [...used].sort();
}

test('pdf_renderer.js loads without any other engine file', () => {
    // The preview inlines it alone; a new top-level dependency would break the
    // sheet at load with nothing but a blank page to show for it.
    const sandbox = loadRendererAlone();
    assert.strictEqual(typeof vm.runInContext('drawSvgToPdf', sandbox), 'function');
});

test('pdf_canvas implements every method the renderer calls', () => {
    const sandbox = loadRendererAlone();
    const drawSvgToPdf = vm.runInContext('drawSvgToPdf', sandbox);
    const missing = rendererApiSurface(drawSvgToPdf)
        .filter((name) => typeof PdfCanvas.prototype[name] !== 'function');
    assert.deepStrictEqual(missing, [],
        `the contact sheet would silently drop these: ${missing.join(', ')}`);
});

test('the documented API surface still matches what the renderer calls', () => {
    // Keeps PdfCanvas.RENDERER_API honest, so the list in the source is a fact
    // rather than a stale comment.
    const sandbox = loadRendererAlone();
    const drawSvgToPdf = vm.runInContext('drawSvgToPdf', sandbox);
    assert.deepStrictEqual(rendererApiSurface(drawSvgToPdf), PdfCanvas.RENDERER_API);
});

test('the preview builder inlines the files it needs', () => {
    const src = fs.readFileSync(path.join(ROOT, 'tools', 'build_rough_preview.js'), 'utf8');
    for (const dep of ['rough_pen.js', 'pdf_renderer.js', 'pdf_canvas.js']) {
        assert.ok(src.includes(dep), `builder no longer inlines ${dep}`);
    }
    const tpl = fs.readFileSync(path.join(ROOT, 'tools', 'rough_preview_template.html'), 'utf8');
    const slots = ['/*__PEN__*/', '/*__RENDERER__*/', '/*__CANVAS__*/',
        '/*__APP__*/', '/*__DATA__*/', '/*__DEFAULTS_SRC__*/'];
    for (const slot of slots) {
        assert.ok(tpl.includes(slot), `template lost its ${slot} slot`);
    }
});

// ── "Copy DEFAULTS" round-trip ───────────────────────────────────────────────
// The button rebuilds engine/rough_pen.js's DEFAULTS block verbatim with the
// tuned numbers substituted, so it pastes straight back over the original. That
// only works while the block stays locatable and every key is a plain line in
// it — anything else would be silently dropped on paste.

function defaultsBlockOf(src) {
    const start = src.indexOf('var DEFAULTS = {');
    const end = start < 0 ? -1 : src.indexOf('\n};', start);
    return start < 0 || end < 0 ? null : src.slice(start, end + 3);
}

// A line this copy can rewrite looks like `    key: value,  // comment`.
function hasSubstitutableLine(block, key) {
    return block.split('\n').some((line) => {
        const trimmed = line.trim();
        if (trimmed.slice(0, key.length) !== key) return false;
        const rest = trimmed.slice(key.length).replace(/^[ \t]+/, '');
        return rest.charAt(0) === ':';
    });
}

test('the DEFAULTS block is locatable and round-trips exactly', () => {
    const src = fs.readFileSync(path.join(ROOT, 'engine', 'rough_pen.js'), 'utf8');
    const block = defaultsBlockOf(src);
    assert.ok(block, 'the builder could not find the DEFAULTS block');

    const start = src.indexOf(block);
    const rebuilt = src.slice(0, start) + block + src.slice(start + block.length);
    assert.strictEqual(rebuilt, src, 'substituting the block back changed the file');

    for (const key of Object.keys(RoughPen.DEFAULTS)) {
        assert.ok(hasSubstitutableLine(block, key),
            `${key} is not a plain line in DEFAULTS, so a pasted block would drop it`);
    }
});

test('every slider the sheet shows maps to a line in DEFAULTS', () => {
    const app = fs.readFileSync(path.join(ROOT, 'tools', 'rough_preview_app.js'), 'utf8');
    const block = defaultsBlockOf(fs.readFileSync(path.join(ROOT, 'engine', 'rough_pen.js'), 'utf8'));

    const keys = [...app.matchAll(/\{\s*k:\s*'([A-Za-z_$][\w$]*)'/g)].map((m) => m[1]);
    assert.ok(keys.length >= 10, `expected the control lists, found ${keys.length} keys`);

    for (const key of keys) {
        assert.ok(key in RoughPen.DEFAULTS, `slider "${key}" is not a DEFAULTS key`);
        assert.ok(hasSubstitutableLine(block, key),
            `slider "${key}" has no line in the DEFAULTS block to write back to`);
    }
});

// ── Freehand wires ───────────────────────────────────────────────────────────
// Only the procedural rough skin redraws wires. Both ends must stay exactly
// where the .asc put them, because junction dots, flag placement and every
// symbol pin are positioned from the original wire coordinates.

test('a roughened wire keeps both endpoints exactly', () => {
    const sandbox = loadRendererAlone();
    const roughWirePoints = vm.runInContext('roughWirePoints', sandbox);
    const opt = RoughPen.DEFAULTS;

    let worst = 0;
    let moved = 0;
    for (let i = 0; i < 250; i++) {
        const x1 = (i * 37) % 900;
        const y1 = (i * 53) % 700;
        const horizontal = i % 2 === 0;
        const len = 8 + ((i * 17) % 420);
        const x2 = horizontal ? x1 + len : x1;
        const y2 = horizontal ? y1 : y1 + len;

        const pts = roughWirePoints(x1, y1, x2, y2, `wire${i}`, opt);
        assert.ok(pts && pts.length > 1, 'a wire produced no geometry');

        worst = Math.max(worst,
            RoughPen.dist(pts[0], [x1, y1]),
            RoughPen.dist(pts[pts.length - 1], [x2, y2]));

        // and it actually bends somewhere in between
        for (const p of pts) {
            const off = horizontal ? Math.abs(p[1] - y1) : Math.abs(p[0] - x1);
            if (off > moved) moved = off;
        }
    }
    assert.strictEqual(worst, 0, `endpoints drifted by ${worst}u — wires would leave their junctions`);
    assert.ok(moved > 0.2, `wires came out straight (max deviation ${moved}u)`);
});

test('a wire with no rough options is left to the straight-line path', () => {
    // This is what keeps Default, Boca Jrs and None byte-for-byte as they were:
    // assets.rough falsy means no options, which means no polyline.
    const sandbox = loadRendererAlone();
    const roughWirePoints = vm.runInContext('roughWirePoints', sandbox);
    assert.strictEqual(roughWirePoints(0, 0, 100, 0, 'seed', null), null);
});

test('wires are drawn at penWidth, like everything else the pen touches', async () => {
    // penWidth reached the symbols but not the wires, so raising it looked like
    // it did nothing. One pen draws the whole sheet.
    const { loadEngineWithPdf, loadSkinAssets } = require('./helpers/load-engine.js');

    // Every stroke width in force when geometry is emitted, split by call: the
    // rough skin sends wires through lines(), the plain path through line().
    async function widthsUsed(rough, penWidth) {
        const env = loadEngineWithPdf();
        const Real = env.window.jspdf.jsPDF;
        const seen = [];
        env.window.jspdf.jsPDF = function Recording(...args) {
            const doc = new Real(...args);
            let current = null;
            const setW = doc.setLineWidth.bind(doc);
            const line = doc.line.bind(doc);
            const lines = doc.lines.bind(doc);
            doc.setLineWidth = (w) => { current = w; return setW(w); };
            doc.line = (...a) => { seen.push(['line', current]); return line(...a); };
            doc.lines = (...a) => { seen.push(['lines', current]); return lines(...a); };
            return doc;
        };

        const asc = fs.readFileSync(path.join(ROOT, 'ASC Examples', '01- Resistors and wires.asc'), 'latin1');
        const scene = env.parseAsc(asc);
        await env.analyzeSceneSymbols(scene);
        const names = new Set(['intersection', 'GND', 'flag']);
        for (const s of scene.symbols) names.add(String(s.type).split(/[\\/]/).pop());

        const assets = loadSkinAssets([...names], 'Default');
        assets.rough = rough;
        if (penWidth !== undefined) assets.roughOptions = { penWidth };
        await env.convertSceneToPdf(scene, assets, 'x', {});

        const pick = (kind) => [...new Set(seen.filter((e) => e[0] === kind).map((e) => e[1]))].sort((a, b) => a - b);
        return { lines: pick('lines'), line: pick('line') };
    }

    // Untouched: wires still go out as straight line() calls at the old width.
    assert.deepStrictEqual(await widthsUsed(false), { lines: [1.5], line: [1.5] },
        'the plain skins must keep drawing exactly as before');

    // One pen: the override reaches wires AND symbols, nothing is left behind.
    assert.deepStrictEqual(await widthsUsed(true, 1.9), { lines: [1.9], line: [] },
        'raising penWidth left something drawing at another width');
    assert.deepStrictEqual(await widthsUsed(true, 3), { lines: [3], line: [] });

    // And with no override it follows the module, whatever it has been tuned to.
    assert.deepStrictEqual(await widthsUsed(true),
        { lines: [RoughPen.DEFAULTS.penWidth], line: [] },
        'the rough skin ignored DEFAULTS.penWidth');
});

test('rough wire geometry is deterministic for the same wire', () => {
    // A redraw of the same schematic must not reshuffle the ink.
    const sandbox = loadRendererAlone();
    const roughWirePoints = vm.runInContext('roughWirePoints', sandbox);
    const a = roughWirePoints(10, 20, 210, 20, 'wire|10,20|210,20', RoughPen.DEFAULTS);
    const b = roughWirePoints(10, 20, 210, 20, 'wire|10,20|210,20', RoughPen.DEFAULTS);
    assert.deepStrictEqual(a, b);
});
