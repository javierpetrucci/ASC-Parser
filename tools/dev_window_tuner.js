/**
 * dev_window_tuner.js
 *
 * Renders all 8 orientations of a component through the EXACT same
 * pipeline as the production website (app.js → prepareAssets → LTSpiceEngine.render).
 *
 * Instead of injecting data into the AST, the state is baked into the
 * ASC text as real WINDOW lines, so the parser, analyzer and renderer
 * all run identically to production.
 *
 * NOTE: This tool lives in tools/ — one level below the repo root.
 * Asset paths are prefixed with ../ accordingly.
 */

// Override fetchAsy so it resolves ASY files relative to the repo root,
// not relative to this tools/ subfolder.
window._fetchAsyOriginal = window.fetchAsy;
window.fetchAsy = async function(componentPath) {
    const cleanedPath = componentPath.replace(/\\/g, '/');
    const url = `../Assets/Component Symbols/${cleanedPath}.asy?t=${Date.now()}`;
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        return await response.text();
    } catch (e) {
        return null;
    }
};

const ORIENTATIONS = ['R0', 'R90', 'R180', 'R270', 'M0', 'M90', 'M180', 'M270'];

const ALIGN_OPTIONS = [
    'Left', 'Right', 'Center', 'Top', 'Bottom',
    'VLeft', 'VRight', 'VCenter', 'VTop', 'VBottom'
];

// ── DOM refs ────────────────────────────────────────────────────────────
const compSelect = document.getElementById('comp-select');
const skinSelect = document.getElementById('skin-select');
const debugAnchors = document.getElementById('debug-anchors');
const tuneMirror = document.getElementById('tune-mirror');
const controlsDiv = document.getElementById('controls');
const outputPre = document.getElementById('output-json');
const pdfViewer = document.getElementById('pdf-viewer');
const copyBtn = document.getElementById('copy-btn');
const statusBar = document.getElementById('status-bar');

// ── Tuner state: [orientation][windowIndex] = {ox, oy, align} ──────────
let state = {};
let renderTimer = null;
let activeWindows = [0, 3];
let currentAttrs = {};

// ── Production-identical asset loader ───────────────────────────────────
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary);
}

async function prepareAssets(scene, skinName) {
    const assets = { fontBase64: null, svgStrings: new Map() };

    // Font — cached exactly like production
    if (!window.cachedFontBase64) {
        try {
            const r = await fetch(`../Assets/Fonts/lmroman10-regular.ttf?v=${Date.now()}`);
            if (r.ok) window.cachedFontBase64 = arrayBufferToBase64(await r.arrayBuffer());
        } catch (e) { console.warn('Font load failed', e); }
    }
    assets.fontBase64 = window.cachedFontBase64;

    // SVGs — same logic as production, respecting skin choice
    if (skinName !== 'None') {
        const types = new Set();
        for (const sym of scene.symbols) types.add(sym.type.split('\\').pop().split('/').pop());
        await Promise.all(Array.from(types).map(async (t) => {
            try {
                const r = await fetch(`../Assets/Skins/${skinName}/${t}.svg?v=${Date.now()}`);
                if (r.ok) assets.svgStrings.set(t, await r.text());
            } catch (e) { /* silent */ }
        }));
    }

    // ASY fallback — same as production via analyzeSceneSymbols
    if (typeof window.analyzeSceneSymbols === 'function') {
        await window.analyzeSceneSymbols(scene, assets);
    }

    return assets;
}

// ── Build WINDOW lines for ASC text ────────────────────────────────────
// LTSpice WINDOW syntax: WINDOW <index> <x> <y> <alignment> <fontSize>
function buildAscText(comp) {
    // Grid layout: 4 per row, spaced generously so labels don't overlap
    // Grid layout: 4 per row, original spacing (320)
    const SPACING_X = 320;
    const SPACING_Y = 320;
    const cols = 4;

    const coordMap = {};
    const labelLines = [];

    ORIENTATIONS.forEach((ori, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        // Start further in to create a wider border (160 * 1.5 = 240)
        const x = 240 + col * SPACING_X;
        const y = 240 + row * SPACING_Y;
        coordMap[ori] = { x, y };

        // Orientation label below component
        labelLines.push(`TEXT ${x - 20} ${y + 120} Left 2 !${ori}`);
    });

    // Increase the sheet dimensions to provide the wider border
    const sheetW = 240 + cols * SPACING_X + 240;
    const sheetH = 240 + Math.ceil(ORIENTATIONS.length / cols) * SPACING_Y + 240;

    let asc = `Version 4.1\nSHEET 1 ${sheetW} ${sheetH}\n`;
    asc += `RECTANGLE Normal 0 0 ${sheetW} ${sheetH}\n`;

    ORIENTATIONS.forEach((ori, i) => {
        const { x, y } = coordMap[ori];

        // When M tuning is off, mirror cards use their R-equivalent's current state
        const isMirror = ori.startsWith('M');
        const sourceOri = (isMirror && !tuneMirror.checked) ? 'R' + ori.slice(1) : ori;

        const s = state[sourceOri] || {};

        // Escape any spaces in the component name (e.g. "74HCU04 Not" -> "74HCU04\ Not")
        const escapedComp = comp.replace(/ /g, '\\ ');
        asc += `SYMBOL ${escapedComp} ${x} ${y} ${ori}\n`;

        for (const win of activeWindows) {
            const w = s[win] || { ox: 0, oy: 0, align: 'Left', fontSize: 2 };
            asc += `WINDOW ${win} ${w.ox} ${w.oy} ${w.align} 2\n`;
        }

        if (activeWindows.includes(0)) asc += `SYMATTR InstName U${i + 3}\n`;
        if (activeWindows.includes(3)) asc += `SYMATTR Value ${currentAttrs['Value'] || 'V=100'}\n`;
        if (activeWindows.includes(39)) asc += `SYMATTR SpiceLine ${currentAttrs['SpiceLine'] || 'S=100'}\n`;
        if (activeWindows.includes(40)) asc += `SYMATTR SpiceLine2 ${currentAttrs['SpiceLine2'] || 'S2=100'}\n`;
        if (activeWindows.includes(123)) asc += `SYMATTR Value2 ${currentAttrs['Value2'] || 'V2=10'}\n`;
    });

    asc += labelLines.join('\n') + '\n';
    return asc;
}

// ── Render ──────────────────────────────────────────────────────────────
function queueRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(doRender, 120);
}

async function doRender() {
    statusBar.textContent = 'Rendering…';
    try {
        const comp = compSelect.value;
        const skin = skinSelect.value;

        const ascText = buildAscText(comp);
        const scene = window.LTSpiceEngine.parse(ascText);
        const assets = await prepareAssets(scene, skin);

        // Force the renderer to use our giant invisible rectangle as the true boundaries
        const options = {
            canvasBasedOnRectangle: true,
            showTextAnchors: debugAnchors.checked
        };

        const pdfBytes = await window.LTSpiceEngine.render(scene, assets, 'tuner', options);

        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        pdfViewer.src = `${url}#view=FitH`;

        statusBar.textContent = `Rendered — ${comp} | skin: ${skin} | ${new Date().toLocaleTimeString()}`;
    } catch (err) {
        console.error(err);
        statusBar.textContent = `Error: ${err.message}`;
    }
}

// ── State sync ──────────────────────────────────────────────────────────
function readEl(ori, win, prop) {
    return document.getElementById(`w${win}-${prop}-${ori}`);
}

function syncFromEl(el) {
    const { ori, win, prop } = el.dataset;
    if (!state[ori]) state[ori] = {};
    if (!state[ori][win]) state[ori][win] = { ox: 0, oy: 0, align: 'Left' };
    state[ori][win][prop] = (prop === 'align') ? el.value : (parseInt(el.value) || 0);
    updateOutput();
    queueRender();
}

// ── Load defaults from COMPONENT_DEFAULTS ──────────────────────────────
function loadDefaults(comp) {
    state = {};
    const basename = comp.split('/').pop().split('\\').pop();
    const defs = (window.LTSpiceEngine.defaults || {})[basename] || {};

    // Detect whether this table is orientation-keyed (res, cap…) or flat (e, bi…)
    const isOrientedTable = ['R0', 'R90', 'R180', 'R270'].some(k => k in defs);

    for (const ori of ORIENTATIONS) {
        state[ori] = {};
        for (const win of activeWindows) {
            let def;
            if (isOrientedTable) {
                // M90 → try M90 first, then R90 (same angle), then R0
                const rotEquiv = ori.startsWith('M') ? 'R' + ori.slice(1) : ori;
                const row = defs[ori] || defs[rotEquiv] || defs['R0'] || {};
                def = row[win] || { ox: 0, oy: 0, align: 'Left' };
            } else {
                // Flat table: single entry applies to all orientations
                def = defs[win] || { ox: 0, oy: 0, align: 'Left' };
            }
            state[ori][win] = { ox: def.ox, oy: def.oy, align: def.align };
        }
    }
    syncToDOM();
    updateOutput();
}

function syncToDOM() {
    for (const ori of ORIENTATIONS) {
        for (const win of activeWindows) {
            const s = state[ori][win];
            if (!s) continue;
            readEl(ori, win, 'ox').value = s.ox;
            readEl(ori, win, 'oy').value = s.oy;
            readEl(ori, win, 'align').value = s.align;
        }
    }
}

// ── Output generation ───────────────────────────────────────────────────
function updateOutput() {
    const comp = compSelect.value;
    const basename = comp.split('/').pop().split('\\').pop();
    const includeMirror = tuneMirror.checked;
    const orisToExport = includeMirror ? ORIENTATIONS : ORIENTATIONS.filter(o => !o.startsWith('M'));

    let out = `    ${basename}: {\n`;
    for (const ori of orisToExport) {
        out += `        ${ori}: { `;
        const entries = [];
        for (const win of activeWindows) {
            const w = state[ori]?.[win] || { ox: 0, oy: 0, align: 'Left' };
            entries.push(`${win}: { ox: ${w.ox}, oy: ${w.oy}, align: '${w.align}' }`);
        }
        out += entries.join(', ') + ` },\n`;
    }
    out += `    },`;
    outputPre.textContent = out;
}

// ── Build control panel ─────────────────────────────────────────────────
function buildControls() {
    controlsDiv.innerHTML = '';

    for (const ori of ORIENTATIONS) {
        const isMirror = ori.startsWith('M');
        const card = document.createElement('div');
        card.className = 'orient-card' + (isMirror ? ' mirror-card' : '');
        card.dataset.ori = ori;

        const winRows = activeWindows.map(win => {
            let labelText = `Win ${win}`;
            if (win === 0) labelText += ' — InstName';
            else if (win === 3) labelText += ' — Value';
            else if (win === 39) labelText += ' — SpiceLine';
            else if (win === 40) labelText += ' — SpiceLine2';
            else if (win === 123) labelText += ' — Value2';

            const alignOpts = ALIGN_OPTIONS.map(o => `<option value="${o}">${o}</option>`).join('');
            return `
                <div class="window-group">
                    <div class="window-label">${labelText}</div>
                    <div class="inputs-row">
                        <label>X</label>
                        <input type="number" id="w${win}-ox-${ori}" data-ori="${ori}" data-win="${win}" data-prop="ox" step="1" value="0">
                        <label>Y</label>
                        <input type="number" id="w${win}-oy-${ori}" data-ori="${ori}" data-win="${win}" data-prop="oy" step="1" value="0">
                        <select id="w${win}-align-${ori}" data-ori="${ori}" data-win="${win}" data-prop="align">
                            ${alignOpts}
                        </select>
                    </div>
                </div>`;
        }).join('');

        card.innerHTML = `<h3>${ori}</h3>${winRows}`;
        controlsDiv.appendChild(card);
    }

    // Attach listeners
    controlsDiv.querySelectorAll('input[type="number"], select').forEach(el => {
        el.addEventListener('input', () => syncFromEl(el));

        if (el.type === 'number') {
            el.addEventListener('wheel', (e) => {
                e.preventDefault();
                const dir = e.deltaY < 0 ? 1 : -1;
                el.value = (parseInt(el.value) || 0) + dir;
                syncFromEl(el);
            }, { passive: false });
        }
    });

    applyMirrorLock();
}

// ── Lock / unlock M-orientation cards ────────────────────────────────────
function applyMirrorLock() {
    const locked = !tuneMirror.checked;
    controlsDiv.querySelectorAll('.mirror-card').forEach(card => {
        card.style.opacity = locked ? '0.4' : '1';
        card.style.pointerEvents = locked ? 'none' : '';
        card.querySelectorAll('input, select').forEach(el => { el.disabled = locked; });
    });
}

// Seed M state from current R state so tuning starts from the live preview values
function seedMirrorFromR() {
    for (const ori of ['M0', 'M90', 'M180', 'M270']) {
        const rOri = 'R' + ori.slice(1);   // M90 → R90
        const src = state[rOri] || {};
        state[ori] = {};
        for (const win of activeWindows) {
            const s = src[win] || { ox: 0, oy: 0, align: 'Left' };
            state[ori][win] = { ox: s.ox, oy: s.oy, align: s.align };
        }
    }
}

// ── Top-level listeners ─────────────────────────────────────────────────
compSelect.addEventListener('change', () => { loadComponentTuner(compSelect.value); });
skinSelect.addEventListener('change', queueRender);
debugAnchors.addEventListener('change', queueRender);
tuneMirror.addEventListener('change', () => {
    if (tuneMirror.checked) {
        seedMirrorFromR();  // initialise M cards from current R-tuned values
        syncToDOM();
    }
    applyMirrorLock();
    updateOutput();
});
copyBtn.addEventListener('click', () => navigator.clipboard.writeText(outputPre.textContent));

// ── Init ────────────────────────────────────────────────────────────────

async function loadComponentTuner(comp) {
    if (typeof fetchAsy !== 'undefined') {
        const asyText = await fetchAsy(comp);
        const candidateIndexes = new Set();
        if (asyText) {
            const asyData = parseAsy(asyText);
            if (asyData) {
                currentAttrs = asyData.attrs || {};
                if (asyData.windows) {
                    for (const idx of Object.keys(asyData.windows)) {
                        candidateIndexes.add(parseInt(idx));
                    }
                }
            }
        } else {
            currentAttrs = {};
        }
        activeWindows = Array.from(candidateIndexes).sort((a, b) => a - b);
    } else {
        activeWindows = [0, 3]; // fallback if analyzer not loaded
        currentAttrs = {};
    }

    buildControls();
    loadDefaults(comp);
    queueRender();
}

loadComponentTuner(compSelect.value);
