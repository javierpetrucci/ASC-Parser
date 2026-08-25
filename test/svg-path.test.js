const test = require('node:test');
const assert = require('node:assert');
const { loadEngine } = require('./helpers/load-engine.js');

const { drawSvgToPdf } = loadEngine();

// Records every doc.lines() call so we can inspect the emitted geometry.
function recordingDoc() {
    const calls = [];
    const noop = () => {};
    return {
        calls,
        setLineDashPattern: noop, setDrawColor: noop, setFillColor: noop,
        setLineWidth: noop, setLineCap: noop, setLineJoin: noop,
        line: noop, ellipse: noop, fill: noop, stroke: noop, fillStroke: noop,
        lines(segments, x, y, scale, style, closed) {
            calls.push({ start: [x, y], segments, style, closed });
        },
    };
}

// Walks a recorded call back into absolute points.
function pointsOf(call) {
    let [x, y] = call.start;
    const pts = [[x, y]];
    for (const [dx, dy] of call.segments) {
        x += dx; y += dy;
        pts.push([x, y]);
    }
    return pts;
}

function render(svg) {
    const doc = recordingDoc();
    drawSvgToPdf(doc, svg, 0, 0, 'R0', 0, 0);
    return doc.calls;
}

const wrap = (body) => `<svg viewBox="0 0 100 100">${body}</svg>`;

test('a path with two subpaths emits two separate strokes', () => {
    // Regression: all points used to land in one flat list, so jsPDF drew a
    // connecting line from the end of subpath 1 to the start of subpath 2, and
    // a single Z closed across both.
    const calls = render(wrap(
        '<path fill="none" stroke="#000" d="M 0 0 L 10 0 L 10 10 Z M 50 0 L 60 0 L 60 10 Z"/>'
    ));

    assert.strictEqual(calls.length, 2, 'expected one draw call per subpath');
    assert.deepStrictEqual(pointsOf(calls[0]), [[0, 0], [10, 0], [10, 10], [0, 0]]);
    assert.deepStrictEqual(pointsOf(calls[1]), [[50, 0], [60, 0], [60, 10], [50, 0]]);

    // The spurious bridge (10,10) -> (50,0) must not exist anywhere.
    const allSegments = calls.flatMap(c => c.segments);
    assert.ok(
        !allSegments.some(([dx, dy]) => dx === 40 && dy === -10),
        'found the spurious segment joining the two subpaths'
    );
});

test('each subpath carries its own closed flag', () => {
    const calls = render(wrap(
        '<path fill="none" stroke="#000" d="M 0 0 L 10 0 L 10 10 Z M 50 0 L 60 0"/>'
    ));
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0].closed, true, 'first subpath ends with Z');
    assert.strictEqual(calls[1].closed, false, 'second subpath is open');
});

test('a single-subpath path is unaffected', () => {
    const calls = render(wrap('<path fill="none" stroke="#000" d="M 0 0 L 10 0 L 10 10"/>'));
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(pointsOf(calls[0]), [[0, 0], [10, 0], [10, 10]]);
});

test('many subpaths all survive', () => {
    const d = Array.from({ length: 12 }, (_, i) => `M ${i * 10} 0 L ${i * 10 + 5} 5`).join(' ');
    const calls = render(wrap(`<path fill="none" stroke="#000" d="${d}"/>`));
    assert.strictEqual(calls.length, 12);
});

test('an unsupported path command warns instead of silently dropping geometry', () => {
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
        render(wrap('<path fill="none" stroke="#000" d="M 0 0 A 5 5 0 0 1 10 10"/>'));
    } finally {
        console.warn = originalWarn;
    }
    assert.ok(
        warnings.some(w => w.includes('Unsupported path command')),
        'expected a warning for the A (arc) command'
    );
});

test('the d attribute is not confused with id', () => {
    // /d="([^"]+)"/ without a word boundary would capture id="..." when id
    // comes first, feeding the parser a component name instead of geometry.
    const calls = render(wrap(
        '<path id="Layer_1" fill="none" stroke="#000" d="M 0 0 L 10 0"/>'
    ));
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(pointsOf(calls[0]), [[0, 0], [10, 0]]);
});

test('polygon and polyline still render as before', () => {
    const poly = render(wrap('<polygon fill="none" stroke="#000" points="0,0 10,0 10,10"/>'));
    assert.strictEqual(poly.length, 1);
    assert.strictEqual(poly[0].segments.length, 3, 'polygon closes back to start');

    const line = render(wrap('<polyline fill="none" stroke="#000" points="0,0 10,0 10,10"/>'));
    assert.strictEqual(line.length, 1);
    assert.strictEqual(line[0].segments.length, 2, 'polyline stays open');
});

// ── Invisible elements ───────────────────────────────────────────────────────
// resolveDrawMode used to fall through to 'S' (stroke) whenever there was no
// fill, without ever consulting hasStroke. So fill="none" stroke="none" — the
// standard way to disable a rough.js hachure layer — was stroked in black,
// painting diagonal shading across every TC2_Rough symbol.

test('an element with fill:none and stroke:none draws nothing', () => {
    for (const el of [
        '<path d="M 0 0 L 10 0 L 10 10 Z" fill="none" stroke="none"/>',
        '<rect x="0" y="0" width="10" height="10" fill="none" stroke="none"/>',
        '<circle cx="5" cy="5" r="4" fill="none" stroke="none"/>',
        '<polygon points="0,0 10,0 10,10" fill="none" stroke="none"/>',
        '<polyline points="0,0 10,0" fill="none" stroke="none"/>',
    ]) {
        assert.strictEqual(render(wrap(el)).length, 0, `drew something for: ${el}`);
    }
});

test('a line with stroke:none draws nothing', () => {
    const doc = recordingDoc();
    let drew = 0;
    doc.line = () => { drew++; };
    drawSvgToPdf(doc, wrap('<line x1="0" y1="0" x2="10" y2="10" stroke="none"/>'), 0, 0, 'R0', 0, 0);
    assert.strictEqual(drew, 0);
});

test('every subpath of a disabled path is skipped, not just the first', () => {
    // The real case: a 20-subpath hachure layer marked stroke="none".
    const d = Array.from({ length: 20 }, (_, i) => `M 0 ${i * 2} L 40 ${i * 2 + 10}`).join(' ');
    assert.strictEqual(render(wrap(`<path d="${d}" fill="none" stroke="none"/>`)).length, 0);
});

test('fill:none WITHOUT a stroke attribute still strokes', () => {
    // Skins commonly put the stroke on a parent <g class="...">, which this flat
    // element scan does not see. Those elements depend on the stroke fallback,
    // so absence of a stroke attribute must NOT be treated as stroke="none".
    const calls = render(wrap('<path d="M 0 0 L 10 0" fill="none"/>'));
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].style, 'S');
});

test('an inline stroke overrides a class that disables it', () => {
    const svg = '<svg viewBox="0 0 100 100"><defs><style>.hidden{stroke:none;fill:none;}</style></defs>'
        + '<path class="hidden" d="M 0 0 L 10 0" stroke="#000"/></svg>';
    assert.strictEqual(render(svg).length, 1, 'the inline stroke should win');
});

test('a class that disables the stroke hides the element', () => {
    const svg = '<svg viewBox="0 0 100 100"><defs><style>.hidden{stroke:none;fill:none;}</style></defs>'
        + '<path class="hidden" d="M 0 0 L 10 0"/></svg>';
    assert.strictEqual(render(svg).length, 0);
});

test('a filled shape with stroke:none is still filled', () => {
    // stroke="none" removes the outline, not the shape.
    const calls = render(wrap('<rect x="0" y="0" width="10" height="10" fill="#000" stroke="none"/>'));
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].style, 'F');
});

// ── Multi-subpath fills ──────────────────────────────────────────────────────
// A <path> holding an outer and an inner contour is ONE shape. Every diode in
// the skin set is drawn that way — diode.asy's triangle is plain LINEs, and the
// SVG reproduces the hollow outline with two oppositely-wound contours. Filling
// each subpath on its own floods the middle solid, which buried the blue and
// yellow underneath the Boca Jrs diodes.

// Records the compound-path API as well as doc.lines().
function pathDoc() {
    const ops = [];
    const noop = () => {};
    return {
        ops,
        setLineDashPattern: noop, setDrawColor: noop, setFillColor: noop,
        setLineWidth: noop, setLineCap: noop, setLineJoin: noop,
        line: noop, ellipse: noop,
        lines: (segments, x, y, scale, style) => ops.push('lines:' + style),
        moveTo: () => ops.push('moveTo'),
        lineTo: () => ops.push('lineTo'),
        close: () => ops.push('close'),
        fill: () => ops.push('fill'),
        fillEvenOdd: () => ops.push('fillEvenOdd'),
        stroke: () => ops.push('stroke'),
        fillStroke: () => ops.push('fillStroke'),
        fillStrokeEvenOdd: () => ops.push('fillStrokeEvenOdd'),
    };
}

function renderWith(doc, svg) {
    drawSvgToPdf(doc, svg, 0, 0, 'R0', 0, 0);
    return doc.ops;
}

test('a filled path with two contours fills once, as a ring', () => {
    const doc = pathDoc();
    const ops = renderWith(doc, wrap(
        '<path fill="#103f79" d="M 0 0 L 30 0 L 15 26 Z M 5 4 L 25 4 L 15 21 Z"/>'
    ));
    assert.strictEqual(ops.filter(o => o === 'moveTo').length, 2, 'both contours in one path');
    assert.strictEqual(ops.filter(o => o === 'fill').length, 1, 'a single fill for the whole shape');
    assert.ok(!ops.some(o => o.startsWith('lines:F')),
        'no per-subpath fill — that is what painted over the colours');
});

test('fill-rule: evenodd reaches the paint operator', () => {
    const svg = '<svg viewBox="0 0 100 100"><defs><style>.ring{fill:#000;fill-rule:evenodd;}</style></defs>'
        + '<path class="ring" d="M 0 0 L 30 0 L 15 26 Z M 5 4 L 25 4 L 15 21 Z"/></svg>';
    assert.ok(renderWith(pathDoc(), svg).includes('fillEvenOdd'));
});

test('a stroked-and-filled ring still gets its outline', () => {
    const ops = renderWith(pathDoc(), wrap(
        '<path fill="#103f79" stroke="#000" d="M 0 0 L 30 0 L 15 26 Z M 5 4 L 25 4 L 15 21 Z"/>'
    ));
    assert.ok(ops.includes('fillStroke'), 'fill and stroke in one operation');
});

test('an unfilled path with two contours is still two separate strokes', () => {
    // The regression above must not collapse independent pen strokes into one.
    const ops = renderWith(pathDoc(), wrap(
        '<path fill="none" stroke="#000" d="M 0 0 L 10 0 Z M 50 0 L 60 0 Z"/>'
    ));
    assert.strictEqual(ops.filter(o => o === 'lines:S').length, 2);
    assert.ok(!ops.includes('moveTo'));
});
