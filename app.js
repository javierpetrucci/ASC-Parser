// web/app.js

const dropOverlay = document.getElementById('drop-overlay');
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const downloadBtn = document.getElementById('download-btn');
const downloadTexBtn = document.getElementById('download-tex-btn');
const pdfContainer = document.getElementById('pdf-container');
const welcomeMsg = document.getElementById('welcome-msg');
const statusMsg = document.getElementById('status-msg');
const optCanvasRect = document.getElementById('opt-canvas-rect');
const optDebugAnchors = document.getElementById('opt-debug-anchors');
const optOverrideAnchors = document.getElementById('opt-override-anchors');
const skinSelector = document.getElementById('skin-selector');

const specContainer = document.getElementById('spec-container');
const specContent = document.getElementById('spec-content');
const viewSpecBtn = document.getElementById('view-spec-btn');
const closeSpecBtn = document.getElementById('close-spec-btn');

let currentPdfBlob = null;
let currentFilename = 'schematic';
// Everything the TikZ exporter needs, kept from the last successful render.
// The .tex is produced on click rather than alongside every PDF: the scene and
// the skin SVGs are already in memory, so nothing is re-fetched or re-parsed.
let currentRenderInput = null;
// Guards processFile/processBatch against overlapping runs. Without it, dropping
// a second file (or toggling an option) mid-render made the in-flight render
// pick up the newer filename, and let two batches write to the same folder.
let isRendering = false;
let currentFileObj = null;

// Drawn procedurally from the Default artwork rather than loaded from a folder,
// so it is offered alongside the real skins but never appears in skins.txt.
const ROUGH_SKIN = 'TC2_Rough';

// Initialize Skins Dropdown
document.addEventListener('DOMContentLoaded', async () => {
    // Scroll console to bottom so the cursor line is visible on load
    if (consoleBox) consoleBox.scrollTop = consoleBox.scrollHeight;

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
                
                // The procedural skin. It has no folder of its own: it redraws
                // Default's artwork through engine/rough_pen.js at render time,
                // seeded per placement, so no two components come out identical.
                const roughOption = document.createElement('option');
                roughOption.value = ROUGH_SKIN;
                roughOption.textContent = ROUGH_SKIN;
                skinSelector.appendChild(roughOption);

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

// The "i" badges live inside the option <label>, so a click on them used to
// toggle the very checkbox they document and trigger a full re-render. Swallow
// the click here rather than via `pointer-events: none`, which would also kill
// the :hover tooltip the badge exists for.
document.querySelectorAll('.help-btn').forEach((badge) => {
    badge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
});

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
    // Clamp at 0: Chrome does not reliably fire the final dragleave when a drag
    // exits the window or is cancelled with Escape. Letting the counter go
    // negative left the overlay stuck and blocked every later drag.
    dragCounter = Math.max(0, dragCounter - 1);
    if (dragCounter === 0) dropOverlay.classList.remove('active');
});

document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropOverlay.classList.remove('active');

    const dropped = e.dataTransfer.files;
    if (dropped.length === 0) {
        // Folders and non-file drags land here; previously nothing happened at all.
        showStatus('Nothing to convert', 'Drop a .asc schematic file (not a folder).', true);
        return;
    }
    if (dropped.length > 1) {
        showStatus('One file at a time', `Converting "${dropped[0].name}". Use Batch Process for multiple files.`);
    }
    processFile(dropped[0]);
});

// File input manually triggered from dropzone click
if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) processFile(e.target.files[0]);
        // Reset so picking the SAME path again still fires `change` — the usual
        // flow is edit in LTSpice, then re-convert the same file.
        e.target.value = '';
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

// Export the same drawing as TikZ source. It runs the very same renderer as the
// PDF (see engine/tikz_renderer.js), so what compiles is what the viewer shows.
if (downloadTexBtn) {
    downloadTexBtn.addEventListener('click', async () => {
        if (!currentRenderInput) return;
        const { scene, assets, filename, options } = currentRenderInput;
        try {
            consolePrint('  exporting TikZ source...', 'muted');
            const tex = await window.LTSpiceEngine.renderTikz(scene, assets, filename, options);
            if (!tex) throw new Error('Nothing to export — this schematic has no drawable geometry.');

            const url = URL.createObjectURL(new Blob([tex], { type: 'application/x-tex' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = filename + '.tex';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            consolePrint(`[ OK ] done — ${filename}.tex`, 'ok');
        } catch (err) {
            console.error(err);
            consolePrint(`[ERR] ${err.message}`, 'err');
            showStatus('Error', err.message, true);
        }
    });
}

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
        neededTypes.add(symbolBasename(sym.type));
    }
    for (const flag of scene.flags) {
        neededTypes.add(flag.name === '0' ? 'GND' : 'flag');
    }

    // Fetch them using the selected skin
    const selectedSkin = skinSelector ? skinSelector.value : 'Default';

    // TC2_Rough ships no artwork of its own - it reads Default's and redraws it
    // freehand in the renderer, which is why it can never drift out of date.
    assets.rough = selectedSkin === ROUGH_SKIN;
    // Only read by the TikZ export, to name the skin in the generated file's header.
    assets.skinName = selectedSkin;
    const sourceSkin = assets.rough ? 'Default' : selectedSkin;

    const promises = Array.from(neededTypes).map(async (type) => {
        if (selectedSkin === 'None') return; // Skip fetching, force ASY fallback
        try {
            // Fetch with the on-disk casing, but key the map case-insensitively so
            // the renderer's lookup cannot miss on a differently-cased .asc.
            const res = await fetch(`Assets/Skins/${sourceSkin}/${type}.svg${ASSET_VERSION}`);
            if (res.ok) {
                const text = await res.text();
                assets.svgStrings.set(type.toLowerCase(), text);
            } else {
                console.warn(`[SKIN] ${sourceSkin} has no ${type}.svg (falling back to .asy geometry)`);
            }
        } catch (e) {
            console.warn(`Could not load SVG for ${type}`);
        }
    });

    await Promise.all(promises);
    return assets;
}

// ── Console Panel ────────────────────────────────────────────────
const consoleLines  = document.getElementById('console-lines');
const consoleBox    = document.getElementById('sidebar-console');

// Pause auto-scroll while the user is hovering to read history
let consoleHovered = false;
if (consoleBox) {
    consoleBox.addEventListener('mouseenter', () => { consoleHovered = true; });
    consoleBox.addEventListener('mouseleave', () => {
        consoleHovered = false;
        // Snap back to bottom when they leave
        consoleBox.scrollTop = consoleBox.scrollHeight;
    });
}

/**
 * Print a line to the sidebar console panel.
 * @param {string} text
 * @param {'dim'|'muted'|'normal'|'ok'|'err'} style
 */
function consolePrint(text, style = 'muted') {
    if (!consoleLines) return;
    const el = document.createElement('span');
    el.className = `con-line con-line--${style}`;
    el.textContent = text;
    consoleLines.appendChild(el);

    // Auto-scroll to bottom only if user isn't browsing history
    if (consoleBox && !consoleHovered) {
        consoleBox.scrollTop = consoleBox.scrollHeight;
    }
}


/** Small async delay helper */

let consoleSequenceId = 0;

// Reports pipeline stages as they happen. The previous version was a scripted
// animation fired AFTER the render finished and never awaited, so the "parsing…
// / loading SVGs… / rendering…" lines were pure theatre printed retroactively —
// and during a slow render the console showed nothing at all.
function consoleStage(sequenceId, text, style = 'normal') {
    if (sequenceId !== consoleSequenceId) return false; // superseded by a newer file
    consolePrint(text, style);
    return true;
}

// Yields to the event loop so the line just printed actually paints before the
// next (potentially blocking) stage starts.
//
// requestAnimationFrame alone is NOT safe here: browsers stop firing it in a
// hidden or backgrounded tab, which would leave the conversion suspended
// forever if the user switches away mid-render. Race it against a timer so the
// pipeline always continues, and still gets a real paint when visible.
function paintTick() {
    return new Promise(resolve => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
        };
        requestAnimationFrame(() => setTimeout(finish, 0));
        setTimeout(finish, 50);
    });
}


// Decodes raw .asc/.asy bytes to text, honouring the byte-order mark.
// LTspice 24.x writes UTF-8 (often with a BOM); older versions wrote
// windows-1252, which stays the no-BOM default. Without the UTF-8 BOM branch
// the first line decodes as "ï»¿Version 4" and the parser drops the header.
function decodeAscBytes(bytes, buffer) {
    let encoding = 'windows-1252';
    let offset = 0;

    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        encoding = 'utf-8';
        offset = 3;
    } else if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
        encoding = 'utf-16le';
        offset = 2;
    } else if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
        encoding = 'utf-16be';
        offset = 2;
    } else if (isLikelyUtf8(bytes)) {
        // No BOM, but the byte pattern is valid multi-byte UTF-8 — decoding as
        // windows-1252 would turn accented net labels into mojibake.
        encoding = 'utf-8';
    }

    const source = offset ? bytes.subarray(offset) : (buffer || bytes);
    return { text: new TextDecoder(encoding).decode(source), encoding };
}

// True only when the buffer contains at least one well-formed multi-byte UTF-8
// sequence and no invalid ones. Pure ASCII returns false — it decodes
// identically either way, so the windows-1252 default is kept.
function isLikelyUtf8(bytes) {
    let sawMultiByte = false;
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b < 0x80) continue;
        let extra;
        if (b >= 0xC2 && b <= 0xDF) extra = 1;
        else if (b >= 0xE0 && b <= 0xEF) extra = 2;
        else if (b >= 0xF0 && b <= 0xF4) extra = 3;
        else return false;
        if (i + extra >= bytes.length) return false;
        for (let k = 1; k <= extra; k++) {
            if ((bytes[i + k] & 0xC0) !== 0x80) return false;
        }
        sawMultiByte = true;
        i += extra;
    }
    return sawMultiByte;
}

// Status and error messages get their own panel. They used to be written into
// #welcome-msg, which (a) is styled to hide h3/p — so every error and all batch
// progress was invisible — and (b) contains #view-spec-btn, which the overwrite
// destroyed along with its listener.
function showStatus(title, body, isError = false) {
    if (!statusMsg) return;
    const cls = isError ? ' class="status-err"' : '';
    statusMsg.innerHTML = `<h3${cls}>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p>`;
    statusMsg.style.display = 'block';
    welcomeMsg.style.display = 'none';
}

// Same as showStatus but appends a bulleted list (used for per-file batch failures).
function showStatusWithList(title, body, items, isError = false) {
    if (!statusMsg) return;
    const cls = isError ? ' class="status-err"' : '';
    const li = items.map(t => `<li>${escapeHtml(t)}</li>`).join('');
    statusMsg.innerHTML =
        `<h3${cls}>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p>` +
        (li ? `<ul>${li}</ul>` : '');
    statusMsg.style.display = 'block';
    welcomeMsg.style.display = 'none';
}

function hideStatus() {
    if (statusMsg) statusMsg.style.display = 'none';
}

// Single source of truth for the render options, so processFile and
// processBatch cannot drift and a batch reads them exactly once.
function readRenderOptions() {
    return {
        canvasBasedOnRectangle: optCanvasRect ? optCanvasRect.checked : false,
        showTextAnchors: optDebugAnchors ? optDebugAnchors.checked : false,
        overrideAnchors: optOverrideAnchors ? optOverrideAnchors.checked : true
    };
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function processFile(file) {
    if (!file.name.toLowerCase().endsWith('.asc')) {
        showStatus('Unsupported file', `"${file.name}" is not a .asc schematic.`, true);
        return;
    }
    if (isRendering) return;
    isRendering = true;

    // Captured locally: these are read again after several awaits, and reading
    // the module-level global there let a newer drop rename an in-flight render.
    const filename = file.name.replace(/\.[^/.]+$/, "");
    currentFilename = filename;
    currentFileObj = file;

    // Show loading state (hide PDF, welcome, status and specification container)
    if (specContainer) specContainer.style.display = 'none';
    welcomeMsg.style.display = 'none';
    pdfContainer.style.display = 'none';
    hideStatus();

    // Increment console sequence counter to cancel any active background console animations
    consoleSequenceId++;
    const mySequenceId = consoleSequenceId;

    try {
        // Each stage prints BEFORE the work it names, then yields a frame so the
        // line paints. That way a slow render shows where it actually is.
        // ── 1. Read file ──────────────────────────────────────
        consoleStage(mySequenceId, `$ open  "${file.name}"`, 'dim');
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        consoleStage(mySequenceId, `  reading file  [${(file.size / 1024).toFixed(1)} kB]`, 'muted');

        // ── 2. Detect encoding ────────────────────────────────
        const { text, encoding } = decodeAscBytes(bytes, buffer);
        consoleStage(mySequenceId, `  encoding       ${encoding}`, 'muted');

        // ── 3. Parse ASC ──────────────────────────────────────
        consoleStage(mySequenceId, '  parsing ASC tokens...');
        await paintTick();
        const scene = window.LTSpiceEngine.parse(text);
        if (mySequenceId !== consoleSequenceId) return;

        consoleStage(mySequenceId,
            `  wires:${scene.wires.length}  symbols:${scene.symbols.length}  labels:${scene.texts.length}`,
            'dim');

        // ── 4. Load assets ────────────────────────────────────
        consoleStage(mySequenceId, '  loading component SVGs...');
        await paintTick();
        const assets = await prepareAssets(scene);
        if (mySequenceId !== consoleSequenceId) return;
        consoleStage(mySequenceId, `  font + ${assets.svgStrings.size} symbol(s) cached`, 'dim');

        // ── 5. Render to PDF ──────────────────────────────────
        consoleStage(mySequenceId, '  rendering PDF vectors...');
        await paintTick();
        const options = readRenderOptions();
        const pdfBytes = await window.LTSpiceEngine.render(scene, assets, filename, options);
        if (mySequenceId !== consoleSequenceId) return;

        // render() returns null when the scene has nothing drawable. Passing that
        // to new File() produced a 4-byte PDF containing the text "null", served
        // as application/pdf with the download button enabled.
        if (!pdfBytes) {
            throw new Error('Nothing to render — this schematic has no drawable geometry.');
        }

        // ── 6. Update viewer ──────────────────────────────────
        consoleStage(mySequenceId, '  building blob URL...', 'muted');
        currentPdfBlob = new File([pdfBytes], `${filename}.pdf`, { type: 'application/pdf' });
        currentRenderInput = { scene, assets, filename, options };
        setPdfViewer(URL.createObjectURL(currentPdfBlob));

        consoleStage(mySequenceId, `[ OK ] done — ${filename}.pdf`, 'ok');

    } catch (err) {
        console.error(err);
        consolePrint(`[ERR] ${err.message}`, 'err');
        showStatus('Error', err.message, true);
        // Drop the stale PDF. Leaving it wired up let the user download the
        // PREVIOUS successful render after a failed re-render, silently getting
        // a file that did not match the current options.
        clearPdfViewer();
        currentPdfBlob = null;
        currentRenderInput = null;
        downloadBtn.disabled = true;
        if (downloadTexBtn) downloadTexBtn.disabled = true;
    } finally {
        isRendering = false;
    }
}

// Swaps the viewer iframe, revoking the previous object URL. Every re-render
// used to leak one blob URL, pinning the whole PDF buffer for the page lifetime.
let currentBlobUrl = null;

function setPdfViewer(blobUrl) {
    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = blobUrl;
    pdfContainer.innerHTML = `<iframe id="pdf-viewer" src="${blobUrl}#view=FitH" style="width:100%;height:100%;border:none;"></iframe>`;
    pdfContainer.style.display = 'block';
    downloadBtn.disabled = false;
    if (downloadTexBtn) downloadTexBtn.disabled = false;
}

function clearPdfViewer() {
    if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
    }
    pdfContainer.innerHTML = '';
    pdfContainer.style.display = 'none';
}


// Recursively search for .asc files using the Neutralino native API
// Returns { ok, files }. `ok` is false only when the ROOT folder could not be
// read, so the caller can tell "folder is gone / no permission" apart from
// "folder has no .asc files" — previously both looked identical.
async function scanFolderForAsc(dir, fileList = [], isRoot = true) {
    let entries;
    try { entries = await window.Neutralino.filesystem.readDirectory(dir); }
    catch (e) {
        if (isRoot) return { ok: false, files: fileList };
        console.warn(`Skipping unreadable directory: ${dir}`);
        return { ok: true, files: fileList };
    }
    
    for (const entry of entries) {
        if (entry.entry === '.' || entry.entry === '..') continue;
        const fullPath = dir + (dir.endsWith('/') || dir.endsWith('\\') ? '' : '/') + entry.entry;
        
        if (entry.type === 'DIRECTORY') {
            await scanFolderForAsc(fullPath, fileList, false);
        } else if (entry.type === 'FILE' && entry.entry.toLowerCase().endsWith('.asc')) {
            fileList.push(fullPath);
        }
    }
    return { ok: true, files: fileList };
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
    if (isRendering) return;
    isRendering = true;
    if (runBatchBtn) runBatchBtn.disabled = true;

    showStatus('Batch Processing...', 'Scanning folder...');
    pdfContainer.style.display = 'none';

    try {
        // Read the render options ONCE. Reading them inside the loop meant
        // toggling a checkbox mid-batch produced a folder of PDFs with mixed
        // settings.
        const options = readRenderOptions();

        const scan = await scanFolderForAsc(sourceFolder);
        if (!scan.ok) {
            // An unreadable folder (moved, deleted, no permission) used to be
            // reported as "no .asc files found", which is actively misleading.
            showStatus('Error', `Could not read the origin folder: ${sourceFolder}`, true);
            return;
        }
        const files = scan.files;
        if (files.length === 0) {
            showStatus('Done', 'No .asc files found in that directory.');
            return;
        }

        let successCount = 0;
        const failures = [];

        for (let i = 0; i < files.length; i++) {
            const filePath = files[i];
            const filename = filePath.split(/[\\/]/).pop().replace(/\.[^/.]+$/, "");

            showStatus(`Processing ${i + 1}/${files.length}`, `${filename}.asc`);
            await new Promise(r => setTimeout(r, 10));

            try {
                // Determine relative path for output reconstruction
                let relativePath = filePath;
                if (filePath.startsWith(sourceFolder)) {
                    relativePath = filePath.substring(sourceFolder.length);
                }
                const relativePdfPath = relativePath.replace(/\.asc$/i, '.pdf');
                const finalPdfPath = joinDestPath(destFolder, relativePdfPath);

                // Read via Neutralino native API
                const rawBuffer = await window.Neutralino.filesystem.readBinaryFile(filePath);
                // Neutralino returns an ArrayBuffer for binary files.
                const bytes = new Uint8Array(rawBuffer);
                const { text } = decodeAscBytes(bytes, rawBuffer);

                const scene = window.LTSpiceEngine.parse(text);
                const assets = await prepareAssets(scene);

                const pdfBytes = await window.LTSpiceEngine.render(scene, assets, filename, options);
                if (!pdfBytes) {
                    throw new Error('Nothing to render (no drawable geometry)');
                }

                // Ensure output directory exists then write
                const destFileFolder = finalPdfPath.substring(0, finalPdfPath.lastIndexOf('/'));
                await ensureDestDir(destFileFolder);

                // writeBinaryFile expects ArrayBuffer
                await window.Neutralino.filesystem.writeBinaryFile(finalPdfPath, pdfBytes.buffer ? pdfBytes.buffer : pdfBytes);

                successCount++;
            } catch (fileErr) {
                console.error(`Error processing ${filename}:`, fileErr);
                failures.push(`${filename}.asc — ${fileErr.message}`);
            }
        }

        // Name the files that failed. Previously the count was the only signal
        // and the per-file reason went to the console alone.
        if (failures.length === 0) {
            showStatus('Batch Complete', `Processed ${successCount} of ${files.length} schematics successfully.`);
        } else {
            const shown = failures.slice(0, 10);
            const body = `Processed ${successCount} of ${files.length}. ${failures.length} failed:`;
            showStatusWithList(
                'Batch Complete (with errors)',
                failures.length > shown.length ? `${body} (first ${shown.length} shown)` : body,
                shown,
                true
            );
        }
    } catch (err) {
        console.error(err);
        showStatus('Error', err.message, true);
    } finally {
        isRendering = false;
        if (runBatchBtn) runBatchBtn.disabled = !(batchOriginPath && batchDestPath);
    }
}

// Joins the destination folder with a relative path without destroying UNC
// prefixes. The old code ran .replace(/\/\//g, '/') over the whole string,
// which turned \server\share into /server/share.
function joinDestPath(destFolder, relativePdfPath) {
    const dest = destFolder.replace(/\\/g, '/').replace(/\/+$/, '');
    const rel = relativePdfPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const uncPrefix = /^\/\//.test(dest) ? '//' : '';
    const body = (dest + '/' + rel).replace(/^\/+/, '').replace(/\/{2,}/g, '/');
    return uncPrefix + body;
}

// ── Format Specification Document Viewer ─────────────────────────

let specCachedMarkdown = null;

// Only these schemes are allowed to reach an href. Anything else (javascript:,
// data:, vbscript:, …) becomes an inert span, so a malicious or mistaken link
// in the fetched specification cannot execute.
const SAFE_URL = /^(?:https?:\/\/|mailto:|#|\.{0,2}\/|[\w.-]+(?:\/|$)|[\w.-]+\.md)/i;

function parseInlineElements(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong class="spec-strong">$1</strong>')
        .replace(/`(.*?)`/g, '<code class="spec-code">$1</code>')
        .replace(/\[(.*?)\]\((.*?)\)/g, (match, label, url) => {
            const clean = url.trim();
            if (!SAFE_URL.test(clean)) return `<span class="spec-link">${label}</span>`;
            return `<a href="${clean}" target="_blank" rel="noopener noreferrer" class="spec-link">${label}</a>`;
        });
}

function renderSpecTable(headers, rows) {
    let html = '<table class="spec-table">\n<thead>\n<tr>\n';
    for (const h of headers) {
        html += `<th class="spec-th">${parseInlineElements(h)}</th>\n`;
    }
    html += '</tr>\n</thead>\n<tbody>\n';
    for (const r of rows) {
        html += '<tr>\n';
        for (const cell of r) {
            html += `<td class="spec-td">${parseInlineElements(cell)}</td>\n`;
        }
        html += '</tr>\n';
    }
    html += '</tbody>\n</table>\n';
    return html;
}

function parseMarkdown(md) {
    // Escape HTML to prevent rendering injection, except for newlines.
    // The double quote matters as much as the angle brackets: link URLs are
    // interpolated straight into href="...", so an unescaped quote lets the
    // source close the attribute and add its own (e.g. an event handler).
    // The spec is normally a repo-local file, but openSpecViewer falls back to
    // fetching it from GitHub over the network.
    let html = md
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    // Extract code blocks and replace with placeholders
    const codeBlocks = [];
    html = html.replace(/```(.*?)\r?\n([\s\S]*?)```/g, (match, lang, code) => {
        const index = codeBlocks.length;
        codeBlocks.push(`<pre class="spec-code-block"><code class="language-${lang.trim()}">${code.trim()}</code></pre>`);
        return `___CODE_BLOCK_PLACEHOLDER_${index}___`;
    });

    const lines = html.split(/\r\n|\r|\n/);
    const result = [];
    let inList = false;
    let listType = null; // 'ul' or 'ol'
    let inTable = false;
    let tableHeaders = [];
    let tableRows = [];

    for (let line of lines) {
        const trimmed = line.trim();

        // If it's a code block placeholder, preserve it
        if (trimmed.startsWith('___CODE_BLOCK_PLACEHOLDER_') && trimmed.endsWith('___')) {
            if (inList) { result.push(`</${listType}>`); inList = false; }
            if (inTable) { result.push(renderSpecTable(tableHeaders, tableRows)); inTable = false; }
            result.push(line);
            continue;
        }

        // Handle Horizontal Rule
        if (trimmed === '---' || trimmed === '***') {
            if (inList) { result.push(`</${listType}>`); inList = false; }
            if (inTable) { result.push(renderSpecTable(tableHeaders, tableRows)); inTable = false; }
            result.push('<hr class="spec-hr">');
            continue;
        }

        // Handle Headers
        const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
        if (headerMatch) {
            if (inList) { result.push(`</${listType}>`); inList = false; }
            if (inTable) { result.push(renderSpecTable(tableHeaders, tableRows)); inTable = false; }
            const level = headerMatch[1].length;
            const text = headerMatch[2];
            result.push(`<h${level} class="spec-h${level}">${text}</h${level}>`);
            continue;
        }

        // Handle Blockquotes
        const quoteMatch = line.match(/^&gt;\s*(.*)$/);
        if (quoteMatch) {
            if (inList) { result.push(`</${listType}>`); inList = false; }
            if (inTable) { result.push(renderSpecTable(tableHeaders, tableRows)); inTable = false; }
            result.push(`<blockquote class="spec-blockquote">${quoteMatch[1]}</blockquote>`);
            continue;
        }

        // Handle Tables
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            if (inList) { result.push(`</${listType}>`); inList = false; }
            const cells = trimmed.split('|').map(c => c.trim()).filter((c, i, arr) => i > 0 && i < arr.length - 1);
            
            // Check if it's separator row (e.g. |---|---|)
            const isSeparator = cells.every(c => /^:?-+:?$/.test(c));
            if (isSeparator) {
                continue;
            }

            if (!inTable) {
                inTable = true;
                tableHeaders = cells;
                tableRows = [];
            } else {
                tableRows.push(cells);
            }
            continue;
        } else {
            if (inTable) {
                result.push(renderSpecTable(tableHeaders, tableRows));
                inTable = false;
            }
        }

        // Handle Lists
        const ulMatch = line.match(/^(\s*)[-\*+]\s+(.*)$/);
        const olMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);

        if (ulMatch) {
            if (!inList || listType !== 'ul') {
                if (inList) result.push(`</${listType}>`);
                result.push('<ul class="spec-ul">');
                inList = true;
                listType = 'ul';
            }
            result.push(`<li class="spec-li">${ulMatch[2]}</li>`);
            continue;
        } else if (olMatch) {
            if (!inList || listType !== 'ol') {
                if (inList) result.push(`</${listType}>`);
                result.push('<ol class="spec-ol">');
                inList = true;
                listType = 'ol';
            }
            result.push(`<li class="spec-li">${olMatch[2]}</li>`);
            continue;
        } else {
            if (inList && trimmed === '') {
                result.push(`</${listType}>`);
                inList = false;
            }
        }

        // Handle empty line
        if (trimmed === '') {
            result.push('<div class="spec-space"></div>');
            continue;
        }

        // Normal paragraph
        result.push(`<p class="spec-p">${line}</p>`);
    }

    if (inList) result.push(`</${listType}>`);
    if (inTable) result.push(renderSpecTable(tableHeaders, tableRows));

    let parsedHtml = result.join('\n');
    parsedHtml = parseInlineElements(parsedHtml);

    // Substitute placeholders back. The replacement MUST be a function: with a
    // string, JS interprets $&, $`, $' and $n inside it, so a code block
    // containing a dollar sign (plausible in SPICE syntax) got mangled and even
    // leaked the placeholder text into the output.
    for (let i = 0; i < codeBlocks.length; i++) {
        parsedHtml = parsedHtml.replace(`___CODE_BLOCK_PLACEHOLDER_${i}___`, () => codeBlocks[i]);
    }

    return parsedHtml;
}

async function openSpecViewer() {
    if (!specContainer || !specContent) return;
    
    welcomeMsg.style.display = 'none';
    pdfContainer.style.display = 'none';
    specContainer.style.display = 'flex';
    
    if (specCachedMarkdown) {
        specContent.innerHTML = parseMarkdown(specCachedMarkdown);
        return;
    }
    
    specContent.innerHTML = `<p class="spec-p" style="color: var(--accent);">Loading specification...</p>`;
    
    try {
        let text = '';
        if (window.Neutralino && window.NL_PORT) {
            text = await window.Neutralino.filesystem.readFile('LTSpice_ASC_ASY_Format_Specification.md');
        } else {
            let response = await fetch('LTSpice_ASC_ASY_Format_Specification.md');
            if (!response.ok) {
                throw new Error(`Local fetch status: ${response.status}`);
            }
            text = await response.text();
        }
        specCachedMarkdown = text;
        specContent.innerHTML = parseMarkdown(text);
        consolePrint('[ OK ] Loaded local format specification document', 'ok');
    } catch (localErr) {
        console.warn('Local fetch failed, trying GitHub raw fallback:', localErr);
        
        try {
            const githubUrl = 'https://raw.githubusercontent.com/javierpetrucci/ASC-Parser/main/LTSpice_ASC_ASY_Format_Specification.md';
            let response = await fetch(githubUrl);
            if (!response.ok) {
                throw new Error(`GitHub fetch status: ${response.status}`);
            }
            const text = await response.text();
            specCachedMarkdown = text;
            specContent.innerHTML = parseMarkdown(text);
            consolePrint('[ OK ] Loaded format specification from GitHub', 'ok');
        } catch (githubErr) {
            console.error('All fetch attempts failed:', githubErr);
            specContent.innerHTML = `
                <h2 class="spec-h2" style="color:#ff4444;">Failed to Load Specification</h2>
                <p class="spec-p">Could not retrieve the specification file from local server or GitHub.</p>
                <p class="spec-p">Error details: ${githubErr.message || githubErr}</p>
                <p class="spec-p"><a href="https://github.com/javierpetrucci/ASC-Parser/blob/main/LTSpice_ASC_ASY_Format_Specification.md" target="_blank" class="spec-link">Click here to open on GitHub</a></p>
            `;
            consolePrint('[ERR] Failed to load format specification document', 'err');
        }
    }
}

function isSpecViewerOpen() {
    return !!specContainer && specContainer.style.display !== 'none';
}

function closeSpecViewer() {
    if (specContainer) {
        specContainer.style.display = 'none';
    }
    if (currentPdfBlob) {
        pdfContainer.style.display = 'block';
    } else if (statusMsg && statusMsg.style.display !== 'none') {
        // Keep the status/error panel up instead of replacing it with the welcome art.
        statusMsg.style.display = 'block';
    } else {
        welcomeMsg.style.display = 'block';
    }
}

// Bind button clicks
if (viewSpecBtn) {
    viewSpecBtn.addEventListener('click', openSpecViewer);
}

if (closeSpecBtn) {
    closeSpecBtn.addEventListener('click', closeSpecViewer);
}

// Intercept footer link
const footerSpecLink = document.querySelector('a[href*="LTSpice_ASC_ASY_Format_Specification.md"]');
if (footerSpecLink) {
    footerSpecLink.addEventListener('click', (e) => {
        e.preventDefault();
        openSpecViewer();
    });
}

// Close on escape key
document.addEventListener('keydown', (e) => {
    // Only act when the viewer is actually open. Unconditionally calling
    // closeSpecViewer() let Escape force-swap panels at any time — including
    // mid-batch, and it could resurrect a stale PDF.
    if (e.key === 'Escape' && isSpecViewerOpen()) {
        closeSpecViewer();
    }
});
