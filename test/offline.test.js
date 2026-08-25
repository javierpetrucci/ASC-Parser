const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./helpers/load-engine.js');

// Pages that actually ship inside the desktop bundle. tools/dev_window_tuner.html
// is a dev-only utility, is not in BUNDLE_LIST, and its Google Fonts link
// degrades to a system font — so it is deliberately not covered here.
const SHIPPED_PAGES = ['index.html'];

test('no shipped HTML page pulls executable code from an external host', () => {
    // The desktop build is meant to work with no network at all, and on blocked
    // networks a CDN miss surfaced as an unhandled TypeError deep in the render.
    const offenders = [];
    for (const rel of SHIPPED_PAGES) {
        const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        for (const m of html.matchAll(/<script[^>]*?src="(https?:[^"]+)"/g)) {
            offenders.push(`${rel} -> ${m[1]}`);
        }
    }
    assert.deepStrictEqual(offenders, [], `external scripts: ${offenders.join(' | ')}`);
});

test('the vendored jsPDF exists and is the expected build', () => {
    const file = path.join(ROOT, 'vendor', 'jspdf.umd.min.js');
    assert.ok(fs.existsSync(file), 'vendor/jspdf.umd.min.js is missing');

    const src = fs.readFileSync(file, 'utf8');
    assert.ok(/jsPDF - PDF Document creation from JavaScript/.test(src), 'not a jsPDF bundle');
    assert.match(src.slice(0, 400), /Version 2\.5\.1/, 'unexpected jsPDF version');
    assert.ok(src.length > 100000, 'suspiciously small — a truncated download?');
});

test('the desktop bundle ships everything the app needs at runtime', () => {
    const build = fs.readFileSync(path.join(ROOT, 'desktop', 'build_desktop.js'), 'utf8');
    for (const entry of ['vendor', 'engine', 'Assets', 'index.html', 'app.js']) {
        assert.ok(
            new RegExp(`'${entry.replace('.', '\.')}'`).test(build),
            `BUNDLE_LIST does not include ${entry}`
        );
    }
});

test('the renderer fails with a clear message when jsPDF is absent', () => {
    const src = fs.readFileSync(path.join(ROOT, 'engine', 'pdf_renderer.js'), 'utf8');
    assert.ok(/window\.jspdf/.test(src));
    assert.ok(/jsPDF failed to load/.test(src),
        'convertSceneToPdf should guard the jsPDF global with an explicit error');
});
