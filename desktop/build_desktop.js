/**
 * build_desktop.js
 *
 * Neutralino desktop build script.
 * Run from repo root: node desktop/build_desktop.js
 *
 * Copies the web app files into an isolated temp directory,
 * rewrites neutralino.config.json to point at /www/,
 * runs the Neutralino CLI build, then moves the output back to /dist.
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Root of the repo — one level above this script
const rootDir  = path.join(__dirname, '..');
const buildDir = path.join(rootDir, '.neu_build_temp');

// Files and folders from the repo root to bundle into the executable
const BUNDLE_LIST = [
    'index.html',
    'app.js',
    'style.css',
    'neutralino.js',
    'engine',
    'Assets',
    // jsPDF is vendored rather than pulled from a CDN so the desktop app works
    // offline; it MUST ship or every conversion throws.
    'vendor',
    // Read by the in-app specification viewer, which otherwise has to reach
    // GitHub over the network.
    'LTSpice_ASC_ASY_Format_Specification.md',
];

// Bundled paths whose absence should abort the build rather than produce an
// executable that fails at runtime.
const REQUIRED_IN_BUNDLE = [
    'vendor/jspdf.umd.min.js',
    'index.html',
    'engine',
];

// Files that must never be embedded, however they got into Assets/.
// LTSpice drops simulation output next to the symbols it was run on, and a
// single Draft2.raw was adding ~26 MB to EVERY platform binary.
const EXCLUDE_FROM_BUNDLE = [/\.raw$/i, /\.log$/i, /\.op\.raw$/i, /^\.DS_Store$/, /^Thumbs\.db$/i];

const isExcluded = (name) => EXCLUDE_FROM_BUNDLE.some(re => re.test(name));

// Which platforms to build. `neu build` produces one executable per runtime
// binary it finds in bin/, so restricting what we copy restricts what is built —
// cheaper than building all seven and deleting six.
// Override with: node desktop/build_desktop.js --targets win_x64,mac_arm64
//                node desktop/build_desktop.js --targets all
const ALL_TARGETS = [
    'win_x64', 'linux_x64', 'linux_arm64', 'linux_armhf',
    'mac_x64', 'mac_arm64', 'mac_universal',
];
const DEFAULT_TARGETS = ['win_x64'];

function resolveTargets(argv) {
    const flag = argv.indexOf('--targets');
    if (flag === -1 || !argv[flag + 1]) return DEFAULT_TARGETS;

    const requested = argv[flag + 1].split(',').map(t => t.trim()).filter(Boolean);
    if (requested.includes('all')) return ALL_TARGETS;

    const unknown = requested.filter(t => !ALL_TARGETS.includes(t));
    if (unknown.length) {
        throw new Error(`Unknown target(s): ${unknown.join(', ')}. Known: ${ALL_TARGETS.join(', ')}`);
    }
    return requested;
}

const TARGETS = resolveTargets(process.argv);

// Neutralino binaries live in bin/ at the repo root
const BIN_SRC = path.join(rootDir, 'bin');

console.log('--- Neutralino Custom Builder ---');
console.log('Preparing isolated build environment...');

// ── 1. Clean and recreate temp dir ──────────────────────────────────────
if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true });
}
fs.mkdirSync(buildDir);

// ── 2. Copy web assets into /www/ and binaries into root of temp dir ────
let skippedBytes = 0;

function copyRecursive(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const child of fs.readdirSync(src)) {
            if (isExcluded(child)) {
                skippedBytes += fs.statSync(path.join(src, child)).size;
                continue;
            }
            copyRecursive(path.join(src, child), path.join(dest, child));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

console.log('Structuring source files...');
const wwwDir = path.join(buildDir, 'www');
fs.mkdirSync(wwwDir);

for (const item of BUNDLE_LIST) {
    const src = path.join(rootDir, item);
    if (fs.existsSync(src)) {
        copyRecursive(src, path.join(wwwDir, item));
    } else {
        console.warn(`  ! Skipping missing bundle entry: ${item}`);
    }
}

// Fail loudly here instead of shipping a build that breaks on first use.
for (const rel of REQUIRED_IN_BUNDLE) {
    if (!fs.existsSync(path.join(wwwDir, rel))) {
        throw new Error(`Bundle is missing a required entry: ${rel}`);
    }
}

if (skippedBytes > 0) {
    console.log(`  Excluded ${(skippedBytes / 1048576).toFixed(1)} MB of simulation/OS artifacts.`);
}

// Neutralino binaries go in the root of the build dir (not /www/).
// Only the requested targets are copied, so `neu build` produces only those.
console.log(`Targets: ${TARGETS.join(', ')}`);
const binDest = path.join(buildDir, 'bin');
fs.mkdirSync(binDest, { recursive: true });

for (const target of TARGETS) {
    const name = target === 'win_x64' ? 'neutralino-win_x64.exe' : `neutralino-${target}`;
    const src = path.join(BIN_SRC, name);
    if (!fs.existsSync(src)) {
        throw new Error(`Missing runtime binary for target "${target}": bin/${name}`);
    }
    fs.copyFileSync(src, path.join(binDest, name));
}

// ── 3. Rewrite neutralino.config.json to point at /www/ ─────────────────
const configSrc  = path.join(rootDir, 'neutralino.config.json');
const configDest = path.join(buildDir, 'neutralino.config.json');

const config = JSON.parse(fs.readFileSync(configSrc, 'utf8'));
config.documentRoot          = '/www/';
config.cli.resourcesPath     = '/www/';
config.cli.clientLibrary     = '/www/neutralino.js';

if (config.modes?.window?.icon) {
    config.modes.window.icon = '/www' + config.modes.window.icon;
}

fs.writeFileSync(configDest, JSON.stringify(config, null, 2));

// ── 4. Run Neutralino build ──────────────────────────────────────────────
try {
    console.log('Running Neutralino build with embedded resources...');
    try {
        execSync('npx @neutralinojs/neu build --embed-resources', {
            cwd: buildDir,
            stdio: 'inherit',
        });
    } catch (buildErr) {
        // Cross-compiling to a foreign platform can fail in postject while the
        // native one still succeeds. Only tolerate that when several targets
        // were requested: with a single target nothing is left to succeed, and
        // swallowing the error reported a failed build as expected output.
        if (TARGETS.length === 1) throw buildErr;
        console.log('Note: some platform embeddings may have failed (cross-compile).');
    }

    // ── 5. Move output back to repo root /dist ───────────────────────────
    const srcDist  = path.join(buildDir, 'dist');
    const destDist = path.join(rootDir, 'dist');

    if (fs.existsSync(destDist)) {
        fs.rmSync(destDist, { recursive: true, force: true });
    }

    console.log('Moving compiled output to /dist...');
    fs.renameSync(srcDist, destDist);

    // Report what actually landed, with sizes. The old message hardcoded the
    // Windows path regardless of which targets were built.
    const outDir = path.join(destDist, 'LTSpice_to_PDF');
    const produced = fs.existsSync(outDir)
        ? fs.readdirSync(outDir).filter(f => f.startsWith('LTSpice_to_PDF'))
        : [];
    if (produced.length === 0) throw new Error('Build produced no executables.');

    console.log('\nBuild successful:');
    for (const f of produced.sort()) {
        const mb = fs.statSync(path.join(outDir, f)).size / 1048576;
        console.log(`   ${mb.toFixed(1).padStart(6)} MB  dist/LTSpice_to_PDF/${f}`);
    }

} catch (err) {
    console.error('❌ Build failed:', err.message);
    process.exitCode = 1; // so CI and `npm run build` actually report the failure
} finally {
    console.log('Cleaning up temp files...');
    fs.rmSync(buildDir, { recursive: true, force: true });
}
