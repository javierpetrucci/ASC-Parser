// Loads the browser-global engine into a Node vm context so its pure functions
// can be unit-tested without a DOM, a bundler, or any dependency.
//
// The engine's only browser globals are `window` (assigned in engine/index.js),
// `window.jspdf` (used inside convertSceneToPdf) and `fetch` (used inside
// fetchAsy) — none of which the pure functions exercised here touch.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');

const ENGINE_FILES = [
    'engine/parser.js',
    'engine/analyzer.js',
    'engine/component_defaults.js',
    'engine/pdf_renderer.js',
    'engine/index.js',
];

// Top-level bindings the tests need. They are `const`/`function` declarations in
// the script's own lexical scope, not properties of the context object, so they
// have to be pulled out by name after evaluation.
const EXPORTED = [
    'parseAsc', 'parseAsy', 'normalizeAttrValue',
    'transformOffset', 'transformAlignment',
    'getWindowText', 'resolveAttrValue',
    'asyPathToUrlPath', 'pinAlignmentToTextAlignment',
    'drawSvgToPdf', 'drawLTSpiceText',
    'COMPONENT_DEFAULTS', 'TRANSISTOR_BASENAMES',
];

function loadEngine() {
    const sandbox = {
        window: {},
        console,
        fetch: async () => { throw new Error('fetch is not available in unit tests'); },
        TextDecoder,
        URL,
    };
    vm.createContext(sandbox);

    // Concatenated into ONE script on purpose: classic <script> tags in a browser
    // share a single global lexical environment, so a top-level `const` in one
    // file (COMPONENT_DEFAULTS) is visible to the next. Running each file as its
    // own vm script would give each file its own scope and hide those bindings.
    const combined = ENGINE_FILES
        .map((rel) => '// ===== ' + rel + ' =====\n' + fs.readFileSync(path.join(ROOT, rel), 'utf8'))
        .join('\n;\n');

    vm.runInContext(combined, sandbox, { filename: 'engine.bundle.js' });

    const exported = vm.runInContext(
        '({' + EXPORTED.join(', ') + '})',
        sandbox,
        { filename: 'engine.exports.js' }
    );

    return Object.assign(sandbox, exported);
}

module.exports = { loadEngine, ROOT, ENGINE_FILES };

// ── Full-pipeline harness ────────────────────────────────────────────────────
// Loads the engine WITH the vendored jsPDF and a `fetch` backed by the real
// asset tree, so convertSceneToPdf can be exercised end to end offline.
function loadEngineWithPdf() {
    const sandbox = {
        console,
        atob: globalThis.atob,
        btoa: globalThis.btoa,
        TextDecoder,
        TextEncoder,
        URL,
        setTimeout,
        clearTimeout,
        // jsPDF sniffs for a DOM; these stubs are enough for the code paths the
        // renderer uses (vector output, no canvas, no html()).
        navigator: { userAgent: 'node', languages: ['en'] },
        document: {
            createElementNS: () => ({ style: {}, setAttribute() {} }),
            createElement: () => ({ style: {}, getContext: () => null, setAttribute() {} }),
            documentElement: { style: {} },
        },
    };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.globalThis = sandbox;

    // Serves Assets/** from disk, mirroring how analyzer.js fetches .asy files.
    sandbox.fetch = async (url) => {
        const clean = String(url).split('?')[0].replace(/^\.?\//, '');
        const file = path.join(ROOT, decodeURIComponent(clean));
        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            return { ok: false, status: 404, async text() { return ''; } };
        }
        const body = fs.readFileSync(file, 'utf8');
        return { ok: true, status: 200, async text() { return body; } };
    };

    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'vendor', 'jspdf.umd.min.js'), 'utf8'),
        sandbox, { filename: 'jspdf.umd.min.js' });

    const combined = ENGINE_FILES
        .map((rel) => '// ===== ' + rel + ' =====\n' + fs.readFileSync(path.join(ROOT, rel), 'utf8'))
        .join('\n;\n');
    vm.runInContext(combined, sandbox, { filename: 'engine.bundle.js' });

    const exported = vm.runInContext('({' + EXPORTED.join(', ') + ', convertSceneToPdf, analyzeSceneSymbols})',
        sandbox, { filename: 'engine.exports.js' });

    return Object.assign(sandbox, exported);
}

// Loads real skin SVGs for the given component names, keyed the way
// prepareAssets keys them (lower-case).
function loadSkinAssets(names, skin = 'Default') {
    const svgStrings = new Map();
    for (const name of names) {
        const file = path.join(ROOT, 'Assets', 'Skins', skin, `${name}.svg`);
        if (fs.existsSync(file)) svgStrings.set(name.toLowerCase(), fs.readFileSync(file, 'utf8'));
    }
    return { svgStrings, fontBase64: null };
}

module.exports.loadEngineWithPdf = loadEngineWithPdf;
module.exports.loadSkinAssets = loadSkinAssets;
