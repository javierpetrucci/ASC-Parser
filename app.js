// web/app.js

const dropOverlay = document.getElementById('drop-overlay');
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const downloadBtn = document.getElementById('download-btn');
const pdfContainer = document.getElementById('pdf-container');
const welcomeMsg = document.getElementById('welcome-msg');
const optCanvasRect = document.getElementById('opt-canvas-rect');
const optDebugAnchors = document.getElementById('opt-debug-anchors');
const optOverrideAnchors = document.getElementById('opt-override-anchors');
const skinSelector = document.getElementById('skin-selector');

let currentPdfBlob = null;
let currentFilename = 'schematic';
let currentFileObj = null;

// Initialize Skins Dropdown
document.addEventListener('DOMContentLoaded', async () => {
    if (!skinSelector) return;
    try {
        const res = await fetch('Assets/Skins/skins.txt');
        if (res.ok) {
            const text = await res.text();
            const skins = text.split('\n').map(s => s.trim()).filter(s => s.length > 0);
            if (skins.length > 0) {
                skinSelector.innerHTML = '';
                for (const s of skins) {
                    const option = document.createElement('option');
                    option.value = s;
                    option.textContent = s;
                    skinSelector.appendChild(option);
                }
                
                // Add a "None" option to fallback entirely to ASY rendering
                const noneOption = document.createElement('option');
                noneOption.value = 'None';
                noneOption.textContent = 'None';
                skinSelector.appendChild(noneOption);
            }
        }
    } catch (e) {
        console.warn('Could not load skins.txt', e);
    }
});

if (optCanvasRect) {
    optCanvasRect.addEventListener('change', () => {
        if (currentFileObj) processFile(currentFileObj);
    });
}

if (optDebugAnchors) {
    optDebugAnchors.addEventListener('change', () => {
        if (currentFileObj) processFile(currentFileObj);
    });
}

if (optOverrideAnchors) {
    optOverrideAnchors.addEventListener('change', () => {
        if (currentFileObj) processFile(currentFileObj);
    });
}

if (skinSelector) {
    skinSelector.addEventListener('change', () => {
        if (currentFileObj) processFile(currentFileObj);
    });
}

// ── 1. Global Drag and Drop ──────────────────────────────────────
let dragCounter = 0;

document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) dropOverlay.classList.add('active');
});

document.addEventListener('dragover', (e) => e.preventDefault());

document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) dropOverlay.classList.remove('active');
});

document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropOverlay.classList.remove('active');

    if (e.dataTransfer.files.length > 0) {
        processFile(e.dataTransfer.files[0]);
    }
});

// File input manually triggered from dropzone click
if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) processFile(e.target.files[0]);
    });
}

// Download button
downloadBtn.addEventListener('click', () => {
    if (currentPdfBlob) {
        const url = URL.createObjectURL(currentPdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = currentFilename + '.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
});

// Neutralino Batch Processing
const batchBox = document.getElementById('batch-box');
const originBtn = document.getElementById('select-origin-btn');
const destBtn = document.getElementById('select-dest-btn');
const runBatchBtn = document.getElementById('run-batch-btn');
const originNameSpan = document.getElementById('origin-folder-name');
const destNameSpan = document.getElementById('dest-folder-name');

let batchOriginPath = null;
let batchDestPath = null;

function updateBatchUI() {
    if (batchOriginPath) {
        originNameSpan.innerText = batchOriginPath.split(/[\\/]/).pop() || batchOriginPath;
    }
    if (batchDestPath) {
        destNameSpan.innerText = batchDestPath.split(/[\\/]/).pop() || batchDestPath;
    }
    if (batchOriginPath && batchDestPath) {
        runBatchBtn.disabled = false;
    }
}

// Initialize Neutralino if the native desktop wrapper is detected
if (window.NL_PORT && window.Neutralino) {
    Neutralino.init();
    
    // UI COSMETIC: Change Download button to Export for native desktop experience
    if (downloadBtn) downloadBtn.innerText = 'Export PDF';

    // UI COSMETIC: Hide the promo for the desktop app if we are already in it
    const promo = document.getElementById('desktop-app-promo');
    if (promo) promo.style.display = 'none';

    if (batchBox) {
        batchBox.style.display = 'block';
        
        // Restore from memory if exists
        batchOriginPath = localStorage.getItem('asc-batch-origin') || null;
        batchDestPath = localStorage.getItem('asc-batch-dest') || null;
        updateBatchUI();

        originBtn.addEventListener('click', async () => {
            const folder = await window.Neutralino.os.showFolderDialog('Select Origin Folder');
            if (folder) {
                batchOriginPath = folder;
                localStorage.setItem('asc-batch-origin', folder);
                updateBatchUI();
            }
        });

        destBtn.addEventListener('click', async () => {
            const folder = await window.Neutralino.os.showFolderDialog('Select Destination Folder');
            if (folder) {
                batchDestPath = folder;
                localStorage.setItem('asc-batch-dest', folder);
                updateBatchUI();
            }
        });

        runBatchBtn.addEventListener('click', async () => {
            if (batchOriginPath && batchDestPath) {
                await processBatch(batchOriginPath, batchDestPath);
            }
        });
    }
}

// ── 2. Controller Logic ──────────────────────────────────────────

// Convert an ArrayBuffer or Blob to a base64 string
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

// Cache-buster: changes each page load so browsers always fetch fresh assets, but breaks Neutralino routing.
const ASSET_VERSION = window.NL_PORT ? '' : `?v=${Date.now()}`;

// Ensure the font is loaded as base64 and SVGs are fetched dynamically based on parsed symbols
async function prepareAssets(scene) {
    const assets = {
        fontBase64: null,
        svgStrings: new Map() // component name -> svg text
    };

    // Load Font once
    if (!window.cachedFontBase64) {
        try {
            // Static assets like fonts rarely change, so don't hit them with the cache-buster, which can interrupt binary streaming on local host servers
            const fontRes = await fetch(`Assets/Fonts/lmroman10-regular.ttf`);
            if (fontRes.ok) {
                const buffer = await fontRes.arrayBuffer();
                window.cachedFontBase64 = arrayBufferToBase64(buffer);
            } else {
                console.warn('Font file not found');
            }
        } catch(e) { console.error('Error fetching font:', e); }
    }
    assets.fontBase64 = window.cachedFontBase64;

    // Discover needed SVGs
    const neededTypes = new Set();
    neededTypes.add('intersection');
    
    for (const sym of scene.symbols) {
        const basename = sym.type.split('\\').pop().split('/').pop();
        neededTypes.add(basename);
    }
    for (const flag of scene.flags) {
        neededTypes.add(flag.name === '0' ? 'GND' : 'flag');
    }

    // Fetch them using the selected skin
    const selectedSkin = skinSelector ? skinSelector.value : 'Default';
    
    const promises = Array.from(neededTypes).map(async (type) => {
        if (selectedSkin === 'None') return; // Skip fetching, force ASY fallback
        try {
            const res = await fetch(`Assets/Skins/${selectedSkin}/${type}.svg${ASSET_VERSION}`);
            if (res.ok) {
                const text = await res.text();
                assets.svgStrings.set(type, text);
            }
        } catch (e) {
            console.warn(`Could not load SVG for ${type}`);
        }
    });

    await Promise.all(promises);
    return assets;
}

async function processFile(file) {
    if (!file.name.toLowerCase().endsWith('.asc')) {
        alert('Please drop a valid .asc file.');
        return;
    }

    currentFilename = file.name.replace(/\.[^/.]+$/, "");
    currentFileObj = file;
    
    // Show loading state
    welcomeMsg.innerHTML = '<h3>Rendering...</h3><p>Generating Vector PDF</p>';
    welcomeMsg.style.display = 'block';
    pdfContainer.style.display = 'none';

    try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        
        // Detect encoding: LTSpice uses UTF-16LE (with BOM) or Windows-1252 (ANSI)
        let encoding = 'windows-1252'; 
        if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
            encoding = 'utf-16le';
        }
        
        const decoder = new TextDecoder(encoding);
        const text = decoder.decode(buffer);
        
        // 1. Parse ASC to Scene Sub-Graph 
        const scene = window.LTSpiceEngine.parse(text);
        
        // 2. Fetch Assets needed for this Scene
        const assets = await prepareAssets(scene);
        
        // 3. Render directly to PDF
        // Read checkbox states
        const options = {
            canvasBasedOnRectangle: optCanvasRect ? optCanvasRect.checked : false,
            showTextAnchors: optDebugAnchors ? optDebugAnchors.checked : false,
            overrideAnchors: optOverrideAnchors ? optOverrideAnchors.checked : true
        };
        const pdfBytes = await window.LTSpiceEngine.render(scene, assets, currentFilename, options);
        
        // Use a File object instead of a Blob to "hint" the filename to the browser's PDF viewer
        currentPdfBlob = new File([pdfBytes], `${currentFilename}.pdf`, { type: 'application/pdf' });
        
        // 4. Update UI Viewer
        const blobUrl = URL.createObjectURL(currentPdfBlob);
        pdfContainer.innerHTML = `<iframe id="pdf-viewer" src="${blobUrl}#view=FitH" style="width:100%;height:100%;border:none;"></iframe>`;
        
        welcomeMsg.style.display = 'none';
        pdfContainer.style.display = 'block';
        downloadBtn.disabled = false;
        
    } catch (err) {
        console.error(err);
        welcomeMsg.innerHTML = `<h3 style="color:var(--accent)">Error</h3><p>${err.message}</p>`;
    }
}

// Recursively search for .asc files using the Neutralino native API
async function scanFolderForAsc(dir, fileList = []) {
    let entries;
    try { entries = await window.Neutralino.filesystem.readDirectory(dir); } 
    catch (e) { return fileList; }
    
    for (const entry of entries) {
        if (entry.entry === '.' || entry.entry === '..') continue;
        const fullPath = dir + (dir.endsWith('/') || dir.endsWith('\\') ? '' : '/') + entry.entry;
        
        if (entry.type === 'DIRECTORY') {
            await scanFolderForAsc(fullPath, fileList);
        } else if (entry.type === 'FILE' && entry.entry.toLowerCase().endsWith('.asc')) {
            fileList.push(fullPath);
        }
    }
    return fileList;
}

// Ensure remote folders exist recursively
async function ensureDestDir(destPath) {
    // Basic fallback folder creation spanning absolute drive paths
    let parts = destPath.replace(/\\/g, '/').split('/');
    let currentPath = parts.shift(); // e.g., "C:" or ""
    
    // Ignore empty leading split artifacts (e.g. from "//" or initial empty root)
    if (currentPath === "") currentPath = "/"; 
    
    for (const part of parts) {
        if (part === "") continue;
        
        currentPath = currentPath === "/" ? `/${part}` : `${currentPath}/${part}`;
        try {
            await window.Neutralino.filesystem.createDirectory(currentPath);
        } catch(e) { /* ignore already exists error */ }
    }
}

async function processBatch(sourceFolder, destFolder) {
    welcomeMsg.innerHTML = `<h3>Batch Processing...</h3><p>Scanning folder...</p>`;
    welcomeMsg.style.display = 'block';
    pdfContainer.style.display = 'none';
    
    try {
        const files = await scanFolderForAsc(sourceFolder);
        if (files.length === 0) {
            welcomeMsg.innerHTML = `<h3>Done</h3><p>No .asc files found in that directory.</p>`;
            return;
        }

        let successCount = 0;
        for (let i = 0; i < files.length; i++) {
            const filePath = files[i];
            const filename = filePath.split(/[\\/]/).pop().replace(/\.[^/.]+$/, "");
            
            welcomeMsg.innerHTML = `<h3>Processing ${i+1}/${files.length}</h3><p>${filename}.asc</p>`;
            await new Promise(r => setTimeout(r, 10));

            try {
                // Determine relative path for output reconstruction
                let relativePath = filePath;
                if (filePath.startsWith(sourceFolder)) {
                    relativePath = filePath.substring(sourceFolder.length);
                }
                const relativePdfPath = relativePath.replace(/\.asc$/i, '.pdf');
                
                const finalPdfPath = (destFolder + '/' + relativePdfPath).replace(/\\/g, '/').replace(/\/\//g, '/');
                
                // Read via Neutralino native API
                const rawBuffer = await window.Neutralino.filesystem.readBinaryFile(filePath);
                // Neutralino returns an ArrayBuffer for binary files.
                const bytes = new Uint8Array(rawBuffer);
                
                let encoding = 'windows-1252'; 
                if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
                    encoding = 'utf-16le';
                }
                
                const decoder = new TextDecoder(encoding);
                const text = decoder.decode(bytes);
                
                const scene = window.LTSpiceEngine.parse(text);
                const assets = await prepareAssets(scene);
                
                const options = {
                    canvasBasedOnRectangle: optCanvasRect ? optCanvasRect.checked : false,
                    showTextAnchors: optDebugAnchors ? optDebugAnchors.checked : false,
                    overrideAnchors: optOverrideAnchors ? optOverrideAnchors.checked : true
                };
                
                const pdfBytes = await window.LTSpiceEngine.render(scene, assets, filename, options);
                
                // Ensure output directory exists then write
                const destFileFolder = finalPdfPath.substring(0, finalPdfPath.lastIndexOf('/'));
                await ensureDestDir(destFileFolder);

                // writeBinaryFile expects ArrayBuffer
                await window.Neutralino.filesystem.writeBinaryFile(finalPdfPath, pdfBytes.buffer ? pdfBytes.buffer : pdfBytes);
                
                successCount++;
            } catch (fileErr) {
                console.error(`Error processing ${filename}:`, fileErr);
            }
        }
        
        welcomeMsg.innerHTML = `<h3>Batch Complete</h3><p>Processed ${successCount} of ${files.length} schematics successfully.</p>`;
    } catch (err) {
        console.error(err);
        welcomeMsg.innerHTML = `<h3 style="color:var(--accent)">Error</h3><p>${err.message}</p>`;
    }
}
