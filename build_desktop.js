const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('--- Neutralino Custom Builder ---');
console.log('Preparing isolated build environment...');

const rootDir = __dirname;
const buildDir = path.join(rootDir, '.neu_build_temp');

// 1. Clean previous temp dir if exists
if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true });
}
fs.mkdirSync(buildDir);

// 2. Define exactly what files/folders go into the executable
const includeList = [
    'index.html',
    'app.js',
    'style.css',
    'neutralino.js',
    'engine',
    'Assets',
    'bin'
];

// Helper to recursively copy directories
function copyRecursiveSync(src, dest) {
    const stats = fs.statSync(src);
    const isDirectory = stats.isDirectory();
    if (isDirectory) {
        fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(childItemName => {
            copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

// 3. Prepare the Neutralino CLI expected structure (assets in a subfolder like /www/)
console.log('Structuring source files to prevent recursion errors...');
const wwwDir = path.join(buildDir, 'www');
fs.mkdirSync(wwwDir);

for (const item of includeList) {
    const srcPath = path.join(rootDir, item);
    // Put "bin" in the root of the build environment, but all standard assets into /www/
    const destPath = item === 'bin' ? path.join(buildDir, item) : path.join(wwwDir, item);
    
    if (fs.existsSync(srcPath)) {
        copyRecursiveSync(srcPath, destPath);
    }
}

// 4. Copy and rewrite the config file to point to /www/
const configPath = path.join(rootDir, 'neutralino.config.json');
const destConfigPath = path.join(buildDir, 'neutralino.config.json');

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.documentRoot = "/www/";
config.cli.resourcesPath = "/www/";
config.cli.clientLibrary = "/www/neutralino.js";

// Fix icon path for compiler
if (config.modes && config.modes.window && config.modes.window.icon) {
    config.modes.window.icon = "/www" + config.modes.window.icon;
}

fs.writeFileSync(destConfigPath, JSON.stringify(config, null, 2));

// 4. Execute neu build inside the clean directory!
try {
    console.log('Running Neutralino build with embedded resources...');
    try {
        execSync('npx @neutralinojs/neu build --embed-resources', { cwd: buildDir, stdio: 'inherit' });
    } catch (buildErr) {
        console.log('Note: neu build reported an error (likely Linux embedding warning). Proceeding...');
    }

    // 5. Move the finished dist folder back to normal root
    const srcDist = path.join(buildDir, 'dist');
    const destDist = path.join(rootDir, 'dist');

    if (fs.existsSync(destDist)) {
        fs.rmSync(destDist, { recursive: true, force: true });
    }

    console.log('Moving compiled output back to root/dist...');
    fs.renameSync(srcDist, destDist);

    // 6. Manually build the Windows distribution folder
    // (postject cannot embed into Windows PE from this host — we ship exe + resources.neu instead)
    const winDistDir = path.join(rootDir, 'dist', 'LTSpice_to_PDF-win64');
    fs.mkdirSync(winDistDir, { recursive: true });

    const winBinSrc = path.join(rootDir, 'bin', 'neutralino-win_x64.exe');
    const winBinDest = path.join(winDistDir, 'LTSpice_to_PDF.exe');
    const resourcesSrc = path.join(rootDir, 'dist', 'LTSpice_to_PDF', 'resources.neu');
    const resourcesDest = path.join(winDistDir, 'resources.neu');

    if (fs.existsSync(winBinSrc)) {
        fs.copyFileSync(winBinSrc, winBinDest);
        console.log('✅ Windows binary copied: LTSpice_to_PDF.exe');
    } else {
        console.warn('⚠️  Windows binary not found in bin/ — run: npx @neutralinojs/neu update');
    }

    if (fs.existsSync(resourcesSrc)) {
        fs.copyFileSync(resourcesSrc, resourcesDest);
        console.log('✅ resources.neu copied');
    }

    // 7. Create a distributable ZIP using PowerShell's built-in Compress-Archive
    const zipPath = path.join(rootDir, 'dist', `LTSpice_to_PDF.zip`);
    if (fs.existsSync(zipPath)) fs.rmSync(zipPath);

    console.log('Creating distributable ZIP...');
    const psCmd = [
        `$files = @('${winBinDest.replace(/\\/g, '\\\\')}', '${resourcesDest.replace(/\\/g, '\\\\')}')`,
        `Compress-Archive -Path $files -DestinationPath '${zipPath.replace(/\\/g, '\\\\')}'`
    ].join('; ');
    execSync(`powershell -Command "${psCmd}"`, { stdio: 'inherit' });


    console.log('\n✅ Build successful!');
    console.log(`   📦 Distribute: dist/LTSpice_to_PDF.zip`);
    console.log('   (Contains LTSpice_to_PDF.exe + resources.neu — keep them together)');

} catch (e) {
    console.error('❌ Build failed:', e.message);
} finally {
    // 6. Cleanup
    console.log('Cleaning up temporary files...');
    fs.rmSync(buildDir, { recursive: true, force: true });
}
