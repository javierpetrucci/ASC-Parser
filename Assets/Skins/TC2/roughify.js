/**
 * roughify.js
 * Converts SVG files in a source folder to a "hand-drawn" style using Rough.js,
 * and writes the results to an output folder.
 *
 * Usage: node roughify.js [inputDir] [outputDir]
 * Defaults: inputDir = . (current folder), outputDir = ../TC2_Rough
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const rough = require('roughjs');

// ─── Configuration ───────────────────────────────────────────────────────────
const INPUT_DIR  = process.argv[2] || '.';
const OUTPUT_DIR = process.argv[3] || path.join('..', 'TC2_Rough');

const ROUGH_OPTIONS = {
  roughness:         0.3,   // 0 = perfect, higher = more wobbly
  bowing:            1.2,   // how much curves bow
  strokeWidth:       1.5,
  stroke:            '#000',
  fill:              'none',
  fillStyle:         'hachure',
  seed:              42,    // fixed seed for reproducibility
  preserveVertices:  false,
};

// Options for filled shapes (e.g. arrowheads, filled polygons)
const ROUGH_FILLED_OPTIONS = {
  ...ROUGH_OPTIONS,
  fill:      '#000',
  fillStyle: 'solid',
};
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a CSS style string into a key/value map.
 */
function parseStyle(styleStr) {
  const map = {};
  if (!styleStr) return map;
  styleStr.split(';').forEach(part => {
    const [k, v] = part.split(':');
    if (k && v) map[k.trim()] = v.trim();
  });
  return map;
}

/**
 * Determine if an element is visually filled (not just stroked).
 * Only returns true when fill is explicitly set to a non-none, non-transparent value
 * directly on the element (attribute or inline style).
 * Class-based fill:none is the norm here, so we default to NOT filled when
 * no explicit fill is present — avoids false positives from the SVG default.
 */
function isFilled(el) {
  const styleMap = parseStyle(el.getAttribute('style'));
  // Inline style takes priority
  if (styleMap['fill']) {
    return styleMap['fill'] !== 'none' && styleMap['fill'] !== 'transparent';
  }
  // Then check the fill attribute directly on the element
  const fillAttr = el.getAttribute('fill');
  if (fillAttr === null || fillAttr === '') return false; // no explicit fill — treat as unfilled
  return fillAttr !== 'none' && fillAttr !== 'transparent';
}

/**
 * Get the stroke color from an element.
 */
function getStrokeColor(el) {
  const styleMap = parseStyle(el.getAttribute('style'));
  return styleMap['stroke'] || el.getAttribute('stroke') || '#000';
}

/**
 * Get the stroke width from an element.
 */
function getStrokeWidth(el) {
  const styleMap = parseStyle(el.getAttribute('style'));
  const sw = styleMap['stroke-width'] || el.getAttribute('stroke-width');
  return sw ? parseFloat(sw) : 1.5;
}

/**
 * Build Rough options tailored to a specific element.
 */
function optionsForEl(el, filled) {
  const stroke = getStrokeColor(el);
  const sw     = getStrokeWidth(el);
  const base   = filled ? { ...ROUGH_FILLED_OPTIONS } : { ...ROUGH_OPTIONS };
  return { ...base, stroke, strokeWidth: sw };
}

/**
 * Convert a <polyline> or <polygon> points string to an array of [x,y] pairs.
 */
function parsePoints(pointsStr) {
  const nums = pointsStr.trim().split(/[\s,]+/).map(Number);
  const pts  = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push([nums[i], nums[i + 1]]);
  }
  return pts;
}

/**
 * Main conversion function for a single SVG string.
 * Returns the roughified SVG string.
 */
function roughifySVG(svgString, filename) {
  const parser     = new DOMParser();
  const serializer = new XMLSerializer();
  const doc        = parser.parseFromString(svgString, 'image/svg+xml');

  const svgEl = doc.documentElement;

  // Create a minimal SVG document that Rough.js can draw into.
  // We replicate the original viewBox / width / height.
  const viewBox = svgEl.getAttribute('viewBox') || '';
  const width   = svgEl.getAttribute('width')   || '';
  const height  = svgEl.getAttribute('height')  || '';

  // Build output SVG document
  const outDoc  = parser.parseFromString('<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml');
  const outSVG  = outDoc.documentElement;

  if (viewBox) outSVG.setAttribute('viewBox', viewBox);
  if (width)   outSVG.setAttribute('width', width);
  if (height)  outSVG.setAttribute('height', height);
  outSVG.setAttribute('version', '1.1');

  // Copy <defs> (styles, markers, etc.) so text labels remain styled
  const defs = svgEl.getElementsByTagName('defs');
  for (let i = 0; i < defs.length; i++) {
    outSVG.appendChild(outDoc.importNode(defs[i], true));
  }

  // Create a Rough.js SVG generator targeting our output document
  const rc = rough.svg(outSVG, { options: ROUGH_OPTIONS });

  /**
   * Recursively process nodes, converting shapes to rough equivalents
   * and preserving text/group structure.
   */
  function processNode(node, parentOut) {
    if (node.nodeType !== 1) return; // skip non-element nodes

    const tag  = node.tagName ? node.tagName.toLowerCase() : '';
    const opts = optionsForEl(node, false);

    let roughNode = null;

    switch (tag) {
      // ── line ──────────────────────────────────────────────────────────────
      case 'line': {
        const x1 = parseFloat(node.getAttribute('x1') || 0);
        const y1 = parseFloat(node.getAttribute('y1') || 0);
        const x2 = parseFloat(node.getAttribute('x2') || 0);
        const y2 = parseFloat(node.getAttribute('y2') || 0);
        roughNode = rc.line(x1, y1, x2, y2, opts);
        break;
      }

      // ── rect ──────────────────────────────────────────────────────────────
      case 'rect': {
        const x  = parseFloat(node.getAttribute('x')      || 0);
        const y  = parseFloat(node.getAttribute('y')      || 0);
        const w  = parseFloat(node.getAttribute('width')  || 0);
        const h  = parseFloat(node.getAttribute('height') || 0);
        const rx = parseFloat(node.getAttribute('rx')     || 0);
        const filled = isFilled(node);
        const rOpts  = optionsForEl(node, filled);
        if (filled) rOpts.fillStyle = 'solid';
        roughNode = rc.rectangle(x, y, w, h, { ...rOpts, roughness: ROUGH_OPTIONS.roughness });
        break;
      }

      // ── circle ────────────────────────────────────────────────────────────
      case 'circle': {
        const cx = parseFloat(node.getAttribute('cx') || 0);
        const cy = parseFloat(node.getAttribute('cy') || 0);
        const r  = parseFloat(node.getAttribute('r')  || 0);
        const filled = isFilled(node);
        const rOpts  = optionsForEl(node, filled);
        roughNode = rc.circle(cx, cy, r * 2, rOpts);
        break;
      }

      // ── ellipse ───────────────────────────────────────────────────────────
      case 'ellipse': {
        const cx = parseFloat(node.getAttribute('cx') || 0);
        const cy = parseFloat(node.getAttribute('cy') || 0);
        const rx = parseFloat(node.getAttribute('rx') || 0);
        const ry = parseFloat(node.getAttribute('ry') || 0);
        const filled = isFilled(node);
        const rOpts  = optionsForEl(node, filled);
        roughNode = rc.ellipse(cx, cy, rx * 2, ry * 2, rOpts);
        break;
      }

      // ── polyline ──────────────────────────────────────────────────────────
      case 'polyline': {
        const pts = parsePoints(node.getAttribute('points') || '');
        if (pts.length >= 2) {
          roughNode = rc.linearPath(pts, opts);
        }
        break;
      }

      // ── polygon ───────────────────────────────────────────────────────────
      case 'polygon': {
        const pts    = parsePoints(node.getAttribute('points') || '');
        const filled = isFilled(node);
        const rOpts  = optionsForEl(node, filled);
        if (pts.length >= 2) {
          roughNode = rc.polygon(pts, rOpts);
        }
        break;
      }

      // ── path ──────────────────────────────────────────────────────────────
      case 'path': {
        const d      = node.getAttribute('d') || '';
        const filled = isFilled(node);
        const rOpts  = optionsForEl(node, filled);
        if (filled) {
          rOpts.fillStyle = 'solid';
        }
        if (d) {
          roughNode = rc.path(d, rOpts);
        }
        break;
      }

      // ── text / tspan — copy as-is ─────────────────────────────────────────
      case 'text':
      case 'tspan': {
        parentOut.appendChild(outDoc.importNode(node, true));
        return;
      }

      // ── g (group) — recurse into children ────────────────────────────────
      case 'g': {
        const groupOut = outDoc.createElement('g');
        // Forward relevant group attributes (id, transform, class)
        ['id', 'transform', 'class', 'data-name'].forEach(attr => {
          const val = node.getAttribute(attr);
          if (val) groupOut.setAttribute(attr, val);
        });
        parentOut.appendChild(groupOut);
        const children = node.childNodes;
        for (let i = 0; i < children.length; i++) {
          processNode(children[i], groupOut);
        }
        return;
      }

      // ── defs — already copied above ───────────────────────────────────────
      case 'defs':
        return;

      default:
        // Preserve unknown elements (markers, symbols, etc.) verbatim
        parentOut.appendChild(outDoc.importNode(node, true));
        return;
    }

    if (roughNode) {
      // Rough.js returns a <g> containing the hand-drawn path(s)
      // Transfer any original class so CSS styles still apply
      const cls = node.getAttribute('class');
      if (cls) roughNode.setAttribute('class', cls);
      parentOut.appendChild(roughNode);
    }
  }

  // Process all top-level children of the source SVG
  const children = svgEl.childNodes;
  for (let i = 0; i < children.length; i++) {
    processNode(children[i], outSVG);
  }

  return serializer.serializeToString(outDoc);
}

// ─── Batch processing ────────────────────────────────────────────────────────

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const svgFiles = fs.readdirSync(INPUT_DIR).filter(f => f.toLowerCase().endsWith('.svg'));

console.log(`Found ${svgFiles.length} SVG files in "${INPUT_DIR}"`);
console.log(`Output → "${OUTPUT_DIR}"\n`);

let ok = 0, fail = 0;

for (const file of svgFiles) {
  const inPath  = path.join(INPUT_DIR, file);
  const outPath = path.join(OUTPUT_DIR, file);
  try {
    const svgIn  = fs.readFileSync(inPath, 'utf8');
    const svgOut = roughifySVG(svgIn, file);
    fs.writeFileSync(outPath, svgOut, 'utf8');
    console.log(`  ✓  ${file}`);
    ok++;
  } catch (err) {
    console.error(`  ✗  ${file}: ${err.message}`);
    fail++;
  }
}

console.log(`\nDone. ${ok} converted, ${fail} failed.`);
