// engine/pdf_renderer.js

// Transform functions (same as canvas renderer)
function transformOffset(ox, oy, orientation) {
    const isMirrored = orientation.startsWith('M');
    const rot = isMirrored ? 'R' + orientation.slice(1) : orientation;
    let rx, ry;
    switch (rot) {
        case 'R0':   rx =  ox; ry =  oy; break;
        case 'R90':  rx = -oy; ry =  ox; break;
        case 'R180': rx = -ox; ry = -oy; break;
        case 'R270': rx =  oy; ry = -ox; break;
        default:     rx =  ox; ry =  oy; break;
    }
    if (isMirrored) rx = -rx;
    return { x: rx, y: ry };
}

function transformAlignment(alignment, orientation) {
    let a = alignment;
    
    // Extract rotation count and mirror flag
    const isMirrored = orientation.startsWith('M');
    const degMatch = orientation.match(/\d+/);
    const deg = degMatch ? parseInt(degMatch[0], 10) : 0;
    const rotCount = deg / 90;

    // Apply 90-deg CW rotation 'rotCount' times
    for (let i = 0; i < rotCount; i++) {
        a = rotate90(a);
    }

    // Apply horizontal mirror if needed
    if (isMirrored) {
        a = mirror(a);
    }

    return a;

    function rotate90(align) {
        const rules = {
            'Left': 'VRight',
            'Right': 'VLeft',
            'Bottom': 'VTop',
            'Top': 'VBottom',
            'Center': 'VCenter',
            'VLeft': 'Left',
            'VRight': 'Right',
            'VBottom': 'Bottom',
            'VTop': 'Top',
            'VCenter': 'Center'
        };
        return rules[align] || align;
    }

    function mirror(align) {
        const rules = {
            'Left': 'Right',
            'Right': 'Left',
            'Bottom': 'Bottom',
            'Top': 'Top',
            'Center': 'Center',
            'VLeft': 'VLeft',
            'VRight': 'VRight',
            'VBottom': 'VTop',
            'VTop': 'VBottom',
            'VCenter': 'VCenter'
        };
        return rules[align] || align;
    }
}

// Default WINDOW positions for 'res' (Resistor) per orientation
const RES_WINDOW_DEFAULTS = {
    R0:   { 0: { ox: 36, oy: 40, align: 'Left'    }, 3: { ox: 36, oy: 76,  align: 'Left'    } },
    R90:  { 0: { ox: 3,  oy: 56, align: 'VBottom' }, 3: { ox: 27, oy: 56,  align: 'VTop'    } },
    R180: { 0: { ox: 36, oy: 76, align: 'Left'    }, 3: { ox: 36, oy: 40,  align: 'Left'    } },
    R270: { 0: { ox: 27, oy: 56, align: 'VTop'    }, 3: { ox: 3,  oy: 56,  align: 'VBottom' } },
};

// Default WINDOW positions for 'cap' (Capacitor) per orientation
const CAP_WINDOW_DEFAULTS = {
    R0:   { 0: { ox: 24, oy: 8,  align: 'Left'    }, 3: { ox: 24, oy: 56, align: 'Left'    } },
    R90:  { 0: { ox: 0,  oy: 32, align: 'VBottom' }, 3: { ox: 32, oy: 32, align: 'VTop'    } },
    R180: { 0: { ox: 24, oy: 56, align: 'Left'    }, 3: { ox: 24, oy: 8,  align: 'Left'    } },
    R270: { 0: { ox: 32, oy: 32, align: 'VTop'    }, 3: { ox: 0,  oy: 32, align: 'VBottom' } },
};

// Default WINDOW positions for 'ind' (Inductor) per orientation
const IND_WINDOW_DEFAULTS = {
    R0:   { 0: { ox: -2, oy: 40, align: 'Right'   }, 3: { ox: -2, oy: 72, align: 'Right'   } },
    R90:  { 0: { ox: 3,  oy: 56, align: 'VBottom' }, 3: { ox: 31, oy: 56, align: 'VTop'    } },
    R180: { 0: { ox: -2, oy: 72, align: 'Right'   }, 3: { ox: -2, oy: 40, align: 'Right'   } },
    R270: { 0: { ox: 31, oy: 56, align: 'VTop'    }, 3: { ox: 3,  oy: 56, align: 'VBottom' } },
};

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
    signal: {
        R0:   { 0: { ox: 24, oy: 16, align: 'Left'    }, 3: { ox: 24, oy: 104, align: 'Left'   } },
        R90:  { 0: { ox: -32, oy: 56, align: 'VBottom' }, 3: { ox: 32, oy: 56, align: 'VTop'   } },
        R180: { 0: { ox: 24, oy: 104, align: 'Left'   }, 3: { ox: 24, oy: 16, align: 'Left'    } },
        R270: { 0: { ox: 32, oy: 56, align: 'VTop'    }, 3: { ox: -32, oy: 56, align: 'VBottom' } },
    }
};

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

function applyPdfLineStyle(doc, style) {
    if (style === '1') doc.setLineDashPattern([10, 5], 0);
    else if (style === '2') doc.setLineDashPattern([2, 5], 0);
    else if (style === '3') doc.setLineDashPattern([10, 5, 2, 5], 0);
    else if (style === '4') doc.setLineDashPattern([10, 5, 2, 5, 2, 5], 0);
    else doc.setLineDashPattern([], 0); // Solid
}

// ── SVG Parsing ────────────────────────────────────────────────────────
function drawSvgToPdf(doc, svgText, symX, symY, orientation, minX, minY, scale = 1) {
    if (!svgText) return;
    doc.setLineDashPattern([], 0); // Always default to solid stroke for SVGs unless explicitly styled

    // 1. Calculate SVG bounds (identical logic to `prepareSvg` from canvas renderer)
    const vbMatch = svgText.match(/viewBox="([^"]+)"/);
    let vx = 0, vy = 0, vw = 32, vh = 32;
    const xs = [], ys = [];
    if (vbMatch) {
        [vx, vy, vw, vh] = vbMatch[1].trim().split(/[\s,]+/).map(Number);
        xs.push(vx, vx + vw); ys.push(vy, vy + vh);
    }
    for (const m of svgText.matchAll(/\b(?:x|x1|x2)="(-?[\d.]+)"/g)) xs.push(parseFloat(m[1]));
    for (const m of svgText.matchAll(/\b(?:y|y1|y2)="(-?[\d.]+)"/g)) ys.push(parseFloat(m[1]));
    for (const m of svgText.matchAll(/<circle[^>]*>/g)) {
        const cx = parseFloat((m[0].match(/cx="(-?[\d.]+)"/) || [])[1] ?? 0);
        const cy = parseFloat((m[0].match(/cy="(-?[\d.]+)"/) || [])[1] ?? 0);
        const r  = parseFloat((m[0].match(/\br="([\d.]+)"/)  || [])[1] ?? 0);
        xs.push(cx - r, cx + r); ys.push(cy - r, cy + r);
    }
    for (const m of svgText.matchAll(/points="([^"]+)"/g)) {
        const nums = m[1].trim().split(/[\s,]+/).map(Number);
        for (let i = 0; i < nums.length; i += 2) {
            xs.push(nums[i]);
            if (i + 1 < nums.length) ys.push(nums[i + 1]);
        }
    }
    // We intentionally DO NOT calculate or subtract svgMinX/svgMinY here. 
    // LTSpice SVG primitives are already in local coordinate space relative to the component's (0,0) anchor.

    // 2. Setup transforms
    const isMirrored = orientation.startsWith('M');
    const rotPart = isMirrored ? 'R' + orientation.slice(1) : orientation;
    let angleRad = 0;
    if (rotPart === 'R90') angleRad = Math.PI / 2;
    else if (rotPart === 'R180') angleRad = Math.PI;
    else if (rotPart === 'R270') angleRad = -Math.PI / 2;

    const baseTx = symX - minX;
    const baseTy = symY - minY;

    // Coordinate mapping function: Rotate THEN Mirror
    function transformPoint(px, py) {
        // SVG coordinates are inherently anchored to (0,0) as the component anchor.
        let lx = px;
        let ly = py;

        // 1. Rotate
        const cosA = Math.cos(angleRad), sinA = Math.sin(angleRad);
        let rx = lx * cosA - ly * sinA;
        let ry = lx * sinA + ly * cosA;

        // 2. Mirror
        if (isMirrored) rx = -rx;

        // 3. Translate
        return { x: baseTx + rx, y: baseTy + ry };
    }

    doc.setDrawColor(0, 0, 0); // Stroke color inside SVG is usually black
    doc.setLineCap(1);
    doc.setLineJoin(1);

    // CSS Parsing for stroke widths, fills, and strokes
    const cssStyles = {};
    const styleMatch = svgText.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    if (styleMatch) {
        const cssRules = styleMatch[1].match(/([^{]+)\{([^}]+)\}/g) || [];
        for (const rule of cssRules) {
            const sm = rule.match(/([^{]+)\{([^}]+)\}/);
            if (sm) {
                const selectors = sm[1].split(',').map(s => s.trim().replace('.', ''));
                let sw = null, fill = null, stroke = null;
                const swMatch = sm[2].match(/stroke-width\s*:\s*([\d.]+)px/);
                const fillMatch = sm[2].match(/(?:^|;)\s*fill\s*:\s*([^;}\/]+)/);
                const strokeMatch = sm[2].match(/(?:^|;)\s*stroke\s*:\s*([^;}\/]+)/);
                if (swMatch) sw = parseFloat(swMatch[1]);
                if (fillMatch) fill = fillMatch[1].trim();
                if (strokeMatch) stroke = strokeMatch[1].trim();
                
                for (const sel of selectors) {
                    if (!cssStyles[sel]) cssStyles[sel] = {};
                    if (sw !== null) cssStyles[sel].strokeWidth = sw;
                    if (fill !== null) cssStyles[sel].fill = fill;
                    if (stroke !== null) cssStyles[sel].stroke = stroke;
                }
            }
        }
    }

    // Helper to parse Hex color to array [r, g, b]
    const hexToRgb = (hexStr) => {
        let hex = hexStr.replace('#', '');
        if (hex.length === 3) hex = hex[0]+hex[0] + hex[1]+hex[1] + hex[2]+hex[2];
        if (hex.length === 6) {
            return [parseInt(hex.substring(0,2), 16), parseInt(hex.substring(2,4), 16), parseInt(hex.substring(4,6), 16)];
        }
        if (hexStr === 'white') return [255, 255, 255];
        return [0, 0, 0]; // default back to black
    };

    // Returns { fill, hasStroke, strokeColor } for the element
    const applySvgStyle = (elementStr) => {
        const clsMatch = elementStr.match(/class="([^"]+)"/);
        const cls = clsMatch ? cssStyles[clsMatch[1]] : null;

        // 1. Stroke width
        let lw = 1.5;
        if (cls && cls.strokeWidth !== undefined) lw = cls.strokeWidth;
        const inlineSw = elementStr.match(/stroke-width="([\d.]+)"/);
        if (inlineSw) lw = parseFloat(inlineSw[1]);
        doc.setLineWidth(lw);

        // 2. Fill value
        let fill = undefined;
        if (cls && cls.fill !== undefined) fill = cls.fill;
        const inlineFill = elementStr.match(/fill="([^"]+)"/);
        if (inlineFill) fill = inlineFill[1];

        // 3. Explicit stroke logic
        let hasStroke = false;
        let strokeColor = '#000000';
        if (cls && cls.stroke !== undefined && cls.stroke !== 'none') {
            hasStroke = true; strokeColor = cls.stroke;
        }
        const inlineStroke = elementStr.match(/stroke="([^"]+)"/);
        if (inlineStroke && inlineStroke[1] !== 'none') {
            hasStroke = true; strokeColor = inlineStroke[1];
        }

        if (hasStroke) {
            const rgb = hexToRgb(strokeColor);
            doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
        } else {
            doc.setDrawColor(0, 0, 0); // fallback stroke
        }

        return { fill, hasStroke };
    };

    // Converts fill/stroke info + shape-type into a jsPDF draw action
    const resolveDrawMode = (fill, hasStroke, isClosedByDefault) => {
        let effectiveFill = fill;
        if (effectiveFill === undefined && isClosedByDefault) effectiveFill = '#000';

        const wantFill = effectiveFill !== undefined && effectiveFill !== 'none';
        if (wantFill) {
            const rgb = hexToRgb(effectiveFill);
            doc.setFillColor(rgb[0], rgb[1], rgb[2]);
        }

        if (wantFill && hasStroke) return 'FD-stroke';
        if (wantFill)              return 'F-only';
        return 'S';
    };

    // Execute the final draw call for a built path
    const executeDraw = (mode) => {
        if (mode === 'FD-stroke') doc.fillStroke();
        else if (mode === 'F-only') doc.fill();
        else doc.stroke();
    };

    // 3. Draw Elements in Order (Painter's Model)
    const elementRegex = /<(rect|line|circle|path|polygon|polyline)[^>]*>/g;
    for (const m of svgText.matchAll(elementRegex)) {
        const fullTag = m[0];
        const tagName = m[1];

        if (tagName === 'rect') {
            const { fill, hasStroke } = applySvgStyle(fullTag);
            const mode = resolveDrawMode(fill, hasStroke, true);
            const lStyle = mode === 'FD-stroke' ? 'FD' : mode === 'F-only' ? 'F' : 'S';
            const rx = parseFloat((fullTag.match(/x="(-?[\d.]+)"/) || [])[1] ?? 0);
            const ry = parseFloat((fullTag.match(/y="(-?[\d.]+)"/) || [])[1] ?? 0);
            const rw = parseFloat((fullTag.match(/width="(-?[\d.]+)"/) || [])[1] ?? 0);
            const rh = parseFloat((fullTag.match(/height="(-?[\d.]+)"/) || [])[1] ?? 0);
            const p1 = transformPoint(rx, ry);
            const p2 = transformPoint(rx + rw, ry);
            const p3 = transformPoint(rx + rw, ry + rh);
            const p4 = transformPoint(rx, ry + rh);
            doc.lines([[p2.x-p1.x, p2.y-p1.y], [p3.x-p2.x, p3.y-p2.y], [p4.x-p3.x, p4.y-p3.y], [p1.x-p4.x, p1.y-p4.y]], p1.x, p1.y, [1,1], lStyle);
        } else if (tagName === 'line') {
            applySvgStyle(fullTag);
            const x1 = parseFloat((fullTag.match(/x1="(-?[\d.]+)"/) || [])[1] ?? 0);
            const y1 = parseFloat((fullTag.match(/y1="(-?[\d.]+)"/) || [])[1] ?? 0);
            const x2 = parseFloat((fullTag.match(/x2="(-?[\d.]+)"/) || [])[1] ?? 0);
            const y2 = parseFloat((fullTag.match(/y2="(-?[\d.]+)"/) || [])[1] ?? 0);
            const p1 = transformPoint(x1, y1);
            const p2 = transformPoint(x2, y2);
            doc.line(p1.x, p1.y, p2.x, p2.y);
        } else if (tagName === 'circle') {
            const { fill, hasStroke } = applySvgStyle(fullTag);
            const mode = resolveDrawMode(fill, hasStroke, true);
            const ellipseStyle = mode === 'FD-stroke' ? 'FD' : mode === 'F-only' ? 'F' : 'S';
            const cx = parseFloat((fullTag.match(/cx="(-?[\d.]+)"/) || [])[1] ?? 0);
            const cy = parseFloat((fullTag.match(/cy="(-?[\d.]+)"/) || [])[1] ?? 0);
            const r = parseFloat((fullTag.match(/r="(-?[\d.]+)"/) || [])[1] ?? 0);
            const cCenter = transformPoint(cx, cy);
            doc.ellipse(cCenter.x, cCenter.y, r, r, ellipseStyle);
        } else if (tagName === 'polygon' || tagName === 'polyline') {
            const { fill, hasStroke } = applySvgStyle(fullTag);
            const isClosed = tagName === 'polygon';
            const mode = resolveDrawMode(fill, hasStroke, isClosed);
            const lStyle = mode === 'FD-stroke' ? 'FD' : mode === 'F-only' ? 'F' : 'S';
            const ptsMatch = fullTag.match(/points="([^"]+)"/);
            if (ptsMatch) {
                const nums = ptsMatch[1].trim().split(/[\s,]+/).map(Number);
                const pts = [];
                for (let i = 0; i < nums.length; i += 2) {
                    pts.push(transformPoint(nums[i], nums[i+1]));
                }
                if (pts.length > 1) {
                    const start = pts[0];
                    const lines = [];
                    for (let i = 1; i < pts.length; i++) {
                        lines.push([pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y]);
                    }
                    if (isClosed) {
                        lines.push([start.x - pts[pts.length-1].x, start.y - pts[pts.length-1].y]);
                    }
                    doc.lines(lines, start.x, start.y, [1,1], lStyle);
                }
            }
        } else if (tagName === 'path') {
            const { fill, hasStroke } = applySvgStyle(fullTag);
            const dMatch = fullTag.match(/d="([^"]+)"/);
            if (dMatch) {
                const tokens = [];
                const regex = /([A-Za-z])|(-?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)/g;
                let tMatch;
                while ((tMatch = regex.exec(dMatch[1]))) {
                    tokens.push(tMatch[0]);
                }

                // Accumulate all points for this path (absolute PDF coords)
                let curX = 0, curY = 0;
                let startX = 0, startY = 0;
                let pathStarted = false;
                let lastCp2X = null, lastCp2Y = null;
                let pathHasZ = false;
                const pathPoints = []; // absolute {x, y} PDF points
                let i = 0;

                const addPoint = (svgX, svgY) => {
                    const p = transformPoint(svgX, svgY);
                    pathPoints.push(p);
                };

                while (i < tokens.length) {
                    const cmd = tokens[i++];
                    let isCurveCommand = false;

                    if (cmd === 'M' || cmd === 'm') {
                        const nx = parseFloat(tokens[i++]);
                        const ny = parseFloat(tokens[i++]);
                        const absX = (cmd === 'm' ? curX + nx : nx) || 0;
                        const absY = (cmd === 'm' ? curY + ny : ny) || 0;
                        curX = absX; curY = absY;
                        startX = curX; startY = curY;
                        pathStarted = true;
                        addPoint(curX, curY);
                        while (i + 1 < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
                            const extraX = parseFloat(tokens[i++]);
                            const extraY = parseFloat(tokens[i++]);
                            const ax = (cmd === 'm' ? curX + extraX : extraX) || 0;
                            const ay = (cmd === 'm' ? curY + extraY : extraY) || 0;
                            addPoint(ax, ay);
                            curX = ax; curY = ay;
                        }
                    } else if (cmd === 'L' || cmd === 'l') {
                        while (i + 1 < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
                            const nx = parseFloat(tokens[i++]);
                            const ny = parseFloat(tokens[i++]);
                            const absX = (cmd === 'l' ? curX + nx : nx) || 0;
                            const absY = (cmd === 'l' ? curY + ny : ny) || 0;
                            if (pathStarted) addPoint(absX, absY);
                            curX = absX; curY = absY;
                        }
                    } else if (cmd === 'H' || cmd === 'h') {
                        while (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
                            const nx = parseFloat(tokens[i++]);
                            const absX = (cmd === 'h' ? curX + nx : nx) || 0;
                            if (pathStarted) addPoint(absX, curY);
                            curX = absX;
                        }
                    } else if (cmd === 'V' || cmd === 'v') {
                        while (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
                            const ny = parseFloat(tokens[i++]);
                            const absY = (cmd === 'v' ? curY + ny : ny) || 0;
                            if (pathStarted) addPoint(curX, absY);
                            curY = absY;
                        }
                    } else if (cmd === 'C' || cmd === 'c') {
                        isCurveCommand = true;
                        while (i + 5 < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
                            const isRel = cmd === 'c';
                            const cp1x = parseFloat(tokens[i++]) + (isRel ? curX : 0);
                            const cp1y = parseFloat(tokens[i++]) + (isRel ? curY : 0);
                            const cp2x = parseFloat(tokens[i++]) + (isRel ? curX : 0);
                            const cp2y = parseFloat(tokens[i++]) + (isRel ? curY : 0);
                            const ex = parseFloat(tokens[i++]) + (isRel ? curX : 0);
                            const ey = parseFloat(tokens[i++]) + (isRel ? curY : 0);
                            const STEPS = 12;
                            for (let step = 1; step <= STEPS; step++) {
                                const t = step / STEPS;
                                const mt = 1 - t;
                                const bx = mt*mt*mt*curX + 3*mt*mt*t*cp1x + 3*mt*t*t*cp2x + t*t*t*ex;
                                const by = mt*mt*mt*curY + 3*mt*mt*t*cp1y + 3*mt*t*t*cp2y + t*t*t*ey;
                                if (pathStarted) addPoint(bx, by);
                            }
                            curX = ex; curY = ey;
                            lastCp2X = cp2x; lastCp2Y = cp2y;
                        }
                    } else if (cmd === 'S' || cmd === 's') {
                        isCurveCommand = true;
                        while (i + 3 < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
                            const isRel = cmd === 's';
                            let cp1x = curX, cp1y = curY;
                            if (lastCp2X !== null && lastCp2Y !== null) {
                                cp1x = curX * 2 - lastCp2X;
                                cp1y = curY * 2 - lastCp2Y;
                            }
                            const cp2x = parseFloat(tokens[i++]) + (isRel ? curX : 0);
                            const cp2y = parseFloat(tokens[i++]) + (isRel ? curY : 0);
                            const ex = parseFloat(tokens[i++]) + (isRel ? curX : 0);
                            const ey = parseFloat(tokens[i++]) + (isRel ? curY : 0);
                            const STEPS = 12;
                            for (let step = 1; step <= STEPS; step++) {
                                const t = step / STEPS;
                                const mt = 1 - t;
                                const bx = mt*mt*mt*curX + 3*mt*mt*t*cp1x + 3*mt*t*t*cp2x + t*t*t*ex;
                                const by = mt*mt*mt*curY + 3*mt*mt*t*cp1y + 3*mt*t*t*cp2y + t*t*t*ey;
                                if (pathStarted) addPoint(bx, by);
                            }
                            curX = ex; curY = ey;
                            lastCp2X = cp2x; lastCp2Y = cp2y;
                        }
                    } else if (cmd === 'Z' || cmd === 'z') {
                        pathHasZ = true;
                        curX = startX; curY = startY;
                    }
                    if (!isCurveCommand) { lastCp2X = null; lastCp2Y = null; }
                }

                if (pathStarted && pathPoints.length > 1) {
                    const mode = resolveDrawMode(fill, hasStroke, pathHasZ);
                    const lStyle = mode === 'FD-stroke' ? 'FD' : mode === 'F-only' ? 'F' : 'S';
                    const start = pathPoints[0];
                    const segments = [];
                    for (let j = 1; j < pathPoints.length; j++) {
                        segments.push([pathPoints[j].x - pathPoints[j-1].x, pathPoints[j].y - pathPoints[j-1].y]);
                    }
                    // Close the path for filled shapes
                    if (pathHasZ) {
                        segments.push([start.x - pathPoints[pathPoints.length-1].x, start.y - pathPoints[pathPoints.length-1].y]);
                    }
                    doc.lines(segments, start.x, start.y, [1,1], lStyle, pathHasZ);
                }
            }
        }
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

function drawLTSpiceText(doc, text, x, y, alignment, ptSize) {
    if (!text) return;
    doc.setFontSize(ptSize);
    
    const w = doc.getTextWidth(text);
    // LTSpice (Windows GDI) bases vertical placement on standard font metrics.
    // We approximate standard vector proportions used by LTSpice:
    const H = ptSize;        // Full cell height 
    const A = ptSize * 0.8;  // Ascent (Baseline offset from top)
    const isVertical = alignment.startsWith('V');
    const baseAlign = isVertical ? alignment.substring(1) : alignment;

    let Lx, By; // Local X (Left edge) and Local Y (Baseline) BEFORE any rotation

    // 1. Calculate Horizontal Anchor Local Coordinates (relative to anchor x, y)
    if (baseAlign === 'Left') {
        Lx = x; 
        By = y - H / 2 + A;
    } else if (baseAlign === 'Right') {
        Lx = x - w;
        By = y - H / 2 + A;
    } else if (baseAlign === 'Center') {
        Lx = x - w / 2;
        By = y - H / 2 + A;
    } else if (baseAlign === 'Top') {
        Lx = x - w / 2;
        By = y + A; // GDI places anchor at cell Top
    } else if (baseAlign === 'Bottom') {
        Lx = x - w / 2;
        By = y; // GDI uses TA_BASELINE for Bottom, anchor explicitly at Baseline
    } else {
        Lx = x;
        By = y;
    }

    if (isVertical) {
        // 2. Rotate the calculated baseline point 90 degrees CCW AROUND the anchor (x,y)
        // This is exactly what LTSpice's affine transformation matrix does for vertical text.
        const relX = Lx - x;
        const relY = By - y;
        
        // CCW 90 degree rotation matrix applied to relative coordinates
        const rotX = relY;
        const rotY = -relX;

        const pdfX = x + rotX;
        const pdfY = y + rotY;

        doc.text(text, pdfX, pdfY, { angle: 90, align: 'left', baseline: 'alphabetic' });
    } else {
        doc.text(text, Lx, By, { angle: 0, align: 'left', baseline: 'alphabetic' });
    }
}


// Main Library export
async function convertSceneToPdf(scene, assets, filename = 'Schematic', options = {}) {
    const optCanvasBasedOnRect = options.canvasBasedOnRectangle || false;

    // Analyze ASY elements if needed
    if (typeof analyzeSceneSymbols === 'function') {
        await analyzeSceneSymbols(scene);
    }

    // 1. Calculate Bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const expand = (x, y) => {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    };

    let largestRectIndex = -1;
    if (optCanvasBasedOnRect && scene.rectangles && scene.rectangles.length > 0) {
        let maxArea = -1;
        for (let i = 0; i < scene.rectangles.length; i++) {
            const r = scene.rectangles[i];
            const area = Math.abs(r.x2 - r.x1) * Math.abs(r.y2 - r.y1);
            if (area > maxArea) { maxArea = area; largestRectIndex = i; }
        }
        if (largestRectIndex !== -1) {
            const r = scene.rectangles[largestRectIndex];
            minX = Math.min(r.x1, r.x2); maxX = Math.max(r.x1, r.x2);
            minY = Math.min(r.y1, r.y2); maxY = Math.max(r.y1, r.y2);
        }
    }

    if (minX === Infinity) {
        for (const w of scene.wires) { expand(w.x1, w.y1); expand(w.x2, w.y2); }
        for (const sym of scene.symbols) { expand(sym.x, sym.y); expand(sym.x + 100, sym.y + 100); }
        for (const r of scene.rectangles) { expand(r.x1, r.y1); expand(r.x2, r.y2); }
        for (const l of scene.lines) { expand(l.x1, l.y1); expand(l.x2, l.y2); }
        for (const c of scene.circles) { expand(c.x1, c.y1); expand(c.x2, c.y2); }
        for (const a of scene.arcs) { expand(a.x1, a.y1); expand(a.x2, a.y2); }
        
        if (minX === Infinity) return null; // empty scene
        const MARGIN = 100;
        minX -= MARGIN; minY -= MARGIN; maxX += MARGIN; maxY += MARGIN;
    }

    const width = maxX - minX;
    const height = maxY - minY;

    // 2. Initialize jsPDF
    const doc = new window.jspdf.jsPDF({
        orientation: width > height ? 'l' : 'p',
        unit: 'pt',
        format: [width, height]
    });
    doc.setProperties({ title: filename });

    // 3. Register Font (if passed through assets)
    if (assets.fontBase64) {
        doc.addFileToVFS('lmroman10.ttf', assets.fontBase64);
        doc.addFont('lmroman10.ttf', 'LMRoman', 'normal');
        doc.setFont('LMRoman');
    }

    // Set line width defaults
    doc.setLineWidth(2);
    doc.setDrawColor(0, 0, 0); // Black (was LTSpice Blue)

    // 4. Draw Geometries
    for (let i = 0; i < scene.rectangles.length; i++) {
        // Only skip the bounding rectangle if we are explicitly using it as the canvas
        if (optCanvasBasedOnRect && i === largestRectIndex) continue;
        const r = scene.rectangles[i];
        applyPdfLineStyle(doc, r.style);
        doc.rect(Math.min(r.x1, r.x2) - minX, Math.min(r.y1, r.y2) - minY, Math.abs(r.x2 - r.x1), Math.abs(r.y2 - r.y1), 'S');
    }

    for (const l of scene.lines) {
        applyPdfLineStyle(doc, l.style);
        doc.line(l.x1 - minX, l.y1 - minY, l.x2 - minX, l.y2 - minY);
    }
    
    // 4.5 Draw Wires
    doc.setLineDashPattern([], 0); // Reset dash style
    doc.setLineWidth(1.5);
    doc.setDrawColor(0, 0, 0); // Black (was #000080)
    for (const w of scene.wires) {
        doc.line(w.x1 - minX, w.y1 - minY, w.x2 - minX, w.y2 - minY);
    }
    
    // 5. Draw Symbols & SVGs
    doc.setLineDashPattern([], 0); // Reset dash style
    for (const sym of scene.symbols) {
        doc.setLineDashPattern([], 0); // Reset for each symbol to prevent state leakage
        const basename = sym.type.split('\\').pop().split('/').pop();

        // Draw the body (via SVG String Native Parser or ASY geometry)
        if (assets.svgStrings && assets.svgStrings.has(basename)) {
            const svgText = assets.svgStrings.get(basename);
            drawSvgToPdf(doc, svgText, sym.x, sym.y, sym.orientation, minX, minY);
        } else if (sym.asyData && sym.asyData.graphics) {
            // Natively draw fallback ASY components using jsPDF
            const g = sym.asyData.graphics;
            doc.setDrawColor(0, 0, 0); 
            doc.setLineWidth(1.5);
            doc.setLineCap(1);
            doc.setLineJoin(1);

            // Re-use transformPoint logic for ASY graphics
            const isMirrored = sym.orientation.startsWith('M');
            const rotPart = isMirrored ? 'R' + sym.orientation.slice(1) : sym.orientation;
            let angleRad = 0;
            if (rotPart === 'R90') angleRad = Math.PI / 2;
            else if (rotPart === 'R180') angleRad = Math.PI;
            else if (rotPart === 'R270') angleRad = -Math.PI / 2;
            const baseTx = sym.x - minX;
            const baseTy = sym.y - minY;
            const transformAsyPoint = (px, py) => {
                const cosA = Math.cos(angleRad), sinA = Math.sin(angleRad);
                let rx = px * cosA - py * sinA;
                let ry = px * sinA + py * cosA;
                if (isMirrored) rx = -rx;
                return { x: baseTx + rx, y: baseTy + ry };
            };

            for (const r of g.rectangles) {
                applyPdfLineStyle(doc, r.style);
                const p1 = transformAsyPoint(r.x1, r.y1);
                const p2 = transformAsyPoint(r.x2, r.y1);
                const p3 = transformAsyPoint(r.x2, r.y2);
                const p4 = transformAsyPoint(r.x1, r.y2);
                doc.lines([[p2.x-p1.x, p2.y-p1.y], [p3.x-p2.x, p3.y-p2.y], [p4.x-p3.x, p4.y-p3.y], [p1.x-p4.x, p1.y-p4.y]], p1.x, p1.y, [1,1]);
            }
            for (const l of g.lines) {
                applyPdfLineStyle(doc, l.style);
                const p1 = transformAsyPoint(l.x1, l.y1);
                const p2 = transformAsyPoint(l.x2, l.y2);
                doc.line(p1.x, p1.y, p2.x, p2.y);
            }
            for (const c of g.circles) {
                applyPdfLineStyle(doc, c.style);
                const cx = (c.x1 + c.x2) / 2, cy = (c.y1 + c.y2) / 2;
                const rRadius = Math.abs(c.x2 - c.x1) / 2;
                const cp = transformAsyPoint(cx, cy);
                doc.ellipse(cp.x, cp.y, rRadius, rRadius);
            }
            for (const t of g.texts) {
                doc.setTextColor(0, 0, 0);
                const FONT_SIZE_MAP = { 0: 8, 1: 13, 2: 20, 3: 26, 4: 32, 5: 46, 6: 65, 7: 92 };
                const ptSize = FONT_SIZE_MAP[t.fontSize] || 8;
                doc.setFontSize(ptSize);
                const finalAlign = transformAlignment(t.align, sym.orientation);
                const isVertical = finalAlign.startsWith('V');
                const baseAlign = isVertical ? finalAlign.slice(1) : finalAlign;
                
                let alignPdf = 'left';
                let baselinePdf = 'middle';
                if (baseAlign === 'Left') alignPdf = 'left';
                if (baseAlign === 'Right') alignPdf = 'right';
                if (baseAlign === 'Center') alignPdf = 'center';
                if (baseAlign === 'Top') { alignPdf = 'center'; baselinePdf = 'top'; }
                if (baseAlign === 'Bottom') { alignPdf = 'center'; baselinePdf = 'bottom'; }

                const p = transformAsyPoint(t.x, t.y);
                
                // Debug Square
                doc.setDrawColor(255, 0, 0); doc.setFillColor(255, 0, 0);
                doc.rect(p.x - 1, p.y - 1, 2, 2, 'F');
                
                doc.text(t.content, p.x, p.y, { align: alignPdf, baseline: baselinePdf, angle: isVertical ? 90 : 0 });
            }
        }

        // Draw Texts (Windows)
        let defaults = null;
        if (COMPONENT_DEFAULTS[basename]) {
            const table = COMPONENT_DEFAULTS[basename];
            const lookupKey = sym.orientation.startsWith('M') ? 'R0' : sym.orientation;
            defaults = table[lookupKey] || table['R0'];
        } else {
            defaults = COMPONENT_FORMULA_DEFAULTS[basename];
        }

        const effectiveWindows = new Map();
        if (defaults) {
            for (const [idx, def] of Object.entries(defaults)) {
                effectiveWindows.set(parseInt(idx), { ox: def.ox, oy: def.oy, align: def.align, fontSize: 2 });
            }
        }
        if (sym.asyData && sym.asyData.windows) {
            for (const [idx, win] of Object.entries(sym.asyData.windows)) {
                effectiveWindows.set(parseInt(idx), { ox: win.ox, oy: win.oy, align: win.align, fontSize: win.fontSize });
            }
        }
        for (const win of sym.windows) {
            effectiveWindows.set(win.index, { ox: win.offsetX, oy: win.offsetY, align: win.alignment, fontSize: win.fontSize });
        }
        if (sym.type === 'ind' && ['R0', 'R180', 'M0', 'M180'].includes(sym.orientation)) {
            if (effectiveWindows.has(0)) effectiveWindows.get(0).align = 'Right';
            if (effectiveWindows.has(3)) effectiveWindows.get(3).align = 'Right';
        }

        for (const [idx, win] of effectiveWindows.entries()) {
            const text = getWindowText(sym, idx);
            if (!text) continue;

            const FONT_SIZE_MAP = { 0: 8, 1: 13, 2: 20, 3: 26, 4: 32, 5: 46, 6: 65, 7: 92 };
            const ptSize = FONT_SIZE_MAP[win.fontSize] || 13;

            const rotated = transformOffset(win.ox, win.oy, sym.orientation);
            let wx = sym.x + rotated.x - minX;
            let wy = sym.y + rotated.y - minY;
            const finalAlign = transformAlignment(win.align, sym.orientation);

            // Debug Square
            doc.setDrawColor(255, 0, 0); doc.setFillColor(255, 0, 0);
            doc.rect(wx - 1, wy - 1, 2, 2, 'F');
            doc.setTextColor(0, 0, 0);

            drawLTSpiceText(doc, text, wx, wy, finalAlign, ptSize);
        }
    }

    // 6. Draw Standalone Texts
    doc.setLineDashPattern([], 0); // Reset dash style
    doc.setTextColor(0, 0, 0);
    for (const t of scene.texts) {
        const FONT_SIZE_MAP = { 0: 8, 1: 13, 2: 20, 3: 26, 4: 32, 5: 46, 6: 65, 7: 92 };
        const ptSize = FONT_SIZE_MAP[t.fontSize] || 8;
        
        let tx = t.x - minX;
        let ty = t.y - minY;

        // Debug Square
        doc.setDrawColor(255, 0, 0); doc.setFillColor(255, 0, 0);
        doc.rect(tx - 1, ty - 1, 2, 2, 'F');

        drawLTSpiceText(doc, t.content, tx, ty, t.alignment, ptSize);
    }

    // 7. Draw Flags
    doc.setDrawColor(0, 0, 0);
    for (const flag of scene.flags) {
        const isGround = flag.name === '0';
        const type = isGround ? 'gnd' : 'flag';
        const dir = findIncomingWireDirection(flag.x, flag.y, scene.wires);

        if (assets.svgStrings && assets.svgStrings.has(type)) {
            let flagOrientation = 'R0';
            if (isGround) {
                if (dir === 'right') flagOrientation = 'R90';
                if (dir === 'bottom') flagOrientation = 'R180';
                if (dir === 'left') flagOrientation = 'R270';
            }
            drawSvgToPdf(doc, assets.svgStrings.get(type), flag.x, flag.y, flagOrientation, minX, minY);
            
            if (!isGround) {
                doc.setTextColor(0, 0, 0); // Black (was #4444cc)
                doc.setFontSize(13); // Size 1 default mapping
                
                let align = 'Top'; 
                if (dir === 'top') align = 'Top';
                if (dir === 'bottom') align = 'Bottom';
                if (dir === 'left') align = 'Left';
                if (dir === 'right') align = 'Right';

                drawLTSpiceText(doc, flag.name, flag.x - minX, flag.y - minY, align, 13);
            }
        }
    }

    // 8. Build output byte array
    return doc.output('arraybuffer');
}

window.LTSpiceEngine = {
    parse: typeof parseAsc !== 'undefined' ? parseAsc : null,
    render: convertSceneToPdf
};
