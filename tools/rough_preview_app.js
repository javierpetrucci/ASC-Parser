/* Client half of the contact sheet. Inlined into rough_preview.html by
   tools/build_rough_preview.js — it runs in the browser only.

   Every panel is painted by the app's own renderer: drawSvgToPdf from
   engine/pdf_renderer.js, drawing into PdfCanvas (tools/pdf_canvas.js) instead
   of a jsPDF document. The sheet used to inject the SVG markup and let the
   browser draw it, which meant style resolution, fill rules and line caps were
   all decided by different code than the exporter uses — and they disagreed. */
(function () {
'use strict';

var D = RoughPen.DEFAULTS;
var SEEDS = ['A', 'B', 'C'];
var PANELS = ['Default'].concat(SEEDS.map(function (s) { return 'Seed ' + s; }));
var PAD = 10;          // symbol units of breathing room around the artwork
var GRID = 16;         // LTSpice's own grid
var MAX_DPR = 2;

var PEN_CONTROLS = [
    { k: 'penWidth',   min: 0.5, max: 4,   step: 0.1,  label: 'Pen width',   hint: 'One nib for the whole skin, whatever the source artwork used.' },
    { k: 'warp',       min: 0,   max: 2,   step: 0.05, label: 'Warp',        hint: 'One distortion field per symbol. Keeps touching parts touching.' },
    { k: 'warpPeriod', min: 20,  max: 140, step: 5,    label: 'Warp period', hint: 'Its wavelength, in units. Near symbol size bends the whole shape.' },
    { k: 'tremor',     min: 0,   max: 1.2, step: 0.02, label: 'Tremor',      hint: 'Hand unsteadiness along a stroke.' },
    { k: 'bow',        min: 0,   max: 2,   step: 0.05, label: 'Bow',         hint: 'A freehand straight line is a shallow arc.' },
    { k: 'overshoot',  min: 0,   max: 3,   step: 0.1,  label: 'Overshoot',   hint: 'How far the pen slides past a free end.' },
    { k: 'overshootP', min: 0,   max: 1,   step: 0.05, label: 'Overshoot rate', hint: 'Fraction of free ends that overshoot at all.' },
    { k: 'markWobble', min: 0,   max: 1.5, step: 0.05, label: 'Mark wobble',    hint: 'How far a filled mark strays from perfect — junction dots, glyphs. Capped at a quarter of the mark’s own ink width.' }
];

var SHAPE_CONTROLS = [
    { k: 'lock',        min: 0,  max: 16, step: 0.5,  label: 'Pin lock radius', hint: 'Straight, undistorted approach around a pin. At 0 the pins stop landing exactly.' },
    { k: 'step',        min: 1,  max: 8,  step: 0.25, label: 'Sample step',     hint: 'Lower is smoother and heavier.' },
    { k: 'cornerAngle', min: 5,  max: 90, step: 5,    label: 'Corner break',    hint: 'Turn angle that splits a stroke, so corners cross.' },
    { k: 'seamOverlap', min: 0,  max: 45, step: 1,    label: 'Circle overlap',  hint: 'How far a closed sweep runs past its own start.' },
    { k: 'rotateMax',   min: 0,  max: 8,  step: 0.25, label: 'Mark rotation',   hint: 'Rigid skew of small filled marks (arrowheads, glyphs).' },
    { k: 'ribbonMax',   min: 0,  max: 6,  step: 0.1,  label: 'Ribbon width max', hint: 'Widest filled sliver still read as a drawn line, not a blob.' },
    { k: 'outlineMin',  min: 0,  max: 20, step: 0.5,  label: 'Outline min size', hint: 'Smallest solid shape traced as an outline instead of left solid.' }
];

var state = {};
var seedSalt = 0;
var view = { pins: true, grid: true, vertex: false, zoom: 2 };
var ink = {};          // theme colours, resolved once per pass

function resetState() {
    PEN_CONTROLS.concat(SHAPE_CONTROLS).forEach(function (c) { state[c.k] = D[c.k]; });
}

function readTheme() {
    var cs = getComputedStyle(document.documentElement);
    ink.grid = cs.getPropertyValue('--paper-grid').trim() || '#ddd';
    ink.pin = cs.getPropertyValue('--pin').trim() || '#c33';
    ink.vertex = cs.getPropertyValue('--accent').trim() || '#2B4A80';
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

// ── Framing ─────────────────────────────────────────────────────────────────

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

// ── Painting ────────────────────────────────────────────────────────────────

function overlayGrid(ctx, box) {
    if (!view.grid) return;
    ctx.save();
    ctx.strokeStyle = ink.grid;
    ctx.lineWidth = 0.4;
    ctx.setLineDash([]);
    ctx.beginPath();
    var x1 = box.x0 + box.w, y1 = box.y0 + box.h;
    for (var x = Math.ceil(box.x0 / GRID) * GRID; x <= x1; x += GRID) {
        ctx.moveTo(x, box.y0); ctx.lineTo(x, y1);
    }
    for (var y = Math.ceil(box.y0 / GRID) * GRID; y <= y1; y += GRID) {
        ctx.moveTo(box.x0, y); ctx.lineTo(x1, y);
    }
    ctx.stroke();
    ctx.restore();
}

function overlayVertices(ctx, strokes) {
    if (!view.vertex || !strokes) return;
    ctx.save();
    ctx.strokeStyle = ink.vertex;
    ctx.lineWidth = 0.35;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    strokes.forEach(function (s) {
        s.pts.forEach(function (p) {
            ctx.moveTo(p[0] - 0.6, p[1]);
            ctx.lineTo(p[0] + 0.6, p[1]);
        });
    });
    ctx.stroke();
    ctx.restore();
}

function overlayPins(ctx, report) {
    if (!view.pins || !report || !report.length) return;
    var R = 3.2;
    ctx.save();
    ctx.strokeStyle = ink.pin;
    ctx.lineWidth = 0.6;

    ctx.setLineDash([]);
    ctx.beginPath();
    report.forEach(function (r) {
        if (r.role === 'hold') return;
        ctx.moveTo(r.pin[0] - R, r.pin[1]); ctx.lineTo(r.pin[0] + R, r.pin[1]);
        ctx.moveTo(r.pin[0], r.pin[1] - R); ctx.lineTo(r.pin[0], r.pin[1] + R);
    });
    ctx.stroke();

    // A marker centred on the terminal: no stroke lands here, so ring it.
    ctx.setLineDash([1.2, 1.2]);
    ctx.beginPath();
    report.forEach(function (r) {
        if (r.role !== 'hold') return;
        ctx.moveTo(r.pin[0] + R, r.pin[1]);
        ctx.arc(r.pin[0], r.pin[1], R, 0, Math.PI * 2);
    });
    ctx.stroke();
    ctx.restore();
}

/**
 * One panel, drawn by the shipping renderer. drawSvgToPdf is handed a zero
 * offset and the canvas carries the framing, so the artwork arrives in its own
 * symbol coordinates and the overlays can use them too.
 */
function paintPanel(canvas, box, svgText, report, strokes) {
    var dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    var w = Math.max(1, box.w * view.zoom), h = Math.max(1, box.h * view.zoom);

    canvas.style.width = w.toFixed(1) + 'px';
    canvas.style.height = h.toFixed(1) + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr * view.zoom, 0, 0, dpr * view.zoom, 0, 0);
    ctx.translate(-box.x0, -box.y0);

    overlayGrid(ctx, box);
    drawSvgToPdf(new PdfCanvas(ctx), svgText, 0, 0, 'R0', 0, 0);
    overlayVertices(ctx, strokes);
    overlayPins(ctx, report);
}

// ── Sheet ───────────────────────────────────────────────────────────────────

var cards = [];
var pollTimer = null;

function buildSheet() {
    var sheet = document.getElementById('sheet');
    COMPONENTS.forEach(function (comp) {
        var card = document.createElement('section');
        card.className = 'card';
        var panels = PANELS.map(function (label, i) {
            return '<div class="panel' + (i === 0 ? ' is-src' : '') + '">' +
                '<span class="cap">' + label + '</span>' +
                '<div class="frame"><canvas></canvas></div></div>';
        }).join('');
        card.innerHTML =
            '<header><h3>' + comp.name + '</h3><span class="badge none">&hellip;</span>' +
            '<span class="meta"></span></header><div class="panels">' + panels + '</div>';
        sheet.appendChild(card);

        cards.push({
            comp: comp, el: card, dirty: true, data: null,
            canvases: [].slice.call(card.querySelectorAll('canvas'))
        });
    });
}

// 268 canvases is far too much to rasterise at once, and pointless: only a few
// cards are ever on screen. Visibility is measured synchronously rather than
// with an IntersectionObserver, because nothing may ever paint if the observer
// does not fire — the same trap as requestAnimationFrame in a background tab.
function isNear(el) {
    var r = el.getBoundingClientRect();
    var margin = (window.innerHeight || 800) * 0.75 + 400;
    return r.bottom > -margin && r.top < (window.innerHeight || 800) + margin;
}

// Paints whatever is dirty and on screen. Cheap when there is nothing to do.
function sweep() {
    var remaining = 0;
    for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        if (!c.dirty || !c.data) continue;
        if (isNear(c.el)) paintCard(c); else remaining++;
    }
    // Scroll events are a hint, not a guarantee: they do not bubble from an
    // inner scroll container, and some hosts never deliver them at all. Polling
    // the position is the only thing that always works. It stops as soon as
    // every card has been painted.
    if (remaining && !pollTimer) pollTimer = setInterval(sweep, 350);
    else if (!remaining && pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// Runs the pen and updates the card's badge. Painting is deferred.
function computeCard(entry) {
    var comp = entry.comp;
    var box = entry._box || (entry._box = boxOf(comp));

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

    entry.data = {
        box: box, report: report,
        svgs: [comp.svg].concat(results.map(function (r) { return r.svg; })),
        strokes: [null].concat(results.map(function (r) { return r.strokes; }))
    };
    entry.dirty = true;

    var badge = entry.el.querySelector('.badge');
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
    entry.el.querySelector('.meta').textContent = results[0].strokes.length + ' strokes';

    return { pins: wanted.length, hit: worst };
}

function paintCard(entry) {
    if (!entry.data) return;
    var d = entry.data;
    for (var i = 0; i < entry.canvases.length; i++) {
        paintPanel(entry.canvases[i], d.box, d.svgs[i], d.report, d.strokes[i]);
    }
    entry.dirty = false;
}

var pending = null;

function schedule() {
    if (pending) clearTimeout(pending);
    pending = setTimeout(run, 90);
}

function run() {
    pending = null;
    readTheme();
    var i = 0, pins = 0, hits = 0, bad = [];

    function chunk() {
        var end = Math.min(i + 6, cards.length);
        for (; i < end; i++) {
            var r = computeCard(cards[i]);
            pins += r.pins; hits += r.hit;
            if (r.pins && r.hit < r.pins) bad.push(cards[i].comp.name);
            if (isNear(cards[i].el)) paintCard(cards[i]);
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
                ? COMPONENTS.length + ' symbols &middot; ' + SEEDS.length + ' seeds each &middot; drawn by drawSvgToPdf'
                : 'off by more than 1e-6: ' + bad.join(', ')) +
            '</div>';
        sweep();
    }
    chunk();
}

// A view-only change needs no re-running of the pen, just a repaint.
function repaintAll() {
    readTheme();
    cards.forEach(function (entry) { entry.dirty = true; });
    sweep();
}

// ── Wire up ─────────────────────────────────────────────────────────────────

resetState();
readTheme();
buildControls('ctl-pen', PEN_CONTROLS);
buildControls('ctl-shape', SHAPE_CONTROLS);
buildSheet();
run();

['pins', 'grid', 'vertex'].forEach(function (k) {
    document.getElementById('t-' + k).addEventListener('change', function (e) {
        view[k] = e.target.checked;
        repaintAll();
    });
});

var zoom = document.getElementById('zoom');
zoom.addEventListener('input', function () {
    view.zoom = parseFloat(zoom.value);
    document.getElementById('zoom-out').textContent = view.zoom.toFixed(1) + '×';
    repaintAll();
});

document.getElementById('reseed').addEventListener('click', function () { seedSalt++; run(); });

document.getElementById('reset').addEventListener('click', function () {
    resetState(); syncControls(); run();
});

/**
 * Rebuilds engine/rough_pen.js's own DEFAULTS block with the tuned numbers in
 * it, so the result pastes straight over the original.
 *
 * DEFAULTS_SRC is that block's literal source, inlined at build time. Only lines
 * whose value actually moved are touched, so the eleven keys the sheet does not
 * expose survive, every comment survives, and an untouched line keeps the exact
 * formatting it had — 0.30 stays 0.30 rather than collapsing to 0.3.
 */
function defaultsBlock() {
    var changed = [];
    var text = DEFAULTS_SRC.split('\n').map(function (line) {
        var m = line.match(/^\s*([A-Za-z_$][\w$]*)\s*:/);
        if (!m) return line;                        // comment, blank or brace
        var key = m[1];
        if (!(key in state) || state[key] === D[key]) return line;
        changed.push(key);

        var colon = line.indexOf(':');
        var gap = line.slice(colon + 1).match(/^[ \t]*/)[0];
        var commentAt = line.indexOf('//');
        var comma = /,[ \t]*(\/\/.*)?$/.test(line) ? ',' : '';
        var head = line.slice(0, colon + 1) + gap + String(state[key]) + comma;

        if (commentAt < 0) return head;
        // Hold the comment in the column the source used, unless the new value
        // is wide enough to push past it.
        var pad = commentAt - head.length;
        return head + (pad > 0 ? new Array(pad + 1).join(' ') : ' ') + line.slice(commentAt);
    }).join('\n');

    return { text: text, changed: changed };
}

document.getElementById('copy').addEventListener('click', function (e) {
    var result = defaultsBlock();
    var btn = e.target;
    function done(ok) {
        btn.textContent = !ok ? 'Copy failed'
            : result.changed.length
                ? 'Copied · ' + result.changed.length + ' changed'
                : 'Copied · unchanged';
        setTimeout(function () { btn.textContent = 'Copy DEFAULTS'; }, 2200);
    }
    if (navigator.clipboard) {
        navigator.clipboard.writeText(result.text).then(function () { done(true); },
                                                        function () { done(false); });
    } else done(false);
});

var sweepTimer = null;
function scheduleSweep() {
    if (sweepTimer) return;
    sweepTimer = setTimeout(function () { sweepTimer = null; sweep(); }, 60);
}
window.addEventListener('scroll', scheduleSweep, { passive: true });
window.addEventListener('resize', scheduleSweep);

if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', repaintAll);
}

}());
