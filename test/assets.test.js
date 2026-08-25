const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./helpers/load-engine.js');

const SKINS_DIR = path.join(ROOT, 'Assets', 'Skins');

// Element types drawSvgToPdf can actually draw. Anything else in a skin SVG is
// silently dropped from the PDF.
const SUPPORTED = ['rect', 'line', 'circle', 'path', 'polygon', 'polyline'];

// Mirrors app.js exactly: split on newline and trim. JS trim() already removes
// both the CR and the UTF-8 BOM (U+FEFF counts as WhiteSpace per ECMAScript),
// which is why the BOM at the head of skins.txt is harmless in production.
function readSkinsManifest() {
    const raw = fs.readFileSync(path.join(SKINS_DIR, 'skins.txt'), 'utf8');
    return raw.split('\n').map(s => s.trim()).filter(s => s.length > 0);
}

function skinSvgs(skin) {
    const dir = path.join(SKINS_DIR, skin);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.svg'));
}

test('every skin listed in skins.txt exists on disk', () => {
    for (const skin of readSkinsManifest()) {
        assert.ok(fs.existsSync(path.join(SKINS_DIR, skin)),
            `skins.txt lists "${skin}" but that folder does not exist`);
    }
});

test('skins.txt entries survive BOM and CRLF stripping', () => {
    const skins = readSkinsManifest();
    assert.ok(skins.length > 0);
    for (const skin of skins) {
        assert.strictEqual(skin, skin.trim());
        assert.ok(!skin.includes('\uFEFF'), `"${skin}" still carries a BOM`);
        assert.ok(!skin.includes('\r'), `"${skin}" still carries a CR`);
    }
});

test('no skin SVG uses an element the PDF renderer cannot draw', () => {
    // drawSvgToPdf handles rect/line/circle/path/polygon/polyline and <text>.
    // Anything else is skipped without a word, so the glyphs or shapes simply
    // never appear in the exported PDF.
    const UNSUPPORTED = ['ellipse', 'use', 'image', 'textPath', 'foreignObject'];
    const offenders = [];
    for (const skin of readSkinsManifest()) {
        for (const file of skinSvgs(skin)) {
            const svg = fs.readFileSync(path.join(SKINS_DIR, skin, file), 'utf8');
            for (const tag of UNSUPPORTED) {
                if (new RegExp('<' + tag + '[\s>]').test(svg)) {
                    offenders.push(`${skin}/${file} uses <${tag}>`);
                }
            }
        }
    }
    assert.deepStrictEqual(offenders, [], `unsupported elements: ${offenders.join(' | ')}`);
});

test('SUPPORTED lists exactly what drawSvgToPdf can draw', () => {
    // Guards the list above against drifting from the renderer.
    const src = fs.readFileSync(path.join(ROOT, 'engine', 'pdf_renderer.js'), 'utf8');
    for (const tag of SUPPORTED) {
        assert.ok(src.includes(tag), `renderer no longer mentions <${tag}>`);
    }
    assert.ok(/matchAll\(\/<text/.test(src), 'renderer lost its <text> pass');
});

test('no skin SVG relies on a group transform', () => {
    // drawSvgToPdf scans elements flat and ignores <g>, so a transform on the
    // group would silently displace all of its children.
    const offenders = [];
    for (const skin of readSkinsManifest()) {
        for (const file of skinSvgs(skin)) {
            const svg = fs.readFileSync(path.join(SKINS_DIR, skin, file), 'utf8');
            if (/<g[^>]*\stransform\s*=/.test(svg)) offenders.push(`${skin}/${file}`);
        }
    }
    assert.deepStrictEqual(offenders, [], `group transforms are ignored in: ${offenders.join(', ')}`);
});

// SVGs the app can actually request: one per component .asy basename, plus the
// three synthesised names. Anything else in a skin folder (e.g. Comp_Detalle,
// which has no .asy) is never fetched, so it is not a coverage gap.
function requestableNames() {
    const names = new Set(['intersection', 'GND', 'flag']);
    (function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (e.name.endsWith('.asy')) names.add(e.name.slice(0, -4));
        }
    })(path.join(ROOT, 'Assets', 'Component Symbols'));
    return names;
}

// Artwork that genuinely does not exist yet for a themed skin. Drawing it is a
// design job, not a code fix — listing it here keeps the test honest about the
// gap while still failing on any NEW one.
const KNOWN_SKIN_GAPS = new Set([
    'Boca Jrs/Vcc.svg',
    'Boca Jrs/nm_nobulk.svg',
    'Boca Jrs/pm_nobulk.svg',
]);

test('every registered skin covers the components Default covers', () => {
    // A missing SVG silently degrades that component to raw .asy line art while
    // the console still reports the skin as loaded.
    const requestable = requestableNames();
    const reference = skinSvgs('Default').filter(f => requestable.has(f.slice(0, -4)));

    const gaps = [];
    for (const skin of readSkinsManifest()) {
        if (skin === 'Default') continue;
        const have = new Set(skinSvgs(skin));
        for (const file of reference) {
            const key = `${skin}/${file}`;
            if (!have.has(file) && !KNOWN_SKIN_GAPS.has(key)) gaps.push(key);
        }
    }
    assert.deepStrictEqual(gaps, [], `skin coverage gaps: ${gaps.join(' | ')}`);
});

test('the known-gap list has no stale entries', () => {
    // If someone draws the missing artwork, this fails so the entry gets removed.
    const stale = [...KNOWN_SKIN_GAPS].filter((key) => {
        const [skin, file] = key.split('/');
        return fs.existsSync(path.join(SKINS_DIR, skin, file));
    });
    assert.deepStrictEqual(stale, [], `these gaps are filled now, drop them from KNOWN_SKIN_GAPS: ${stale.join(', ')}`);
});

// Art that exists in every registered skin but maps to no .asy — deliberate
// spares/variants, not mistakes. Plus two genuinely unreachable leftovers kept
// because they hold unique artwork nobody has claimed yet.
const KNOWN_ORPHANS = new Set([
    'GND_triangle.svg', 'Marcador_Bloques.svg', 'ress.svg', 'voltage_.svg',
    'Comp_Detalle.svg',
    'NPN_.svg',   // Boca Jrs only; distinct art, no NPN_.asy exists to request it
]);

test('no skin ships an unexpected SVG with no matching component', () => {
    // Catches a misspelt filename, which otherwise fails silently: the skin
    // falls back to raw .asy line art and the console still says "loaded".
    const requestable = requestableNames();
    const orphans = [];
    for (const skin of readSkinsManifest()) {
        for (const file of skinSvgs(skin)) {
            if (requestable.has(file.slice(0, -4))) continue;
            if (KNOWN_ORPHANS.has(file)) continue;
            orphans.push(`${skin}/${file}`);
        }
    }
    assert.deepStrictEqual(orphans, [], `no component would ever request: ${orphans.join(' | ')}`);
});
