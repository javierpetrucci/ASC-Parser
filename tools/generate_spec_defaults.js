#!/usr/bin/env node
// Regenerates section 9 (Default WINDOW Positions) of
// LTSpice_ASC_ASY_Format_Specification.md directly from engine/component_defaults.js.
//
// That section used to be maintained by hand against the old canvas debug
// renderer. When that renderer was deleted the numbers were left documenting
// code that no longer existed — nearly every value disagreed with the engine.
//
//   node tools/generate_spec_defaults.js          # rewrite the spec in place
//   node tools/generate_spec_defaults.js --check  # exit 1 if it is out of date

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SPEC = path.join(ROOT, 'LTSpice_ASC_ASY_Format_Specification.md');

const BEGIN = '<!-- BEGIN GENERATED: component-defaults -->';
const END = '<!-- END GENERATED: component-defaults -->';

const WINDOW_LABELS = {
    0: 'InstName', 3: 'Value', 39: 'SpiceLine', 40: 'SpiceLine2', 123: 'Value2', 38: 'SpiceModel',
};

function loadDefaults() {
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(
        fs.readFileSync(path.join(ROOT, 'engine', 'component_defaults.js'), 'utf8'),
        sandbox,
        { filename: 'component_defaults.js' }
    );
    return vm.runInContext('COMPONENT_DEFAULTS', sandbox);
}

function render(defaults) {
    const names = Object.keys(defaults).sort((a, b) => a.localeCompare(b));
    const out = [];

    out.push(BEGIN);
    out.push('');
    out.push('> This section is generated from `engine/component_defaults.js` by');
    out.push('> `tools/generate_spec_defaults.js`. Do not edit it by hand — run the');
    out.push('> generator instead, or CI will flag it as stale.');
    out.push('');
    out.push(`Components with a defaults entry: **${names.length}**.`);
    out.push('');
    out.push('**How to read these numbers.** `offsetX`/`offsetY`/`Alignment` are in the');
    out.push("component's LOCAL (pre-rotation) frame, even inside a per-orientation row.");
    out.push('The renderer always passes them through `transformOffset` and');
    out.push('`transformAlignment` with the symbol\'s orientation. Two rotations holding');
    out.push('identical values therefore do NOT render identically, and a horizontal');
    out.push('keyword such as `Left` inside an R90 row is normal — it becomes a vertical');
    out.push('one after the transform.');
    out.push('');
    out.push('Mirrored orientations (M0–M270) reuse the matching `Rxx` row and then apply');
    out.push('the mirror transform.');
    out.push('');

    for (const name of names) {
        const table = defaults[name];
        out.push(`#### \`${name}\``);
        out.push('');
        out.push('| Orientation | Index | offsetX | offsetY | Alignment |');
        out.push('|-------------|-------|---------|---------|-----------|');
        for (const rot of ['R0', 'R90', 'R180', 'R270']) {
            const entry = table[rot];
            if (!entry) continue;
            const indexes = Object.keys(entry).map(Number).sort((a, b) => a - b);
            for (const idx of indexes) {
                const d = entry[idx];
                const label = WINDOW_LABELS[idx] ? ` (${WINDOW_LABELS[idx]})` : '';
                out.push(`| ${rot} | ${idx}${label} | ${d.ox} | ${d.oy} | ${d.align} |`);
            }
        }
        out.push('');
    }

    out.push('**Fall-through rule:** a component with no entry above uses the `WINDOW`');
    out.push('lines from its own `.asy` file.');
    out.push('');
    out.push(END);
    return out.join('\n');
}

function main() {
    const check = process.argv.includes('--check');
    const spec = fs.readFileSync(SPEC, 'utf8');

    const start = spec.indexOf(BEGIN);
    const end = spec.indexOf(END);
    if (start === -1 || end === -1) {
        console.error(`Markers not found in ${path.basename(SPEC)}.`);
        console.error(`Insert these two lines where the tables belong:\n  ${BEGIN}\n  ${END}`);
        process.exit(2);
    }

    const generated = render(loadDefaults());
    const updated = spec.slice(0, start) + generated + spec.slice(end + END.length);

    if (updated === spec) {
        console.log('Specification section 9 is up to date.');
        return;
    }
    if (check) {
        console.error('Specification section 9 is STALE — run: node tools/generate_spec_defaults.js');
        process.exit(1);
    }
    fs.writeFileSync(SPEC, updated);
    console.log(`Rewrote section 9 of ${path.basename(SPEC)}.`);
}

main();
