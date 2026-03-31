/**
 * generate_component_list.js
 *
 * Scans Assets/Component Symbols/ and injects <option> elements
 * into tools/dev_window_tuner.html for the component selector.
 *
 * Run from repo root: node tools/generate_component_list.js
 */

const fs   = require('fs');
const path = require('path');

const rootDir  = path.join(__dirname, '..');
const symbolsDir = path.join(rootDir, 'Assets', 'Component Symbols');
const tunerHtml  = path.join(__dirname, 'dev_window_tuner.html');

// Collect all .asy files recursively
const files = [];
function walk(dir) {
    for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
            walk(full);
        } else if (entry.endsWith('.asy')) {
            const rel = full
                .substring(symbolsDir.length + 1)
                .replace('.asy', '')
                .replace(/\\/g, '/');
            files.push(rel);
        }
    }
}
walk(symbolsDir);
files.sort();

const opts = files
    .map(f => `                        <option value="${f}">${f}</option>`)
    .join('\n');

let html = fs.readFileSync(tunerHtml, 'utf8');
html = html.replace(
    /<select id="comp-select"[^>]*>[\s\S]*?<\/select>/,
    `<select id="comp-select" style="margin-top:4px; width:160px;">\n${opts}\n                </select>`
);

fs.writeFileSync(tunerHtml, html);
console.log(`Updated dev_window_tuner.html with ${files.length} components.`);
