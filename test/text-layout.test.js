const test = require('node:test');
const assert = require('node:assert');
const { loadEngine } = require('./helpers/load-engine.js');

const { drawLTSpiceText, pinAlignmentToTextAlignment } = loadEngine();

// Captures what drawLTSpiceText hands to jsPDF. Text width is a fixed advance
// per character so the geometry is predictable.
const CHAR_W = 6;
function probe() {
    const calls = [];
    return {
        calls,
        _size: 0,
        setFontSize(n) { this._size = n; },
        getTextWidth(t) { return t.length * CHAR_W; },
        text(str, x, y, opts) { calls.push({ str, x, y, ...opts }); },
    };
}

function place(text, x, y, align, pt = 20) {
    const doc = probe();
    drawLTSpiceText(doc, text, x, y, align, pt);
    return doc.calls[0];
}

test('empty text draws nothing', () => {
    const doc = probe();
    drawLTSpiceText(doc, '', 10, 10, 'Left', 20);
    drawLTSpiceText(doc, null, 10, 10, 'Left', 20);
    assert.strictEqual(doc.calls.length, 0);
});

test('Left anchors the left edge at x', () => {
    const c = place('abcd', 100, 50, 'Left');
    assert.strictEqual(c.x, 100);
    assert.strictEqual(c.angle, 0);
});

test('Right places the text so it ENDS at x', () => {
    const c = place('abcd', 100, 50, 'Right');
    assert.strictEqual(c.x, 100 - 4 * CHAR_W);
});

test('Center splits the width either side of x', () => {
    const c = place('abcd', 100, 50, 'Center');
    assert.strictEqual(c.x, 100 - (4 * CHAR_W) / 2);
});

test('Left, Right and Center share one baseline', () => {
    const ys = ['Left', 'Right', 'Center'].map(a => place('abcd', 100, 50, a).y);
    assert.strictEqual(new Set(ys).size, 1, `baselines diverged: ${ys}`);
});

test('the horizontal baseline follows the documented GDI approximation', () => {
    // By = y - H/2 + A, with H = ptSize and A = ptSize * 0.8.
    const pt = 20;
    const c = place('abcd', 100, 50, 'Left', pt);
    assert.ok(Math.abs(c.y - (50 - pt / 2 + pt * 0.8)) < 1e-9, `baseline was ${c.y}`);
});

test('Top sits below the anchor and Bottom above it', () => {
    const top = place('abcd', 100, 50, 'Top');
    const bottom = place('abcd', 100, 50, 'Bottom');
    assert.ok(top.y > 50, 'Top should push the baseline down from the anchor');
    assert.ok(bottom.y < 50, 'Bottom should pull the baseline up from the anchor');
    // Both centre horizontally.
    assert.strictEqual(top.x, 100 - (4 * CHAR_W) / 2);
    assert.strictEqual(bottom.x, top.x);
});

test('vertical alignments rotate the text 90 degrees', () => {
    for (const align of ['VLeft', 'VRight', 'VCenter', 'VTop', 'VBottom']) {
        assert.strictEqual(place('abcd', 100, 50, align).angle, 90, `${align} was not rotated`);
    }
});

test('a vertical run is the horizontal one rotated about the anchor', () => {
    // drawLTSpiceText rotates the computed baseline point 90 degrees CCW around
    // (x, y), matching LTSpice's affine transform.
    const x = 100, y = 50;
    const h = place('abcd', x, y, 'Left');
    const v = place('abcd', x, y, 'VLeft');

    const relX = h.x - x, relY = h.y - y;
    assert.ok(Math.abs(v.x - (x + relY)) < 1e-9, `x was ${v.x}`);
    assert.ok(Math.abs(v.y - (y - relX)) < 1e-9, `y was ${v.y}`);
});

test('font size is applied before the width is measured', () => {
    const doc = probe();
    drawLTSpiceText(doc, 'abcd', 0, 0, 'Right', 46);
    assert.strictEqual(doc._size, 46);
});

test('longer text shifts Right-aligned output further left', () => {
    const short = place('ab', 100, 50, 'Right').x;
    const long  = place('abcdefgh', 100, 50, 'Right').x;
    assert.ok(long < short, 'width was not accounted for');
});

test('pin alignments map to a keyword plus an outward offset', () => {
    const cases = {
        LEFT:    { textAlign: 'Left',    dx:  1, dy:  0 },
        RIGHT:   { textAlign: 'Right',   dx: -1, dy:  0 },
        TOP:     { textAlign: 'Top',     dx:  0, dy:  1 },
        BOTTOM:  { textAlign: 'Bottom',  dx:  0, dy: -1 },
        VLEFT:   { textAlign: 'VLeft',   dx:  0, dy: -1 },
        VRIGHT:  { textAlign: 'VRight',  dx:  0, dy:  1 },
        VTOP:    { textAlign: 'VTop',    dx:  1, dy:  0 },
        VBOTTOM: { textAlign: 'VBottom', dx: -1, dy:  0 },
    };
    for (const [input, expected] of Object.entries(cases)) {
        const got = pinAlignmentToTextAlignment(input);
        assert.deepStrictEqual({ textAlign: got.textAlign, dx: got.dx, dy: got.dy }, expected, input);
        // Case must not matter — .asy files are inconsistent about it.
        assert.strictEqual(pinAlignmentToTextAlignment(input.toLowerCase()).textAlign, expected.textAlign);
    }
});

test('an unknown pin alignment degrades to Left with no offset', () => {
    const got = pinAlignmentToTextAlignment('NONE');
    assert.strictEqual(got.textAlign, 'Left');
    assert.strictEqual(got.dx, 0);
    assert.strictEqual(got.dy, 0);
});
