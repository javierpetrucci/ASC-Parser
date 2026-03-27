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
    console.log('Running Neutralino build...');
    execSync('npx @neutralinojs/neu build', { cwd: buildDir, stdio: 'inherit' });
    
    // 5. Move the finished dist folder back to normal root
    const srcDist = path.join(buildDir, 'dist');
    const destDist = path.join(rootDir, 'dist');
    
    if (fs.existsSync(destDist)) {
        fs.rmSync(destDist, { recursive: true, force: true });
    }
    
    console.log('Moving compiled binary back to root/dist...');
    fs.renameSync(srcDist, destDist);
    
    console.log('✅ Build successful! Executable is waiting in the /dist folder.');
} catch (e) {
    console.error('❌ Build failed:', e.message);
} finally {
    // 6. Cleanup
    console.log('Cleaning up temporary files...');
    fs.rmSync(buildDir, { recursive: true, force: true });
}
