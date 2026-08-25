const test = require('node:test');
const assert = require('node:assert');
const { loadEngine } = require('./helpers/load-engine.js');

const { transformOffset, transformAlignment } = loadEngine();

// The engine runs in a vm realm, so the objects it returns have that realm's
// Object.prototype and deepStrictEqual would reject them on prototype alone.
// Re-wrap into a plain object belonging to this realm before comparing.
// Adding 0 also collapses -0 to 0: mirroring negates x, so an x of 0 comes back
// as -0, which deepStrictEqual reports as a mismatch. The two are arithmetically
// interchangeable everywhere the renderer uses them.
const off = (x, y, orientation) => {
    const r = transformOffset(x, y, orientation);
    return { x: r.x + 0, y: r.y + 0 };
};

const ORIENTATIONS = ['R0', 'R90', 'R180', 'R270', 'M0', 'M90', 'M180', 'M270'];
const ALIGNMENTS = ['Left', 'Right', 'Center', 'Top', 'Bottom',
                    'VLeft', 'VRight', 'VCenter', 'VTop', 'VBottom'];

test('transformOffset rotates first, then mirrors', () => {
    // (1, 0) walked around the four rotations
    assert.deepStrictEqual(off(1, 0, 'R0'),   { x: 1, y: 0 });
    assert.deepStrictEqual(off(1, 0, 'R90'),  { x: 0, y: 1 });
    assert.deepStrictEqual(off(1, 0, 'R180'), { x: -1, y: 0 });
    assert.deepStrictEqual(off(1, 0, 'R270'), { x: 0, y: -1 });

    // Mirroring flips x AFTER the rotation
    assert.deepStrictEqual(off(1, 0, 'M0'),   { x: -1, y: 0 });
    assert.deepStrictEqual(off(1, 0, 'M90'),  { x: 0, y: 1 });
    assert.deepStrictEqual(off(1, 0, 'M180'), { x: 1, y: 0 });
    assert.deepStrictEqual(off(1, 0, 'M270'), { x: 0, y: -1 });
});

test('transformOffset is identity for R0 and involutive for R180', () => {
    for (const [x, y] of [[3, 7], [-5, 2], [0, 0]]) {
        assert.deepStrictEqual(off(x, y, 'R0'), { x, y });
        const once = off(x, y, 'R180');
        assert.deepStrictEqual(off(once.x, once.y, 'R180'), { x, y });
    }
});

// Golden table. This is the semantics the PDF engine implements and the spec
// describes; the deleted canvas debug renderer had several of these inverted,
// so pinning them down is the point of this suite.
const ALIGNMENT_GOLDEN = {
    R0:   { Left: 'Left', Right: 'Right', Center: 'Center', Top: 'Top', Bottom: 'Bottom',
            VLeft: 'VLeft', VRight: 'VRight', VCenter: 'VCenter', VTop: 'VTop', VBottom: 'VBottom' },
    R90:  { Left: 'VRight', Right: 'VLeft', Center: 'VCenter', Top: 'VBottom', Bottom: 'VTop',
            VLeft: 'Left', VRight: 'Right', VCenter: 'Center', VTop: 'Top', VBottom: 'Bottom' },
    R180: { Left: 'Right', Right: 'Left', Center: 'Center', Top: 'Bottom', Bottom: 'Top',
            VLeft: 'VRight', VRight: 'VLeft', VCenter: 'VCenter', VTop: 'VBottom', VBottom: 'VTop' },
    R270: { Left: 'VLeft', Right: 'VRight', Center: 'VCenter', Top: 'VTop', Bottom: 'VBottom',
            VLeft: 'Right', VRight: 'Left', VCenter: 'Center', VTop: 'Bottom', VBottom: 'Top' },
};

test('transformAlignment matches the golden table for the four rotations', () => {
    for (const orientation of ['R0', 'R90', 'R180', 'R270']) {
        for (const align of ALIGNMENTS) {
            assert.strictEqual(
                transformAlignment(align, orientation),
                ALIGNMENT_GOLDEN[orientation][align],
                `${align} @ ${orientation}`
            );
        }
    }
});

test('mirroring swaps Left/Right and VTop/VBottom, leaving VLeft/VRight alone', () => {
    // Vertical text is rotated 90 degrees, so a HORIZONTAL mirror flips its
    // Top/Bottom axis, not its Left/Right one.
    assert.strictEqual(transformAlignment('Left', 'M0'), 'Right');
    assert.strictEqual(transformAlignment('Right', 'M0'), 'Left');
    assert.strictEqual(transformAlignment('Top', 'M0'), 'Top');
    assert.strictEqual(transformAlignment('Bottom', 'M0'), 'Bottom');
    assert.strictEqual(transformAlignment('VLeft', 'M0'), 'VLeft');
    assert.strictEqual(transformAlignment('VRight', 'M0'), 'VRight');
    assert.strictEqual(transformAlignment('VTop', 'M0'), 'VBottom');
    assert.strictEqual(transformAlignment('VBottom', 'M0'), 'VTop');
});

test('transformAlignment always returns a known alignment keyword', () => {
    for (const orientation of ORIENTATIONS) {
        for (const align of ALIGNMENTS) {
            assert.ok(
                ALIGNMENTS.includes(transformAlignment(align, orientation)),
                `${align} @ ${orientation} produced an unknown keyword`
            );
        }
    }
});

test('applying R90 four times returns to the original alignment', () => {
    for (const align of ALIGNMENTS) {
        let a = align;
        for (let i = 0; i < 4; i++) a = transformAlignment(a, 'R90');
        assert.strictEqual(a, align, `${align} did not survive 4x R90`);
    }
});
