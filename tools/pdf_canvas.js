/**
 * pdf_canvas.js
 *
 * A Canvas2D stand-in for a jsPDF document, so the contact sheet can draw
 * through the SHIPPING renderer — engine/pdf_renderer.js's drawSvgToPdf —
 * instead of handing the SVG to the browser and hoping the two agree.
 *
 * They did not agree. The browser resolves CSS classes, its own fill rules and
 * its own caps; drawSvgToPdf resolves all three differently and is what the
 * exported PDF actually uses. Every mismatch the sheet has shown so far lived
 * in that gap. Driving the real renderer closes it: the only thing still
 * unshared is where the ink lands (canvas pixels instead of PDF operators).
 *
 * drawSvgToPdf touches exactly 18 methods across all 67 symbols, clean and
 * roughened. Everything below either implements one of them or is defensive
 * cover for a jsPDF signature the renderer does not currently reach.
 *
 * The caller sets up the transform; this only issues path operations in the
 * renderer's own coordinates.
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.PdfCanvas = factory();
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

var CAPS  = ['butt', 'round', 'square'];
var JOINS = ['miter', 'round', 'bevel'];

// jsPDF accepts a single value as grey, or three as RGB.
function rgb(r, g, b) {
    if (g === undefined) { g = r; b = r; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
}

function PdfCanvas(ctx) {
    this.ctx = ctx;
    this.textColor = 'rgb(0,0,0)';
    this.fontPt = 12;
    this.fontFamily = '"Latin Modern Roman", Georgia, "Times New Roman", serif';
    this._open = false;          // a path is being built by moveTo/lineTo
}

PdfCanvas.prototype = {

    // ── Graphics state ──────────────────────────────────────────────────────

    setDrawColor: function (r, g, b) { this.ctx.strokeStyle = rgb(r, g, b); },
    setFillColor: function (r, g, b) { this.ctx.fillStyle = rgb(r, g, b); },
    setLineWidth: function (w) { this.ctx.lineWidth = w; },

    setLineCap: function (c) {
        this.ctx.lineCap = typeof c === 'number' ? (CAPS[c] || 'butt') : (c || 'butt');
    },
    setLineJoin: function (j) {
        this.ctx.lineJoin = typeof j === 'number' ? (JOINS[j] || 'miter') : (j || 'miter');
    },
    setLineDashPattern: function (pattern, phase) {
        this.ctx.setLineDash(pattern && pattern.length ? pattern : []);
        this.ctx.lineDashOffset = phase || 0;
    },

    setTextColor: function (r, g, b) { this.textColor = rgb(r, g, b); },
    setFontSize: function (pt) { this.fontPt = pt; },

    // ── Painting ────────────────────────────────────────────────────────────

    // jsPDF style codes: S stroke, F fill, FD/DF/B fill then stroke, * even-odd.
    _paint: function (style) {
        var c = this.ctx;
        var s = String(style == null ? 'S' : style);
        var evenOdd = s.indexOf('*') !== -1;
        var u = s.toUpperCase().replace('*', '');
        var wantFill   = u === 'F' || u === 'FD' || u === 'DF' || u === 'B';
        var wantStroke = u === 'S' || u === 'FD' || u === 'DF' || u === 'B';
        if (wantFill) c.fill(evenOdd ? 'evenodd' : 'nonzero');
        if (wantStroke) c.stroke();
    },

    line: function (x1, y1, x2, y2) {
        var c = this.ctx;
        c.beginPath();
        c.moveTo(x1, y1);
        c.lineTo(x2, y2);
        c.stroke();
    },

    /**
     * jsPDF's relative polyline. Each segment is [dx, dy], or [dx1, dy1, dx2,
     * dy2, dx3, dy3] for a cubic — the renderer only emits the two-element form,
     * but the six-element one is cheap to honour.
     */
    lines: function (segments, x, y, scale, style, closed) {
        var c = this.ctx;
        var sx = scale && scale.length ? scale[0] : 1;
        var sy = scale && scale.length ? scale[1] : 1;
        var cx = x, cy = y;

        c.beginPath();
        c.moveTo(cx, cy);
        for (var i = 0; i < segments.length; i++) {
            var s = segments[i];
            if (s.length >= 6) {
                c.bezierCurveTo(cx + s[0] * sx, cy + s[1] * sy,
                                cx + s[2] * sx, cy + s[3] * sy,
                                cx + s[4] * sx, cy + s[5] * sy);
                cx += s[4] * sx; cy += s[5] * sy;
            } else {
                cx += s[0] * sx; cy += s[1] * sy;
                c.lineTo(cx, cy);
            }
        }
        if (closed) c.closePath();
        this._paint(style);
    },

    ellipse: function (x, y, rx, ry, style) {
        var c = this.ctx;
        c.beginPath();
        c.ellipse(x, y, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
        this._paint(style);
    },

    // ── Compound paths ──────────────────────────────────────────────────────
    // Used for a filled <path> with several contours, where each subpath has to
    // join one shape so the fill rule can cut the hole (every diode's triangle).

    moveTo: function (x, y) {
        if (!this._open) { this.ctx.beginPath(); this._open = true; }
        this.ctx.moveTo(x, y);
    },
    lineTo: function (x, y) { this.ctx.lineTo(x, y); },
    close:  function () { this.ctx.closePath(); },

    fill:              function () { this._finish('F'); },
    fillEvenOdd:       function () { this._finish('F*'); },
    stroke:            function () { this._finish('S'); },
    fillStroke:        function () { this._finish('B'); },
    fillStrokeEvenOdd: function () { this._finish('B*'); },

    _finish: function (style) { this._paint(style); this._open = false; },

    // ── Text ────────────────────────────────────────────────────────────────
    // Only OA_Signal and OA_Signal2 carry <text>. The PDF embeds Latin Modern;
    // canvas falls back to a serif, so glyph shapes are approximate here.

    getTextWidth: function (text) {
        this.ctx.font = this.fontPt + 'px ' + this.fontFamily;
        return this.ctx.measureText(String(text)).width;
    },

    text: function (str, x, y, opts) {
        var c = this.ctx;
        c.save();
        c.font = this.fontPt + 'px ' + this.fontFamily;
        c.fillStyle = this.textColor;
        c.textAlign = 'left';
        c.textBaseline = 'alphabetic';
        var angle = (opts && opts.angle) || 0;
        if (angle) {
            c.translate(x, y);
            // jsPDF measures its angle counter-clockwise; canvas rotates the
            // other way in screen coordinates.
            c.rotate(-angle * Math.PI / 180);
            c.fillText(String(str), 0, 0);
        } else {
            c.fillText(String(str), x, y);
        }
        c.restore();
    }
};

// The renderer calls these and nothing else. test/rough-preview.test.js asserts
// the two lists still match, so a new call in the renderer cannot silently
// vanish from the preview.
PdfCanvas.RENDERER_API = [
    'close', 'ellipse', 'fill', 'fillStroke', 'getTextWidth', 'line', 'lineTo',
    'lines', 'moveTo', 'setDrawColor', 'setFillColor', 'setFontSize',
    'setLineCap', 'setLineDashPattern', 'setLineJoin', 'setLineWidth',
    'setTextColor', 'text'
];

return PdfCanvas;
}));
