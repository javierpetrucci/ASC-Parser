/* Client half of the contact sheet. Inlined into rough_preview.html by
   tools/build_rough_preview.js — it runs in the browser only. */
(function () {
'use strict';

var D = RoughPen.DEFAULTS;
var SEEDS = ['A', 'B', 'C'];
var PAD = 10;          // symbol units of breathing room around the artwork
var GRID = 16;         // LTSpice's own grid

var PEN_CONTROLS = [
    { k: 'penWidth',   min: 0.5, max: 4,   step: 0.1,  label: 'Pen width',   hint: 'One nib for the whole skin, whatever the source artwork used.' },
    { k: 'warp',       min: 0,   max: 2,   step: 0.05, label: 'Warp',        hint: 'One distortion field per symbol. Keeps touching parts touching.' },
    { k: 'warpPeriod', min: 20,  max: 140, step: 5,    label: 'Warp period', hint: 'Its wavelength, in units. Near symbol size bends the whole shape.' },
    { k: 'tremor',     min: 0,   max: 1.2, step: 0.02, label: 'Tremor',      hint: 'Hand unsteadiness along a stroke.' },
    { k: 'bow',        min: 0,   max: 2,   step: 0.05, label: 'Bow',         hint: 'A freehand straight line is a shallow arc.' },
    { k: 'overshoot',  min: 0,   max: 3,   step: 0.1,  label: 'Overshoot',   hint: 'How far the pen slides past a free end.' },
    { k: 'overshootP', min: 0,   max: 1,   step: 0.05, label: 'Overshoot rate', hint: 'Fraction of free ends that overshoot at all.' }
];

var SHAPE_CONTROLS = [
    { k: 'lock',        min: 0,  max: 16, step: 0.5, label: 'Pin lock radius', hint: 'Straight, undistorted approach around a pin.' },
    { k: 'step',        min: 1,  max: 8,  step: 0.25, label: 'Sample step',    hint: 'Lower is smoother and heavier.' },
    { k: 'cornerAngle', min: 5,  max: 90, step: 5,   label: 'Corner break',    hint: 'Turn angle that splits a stroke, so corners cross.' },
    { k: 'seamOverlap', min: 0,  max: 45, step: 1,   label: 'Circle overlap',  hint: 'How far a closed sweep runs past its own start.' },
    { k: 'rotateMax',   min: 0,  max: 8,  step: 0.25, label: 'Mark rotation',  hint: 'Rigid skew of small filled marks (arrowheads, glyphs).' },
    { k: 'ribbonMax',   min: 0,  max: 6,  step: 0.1,  label: 'Ribbon width max', hint: 'Widest filled sliver still read as a drawn line, not a blob.' },
    { k: 'outlineMin',  min: 0,  max: 20, step: 0.5,  label: 'Outline min size', hint: 'Smallest solid shape traced as an outline instead of left solid.' }
];

var state = {};
var seedSalt = 0;
var view = { pins: true, grid: true, vertex: false, zoom: 2 };

function resetState() {
    PEN_CONTROLS.concat(SHAPE_CONTROLS).forEach(function (c) { state[c.k] = D[c.k]; });
}

// ── Controls ────────────────────────────────────────────────────────────────

function buildControls(hostId, specs) {
    var host = document.getElementById(hostId);
    specs.forEach(function (c) {
        var wrap = document.createElement('div');
        wrap.className = 'ctl';
        wrap.innerHTML =
            '<label for="c-' + c.k + '">' + c.label + '</label>' +
            '<output id="o-' + c.k + '"></output>' +
            '<input type="range" id="c-' + c.k + '" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '">' +
            '<span class="hint">' + c.hint + '</span>';
        host.appendChild(wrap);

        var input = wrap.querySelector('input');
        var out = wrap.querySelector('output');
        input.value = state[c.k];
        out.textContent = format(state[c.k]);
        input.addEventListener('input', function () {
            state[c.k] = parseFloat(input.value);
            out.textContent = format(state[c.k]);
            schedule();
        });
        c._input = input; c._out = out;
    });
}

function format(v) { return Number.isInteger(v) ? String(v) : v.toFixed(2); }

function syncControls() {
    PEN_CONTROLS.concat(SHAPE_CONTROLS).forEach(function (c) {
        if (!c._input) return;
        c._input.value = state[c.k];
        c._out.textContent = format(state[c.k]);
    });
}

// ── SVG assembly ────────────────────────────────────────────────────────────

function overlay(box, pins, strokes) {
    var out = '';
    if (view.grid) {
        var g = '';
        var x0 = Math.ceil(box.x0 / GRID) * GRID, x1 = box.x0 + box.w;
        var y0 = Math.ceil(box.y0 / GRID) * GRID, y1 = box.y0 + box.h;
        for (var x = x0; x <= x1; x += GRID) g += 'M' + x + ' ' + box.y0 + 'V' + y1;
        for (var y = y0; y <= y1; y += GRID) g += 'M' + box.x0 + ' ' + y + 'H' + x1;
        if (g) out += '<path d="' + g + '" fill="none" stroke="var(--paper-grid)" stroke-width="0.5"/>';
    }
    if (view.vertex && strokes) {
        var v = '';
        strokes.forEach(function (s) {
            s.pts.forEach(function (p) {
                v += 'M' + (p[0] - 0.6) + ' ' + p[1] + 'h1.2';
            });
        });
        out += '<path d="' + v + '" fill="none" stroke="#2B4A80" stroke-width="0.5" opacity="0.7"/>';
    }
    if (view.pins && pins.length) {
        var c = '', R = 3.2;
        pins.forEach(function (r) {
            var p = r.pin || r;
            if (r.role === 'hold') {
                // A marker centred on the terminal: no stroke lands here, so
                // ring it rather than crossing it.
                out += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + R +
                    '" fill="none" stroke="var(--pin)" stroke-width="0.7" stroke-dasharray="1.4 1.4"/>';
            } else {
                c += 'M' + (p[0] - R) + ' ' + p[1] + 'h' + (2 * R) +
                     'M' + p[0] + ' ' + (p[1] - R) + 'v' + (2 * R);
            }
        });
        if (c) out += '<path d="' + c + '" fill="none" stroke="var(--pin)" stroke-width="0.7"/>';
    }
    return out;
}

function frame(inner, box, extra) {
    var w = box.w * view.zoom, h = box.h * view.zoom;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) +
        '" viewBox="' + box.x0 + ' ' + box.y0 + ' ' + box.w + ' ' + box.h + '">' + extra + inner + '</svg>';
}

// Strips the outer <svg> wrapper so the body can be re-framed at our viewBox.
function innerOf(svgText) {
    var m = svgText.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/);
    return m ? m[1] : svgText;
}

// ── Per-component work ──────────────────────────────────────────────────────

function boxOf(comp) {
    var doc = RoughPen.readSvg(comp.svg, state);
    var pts = [];
    doc.prims.forEach(function (p) { pts = pts.concat(RoughPen.primPoints(p)); });
    comp.pins.forEach(function (p) { pts.push(p); });
    if (!pts.length) pts = [[0, 0], [32, 32]];
    var b = RoughPen.bbox(pts);
    return { x0: b.x0 - PAD, y0: b.y0 - PAD, w: b.w + 2 * PAD, h: b.h + 2 * PAD };
}

function landed(strokes, pin) {
    for (var i = 0; i < strokes.length; i++) {
        for (var j = 0; j < strokes[i].pts.length; j++) {
            if (RoughPen.dist(strokes[i].pts[j], pin) < 1e-6) return true;
        }
    }
    return false;
}

function renderCard(comp, card) {
    var box = comp._box || (comp._box = boxOf(comp));

    var results = SEEDS.map(function (label) {
        return RoughPen.roughen(comp.svg, Object.assign({}, state, {
            pins: comp.pins,
            seed: comp.name + '|' + label + '|' + seedSalt
        }));
    });

    var report = results[0].pins.report;
    var wanted = report.filter(function (r) { return r.role === 'landing'; });
    var holds = report.filter(function (r) { return r.role === 'hold'; }).length;

    var worst = wanted.length;
    results.forEach(function (res) {
        var hit = wanted.filter(function (r) { return landed(res.strokes, r.pin); }).length;
        if (hit < worst) worst = hit;
    });

    var html = '<div class="panel is-src"><span class="cap">Default</span>' +
        '<div class="frame">' + frame(innerOf(comp.svg), box, overlay(box, report, null)) + '</div></div>';
    results.forEach(function (res, i) {
        html += '<div class="panel"><span class="cap">Seed ' + SEEDS[i] + '</span>' +
            '<div class="frame">' + frame(innerOf(res.svg), box, overlay(box, report, res.strokes)) + '</div></div>';
    });
    card.querySelector('.panels').innerHTML = html;

    var badge = card.querySelector('.badge');
    if (!wanted.length) {
        badge.className = 'badge none';
        badge.textContent = holds ? holds + ' centred' : 'no pins';
    } else if (worst === wanted.length) {
        badge.className = 'badge ok';
        badge.textContent = worst + '/' + wanted.length + ' pins exact' + (holds ? ' +' + holds + ' centred' : '');
    } else {
        badge.className = 'badge warn';
        badge.textContent = worst + '/' + wanted.length + ' pins exact';
    }
    card.querySelector('.meta').textContent = results[0].strokes.length + ' strokes';
    return { pins: wanted.length, hit: worst };
}

// ── Sheet ───────────────────────────────────────────────────────────────────

var cards = [];

function buildSheet() {
    var sheet = document.getElementById('sheet');
    COMPONENTS.forEach(function (comp) {
        var card = document.createElement('section');
        card.className = 'card';
        card.innerHTML =
            '<header><h3>' + comp.name + '</h3><span class="badge none">&hellip;</span>' +
            '<span class="meta"></span></header><div class="panels"></div>';
        sheet.appendChild(card);
        cards.push({ comp: comp, el: card });
    });
}

var pending = null;

function schedule() {
    if (pending) clearTimeout(pending);
    pending = setTimeout(run, 90);
}

function run() {
    pending = null;
    var i = 0, pins = 0, hits = 0, bad = [];

    function chunk() {
        var end = Math.min(i + 6, cards.length);
        for (; i < end; i++) {
            var r = renderCard(cards[i].comp, cards[i].el);
            pins += r.pins; hits += r.hit;
            if (r.pins && r.hit < r.pins) bad.push(cards[i].comp.name);
        }
        // setTimeout, not requestAnimationFrame: a page in a background tab gets
        // no animation frames and would stall here half-rendered.
        if (i < cards.length) { setTimeout(chunk, 0); return; }

        var el = document.getElementById('status');
        var okAll = hits === pins;
        el.className = 'status' + (okAll ? '' : ' bad');
        el.innerHTML = '<strong>' + hits + '/' + pins + '</strong> pin landings exact' +
            '<div class="detail">' +
            (okAll
                ? COMPONENTS.length + ' symbols &middot; ' + SEEDS.length + ' seeds each'
                : 'off by more than 1e-6: ' + bad.join(', ')) +
            '</div>';
    }
    chunk();
}

// ── Wire up ─────────────────────────────────────────────────────────────────

resetState();
buildControls('ctl-pen', PEN_CONTROLS);
buildControls('ctl-shape', SHAPE_CONTROLS);
buildSheet();
run();

['pins', 'grid', 'vertex'].forEach(function (k) {
    document.getElementById('t-' + k).addEventListener('change', function (e) {
        view[k] = e.target.checked;
        schedule();
    });
});

var zoom = document.getElementById('zoom');
zoom.addEventListener('input', function () {
    view.zoom = parseFloat(zoom.value);
    document.getElementById('zoom-out').textContent = view.zoom.toFixed(1) + '×';
    schedule();
});

document.getElementById('reseed').addEventListener('click', function () { seedSalt++; run(); });

document.getElementById('reset').addEventListener('click', function () {
    resetState(); syncControls(); run();
});

document.getElementById('copy').addEventListener('click', function (e) {
    var lines = Object.keys(state).sort().map(function (k) {
        return '    ' + k + ': ' + state[k];
    });
    var txt = '{\n' + lines.join(',\n') + '\n}';
    var btn = e.target;
    function done(ok) { btn.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(function () { btn.textContent = 'Copy settings'; }, 1600); }
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { done(true); }, function () { done(false); });
    else done(false);
});

}());
