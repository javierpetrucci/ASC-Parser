/**
 * build_rough_preview.js
 *
 * Builds .tmp/rough_preview.html — a self-contained contact sheet of every
 * Default skin symbol redrawn by tools/rough_pen.js, with the .asy PIN
 * coordinates marked, and live sliders for tuning the pen.
 *
 * Everything is inlined (artwork, pin tables, the pen module itself) so the page
 * works with no server and no network, which is what lets it be published as an
 * artifact and opened straight off disk.
 *
 * Run from repo root:  node tools/build_rough_preview.js
 * Exits non-zero if any pin fails to land exactly.
 */

const fs = require('fs');
const path = require('path');
const RoughPen = require('./rough_pen.js');

const rootDir = path.join(__dirname, '..');
const skinDir = path.join(rootDir, 'Assets', 'Skins', 'Default');
const symbolsDir = path.join(rootDir, 'Assets', 'Component Symbols');
const outDir = path.join(rootDir, '.tmp');
const outFile = path.join(outDir, 'rough_preview.html');

// Names the app synthesises rather than reading from a .asy. They are drawn
// around the anchor, which is where the wire arrives, so (0,0) is the terminal.
const SYNTHESISED = new Set(['GND', 'flag', 'intersection']);

const SEEDS = ['A', 'B', 'C'];
const TOL = 1e-6;

// ── Locate every .asy once ──────────────────────────────────────────────────

const asyByName = new Map();
(function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.asy')) asyByName.set(entry.name.slice(0, -4), full);
    }
})(symbolsDir);

function pinsFor(name) {
    const file = asyByName.get(name);
    if (file) {
        const pins = [];
        for (const line of fs.readFileSync(file, 'utf8').split(/\r\n|\r|\n/)) {
            const parts = line.trim().split(/\s+/);
            if (parts[0] === 'PIN' && parts.length >= 3) {
                pins.push([parseFloat(parts[1]), parseFloat(parts[2])]);
            }
        }
        if (pins.length) return pins;
    }
    return SYNTHESISED.has(name) ? [[0, 0]] : [];
}

// ── Collect the components ──────────────────────────────────────────────────

const components = fs.readdirSync(skinDir)
    .filter(f => f.toLowerCase().endsWith('.svg'))
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(file => {
        const name = file.slice(0, -4);
        return { name, svg: fs.readFileSync(path.join(skinDir, file), 'utf8'), pins: pinsFor(name) };
    });

// ── Verify, the same way the page will ──────────────────────────────────────

function landed(strokes, pin) {
    for (const s of strokes) {
        for (const p of s.pts) if (RoughPen.dist(p, pin) < TOL) return true;
    }
    return false;
}

const BAD_CMD = /[^MLZ0-9\s.,\-]/;

let totalLandings = 0, totalHits = 0, held = [], unreached = [], badCmd = [], rows = [];

for (const comp of components) {
    let strokes = 0, bytes = 0, landings = 0, hits = Infinity;

    for (const seed of SEEDS) {
        const res = RoughPen.roughen(comp.svg, {
            pins: comp.pins,
            seed: comp.name + '|' + seed + '|0'
        });
        strokes = res.strokes.length;
        bytes = Buffer.byteLength(res.svg, 'utf8');

        // Only 'landing' pins are ones a stroke is supposed to touch.
        const wanted = res.pins.report.filter(r => r.role === 'landing');
        landings = wanted.length;
        hits = Math.min(hits, wanted.filter(r => landed(res.strokes, r.pin)).length);

        // The renderer understands M/L/H/V/C/S/Z only; the module must emit the
        // straight-segment subset so preview and PDF agree vertex for vertex.
        for (const m of res.svg.matchAll(/\bd="([^"]+)"/g)) {
            if (BAD_CMD.test(m[1])) { badCmd.push(comp.name + ' -> ' + m[1].slice(0, 40)); break; }
        }

        for (const r of res.pins.report) {
            if (r.role === 'landing') continue;
            const tag = comp.name + ' (' + r.pin[0] + ',' + r.pin[1] + ')';
            const list = r.role === 'hold' ? held : unreached;
            if (!list.some(u => u.startsWith(tag))) {
                list.push(tag + ' nearest geometry ' + r.distance.toFixed(2) + 'u away');
            }
        }
    }

    if (!isFinite(hits)) hits = 0;
    totalLandings += landings;
    totalHits += hits;
    rows.push({ name: comp.name, pins: comp.pins.length, landings, hits, strokes, bytes });
}

// ── Report ──────────────────────────────────────────────────────────────────

const w = Math.max(...rows.map(r => r.name.length));
console.log('\n  symbol'.padEnd(w + 4) + '  pins  exact  strokes   bytes');
console.log('  ' + '-'.repeat(w + 34));
for (const r of rows) {
    const flag = r.landings === 0 ? '  -  ' : (r.hits === r.landings ? '  ok ' : ' FAIL');
    console.log('  ' + r.name.padEnd(w + 2) +
        String(r.pins).padStart(4) + flag.padStart(7) +
        String(r.strokes).padStart(8) + String(r.bytes).padStart(8));
}

console.log('\n  ' + components.length + ' symbols, ' + SEEDS.length + ' seeds each');
console.log('  pin landings exact: ' + totalHits + '/' + totalLandings);

if (held.length) {
    console.log('\n  centred markers - the artwork surrounds the terminal rather than');
    console.log('  reaching it, so it is anchored in place but lands no stroke:');
    for (const u of held) console.log('    - ' + u);
}
if (unreached.length) {
    console.log('\n  pins the artwork never reaches (reported, not forced):');
    for (const u of unreached) console.log('    - ' + u);
}
if (badCmd.length) {
    console.log('\n  paths using a command outside M/L/Z:');
    for (const b of badCmd) console.log('    - ' + b);
}

// ── Emit the page ───────────────────────────────────────────────────────────

const template = fs.readFileSync(path.join(__dirname, 'rough_preview_template.html'), 'utf8');
const penSrc = fs.readFileSync(path.join(__dirname, 'rough_pen.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, 'rough_preview_app.js'), 'utf8');

// </script> anywhere inside inlined data would close the tag early.
const safe = (s) => s.replace(/<\/script>/gi, '<\\/script>');

const html = template
    .replace('/*__PEN__*/', () => safe(penSrc))
    .replace('/*__DATA__*/', () => safe(JSON.stringify(components)))
    .replace('/*__APP__*/', () => safe(appSrc));

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, html);
console.log('\n  wrote ' + path.relative(rootDir, outFile) +
    ' (' + (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0) + ' KB)\n');

if (totalHits !== totalLandings || badCmd.length) process.exit(1);
