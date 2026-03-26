/**
 * dev_window_tuner.js
 *
 * Renders all 8 orientations of a component through the EXACT same
 * pipeline as the production website (app.js → prepareAssets → LTSpiceEngine.render).
 *
 * Instead of injecting data into the AST, the state is baked into the
 * ASC text as real WINDOW lines, so the parser, analyzer and renderer
 * all run identically to production.
 */

const ORIENTATIONS = ['R0', 'R90', 'R180', 'R270', 'M0', 'M90', 'M180', 'M270'];

const ALIGN_OPTIONS = [
    'Left', 'Right', 'Center', 'Top', 'Bottom',
    'VLeft', 'VRight', 'VCenter', 'VTop', 'VBottom'
];

// ── DOM refs ────────────────────────────────────────────────────────────
const compSelect   = document.getElementById('comp-select');
const skinSelect   = document.getElementById('skin-select');
const debugAnchors = document.getElementById('debug-anchors');
const controlsDiv  = document.getElementById('controls');
const outputPre    = document.getElementById('output-json');
const pdfViewer    = document.getElementById('pdf-viewer');
const copyBtn      = document.getElementById('copy-btn');
const statusBar    = document.getElementById('status-bar');

// ── Tuner state: [orientation][windowIndex] = {ox, oy, align} ──────────
let state = {};
let renderTimer = null;

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
    const SPACING_X = 320;
    const SPACING_Y = 320;
    const cols = 4;

    const coordMap = {};          // orientation -> {x, y}
    const labelLines = [];

    ORIENTATIONS.forEach((ori, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = 160 + col * SPACING_X;
        const y = 160 + row * SPACING_Y;
        coordMap[ori] = { x, y };

        // Orientation label below component (slightly offset to avoid text collision)
        labelLines.push(`TEXT ${x - 20} ${y + 120} Left 2 !${ori}`);
    });

    const sheetW = 160 + cols * SPACING_X + 80;
    const sheetH = 160 + Math.ceil(ORIENTATIONS.length / cols) * SPACING_Y + 80;

    let asc = `Version 4.1\nSHEET 1 ${sheetW} ${sheetH}\n`;

    ORIENTATIONS.forEach((ori, i) => {
        const { x, y } = coordMap[ori];
        const s = state[ori] || {};
        const w0 = s[0] || { ox: 0, oy: 0, align: 'Left' };
        const w3 = s[3] || { ox: 0, oy: 0, align: 'Left' };

        asc += `SYMBOL ${comp} ${x} ${y} ${ori}\n`;
        asc += `WINDOW 0 ${w0.ox} ${w0.oy} ${w0.align} 2\n`;
        asc += `WINDOW 3 ${w3.ox} ${w3.oy} ${w3.align} 2\n`;
        asc += `SYMATTR InstName U${i + 1}\n`;
        asc += `SYMATTR Value 1000\n`;
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
        const scene   = window.LTSpiceEngine.parse(ascText);
        const assets  = await prepareAssets(scene, skin);

        const options = {
            canvasBasedOnRectangle: false,
            showTextAnchors: debugAnchors.checked
        };

        const pdfBytes = await window.LTSpiceEngine.render(scene, assets, 'tuner', options);

        const blob    = new Blob([pdfBytes], { type: 'application/pdf' });
        const url     = URL.createObjectURL(blob);
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
    if (!state[ori])      state[ori]      = {};
    if (!state[ori][win]) state[ori][win] = { ox: 0, oy: 0, align: 'Left' };
    state[ori][win][prop] = (prop === 'align') ? el.value : (parseInt(el.value) || 0);
    updateOutput();
    queueRender();
}

// ── Load defaults from COMPONENT_DEFAULTS ──────────────────────────────
function loadDefaults(comp) {
    state = {};
    const defs = (window.LTSpiceEngine.defaults || {})[comp] || {};

    for (const ori of ORIENTATIONS) {
        state[ori] = {};
        for (const win of [0, 3]) {
            // Check exact orientation first, then fall back to same as R0
            const row = defs[ori] || defs['R0'] || {};
            const def = row[win] || { ox: 0, oy: 0, align: 'Left' };
            state[ori][win] = { ox: def.ox, oy: def.oy, align: def.align };
        }
    }
    syncToDOM();
    updateOutput();
}

function syncToDOM() {
    for (const ori of ORIENTATIONS) {
        for (const win of [0, 3]) {
            const s = state[ori][win];
            readEl(ori, win, 'ox').value    = s.ox;
            readEl(ori, win, 'oy').value    = s.oy;
            readEl(ori, win, 'align').value = s.align;
        }
    }
}

// ── Output generation ───────────────────────────────────────────────────
function updateOutput() {
    const comp = compSelect.value;
    let out = `    '${comp}': {\n`;
    for (const ori of ORIENTATIONS) {
        const w0 = state[ori]?.[0] || {};
        const w3 = state[ori]?.[3] || {};
        out += `        ${ori}: { 0: { ox: ${w0.ox}, oy: ${w0.oy}, align: '${w0.align}' }, 3: { ox: ${w3.ox}, oy: ${w3.oy}, align: '${w3.align}' } },\n`;
    }
    out += `    },`;
    outputPre.textContent = out;
}

// ── Build control panel ─────────────────────────────────────────────────
function buildControls() {
    controlsDiv.innerHTML = '';

    for (const ori of ORIENTATIONS) {
        const card = document.createElement('div');
        card.className = 'orient-card';

        const winRows = [0, 3].map(win => {
            const labelText = win === 0 ? 'Win 0 — InstName' : 'Win 3 — Value';
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
}

// ── Top-level listeners ─────────────────────────────────────────────────
compSelect.addEventListener('change', () => { loadDefaults(compSelect.value); queueRender(); });
skinSelect.addEventListener('change', queueRender);
debugAnchors.addEventListener('change', queueRender);
copyBtn.addEventListener('click', () => navigator.clipboard.writeText(outputPre.textContent));

// ── Init ────────────────────────────────────────────────────────────────
buildControls();
loadDefaults(compSelect.value);
queueRender();
