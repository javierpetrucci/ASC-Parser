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

const specContainer = document.getElementById('spec-container');
const specContent = document.getElementById('spec-content');
const viewSpecBtn = document.getElementById('view-spec-btn');
const closeSpecBtn = document.getElementById('close-spec-btn');

let currentPdfBlob = null;
let currentFilename = 'schematic';
let currentFileObj = null;

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
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function processFile(file) {
    if (!file.name.toLowerCase().endsWith('.asc')) {
        alert('Please drop a valid .asc file.');
        return;
    }

    currentFilename = file.name.replace(/\.[^/.]+$/, "");
    currentFileObj = file;

    // Show loading state (hide PDF, welcome, and specification container)
    if (specContainer) specContainer.style.display = 'none';
    welcomeMsg.style.display = 'none';
    pdfContainer.style.display = 'none';

    try {
        // ── Step 1: Read file ──────────────────────────────────────
        consolePrint(`$ open  "${file.name}"`, 'dim');
        consolePrint(`  reading file  [${(file.size / 1024).toFixed(1)} kB]`, 'muted');

        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        // ── Step 2: Detect encoding ────────────────────────────────
        let encoding = 'windows-1252';
        if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
            encoding = 'utf-16le';
        }
        consolePrint(`  encoding       ${encoding}`, 'muted');

        const decoder = new TextDecoder(encoding);
        const text = decoder.decode(buffer);

        // ── Step 3: Parse ASC ──────────────────────────────────────
        consolePrint(`  parsing ASC tokens...`, 'normal');

        const scene = window.LTSpiceEngine.parse(text);

        const wCount  = scene.wires.length;
        const symCount = scene.symbols.length;
        const txtCount = scene.texts.length;
        consolePrint(`  wires:${wCount}  symbols:${symCount}  labels:${txtCount}`, 'dim');

        // ── Step 4: Load assets ────────────────────────────────────
        consolePrint(`  loading component SVGs...`, 'normal');

        const assets = await prepareAssets(scene);

        consolePrint(`  font + ${assets.svgStrings.size} symbol(s) cached`, 'dim');

        // ── Step 5: Render to PDF ──────────────────────────────────
        consolePrint(`  rendering PDF vectors...`, 'normal');

        const options = {
            canvasBasedOnRectangle: optCanvasRect ? optCanvasRect.checked : false,
            showTextAnchors: optDebugAnchors ? optDebugAnchors.checked : false,
            overrideAnchors: optOverrideAnchors ? optOverrideAnchors.checked : true
        };
        const pdfBytes = await window.LTSpiceEngine.render(scene, assets, currentFilename, options);

        consolePrint(`  building blob URL...`, 'muted');

        // ── Step 6: Update viewer ──────────────────────────────────
        currentPdfBlob = new File([pdfBytes], `${currentFilename}.pdf`, { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(currentPdfBlob);
        pdfContainer.innerHTML = `<iframe id="pdf-viewer" src="${blobUrl}#view=FitH" style="width:100%;height:100%;border:none;"></iframe>`;

        pdfContainer.style.display = 'block';
        downloadBtn.disabled = false;

        consolePrint(`[ OK ] done — ${currentFilename}.pdf`, 'ok');

    } catch (err) {
        console.error(err);
        consolePrint(`[ERR] ${err.message}`, 'err');
        welcomeMsg.innerHTML = `<h3 style="color:var(--accent)">Error</h3><p>${err.message}</p>`;
        welcomeMsg.style.display = 'block';
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

// ── Format Specification Document Viewer ─────────────────────────

let specCachedMarkdown = null;

function parseInlineElements(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong class="spec-strong">$1</strong>')
        .replace(/`(.*?)`/g, '<code class="spec-code">$1</code>')
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" class="spec-link">$1</a>');
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
    // Escape HTML to prevent rendering injection, except for newlines
    let html = md
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

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

    // Substitute placeholders back
    for (let i = 0; i < codeBlocks.length; i++) {
        parsedHtml = parsedHtml.replace(`___CODE_BLOCK_PLACEHOLDER_${i}___`, codeBlocks[i]);
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

function closeSpecViewer() {
    if (specContainer) {
        specContainer.style.display = 'none';
    }
    if (currentPdfBlob) {
        pdfContainer.style.display = 'block';
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
    if (e.key === 'Escape') {
        closeSpecViewer();
    }
});
