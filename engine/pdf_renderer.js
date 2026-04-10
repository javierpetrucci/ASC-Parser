// engine/pdf_renderer.js

// Transform functions (same as canvas renderer)
function transformOffset(ox, oy, orientation) {
    const isMirrored = orientation.startsWith('M');
    const rot = isMirrored ? 'R' + orientation.slice(1) : orientation;
    let rx, ry;
    switch (rot) {
        case 'R0': rx = ox; ry = oy; break;
        case 'R90': rx = -oy; ry = ox; break;
        case 'R180': rx = -ox; ry = -oy; break;
        case 'R270': rx = oy; ry = -ox; break;
        default: rx = ox; ry = oy; break;
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

// Component window defaults are loaded from engine/component_defaults.js
// (must be included before this script in the HTML)



function getWindowText(sym, index) {
    if (index === 0) return sym.attrs['InstName'] || sym.asyData?.attrs?.['InstName'] || '';
    if (index === 3) {
        let val = sym.attrs['Value'] || sym.asyData?.attrs?.['Value'] || '';
        const basename = sym.type.split('\\').pop().split('/').pop().toLowerCase();

        // Special formatting rules for res, cap, ind values (index 3)
        if (['res', 'cap', 'ind'].includes(basename) && val) {
            let workingVal = val.trim();
            
            // Check if it's just the default placeholder letter; if so skip unit append
            if ((basename === 'res' && workingVal.toUpperCase() === 'R') ||
                (basename === 'cap' && workingVal.toUpperCase() === 'C') ||
                (basename === 'ind' && workingVal.toUpperCase() === 'L')) {
                return workingVal;
            }

            // Step 1: Remove trailing units from source (F, H, Hy) for cap/ind
            if (basename === 'cap' && workingVal.toLowerCase().endsWith('f')) {
                workingVal = workingVal.substring(0, workingVal.length - 1).trim();
            } else if (basename === 'ind') {
                if (workingVal.toLowerCase().endsWith('hy')) {
                    workingVal = workingVal.substring(0, workingVal.length - 2).trim();
                } else if (workingVal.toLowerCase().endsWith('h')) {
                    workingVal = workingVal.substring(0, workingVal.length - 1).trim();
                }
            }

            // Step 2: Handle suffixes (meg -> M, M/m -> m)
            if (workingVal.toLowerCase().endsWith('meg')) {
                workingVal = workingVal.substring(0, workingVal.length - 3) + 'M';
            } else if (workingVal.toLowerCase().endsWith('m')) {
                // Both 'M' and 'm' in LTSpice mean milli
                workingVal = workingVal.substring(0, workingVal.length - 1) + 'm';
            }

            // Step 3: Append final units
            if (basename === 'res') return workingVal + 'Ω';
            if (basename === 'cap') return workingVal + 'F';
            if (basename === 'ind') return workingVal + 'Hy';
        }

        return val;
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
        const r = parseFloat((m[0].match(/\br="([\d.]+)"/) || [])[1] ?? 0);
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
        if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        if (hex.length === 6) {
            return [parseInt(hex.substring(0, 2), 16), parseInt(hex.substring(2, 4), 16), parseInt(hex.substring(4, 6), 16)];
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
        if (wantFill) return 'F-only';
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

        // Parse SVG transform="..." attribute
        const tMatch = fullTag.match(/transform="([^"]+)"/);
        let txA = 1, txB = 0, txC = 0, txD = 1, txE = 0, txF = 0;
        if (tMatch) {
            const regex = /([a-z]+)\s*\(([^)]+)\)/g;
            let match;
            while ((match = regex.exec(tMatch[1]))) {
                const cmd = match[1];
                const args = match[2].trim().split(/[\s,]+/).map(Number);
                if (cmd === 'translate') {
                    const tx = args[0] || 0, ty = args[1] !== undefined ? args[1] : 0;
                    txE += txA * tx + txC * ty;
                    txF += txB * tx + txD * ty;
                } else if (cmd === 'rotate') {
                    const angle = (args[0] || 0) * Math.PI / 180;
                    const cx = args[1] || 0, cy = args[2] || 0;
                    if (cx || cy) { txE += txA * cx + txC * cy; txF += txB * cx + txD * cy; }
                    const cosA = Math.cos(angle), sinA = Math.sin(angle);
                    const na = txA * cosA + txC * sinA, nb = txB * cosA + txD * sinA;
                    const nc = -txA * sinA + txC * cosA, nd = -txB * sinA + txD * cosA;
                    txA = na; txB = nb; txC = nc; txD = nd;
                    if (cx || cy) { txE -= txA * cx + txC * cy; txF -= txB * cx + txD * cy; }
                } else if (cmd === 'scale') {
                    const sx = args[0] || 1, sy = args[1] !== undefined ? args[1] : sx;
                    txA *= sx; txB *= sx; txC *= sy; txD *= sy;
                } else if (cmd === 'matrix') {
                    const [ma, mb, mc, md, me, mf] = args;
                    const na = txA * ma + txC * mb, nb = txB * ma + txD * mb;
                    const nc = txA * mc + txC * md, nd = txB * mc + txD * md;
                    txE += txA * me + txC * mf; txF += txB * me + txD * mf;
                    txA = na; txB = nb; txC = nc; txD = nd;
                }
            }
        }

        const localTransformPoint = (px, py) => {
            if (txA !== 1 || txB !== 0 || txC !== 0 || txD !== 1 || txE !== 0 || txF !== 0) {
                const npx = txA * px + txC * py + txE;
                const npy = txB * px + txD * py + txF;
                return transformPoint(npx, npy);
            }
            return transformPoint(px, py);
        };

        if (tagName === 'rect') {
            const { fill, hasStroke } = applySvgStyle(fullTag);
            const mode = resolveDrawMode(fill, hasStroke, true);
            const lStyle = mode === 'FD-stroke' ? 'FD' : mode === 'F-only' ? 'F' : 'S';
            const rx = parseFloat((fullTag.match(/x="(-?[\d.]+)"/) || [])[1] ?? 0);
            const ry = parseFloat((fullTag.match(/y="(-?[\d.]+)"/) || [])[1] ?? 0);
            const rw = parseFloat((fullTag.match(/width="(-?[\d.]+)"/) || [])[1] ?? 0);
            const rh = parseFloat((fullTag.match(/height="(-?[\d.]+)"/) || [])[1] ?? 0);
            const p1 = localTransformPoint(rx, ry);
            const p2 = localTransformPoint(rx + rw, ry);
            const p3 = localTransformPoint(rx + rw, ry + rh);
            const p4 = localTransformPoint(rx, ry + rh);
            doc.lines([[p2.x - p1.x, p2.y - p1.y], [p3.x - p2.x, p3.y - p2.y], [p4.x - p3.x, p4.y - p3.y], [p1.x - p4.x, p1.y - p4.y]], p1.x, p1.y, [1, 1], lStyle);
        } else if (tagName === 'line') {
            applySvgStyle(fullTag);
            const x1 = parseFloat((fullTag.match(/x1="(-?[\d.]+)"/) || [])[1] ?? 0);
            const y1 = parseFloat((fullTag.match(/y1="(-?[\d.]+)"/) || [])[1] ?? 0);
            const x2 = parseFloat((fullTag.match(/x2="(-?[\d.]+)"/) || [])[1] ?? 0);
            const y2 = parseFloat((fullTag.match(/y2="(-?[\d.]+)"/) || [])[1] ?? 0);
            const p1 = localTransformPoint(x1, y1);
            const p2 = localTransformPoint(x2, y2);
            doc.line(p1.x, p1.y, p2.x, p2.y);
        } else if (tagName === 'circle') {
            const { fill, hasStroke } = applySvgStyle(fullTag);
            const mode = resolveDrawMode(fill, hasStroke, true);
            const ellipseStyle = mode === 'FD-stroke' ? 'FD' : mode === 'F-only' ? 'F' : 'S';
            const cx = parseFloat((fullTag.match(/cx="(-?[\d.]+)"/) || [])[1] ?? 0);
            const cy = parseFloat((fullTag.match(/cy="(-?[\d.]+)"/) || [])[1] ?? 0);
            const r = parseFloat((fullTag.match(/r="(-?[\d.]+)"/) || [])[1] ?? 0);
            const cCenter = localTransformPoint(cx, cy);
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
                    pts.push(localTransformPoint(nums[i], nums[i + 1]));
                }
                if (pts.length > 1) {
                    const start = pts[0];
                    const lines = [];
                    for (let i = 1; i < pts.length; i++) {
                        lines.push([pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y]);
                    }
                    if (isClosed) {
                        lines.push([start.x - pts[pts.length - 1].x, start.y - pts[pts.length - 1].y]);
                    }
                    doc.lines(lines, start.x, start.y, [1, 1], lStyle);
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
                    const p = localTransformPoint(svgX, svgY);
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
                                const bx = mt * mt * mt * curX + 3 * mt * mt * t * cp1x + 3 * mt * t * t * cp2x + t * t * t * ex;
                                const by = mt * mt * mt * curY + 3 * mt * mt * t * cp1y + 3 * mt * t * t * cp2y + t * t * t * ey;
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
                                const bx = mt * mt * mt * curX + 3 * mt * mt * t * cp1x + 3 * mt * t * t * cp2x + t * t * t * ex;
                                const by = mt * mt * mt * curY + 3 * mt * mt * t * cp1y + 3 * mt * t * t * cp2y + t * t * t * ey;
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
                    const start = pathPoints[0];
                    const end = pathPoints[pathPoints.length - 1];
                    const isEmotionallyClosed = pathHasZ || (Math.abs(start.x - end.x) < 0.001 && Math.abs(start.y - end.y) < 0.001);
                    
                    const mode = resolveDrawMode(fill, hasStroke, isEmotionallyClosed);
                    const lStyle = mode === 'FD-stroke' ? 'FD' : mode === 'F-only' ? 'F' : 'S';
                    const segments = [];
                    for (let j = 1; j < pathPoints.length; j++) {
                        segments.push([pathPoints[j].x - pathPoints[j - 1].x, pathPoints[j].y - pathPoints[j - 1].y]);
                    }
                    // Close the path for filled shapes
                    if (pathHasZ) {
                        segments.push([start.x - pathPoints[pathPoints.length - 1].x, start.y - pathPoints[pathPoints.length - 1].y]);
                    }
                    doc.lines(segments, start.x, start.y, [1, 1], lStyle, pathHasZ);
                }
            }
        }
    }
}

function findIncomingWireDirection(x, y, wires) {
    const incoming = new Set();
    for (const w of wires) {
        if (w.x1 === x && w.y1 === y) {
            if (w.x2 < x) incoming.add('left');
            else if (w.x2 > x) incoming.add('right');
            else if (w.y2 < y) incoming.add('top');
            else if (w.y2 > y) incoming.add('bottom');
        }
        if (w.x2 === x && w.y2 === y) {
            if (w.x1 < x) incoming.add('left');
            else if (w.x1 > x) incoming.add('right');
            else if (w.y1 < y) incoming.add('top');
            else if (w.y1 > y) incoming.add('bottom');
        }
    }

    if (incoming.size <= 1) {
        return incoming.values().next().value || 'top';
    }

    // When 2 or more wires are present, place the flag away from the incoming wires.
    // Empty space priority: Top space -> Bottom space -> Left space -> Right space.
    // (Note: To place text at Top space, we act as if the wire came from 'bottom')
    if (!incoming.has('top')) return 'bottom';
    if (!incoming.has('bottom')) return 'top';
    if (!incoming.has('left')) return 'right';
    return 'left';
}

// Normalizes a PIN alignment keyword to the canonical mixed-case form used by
// drawLTSpiceText, and returns the offset direction vector for that alignment.
// The pin alignment is used as-is — no semantic translation is applied.
//
// Offset direction (away from anchor, in world space):
//   Left   → +x,  Right  → -x,  Top    → +y,  Bottom → -y
//   VLeft  → +x,  VRight → -x,  VTop   → +y,  VBottom→ -y
function pinAlignmentToTextAlignment(pinAlign) {
    switch (pinAlign.toUpperCase()) {
        case 'LEFT':    return { textAlign: 'Left',    dx:  1, dy:  0 };
        case 'RIGHT':   return { textAlign: 'Right',   dx: -1, dy:  0 };
        case 'TOP':     return { textAlign: 'Top',     dx:  0, dy:  1 };
        case 'BOTTOM':  return { textAlign: 'Bottom',  dx:  0, dy: -1 };
        case 'VLEFT':   return { textAlign: 'VLeft',   dx:  0, dy: -1 };
        case 'VRIGHT':  return { textAlign: 'VRight',  dx:  0, dy:  1 };
        case 'VTOP':    return { textAlign: 'VTop',    dx:  1, dy:  0 };
        case 'VBOTTOM': return { textAlign: 'VBottom', dx: -1, dy:  0 };
        default:        return { textAlign: 'Left',    dx:  0, dy:  0 };
    }
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
        //By = y + A; // GDI places anchor at cell Top
        By = y + A + (H * 0.225); // Manual offset to match spice position relative to component
    } else if (baseAlign === 'Bottom') {
        Lx = x - w / 2;
        //By = y; // GDI uses TA_BASELINE for Bottom, anchor explicitly at Baseline
        By = y - (H * 0.225); //Manually increased baseline to match spice placement.
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

// Utility to draw a small red square at a specific coordinate for debugging alignment
function drawDebugSquare(doc, x, y, color = [255, 0, 0]) {
    const oldDraw = doc.getDrawColor();
    const oldFill = doc.getFillColor();
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(x - 1, y - 1, 2, 2, 'F');
    doc.setDrawColor(oldDraw);
    doc.setFillColor(oldFill);
}

// Utility to generate path segments for an LTSpice ARC (defined by bounding box + start/end coordinates)
function drawPdfArc(doc, x1, y1, x2, y2, xs, ys, xe, ye, transformer = null) {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const rx = Math.abs(x2 - x1) / 2;
    const ry = Math.abs(y2 - y1) / 2;
    if (rx === 0 || ry === 0) return;

    // Angles for the start and end coordinates relative to the ellipse center
    let sa = Math.atan2(ys - cy, xs - cx);
    let ea = Math.atan2(ye - cy, xe - cx);

    // LTSpice (via Windows GDI) draws arcs visually Counter-Clockwise from start to end.
    // Because Y increases downwards on screen, a visually CCW rotation corresponds to a decreasing mathematical angle.
    let sweep = ea - sa;
    if (sweep > 0) sweep -= 2 * Math.PI;

    const segments = 32;
    const step = sweep / segments;
    const pts = [];
    for (let i = 0; i <= segments; i++) {
        const a = sa + i * step;
        let px = cx + rx * Math.cos(a);
        let py = cy + ry * Math.sin(a);
        if (transformer) {
            const tr = transformer(px, py);
            px = tr.x;
            py = tr.y;
        }
        pts.push({ x: px, y: py });
    }

    const lines = [];
    const startObj = pts[0];
    for (let i = 1; i < pts.length; i++) {
        lines.push([pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y]);
    }
    doc.lines(lines, startObj.x, startObj.y, [1, 1], 'S', false);
}


// Main Library export
async function convertSceneToPdf(scene, assets, filename = 'Schematic', options = {}) {
    const optCanvasBasedOnRect = options.canvasBasedOnRectangle || false;

    // Analyze ASY elements if needed (supplying assets to skip fetched SVGs)
    if (typeof analyzeSceneSymbols === 'function') {
        await analyzeSceneSymbols(scene, assets);
    }

    // 1. Calculate Bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const expand = (x, y) => {
        if (isNaN(x) || isNaN(y)) return;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    };

    let largestRectIndex = -1;
    if (optCanvasBasedOnRect && scene.rectangles && scene.rectangles.length > 0) {
        let maxArea = -1;
        for (let i = 0; i < scene.rectangles.length; i++) {
            const r = scene.rectangles[i];
            if (isNaN(r.x1) || isNaN(r.y1) || isNaN(r.x2) || isNaN(r.y2)) continue;
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
        format: [width, height],
        putOnlyUsedFonts: false // Disable subsetting where possible to ensure full font embedding
    });
    doc.setProperties({ title: filename });

    // 3. Register Font (if passed through assets)
    if (assets.fontBase64) {
        // Embed the full font name and match PostScript Name to ensure Illustrator compatibility
        // Using "LMRoman10-Regular" to match the system's font metadata requirements
        doc.addFileToVFS('lmroman10.ttf', assets.fontBase64);
        doc.addFont('lmroman10.ttf', 'LMRoman10-Regular', 'normal');
        doc.setFont('LMRoman10-Regular', 'normal'); // Required second parameter
    }

    // Set line width defaults
    doc.setLineWidth(2);
    doc.setDrawColor(0, 0, 0); // Black (was LTSpice Blue)
    doc.setLineCap(1);         // Round cap
    doc.setLineJoin(1);        // Round join

    // 4. Draw Geometries
    for (let i = 0; i < scene.rectangles.length; i++) {
        // Only skip the bounding rectangle if we are explicitly using it as the canvas
        if (optCanvasBasedOnRect && i === largestRectIndex) continue;
        const r = scene.rectangles[i];
        applyPdfLineStyle(doc, r.style);

        const rx = Math.min(r.x1, r.x2) - minX;
        const ry = Math.min(r.y1, r.y2) - minY;
        const rw = Math.abs(r.x2 - r.x1);
        const rh = Math.abs(r.y2 - r.y1);

        if (isNaN(rx) || isNaN(ry) || isNaN(rw) || isNaN(rh)) {
            console.error('[PDF_RENDERER] Invalid rect geometry detected:', r, { rx, ry, rw, rh, minX, minY });
            continue;
        }

        doc.rect(rx, ry, rw, rh, 'S');
    }

    for (const l of scene.lines) {
        if (isNaN(l.x1) || isNaN(l.y1) || isNaN(l.x2) || isNaN(l.y2)) continue;
        applyPdfLineStyle(doc, l.style);
        doc.line(l.x1 - minX, l.y1 - minY, l.x2 - minX, l.y2 - minY);
    }

    for (const c of scene.circles) {
        if (isNaN(c.x1) || isNaN(c.y1) || isNaN(c.x2) || isNaN(c.y2)) continue;
        applyPdfLineStyle(doc, c.style);
        const cx = (c.x1 + c.x2) / 2 - minX;
        const cy = (c.y1 + c.y2) / 2 - minY;
        const rRadius = Math.abs(c.x2 - c.x1) / 2;
        doc.ellipse(cx, cy, rRadius, rRadius, 'S');
    }

    for (const a of scene.arcs) {
        if (isNaN(a.x1) || isNaN(a.y1) || isNaN(a.x2) || isNaN(a.y2)) continue;
        applyPdfLineStyle(doc, a.style);
        drawPdfArc(doc, a.x1, a.y1, a.x2, a.y2, a.xs, a.ys, a.xe, a.ye, (px, py) => {
            return { x: px - minX, y: py - minY };
        });
    }

    // 4.5 Draw Wires and Intersections
    doc.setLineDashPattern([], 0); // Reset dash style
    doc.setLineWidth(1.5);
    doc.setDrawColor(0, 0, 0); // Black (was #000080)

    const wirePointsCount = new Map();

    for (const w of scene.wires) {
        if (isNaN(w.x1) || isNaN(w.y1) || isNaN(w.x2) || isNaN(w.y2)) continue;
        doc.line(w.x1 - minX, w.y1 - minY, w.x2 - minX, w.y2 - minY);
        
        const p1 = `${w.x1},${w.y1}`;
        const p2 = `${w.x2},${w.y2}`;
        wirePointsCount.set(p1, (wirePointsCount.get(p1) || 0) + 1);
        wirePointsCount.set(p2, (wirePointsCount.get(p2) || 0) + 1);
    }

    // Draw an intersection dot for any coordinate shared by >= 3 wire endpoints
    if (assets.svgStrings && assets.svgStrings.has('intersection')) {
        const intersectionSvg = assets.svgStrings.get('intersection');
        for (const [key, count] of wirePointsCount.entries()) {
            if (count >= 3) {
                const [xStr, yStr] = key.split(',');
                const x = parseFloat(xStr);
                const y = parseFloat(yStr);
                drawSvgToPdf(doc, intersectionSvg, x, y, 'R0', minX, minY);
            }
        }
    } else {
        // Fallback natively drawn square if the SVG is explicitly missing
        doc.setFillColor(0, 0, 0);
        for (const [key, count] of wirePointsCount.entries()) {
            if (count >= 3) {
                const [xStr, yStr] = key.split(',');
                const x = parseFloat(xStr) - minX;
                const y = parseFloat(yStr) - minY;
                // 8pt diameter -> radius 4pt
                doc.ellipse(x, y, 4, 4, 'F');
            }
        }
    }

    // 5. Draw Symbols & SVGs
    doc.setLineDashPattern([], 0); // Reset dash style
    for (const sym of scene.symbols) {
        doc.setLineDashPattern([], 0); // Reset for each symbol to prevent state leakage
        const basename = sym.type.split('\\').pop().split('/').pop();

        // Build the ASY-space → PDF-space transform for this symbol.
        // Used for both ASY-fallback body drawing AND pin label rendering.
        const symIsMirrored = sym.orientation.startsWith('M');
        const symRotPart = symIsMirrored ? 'R' + sym.orientation.slice(1) : sym.orientation;
        let symAngleRad = 0;
        if (symRotPart === 'R90') symAngleRad = Math.PI / 2;
        else if (symRotPart === 'R180') symAngleRad = Math.PI;
        else if (symRotPart === 'R270') symAngleRad = -Math.PI / 2;
        const symBaseTx = sym.x - minX;
        const symBaseTy = sym.y - minY;
        const transformAsyPoint = (px, py) => {
            const cosA = Math.cos(symAngleRad), sinA = Math.sin(symAngleRad);
            let rx = px * cosA - py * sinA;
            let ry = px * sinA + py * cosA;
            if (symIsMirrored) rx = -rx;
            return { x: symBaseTx + rx, y: symBaseTy + ry };
        };

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


            for (const r of g.rectangles) {
                applyPdfLineStyle(doc, r.style);
                const p1 = transformAsyPoint(r.x1, r.y1);
                const p2 = transformAsyPoint(r.x2, r.y1);
                const p3 = transformAsyPoint(r.x2, r.y2);
                const p4 = transformAsyPoint(r.x1, r.y2);
                doc.lines([[p2.x - p1.x, p2.y - p1.y], [p3.x - p2.x, p3.y - p2.y], [p4.x - p3.x, p4.y - p3.y], [p1.x - p4.x, p1.y - p4.y]], p1.x, p1.y, [1, 1]);
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
            for (const a of g.arcs) {
                applyPdfLineStyle(doc, a.style);
                drawPdfArc(doc, a.x1, a.y1, a.x2, a.y2, a.xs, a.ys, a.xe, a.ye, transformAsyPoint);
            }
            for (const t of g.texts) {
                doc.setTextColor(0, 0, 0);
                const FONT_SIZE_MAP = { 0: 8, 1: 13, 2: 20, 3: 26, 4: 32, 5: 46, 6: 65, 7: 92 };
                const ptSize = FONT_SIZE_MAP[t.fontSize] || 8;
                const finalAlign = transformAlignment(t.align, sym.orientation);
                const p = transformAsyPoint(t.x, t.y);
                if (options.showTextAnchors) drawDebugSquare(doc, p.x, p.y);
                drawLTSpiceText(doc, t.content, p.x, p.y, finalAlign, ptSize);
            }


        }

        // ── PIN Labels (always rendered, regardless of SVG or ASY body) ──────
        if (sym.asyData && sym.asyData.graphics && sym.asyData.graphics.pins) {
            for (const pin of sym.asyData.graphics.pins) {
                if (!pin.attrs.PinName) continue;
                if (pin.align.toUpperCase() === 'NONE') continue;

                doc.setTextColor(0, 0, 0);
                const PIN_PT_SIZE = 19.5; // size 1.5 → 1.5 * 13pt

                // Convert pin wire-direction alignment → general text alignment + offset direction
                const { textAlign, dx, dy } = pinAlignmentToTextAlignment(pin.align);

                // Apply component orientation to both the pin position and the text alignment
                const p = transformAsyPoint(pin.x, pin.y);
                const finalAlign = transformAlignment(textAlign, sym.orientation);

                // dx/dy are in local (ASY) space — rotate them through the component orientation.
                const offsetVec = transformOffset(dx * pin.offset * 3, dy * pin.offset * 3, sym.orientation);
                const tx = p.x + offsetVec.x;
                const ty = p.y + offsetVec.y;

                if (options.showTextAnchors) drawDebugSquare(doc, tx, ty);
                drawLTSpiceText(doc, pin.attrs.PinName, tx, ty, finalAlign, PIN_PT_SIZE);
            }
        }

        // ── Window (text label) Resolution ─────────────────────────────────
        //
        // Priority rules (per the ASC format spec):
        //
        //   WHAT to render:    Determined by the ASY file. Every WINDOW index
        //                      declared in the .asy is a candidate, plus any
        //                      extra indexes added explicitly in the .asc.
        //
        //   WHERE to render:   Three-layer priority stack:
        //
        //     If "Override Text Anchors" (overrideAnchors) is ON and the
        //     component has an entry in component_defaults.js:
        //       → Use ONLY the component_defaults.js coordinates. ASY and
        //         ASC coordinates are ignored for that component.
        //
        //     Otherwise (normal mode):
        //       Layer 1 (lowest priority): ASY file WINDOW coordinates
        //       Layer 2 (mid priority):    ASC file explicit WINDOW lines
        //       (component_defaults.js is NOT used in normal mode)
        //
        // An index is only rendered if it has a non-empty text value to show.

        // --- Step 1 & 2: Resolve which windows to render and where ---
        //
        // A window is ONLY rendered if its position is explicitly defined in one of:
        //   - The ASY file's WINDOW declarations
        //   - The ASC file's explicit WINDOW lines
        //   - component_defaults.js (override mode only)
        //
        // Merely having a SYMATTR (e.g. InstName) is NOT sufficient — the component
        // must also declare a WINDOW position for that index.

        const effectiveWindows = new Map();
        const table = COMPONENT_DEFAULTS[basename];
        const useOverride = options.overrideAnchors && !!table;

        if (useOverride) {
            // Override mode: component_defaults.js is the COMPLETE contract.
            // Only indexes explicitly listed there will be rendered.
            // Intentionally omitting an index (e.g. 0/InstName) suppresses it.
            const exactKey = sym.orientation;
            const rotEquiv = sym.orientation.startsWith('M')
                ? 'R' + sym.orientation.slice(1)
                : sym.orientation;
            const defaults = table[exactKey] || table[rotEquiv] || table['R0'];
            if (defaults) {
                for (const [idxStr, def] of Object.entries(defaults)) {
                    const idx = parseInt(idxStr);
                    let isHidden = false;
                    
                    const asyWin = sym.asyData?.windows?.[idx];
                    if (asyWin && asyWin.isHidden) isHidden = true;
                    
                    const ascWin = sym.windows.find(w => w.index === idx);
                    if (ascWin) isHidden = ascWin.isHidden;

                    effectiveWindows.set(idx, { ox: def.ox, oy: def.oy, align: def.align, fontSize: 2, isHidden: isHidden });
                }
            }
        } else {
            // Normal mode: position-driven. Only windows with an explicitly defined
            // position are added. No implicit defaults or (0,0) placeholders.
            
            // Layer 1: ASY WINDOW positions (base)
            if (sym.asyData && sym.asyData.windows) {
                for (const [idxStr, asyWin] of Object.entries(sym.asyData.windows)) {
                    const idx = parseInt(idxStr);
                    effectiveWindows.set(idx, { ox: asyWin.ox, oy: asyWin.oy, align: asyWin.align, fontSize: asyWin.fontSize, isHidden: asyWin.isHidden });
                }
            }
            // Layer 2: ASC explicit WINDOW lines override ASY positions (or add new ones)
            for (const win of sym.windows) {
                effectiveWindows.set(win.index, { ox: win.offsetX, oy: win.offsetY, align: win.alignment, fontSize: win.fontSize, isHidden: win.isHidden });
            }
        }

        // --- Step 3: Inductor special-case alignment override ---
        if (sym.type === 'ind' && ['R0', 'R180', 'M0', 'M180'].includes(sym.orientation)) {
            if (effectiveWindows.has(0)) effectiveWindows.get(0).align = 'Right';
            if (effectiveWindows.has(3)) effectiveWindows.get(3).align = 'Right';
        }

        // --- Step 4: Render each window that has a non-empty text value ---
        for (const [idx, win] of effectiveWindows.entries()) {
            if (win.isHidden) continue; // Skip permanently hidden windows
            const text = getWindowText(sym, idx);
            if (!text) continue; // Skip indexes with no value to display

            const FONT_SIZE_MAP = { 0: 8, 1: 13, 2: 20, 3: 26, 4: 32, 5: 46, 6: 65, 7: 92 };
            const ptSize = FONT_SIZE_MAP[win.fontSize] || 13;

            const rotated = transformOffset(win.ox, win.oy, sym.orientation);
            const wx = sym.x + rotated.x - minX;
            const wy = sym.y + rotated.y - minY;
            const finalAlign = transformAlignment(win.align, sym.orientation);

            if (options.showTextAnchors) {
                drawDebugSquare(doc, wx, wy);
            }
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

        if (options.showTextAnchors) {
            drawDebugSquare(doc, tx, ty);
        }

        drawLTSpiceText(doc, t.content, tx, ty, t.alignment, ptSize);
    }

    // 7. Draw Flags
    doc.setDrawColor(0, 0, 0);
    for (const flag of scene.flags) {
        const isGround = flag.name === '0';
        const type = isGround ? 'GND' : 'flag';
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
                doc.setTextColor(0, 0, 0); // Black
                doc.setFontSize(20); // Size 2 default mapping

                let align = 'Top';
                let ox = 0, oy = 0;
                if (dir === 'top') { align = 'Top'; oy = 8; }
                else if (dir === 'bottom') { align = 'Bottom'; oy = -8; }
                else if (dir === 'left') { align = 'Left'; ox = 8; }
                else if (dir === 'right') { align = 'Right'; ox = -8; }

                const finalX = flag.x - minX + ox;
                const finalY = flag.y - minY + oy;

                if (options.showTextAnchors) drawDebugSquare(doc, finalX, finalY);
                drawLTSpiceText(doc, flag.name, finalX, finalY, align, 20);
            }
        } else {
            // Native fallback for ASY/None skin
            const fx = flag.x - minX;
            const fy = flag.y - minY;
            doc.setLineWidth(1.5);

            if (isGround) {
                let fOr = 'R0';
                if (dir === 'right') fOr = 'R90';
                else if (dir === 'bottom') fOr = 'R180';
                else if (dir === 'left') fOr = 'R270';

                // LTSpice GND.asy exact coordinates
                const gndLines = [
                    [-16, 16, 16, 16],
                    [-16, 16, 0, 32],
                    [16, 16, 0, 32],
                    [0, 0, 0, 16]
                ];

                for (const l of gndLines) {
                    const pt1 = transformOffset(l[0], l[1], fOr);
                    const pt2 = transformOffset(l[2], l[3], fOr);
                    doc.line(fx + pt1.x, fy + pt1.y, fx + pt2.x, fy + pt2.y);
                }
            } else {
                // Draw named node native fallback (small cirsle + text)
                doc.setFillColor(255, 255, 255);
                doc.setDrawColor(0, 0, 0);
                doc.ellipse(fx, fy, 4, 4, 'FD');

                doc.setTextColor(0, 0, 0);
                doc.setFontSize(20); // Size 2 default mapping

                let align = 'Top';
                let ox = 0, oy = 0;
                if (dir === 'top') { align = 'Top'; oy = 8; }
                else if (dir === 'bottom') { align = 'Bottom'; oy = -8; }
                else if (dir === 'left') { align = 'Left'; ox = 8; }
                else if (dir === 'right') { align = 'Right'; ox = -8; }

                if (options.showTextAnchors) drawDebugSquare(doc, fx + ox, fy + oy);
                drawLTSpiceText(doc, flag.name, fx + ox, fy + oy, align, 13);
            }
        }
    }

    // 8. Build output byte array
    return doc.output('arraybuffer');
}

window.LTSpiceEngine = {
    parse: typeof parseAsc !== 'undefined' ? parseAsc : null,
    render: convertSceneToPdf,
    defaults: typeof COMPONENT_DEFAULTS !== 'undefined' ? COMPONENT_DEFAULTS : {}
};
