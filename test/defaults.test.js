const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadEngine, ROOT } = require('./helpers/load-engine.js');

const {
    COMPONENT_DEFAULTS, asyPathToUrlPath, transformOffset, transformAlignment,
} = loadEngine();

// IMPORTANT: ox/oy/align in this table are in LOCAL (pre-rotation) space, even
// inside a per-orientation entry — pdf_renderer.js always runs them through
// transformOffset/transformAlignment with the symbol's orientation. So two
// orientations holding IDENTICAL raw values still render differently, and a
// horizontal keyword such as 'Left' inside an R90 entry is normal. Invariants
// written against the raw values produce false positives; assert on the
// TRANSFORMED result instead.

const ROTATIONS = ['R0', 'R90', 'R180', 'R270'];
const entries = Object.entries(COMPONENT_DEFAULTS);

const finalPlacement = (def, orientation) => {
    const o = transformOffset(def.ox, def.oy, orientation);
    return { x: o.x + 0, y: o.y + 0, align: transformAlignment(def.align, orientation) };
};

test('the table is not empty', () => {
    assert.ok(entries.length > 0);
});

test('every component defines all four rotations', () => {
    for (const [name, table] of entries) {
        for (const rot of ROTATIONS) {
            assert.ok(table[rot], `${name} is missing ${rot}`);
        }
    }
});

test('every window entry has numeric offsets and a known alignment', () => {
    const VALID = new Set(['Left', 'Right', 'Center', 'Top', 'Bottom',
                            'VLeft', 'VRight', 'VCenter', 'VTop', 'VBottom']);
    for (const [name, table] of entries) {
        for (const rot of ROTATIONS) {
            for (const [idx, def] of Object.entries(table[rot])) {
                assert.strictEqual(typeof def.ox, 'number', `${name}.${rot}[${idx}].ox`);
                assert.strictEqual(typeof def.oy, 'number', `${name}.${rot}[${idx}].oy`);
                assert.ok(Number.isFinite(def.ox) && Number.isFinite(def.oy),
                    `${name}.${rot}[${idx}] has a non-finite offset`);
                assert.ok(VALID.has(def.align), `${name}.${rot}[${idx}] has align "${def.align}"`);
            }
        }
    }
});

test('every orientation declares the same set of window indexes', () => {
    // A component that lists index 3 for R0 but not for R180 loses its value
    // label on half its rotations.
    for (const [name, table] of entries) {
        const reference = Object.keys(table.R0).sort().join(',');
        for (const rot of ROTATIONS) {
            assert.strictEqual(Object.keys(table[rot]).sort().join(','), reference,
                `${name}.${rot} declares a different set of window indexes than R0`);
        }
    }
});

test('R90 and R270 do not resolve to the same final placement', () => {
    // The meaningful check: after the transform, the two rotations must put the
    // label somewhere different. Raw duplicates are fine — they transform apart.
    const offenders = [];
    for (const [name, table] of entries) {
        for (const idx of Object.keys(table.R90)) {
            const a = table.R90[idx], b = table.R270[idx];
            if (!a || !b) continue;
            const fa = finalPlacement(a, 'R90');
            const fb = finalPlacement(b, 'R270');
            if (fa.x === fb.x && fa.y === fb.y && fa.align === fb.align) {
                offenders.push(`${name}[${idx}]`);
            }
        }
    }
    assert.deepStrictEqual(offenders, [], `R90 and R270 render identically for: ${offenders.join(', ')}`);
});

test('R0 and R180 do not resolve to the same final placement', () => {
    const offenders = [];
    for (const [name, table] of entries) {
        for (const idx of Object.keys(table.R0)) {
            const a = table.R0[idx], b = table.R180[idx];
            if (!a || !b) continue;
            const fa = finalPlacement(a, 'R0');
            const fb = finalPlacement(b, 'R180');
            if (fa.x === fb.x && fa.y === fb.y && fa.align === fb.align) {
                offenders.push(`${name}[${idx}]`);
            }
        }
    }
    assert.deepStrictEqual(offenders, [], `R0 and R180 render identically for: ${offenders.join(', ')}`);
});

test('every table key has a matching .asy on disk', () => {
    const symbolsDir = path.join(ROOT, 'Assets', 'Component Symbols');
    const onDisk = new Set();
    (function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (e.name.endsWith('.asy')) onDisk.add(e.name.slice(0, -4));
        }
    })(symbolsDir);

    const missing = entries.map(([n]) => n).filter(n => !onDisk.has(n));
    assert.deepStrictEqual(missing, [], `no .asy on disk for: ${missing.join(', ')}`);
});

test('asyPathToUrlPath collapses the doubled separators .asc files contain', () => {
    const BS = String.fromCharCode(92);
    assert.strictEqual(asyPathToUrlPath('TCLib' + BS + BS + 'OA_Ideal'), 'TCLib/OA_Ideal');
    assert.strictEqual(asyPathToUrlPath('TCLib' + BS + 'Special' + BS + 'arrow'), 'TCLib/Special/arrow');
    assert.strictEqual(asyPathToUrlPath('res'), 'res');
    // A leading separator would make the URL absolute and escape the asset dir.
    assert.strictEqual(asyPathToUrlPath(BS + 'Misc' + BS + 'signal'), 'Misc/signal');
});
