const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./helpers/load-engine.js');

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

test('the tuner component list matches what is on disk', () => {
    // tools/generate_component_list.js rewrites the dropdown. Nobody re-ran it
    // after adding components, so nm_nobulk/pm_nobulk were unselectable and a
    // deleted TCLib/Comp_ideal was still offered. Run `npm run components`.
    const symbolsDir = path.join(ROOT, 'Assets', 'Component Symbols');
    const onDisk = [];
    (function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { walk(full); continue; }
            if (e.name.endsWith('.asy')) {
                onDisk.push(full.substring(symbolsDir.length + 1).replace(/\.asy$/, '').split(path.sep).join('/'));
            }
        }
    })(symbolsDir);

    const html = fs.readFileSync(path.join(ROOT, 'tools', 'dev_window_tuner.html'), 'utf8');
    const select = (html.match(/<select id="comp-select"[^>]*>[\s\S]*?<\/select>/) || [''])[0];
    const listed = [...select.matchAll(/<option value="([^"]+)"/g)].map(m => m[1]);

    const missing = onDisk.filter(f => !listed.includes(f));
    const ghosts = listed.filter(f => !onDisk.includes(f));

    assert.deepStrictEqual(missing, [], `not selectable in the tuner: ${missing.join(', ')}`);
    assert.deepStrictEqual(ghosts, [], `listed but absent from disk: ${ghosts.join(', ')}`);
});

test('neutralino.config.json carries no key that silently does nothing', () => {
    const cfg = readJson('neutralino.config.json');

    // "targets" looked like it restricted the build but did not: it said
    // ["windows"] while all seven platform binaries were produced. The target is
    // chosen by build_desktop.js, from the runtimes it copies into bin/.
    assert.ok(!('targets' in cfg), '"targets" is not honoured — remove it');

    // Paths that build_desktop.js rewrites to /www/ must all be present; any it
    // does NOT rewrite must not be configured, or it resolves outside the bundle.
    assert.ok(cfg.cli.resourcesPath, 'cli.resourcesPath is required');
    assert.ok(cfg.cli.clientLibrary, 'cli.clientLibrary is required');
    if (cfg.cli.extensionsPath) {
        assert.ok(fs.existsSync(path.join(ROOT, 'extensions')),
            'cli.extensionsPath is set but extensions/ does not exist');
    }
});

test('the build defaults to Windows only and can be widened explicitly', () => {
    const src = fs.readFileSync(path.join(ROOT, 'desktop', 'build_desktop.js'), 'utf8');
    assert.match(src, /DEFAULT_TARGETS\s*=\s*\[\s*'win_x64'\s*\]/,
        'the default build should produce only the Windows executable');
    assert.match(src, /--targets/, 'there should be a way to request other platforms');
});

test('simulation artifacts are excluded from the bundle', () => {
    // A single 26 MB Draft2.raw sitting in Assets/Component Symbols/ was being
    // embedded into every platform binary.
    const src = fs.readFileSync(path.join(ROOT, 'desktop', 'build_desktop.js'), 'utf8');
    assert.match(src, /EXCLUDE_FROM_BUNDLE/);
    assert.ok(src.includes('.raw$'), '.raw files should be excluded');
    assert.ok(src.includes('.log$'), '.log files should be excluded');
    assert.match(src, /isExcluded\(/, 'the filter must actually be applied while copying');
});

test('package.json scripts cover the maintenance tasks', () => {
    const { scripts } = readJson('package.json');
    for (const name of ['test', 'build', 'spec', 'spec:check', 'components']) {
        assert.ok(scripts[name], `missing npm script: ${name}`);
    }
    // Stale Electron scaffolding: this project builds with Neutralino.
    const pkg = readJson('package.json');
    assert.ok(!pkg.devDependencies, 'devDependencies should be empty (Electron was removed)');
    assert.ok(!pkg.main, '"main" pointed at a main.js that does not exist');
});
