// ============================================================
//  renderer.js — ASC Debug Renderer (Canvas)
//  Transform order for M (mirrored) codes: ROTATE FIRST, then mirror.
//  WINDOW offsets and alignment are in local pre-rotation space and
//  must be transformed (rotate then mirror) to get canvas values.
// ============================================================

// Apply orientation transform to a local-space offset.
// Order: rotate first, then mirror.
function transformOffset(ox, oy, orientation) {
    const isMirrored = orientation.startsWith('M');
    const rot = isMirrored ? 'R' + orientation.slice(1) : orientation;

    // Step 1: Rotate
    let rx, ry;
    switch (rot) {
        case 'R0':   rx =  ox; ry =  oy; break;
        case 'R90':  rx = -oy; ry =  ox; break;
        case 'R180': rx = -ox; ry = -oy; break;
        case 'R270': rx =  oy; ry = -ox; break;
        default:     rx =  ox; ry =  oy; break;
    }

    // Step 2: Mirror (flip x)
    if (isMirrored) rx = -rx;

    return { x: rx, y: ry };
}

// Transform alignment from local (pre-rotation) frame to final canvas alignment.
// Order: rotate first, then mirror. Uses rules from spec Section 6.
function transformAlignment(alignment, orientation) {
    const isMirrored = orientation.startsWith('M');
    const rot = isMirrored ? 'R' + orientation.slice(1) : orientation;

    const TABLES = {
        // R90: Swap H↔V prefix, Keep Top/Bottom, swap Left↔Right
        R90: {
            'Left':'VRight',  'Right':'VLeft',  'Center':'VCenter',
            'Top':'VTop',     'Bottom':'VBottom',
            'VLeft':'Right',  'VRight':'Left',  'VCenter':'Center',
            'VTop':'Top',     'VBottom':'Bottom'
        },
        // R180: Keep H/V prefix, swap Top↔Bottom, swap Left↔Right
        R180: {
            'Left':'Right',   'Right':'Left',   'Center':'Center',
            'Top':'Bottom',   'Bottom':'Top',
            'VLeft':'VRight', 'VRight':'VLeft', 'VCenter':'VCenter',
            'VTop':'VBottom', 'VBottom':'VTop'
        },
        // R270: Swap H↔V prefix, swap Top↔Bottom, keep Left/Right/Center
        R270: {
            'Left':'VLeft',   'Right':'VRight',  'Center':'VCenter',
            'Top':'VBottom',  'Bottom':'VTop',
            'VLeft':'Left',   'VRight':'Right',  'VCenter':'Center',
            'VTop':'Bottom',  'VBottom':'Top'
        }
    };

    // Step 1: Rotate alignment
    let a = alignment;
    if (rot !== 'R0') a = (TABLES[rot] && TABLES[rot][a]) || a;

    // Step 2: Mirror swap (Left↔Right, VLeft↔VRight)
    if (isMirrored) {
        const MIRROR = { 'Left':'Right', 'Right':'Left', 'VLeft':'VRight', 'VRight':'VLeft' };
        a = MIRROR[a] || a;
    }

    return a;
}

// Default WINDOW positions for 'res' per orientation (from spec Section 6, Group 1)
const RES_WINDOW_DEFAULTS = {
    R0:   { 0: { ox: 36, oy: 40, align: 'Left'    }, 3: { ox: 36, oy: 76,  align: 'Left'    } },
    R90:  { 0: { ox: 3,  oy: 56, align: 'VBottom' }, 3: { ox: 27, oy: 56,  align: 'VTop'    } },
    R180: { 0: { ox: 36, oy: 76, align: 'Left'    }, 3: { ox: 36, oy: 40,  align: 'Left'    } },
    R270: { 0: { ox: 27, oy: 56, align: 'VTop'    }, 3: { ox: 3,  oy: 56,  align: 'VBottom' } },
};

// Default WINDOW positions for 'cap' (Capacitor) per orientation (spec Section 6, Group 1)
const CAP_WINDOW_DEFAULTS = {
    R0:   { 0: { ox: 24, oy: 8,  align: 'Left'    }, 3: { ox: 24, oy: 56, align: 'Left'    } },
    R90:  { 0: { ox: 0,  oy: 32, align: 'VBottom' }, 3: { ox: 32, oy: 32, align: 'VTop'    } },
    R180: { 0: { ox: 24, oy: 56, align: 'Left'    }, 3: { ox: 24, oy: 8,  align: 'Left'    } },
    R270: { 0: { ox: 32, oy: 32, align: 'VTop'    }, 3: { ox: 0,  oy: 32, align: 'VBottom' } },
};

// Default WINDOW positions for 'ind' (Inductor) per orientation (spec Section 6, Group 1)
const IND_WINDOW_DEFAULTS = {
    R0:   { 0: { ox: -2, oy: 40, align: 'Right'   }, 3: { ox: -2, oy: 72, align: 'Right'   } },
    R90:  { 0: { ox: 3,  oy: 56, align: 'VBottom' }, 3: { ox: 31, oy: 56, align: 'VTop'    } },
    R180: { 0: { ox: -2, oy: 72, align: 'Right'   }, 3: { ox: -2, oy: 40, align: 'Right'   } },
    R270: { 0: { ox: 31, oy: 56, align: 'VTop'    }, 3: { ox: 3,  oy: 56, align: 'VBottom' } },
};

// Group 1: Explicit per-rotation defaults
const COMPONENT_DEFAULTS = {
    res: RES_WINDOW_DEFAULTS,
    cap: CAP_WINDOW_DEFAULTS,
    ind: IND_WINDOW_DEFAULTS,
    diode: {
        R0:   { 0: { ox: 24, oy: 0,  align: 'Left'    }, 3: { ox: 24, oy: 64, align: 'Left'    } },
        R90:  { 0: { ox: 0,  oy: 32, align: 'VBottom' }, 3: { ox: 32, oy: 32, align: 'VTop'    } },
        R180: { 0: { ox: 24, oy: 64, align: 'Left'    }, 3: { ox: 24, oy: 0,  align: 'Left'    } },
        R270: { 0: { ox: 32, oy: 32, align: 'VTop'    }, 3: { ox: 0,  oy: 32, align: 'VBottom' } },
    },
    zener: {
        R0:   { 0: { ox: 24, oy: 0,  align: 'Left'    }, 3: { ox: 24, oy: 64, align: 'Left'    } },
        R90:  { 0: { ox: -4, oy: 32, align: 'VBottom' }, 3: { ox: 36, oy: 32, align: 'VTop'    } },
        R180: { 0: { ox: 24, oy: 64, align: 'Left'    }, 3: { ox: 24, oy: 0,  align: 'Left'    } },
        R270: { 0: { ox: 36, oy: 32, align: 'VTop'    }, 3: { ox: -4, oy: 32, align: 'VBottom' } },
    },
    voltage: {
        R0:   { 0: { ox: 24, oy: 16, align: 'Left'    }, 3: { ox: 24, oy: 96, align: 'Left'    } },
        R90:  { 0: { ox: -32, oy: 56, align: 'VBottom' }, 3: { ox: 32, oy: 56, align: 'VTop'   } },
        R180: { 0: { ox: 24, oy: 96, align: 'Left'    }, 3: { ox: 24, oy: 16, align: 'Left'    } },
        R270: { 0: { ox: 32, oy: 56, align: 'VTop'    }, 3: { ox: -32, oy: 56, align: 'VBottom' } },
    },
    current: {
        R0:   { 0: { ox: 26, oy: 0,  align: 'Left'    }, 3: { ox: 26, oy: 80, align: 'Left'    } },
        R90:  { 0: { ox: -30, oy: 40, align: 'VBottom' }, 3: { ox: 34, oy: 40, align: 'VTop'   } },
        R180: { 0: { ox: 26, oy: 80, align: 'Left'    }, 3: { ox: 26, oy: 0,  align: 'Left'    } },
        R270: { 0: { ox: 34, oy: 40, align: 'VTop'    }, 3: { ox: -30, oy: 40, align: 'VBottom' } },
    },
    signal: { // Misc\signal
        R0:   { 0: { ox: 24, oy: 16, align: 'Left'    }, 3: { ox: 24, oy: 104, align: 'Left'   } },
        R90:  { 0: { ox: -32, oy: 56, align: 'VBottom' }, 3: { ox: 32, oy: 56, align: 'VTop'   } },
        R180: { 0: { ox: 24, oy: 104, align: 'Left'   }, 3: { ox: 24, oy: 16, align: 'Left'    } },
        R270: { 0: { ox: 32, oy: 56, align: 'VTop'    }, 3: { ox: -32, oy: 56, align: 'VBottom' } },
    }
};

// Group 2: Formula-derived defaults (stored as R0, derived in render loop)
const COMPONENT_FORMULA_DEFAULTS = {
    e:    { 0: { ox: 26, oy: 16, align: 'Left' }, 3: { ox: 26, oy: 96, align: 'Left' } },
    e2:   { 0: { ox: 26, oy: 16, align: 'Left' }, 3: { ox: 26, oy: 96, align: 'Left' } },
    g:    { 0: { ox: 26, oy: 16, align: 'Left' }, 3: { ox: 26, oy: 96, align: 'Left' } },
    g2:   { 0: { ox: 26, oy: 16, align: 'Left' }, 3: { ox: 26, oy: 96, align: 'Left' } },
    njf:  { 0: { ox: 58, oy: 32, align: 'Left' }, 3: { ox: 58, oy: 72, align: 'Left' } },
    nmos: { 0: { ox: 58, oy: 32, align: 'Left' }, 3: { ox: 58, oy: 72, align: 'Left' } },
    npn:  { 0: { ox: 58, oy: 32, align: 'Left' }, 3: { ox: 58, oy: 68, align: 'Left' } },
    pjf:  { 0: { ox: 58, oy: 32, align: 'Left' }, 3: { ox: 58, oy: 72, align: 'Left' } },
    pmos: { 0: { ox: 58, oy: 32, align: 'Left' }, 3: { ox: 58, oy: 72, align: 'Left' } },
    pnp:  { 0: { ox: 58, oy: 32, align: 'Left' }, 3: { ox: 58, oy: 68, align: 'Left' } },
};

// Returns { textAlign, textBaseline, isVertical } for a given alignment keyword
function decodeAlignment(alignment) {
    const isVertical = alignment.startsWith('V');
    const base = isVertical ? alignment.slice(1) : alignment;

    let textAlign = 'left';
    let textBaseline = 'middle';

    if (base === 'Left')   { textAlign = 'left';   textBaseline = 'middle'; }
    if (base === 'Right')  { textAlign = 'right';  textBaseline = 'middle'; }
    if (base === 'Center') { textAlign = 'center'; textBaseline = 'middle'; }
    if (base === 'Top')    { textAlign = 'center'; textBaseline = 'top';    }
    if (base === 'Bottom') { textAlign = 'center'; textBaseline = 'bottom'; }

    return { textAlign, textBaseline, isVertical };
}

function getWindowText(sym, index) {
    if (index === 0) return sym.attrs['InstName'] || sym.asyData?.attrs?.['InstName'] || '';
    if (index === 3) {
        if (sym.attrs['Value']) return sym.attrs['Value'];
        if (sym.asyData?.attrs?.['Value']) return sym.asyData.attrs['Value'];
        
        const basename = sym.type.split('\\').pop().split('/').pop();
        const defaults = {
            res: 'R', cap: 'C', ind: 'L', diode: 'D', zener: 'D', voltage: 'V', current: 'I', signal: 'V',
            e: 'E', e2: 'E', g: 'G', g2: 'G', npn: 'NPN', pnp: 'PNP', nmos: 'NMOS', pmos: 'PMOS', njf: 'NJF', pjf: 'PJF'
        };
        return defaults[basename] || '';
    }
    if (index === 39) return sym.attrs['SpiceLine'] || sym.asyData?.attrs?.['SpiceLine'] || '';
    if (index === 40) return sym.attrs['SpiceLine2'] || sym.asyData?.attrs?.['SpiceLine2'] || '';
    if (index === 123) return sym.attrs['Value2'] || sym.asyData?.attrs?.['Value2'] || '';
    return '';
}

// Compute the true bounding box of SVG content by scanning coordinate attributes,
// then patch the viewBox to cover all geometry. Returns the modified SVG text and
// the pixel offset of the SVG coordinate origin within the resulting image.
function prepareSvg(svgText) {
    const vbMatch = svgText.match(/viewBox="([^"]+)"/);
    const PAD = 4;

    if (!vbMatch) return { svgText, offsetX: 0, offsetY: 0, w: 32, h: 32 };
    const [vx, vy, vw, vh] = vbMatch[1].trim().split(/[\s,]+/).map(Number);

    const xs = [vx, vx + vw];
    const ys = [vy, vy + vh];

    // Scalar coordinate attributes
    for (const m of svgText.matchAll(/\b(?:x|x1|x2)="(-?[\d.]+)"/g)) xs.push(parseFloat(m[1]));
    for (const m of svgText.matchAll(/\b(?:y|y1|y2)="(-?[\d.]+)"/g)) ys.push(parseFloat(m[1]));

    // Circles: cx, cy, r
    for (const m of svgText.matchAll(/<circle[^>]*>/g)) {
        const cx = parseFloat((m[0].match(/cx="(-?[\d.]+)"/) || [])[1] ?? 0);
        const cy = parseFloat((m[0].match(/cy="(-?[\d.]+)"/) || [])[1] ?? 0);
        const r  = parseFloat((m[0].match(/\br="([\d.]+)"/)  || [])[1] ?? 0);
        xs.push(cx - r, cx + r);
        ys.push(cy - r, cy + r);
    }

    // Polygon / polyline points="x1,y1 x2,y2 ..."
    for (const m of svgText.matchAll(/points="([^"]+)"/g)) {
        const nums = m[1].trim().split(/[\s,]+/).map(Number);
        for (let i = 0; i < nums.length; i += 2) {
            xs.push(nums[i]);
            if (i + 1 < nums.length) ys.push(nums[i + 1]);
        }
    }

    const newMinX = Math.floor(Math.min(...xs)) - PAD;
    const newMinY = Math.floor(Math.min(...ys)) - PAD;
    const newMaxX = Math.ceil(Math.max(...xs))  + PAD;
    const newMaxY = Math.ceil(Math.max(...ys))  + PAD;
    const newW = newMaxX - newMinX;
    const newH = newMaxY - newMinY;

    const fixedSvg = svgText.replace(/viewBox="[^"]+"/, `viewBox="${newMinX} ${newMinY} ${newW} ${newH}"`);

    return { svgText: fixedSvg, offsetX: newMinX, offsetY: newMinY, w: newW, h: newH };
}


// Compute the ctx rotation angle for an orientation string
function orientationAngle(orientation) {
    const rotPart = orientation.startsWith('M') ? 'R' + orientation.slice(1) : orientation;
    switch (rotPart) {
        case 'R0':   return 0;
        case 'R90':  return Math.PI / 2;
        case 'R180': return Math.PI;
        case 'R270': return -Math.PI / 2;  // = 3π/2 = 270° CW = 90° CCW
        default:     return 0;
    }
}

function findIncomingWireDirection(x, y, wires) {
    for (const w of wires) {
        if (w.x1 === x && w.y1 === y) {
            if (w.x2 < x) return 'left';
            if (w.x2 > x) return 'right';
            if (w.y2 < y) return 'top';
            if (w.y2 > y) return 'bottom';
        }
        if (w.x2 === x && w.y2 === y) {
            if (w.x1 < x) return 'left';
            if (w.x1 > x) return 'right';
            if (w.y1 < y) return 'top';
            if (w.y1 > y) return 'bottom';
        }
    }
    return 'top'; // default
}

function applyLineStyle(ctx, style) {
    if (style === '1') ctx.setLineDash([10, 5]);
    else if (style === '2') ctx.setLineDash([2, 5]);
    else if (style === '3') ctx.setLineDash([10, 5, 2, 5]);
    else if (style === '4') ctx.setLineDash([10, 5, 2, 5, 2, 5]);
    else ctx.setLineDash([]);
}

async function renderScene(canvas, scene, assets) {
    const ctx = canvas.getContext('2d');
    
    // ── 0. Analyze external ASY dependencies ────────────────────
    if (typeof analyzeSceneSymbols === 'function') {
        await analyzeSceneSymbols(scene);
    }

    // ── 1. Load SVGs into Image objects ──────────────────────────
    const images = new Map();
    const dimensions = new Map();
    const promises = [];

    if (assets && assets.svgs) {
        for (const [name, svgText] of assets.svgs.entries()) {
            // Expand viewBox to cover all actual SVG geometry (handles negative-coord content)
            const prepared = prepareSvg(svgText);
            dimensions.set(name, { w: prepared.w, h: prepared.h, offsetX: prepared.offsetX, offsetY: prepared.offsetY });
            promises.push(new Promise((resolve) => {
                const blob = new Blob([prepared.svgText], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => { images.set(name, img); URL.revokeObjectURL(url); resolve(); };
                img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
                img.src = url;
            }));
        }
    }
    await Promise.all(promises);

    // ── 2. Compute bounding box ──────────────────────────────────
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let largestRectIndex = -1;

    // Canvas Boundary Rule (Section 10): largest rectangle defines the canvas
    if (scene.rectangles && scene.rectangles.length > 0) {
        let maxArea = -1;
        for (let i = 0; i < scene.rectangles.length; i++) {
            const r = scene.rectangles[i];
            const area = Math.abs(r.x2 - r.x1) * Math.abs(r.y2 - r.y1);
            if (area > maxArea) {
                maxArea = area;
                largestRectIndex = i;
            }
        }
        if (largestRectIndex !== -1) {
            const r = scene.rectangles[largestRectIndex];
            minX = Math.min(r.x1, r.x2);
            maxX = Math.max(r.x1, r.x2);
            minY = Math.min(r.y1, r.y2);
            maxY = Math.max(r.y1, r.y2);
        }
    }

    if (minX === Infinity) {
        const expand = (x, y) => {
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        };
        for (const w of scene.wires) { expand(w.x1, w.y1); expand(w.x2, w.y2); }
        for (const sym of scene.symbols) {
            expand(sym.x, sym.y);
            expand(sym.x + 100, sym.y + 100);
        }
        for (const r of scene.rectangles) { expand(r.x1, r.y1); expand(r.x2, r.y2); }
        for (const l of scene.lines) { expand(l.x1, l.y1); expand(l.x2, l.y2); }
        for (const c of scene.circles) { expand(c.x1, c.y1); expand(c.x2, c.y2); }
        for (const a of scene.arcs) { expand(a.x1, a.y1); expand(a.x2, a.y2); }

        if (minX === Infinity) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }
        const MARGIN = 200;
        minX -= MARGIN; minY -= MARGIN;
        maxX += MARGIN; maxY += MARGIN;
    }

    const worldW = maxX - minX;
    const worldH = maxY - minY;

    canvas.width  = Math.min(worldW, 4000);
    canvas.height = Math.min(worldH, 4000);

    const scale = Math.min(canvas.width / worldW, canvas.height / worldH);

    // ── 3. Clear & configure transform ──────────────────────────
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-minX, -minY);

    // ── 3.5 Draw GRAPHIC ELEMENTS ────────────────────────────────
    ctx.strokeStyle = '#0000bb'; 
    ctx.lineWidth = 2;

    for (let i = 0; i < scene.rectangles.length; i++) {
        if (i === largestRectIndex) continue;
        const r = scene.rectangles[i];
        ctx.save();
        applyLineStyle(ctx, r.style);
        ctx.strokeRect(Math.min(r.x1, r.x2), Math.min(r.y1, r.y2), Math.abs(r.x2-r.x1), Math.abs(r.y2-r.y1));
        ctx.restore();
    }

    for (const l of scene.lines) {
        ctx.save();
        applyLineStyle(ctx, l.style);
        ctx.beginPath();
        ctx.moveTo(l.x1, l.y1);
        ctx.lineTo(l.x2, l.y2);
        ctx.stroke();
        ctx.restore();
    }

    for (const c of scene.circles) {
        ctx.save();
        applyLineStyle(ctx, c.style);
        const cx = (c.x1 + c.x2) / 2;
        const cy = (c.y1 + c.y2) / 2;
        const rx = Math.abs(c.x2 - c.x1) / 2;
        const ry = Math.abs(c.y2 - c.y1) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.restore();
    }

    for (const a of scene.arcs) {
        ctx.save();
        applyLineStyle(ctx, a.style);
        const cx = (a.x1 + a.x2) / 2;
        const cy = (a.y1 + a.y2) / 2;
        const rx = Math.abs(a.x2 - a.x1) / 2;
        const ry = Math.abs(a.y2 - a.y1) / 2;
        const startAngle = Math.atan2(a.ye - cy, a.xe - cx);
        const endAngle = Math.atan2(a.ys - cy, a.xs - cx);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, startAngle, endAngle);
        ctx.stroke();
        ctx.restore();
    }

    // ── 4. Draw WIRES ────────────────────────────────────────────
    ctx.strokeStyle = '#000080';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    for (const w of scene.wires) {
        ctx.moveTo(w.x1, w.y1);
        ctx.lineTo(w.x2, w.y2);
    }
    ctx.stroke();

    // ── 5. Draw SYMBOLS ──────────────────────────────────────────
    for (const sym of scene.symbols) {
        const isMirrored = sym.orientation.startsWith('M');
        const angle = orientationAngle(sym.orientation);

        // ── 5a. Draw the SVG body ────────────────────────────────
        ctx.save();
        ctx.translate(sym.x, sym.y);

        if (isMirrored) ctx.scale(-1, 1);  // must come before rotate in code to achieve rotate-then-mirror geometrically
        ctx.rotate(angle);

        const img = images.get(sym.type);
        if (img) {
            const dim = dimensions.get(sym.type);
            // Draw at offsetX/offsetY so SVG coordinate (0,0) aligns with the translated anchor
            ctx.drawImage(img, dim.offsetX, dim.offsetY, dim.w, dim.h);
        } else if (sym.asyData && sym.asyData.graphics) {
            // Fallback: draw native ASY graphics if parsed
            const g = sym.asyData.graphics;
            ctx.strokeStyle = '#000000'; 
            ctx.lineWidth = 2;

            for (const r of g.rectangles) {
                ctx.save();
                applyLineStyle(ctx, r.style);
                ctx.strokeRect(Math.min(r.x1, r.x2), Math.min(r.y1, r.y2), Math.abs(r.x2 - r.x1), Math.abs(r.y2 - r.y1));
                ctx.restore();
            }
            for (const l of g.lines) {
                ctx.save();
                applyLineStyle(ctx, l.style);
                ctx.beginPath();
                ctx.moveTo(l.x1, l.y1);
                ctx.lineTo(l.x2, l.y2);
                ctx.stroke();
                ctx.restore();
            }
            for (const c of g.circles) {
                ctx.save();
                applyLineStyle(ctx, c.style);
                const cx = (c.x1 + c.x2) / 2;
                const cy = (c.y1 + c.y2) / 2;
                const rx = Math.abs(c.x2 - c.x1) / 2;
                const ry = Math.abs(c.y2 - c.y1) / 2;
                ctx.beginPath();
                ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
                ctx.stroke();
                ctx.restore();
            }
            for (const a of g.arcs) {
                ctx.save();
                applyLineStyle(ctx, a.style);
                const cx = (a.x1 + a.x2) / 2;
                const cy = (a.y1 + a.y2) / 2;
                const rx = Math.abs(a.x2 - a.x1) / 2;
                const ry = Math.abs(a.y2 - a.y1) / 2;
                const startAngle = Math.atan2(a.ye - cy, a.xe - cx);
                const endAngle = Math.atan2(a.ys - cy, a.xs - cx);
                ctx.beginPath();
                ctx.ellipse(cx, cy, rx, ry, 0, startAngle, endAngle);
                ctx.stroke();
                ctx.restore();
            }
            for (const t of g.texts) {
                const dec = decodeAlignment(t.align);
                ctx.save();
                ctx.translate(t.x, t.y);
                if (dec.isVertical) ctx.rotate(-Math.PI / 2);
                ctx.textAlign = dec.textAlign;
                ctx.textBaseline = dec.textBaseline;
                ctx.fillStyle = '#000000';
                const pxSize = t.fontSize === 0 ? 2 : t.fontSize * 7;
                ctx.font = `${pxSize}px sans-serif`;
                ctx.fillText(t.content, 0, 0);
                ctx.restore();
            }
        } else {
            // Fallback: small grey box
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 2;
            ctx.strokeRect(0, 0, 32, 32);
            ctx.fillStyle = '#ddd';
            ctx.fillRect(0, 0, 32, 32);
        }

        ctx.restore();

        // ── 5b. Build effective WINDOW list ─────────────────────
        // Start from defaults for known components, then let explicit
        // WINDOW lines in the file override per index.
        const effectiveWindows = new Map();  // index → {ox, oy, align}

        // Fill defaults for known standard components
        let defaults = null;
        const basename = sym.type.split('\\').pop().split('/').pop();
        
        if (COMPONENT_DEFAULTS[basename]) {
            // Group 1: Explicit per-rotation tables
            const table = COMPONENT_DEFAULTS[basename];
            const lookupKey = isMirrored ? 'R0' : sym.orientation;
            defaults = table[lookupKey] || table['R0'];
        } else {
            // Group 2 (Fall-through): R0 base, transform-derived
            defaults = COMPONENT_FORMULA_DEFAULTS[basename];
        }

        if (defaults) {
            for (const [idx, def] of Object.entries(defaults)) {
                effectiveWindows.set(parseInt(idx), { ox: def.ox, oy: def.oy, align: def.align, fontSize: 2 });
            }
        }

        // Apply fallback ASY windows if parsed (priority over standard defaults, lower than explicit)
        if (sym.asyData && sym.asyData.windows) {
            for (const [idx, win] of Object.entries(sym.asyData.windows)) {
                effectiveWindows.set(parseInt(idx), { ox: win.ox, oy: win.oy, align: win.align, fontSize: win.fontSize });
            }
        }

        // Override with explicitly-specified WINDOWs from the file
        for (const win of sym.windows) {
            effectiveWindows.set(win.index, { ox: win.offsetX, oy: win.offsetY, align: win.alignment, fontSize: win.fontSize });
        }

        // Apply inductor exception: for R0, R180, M0, M180, always Right aligned
        if (sym.type === 'ind' && ['R0', 'R180', 'M0', 'M180'].includes(sym.orientation)) {
            for (const idx of [0, 3]) {
                if (effectiveWindows.has(idx)) {
                    effectiveWindows.get(idx).align = 'Right';
                }
            }
        }

        // ── 5c. Draw text labels ─────────────────────────────────
        ctx.fillStyle = '#4444cc';

        for (const [idx, win] of effectiveWindows.entries()) {
            const text = getWindowText(sym, idx);
            if (!text) continue;

            // fontSize=0 renders tiny per spec
            const pxSize = win.fontSize === 0 ? 2 : win.fontSize * 7;
            ctx.font = `${pxSize}px sans-serif`;

            // Both offset AND alignment are pre-rotation — transform both with component orientation
            const rotated = transformOffset(win.ox, win.oy, sym.orientation);
            const wx = sym.x + rotated.x;
            const wy = sym.y + rotated.y;

            const finalAlign = transformAlignment(win.align, sym.orientation);
            const { textAlign, textBaseline, isVertical } = decodeAlignment(finalAlign);

            ctx.save();
            ctx.translate(wx, wy);
            if (isVertical) {
                // Vertical text reads bottom-to-top → rotate -90°
                ctx.rotate(-Math.PI / 2);
            }
            ctx.textAlign = textAlign;
            ctx.textBaseline = textBaseline;
            ctx.fillText(text, 0, 0);
            ctx.restore();
        }
    }

    // ── 6. Draw STANDALONE TEXT ──────────────────────────────────
    for (const t of scene.texts) {
        const { textAlign, textBaseline, isVertical } = decodeAlignment(t.alignment);
        ctx.save();
        ctx.translate(t.x, t.y);
        if (isVertical) ctx.rotate(-Math.PI / 2);
        
        ctx.textAlign = textAlign;
        ctx.textBaseline = textBaseline;
        ctx.fillStyle = '#000000';
        ctx.font = `${t.fontSize * 7}px sans-serif`;
        ctx.fillText(t.content, 0, 0);
        ctx.restore();
    }

    // ── 7. Draw FLAGS ────────────────────────────────────────────
    for (const flag of scene.flags) {
        const isGround = flag.name === '0';
        const type = isGround ? 'gnd' : 'flag';
        const dir = findIncomingWireDirection(flag.x, flag.y, scene.wires);

        // ── 6a. Draw symbol ──────────────────────────────────────
        ctx.save();
        ctx.translate(flag.x, flag.y);

        let angle = 0;
        if (isGround) {
            // Ground rotation depends on incoming wire direction (Section 8)
            if (dir === 'right') angle = Math.PI / 2;
            if (dir === 'bottom') angle = Math.PI;
            if (dir === 'left') angle = -Math.PI / 2;
        }
        ctx.rotate(angle);

        const img = images.get(type);
        if (img) {
            const dim = dimensions.get(type);
            ctx.drawImage(img, dim.offsetX, dim.offsetY, dim.w, dim.h);
        }
        ctx.restore();

        // ── 6b. Draw text (if not ground) ────────────────────────
        if (!isGround) {
            ctx.save();
            ctx.translate(flag.x, flag.y);
            ctx.fillStyle = '#4444cc';
            ctx.font = '14px sans-serif';

            // Alignment depends on incoming wire direction (Section 8)
            let align = 'Top'; // default
            if (dir === 'top') align = 'Top';
            if (dir === 'bottom') align = 'Bottom';
            if (dir === 'left') align = 'Left';
            if (dir === 'right') align = 'Right';

            const { textAlign, textBaseline } = decodeAlignment(align);
            ctx.textAlign = textAlign;
            ctx.textBaseline = textBaseline;
            
            ctx.fillText(flag.name, 0, 0);
            ctx.restore();
        }
    }

    ctx.restore();
}
