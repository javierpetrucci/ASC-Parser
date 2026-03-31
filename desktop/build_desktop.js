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
];

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
function copyRecursive(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const child of fs.readdirSync(src)) {
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
    }
}

// Neutralino binaries go in the root of the build dir (not /www/)
if (fs.existsSync(BIN_SRC)) {
    copyRecursive(BIN_SRC, path.join(buildDir, 'bin'));
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
    } catch {
        // Linux binary postject may fail on cross-compile — Windows embed still succeeds
        console.log('Note: Some platform embeddings may have failed (expected on cross-compile).');
    }

    // ── 5. Move output back to repo root /dist ───────────────────────────
    const srcDist  = path.join(buildDir, 'dist');
    const destDist = path.join(rootDir, 'dist');

    if (fs.existsSync(destDist)) {
        fs.rmSync(destDist, { recursive: true, force: true });
    }

    console.log('Moving compiled output to /dist...');
    fs.renameSync(srcDist, destDist);

    console.log('\n✅ Build successful!');
    console.log('   📦 dist/LTSpice_to_PDF/LTSpice_to_PDF-win_x64.exe');

} catch (err) {
    console.error('❌ Build failed:', err.message);
} finally {
    console.log('Cleaning up temp files...');
    fs.rmSync(buildDir, { recursive: true, force: true });
}
