// analyzer.js
// Fetches and parses .asy files to extract default WINDOW positions and SYMATTR values
// for special/custom components.

async function fetchAsy(componentPath) {
    // We map this to "Assets/Component Symbols/[cleanedPath].asy"
    const cleanedPath = componentPath.replace(/\\/g, '/');
    const url = `Assets/Component Symbols/${cleanedPath}.asy?t=${Date.now()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        return await response.text();
    } catch (e) {
        return null;
    }
}

function parseAsy(asyText) {
    // Split on all three common line ending conventions:
    //   \r\n  Windows
    //   \r    old Mac OS 9 (bare CR, no LF) — critical for LTSpice .asy files from older exports
    //   \n    Unix
    const lines = asyText.split(/\r\n|\r|\n/);
    const asyData = {
        windows: {},
        attrs: {},
        graphics: {
            lines: [],
            rectangles: [],
            circles: [],
            arcs: [],
            texts: [],
            pins: []
        }
    };

    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length === 0 || !parts[0]) continue;

        const type = parts[0];

        if (type === 'WINDOW') {
            if (parts.length >= 6) {
                const index = parseInt(parts[1]);
                asyData.windows[index] = {
                    ox: parseFloat(parts[2]),
                    oy: parseFloat(parts[3]),
                    align: parts[4],
                    fontSize: parseInt(parts[5]),
                    isHidden: parts[4] === 'Invisible' || (parts.length >= 7 && parts[6] === '0')
                };
            }
        } else if (type === 'SYMATTR') {
            if (parts.length >= 3) {
                const attrName = parts[1];
                const attrValue = line.substring(line.indexOf(attrName) + attrName.length).trim();
                asyData.attrs[attrName] = attrValue;
            }
        } else if (type === 'LINE' || type === 'RECTANGLE' || type === 'CIRCLE') {
            if (parts.length >= 6 && parts[1] === 'Normal') {
                const shape = {
                    x1: parseFloat(parts[2]),
                    y1: parseFloat(parts[3]),
                    x2: parseFloat(parts[4]),
                    y2: parseFloat(parts[5]),
                    style: parts[6] || null
                };
                if (type === 'LINE') asyData.graphics.lines.push(shape);
                else if (type === 'RECTANGLE') asyData.graphics.rectangles.push(shape);
                else if (type === 'CIRCLE') asyData.graphics.circles.push(shape);
            }
        } else if (type === 'ARC') {
            if (parts.length >= 10 && parts[1] === 'Normal') {
                asyData.graphics.arcs.push({
                    x1: parseFloat(parts[2]),
                    y1: parseFloat(parts[3]),
                    x2: parseFloat(parts[4]),
                    y2: parseFloat(parts[5]),
                    xs: parseFloat(parts[6]),
                    ys: parseFloat(parts[7]),
                    xe: parseFloat(parts[8]),
                    ye: parseFloat(parts[9]),
                    style: parts[10] || null
                });
            }
        } else if (type === 'TEXT') {
            if (parts.length >= 5) {
                const align = parts[3];
                const fontSize = parseFloat(parts[4]);
                
                // Skip the first 5 elements (type, x, y, align, fontSize) 
                // to extract the true text content, avoiding `indexOf` collisions with coordinates
                const match = line.match(/^\s*\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(.*)$/);
                const content = match ? match[1].trim() : '';

                asyData.graphics.texts.push({
                    x: parseFloat(parts[1]),
                    y: parseFloat(parts[2]),
                    align: align,
                    fontSize: fontSize,
                    content: content
                });
            }
        } else if (type === 'PIN') {
            if (parts.length >= 5) {
                asyData.graphics.pins.push({
                    x: parseFloat(parts[1]),
                    y: parseFloat(parts[2]),
                    align: parts[3],
                    offset: parseFloat(parts[4]),
                    attrs: {}
                });
            }
        } else if (type === 'PINATTR') {
            if (parts.length >= 3 && asyData.graphics.pins.length > 0) {
                const attrName = parts[1];
                const attrValue = line.substring(line.indexOf(attrName) + attrName.length).trim();
                const lastPin = asyData.graphics.pins[asyData.graphics.pins.length - 1];
                lastPin.attrs[attrName] = attrValue;
            }
        }
    }

    return asyData;
}

async function analyzeSceneSymbols(scene, assets = null) {
    const promises = scene.symbols.map(async (sym) => {
        // ALWAYS fetch the ASY file for every symbol.
        // The ASY file is the canonical source of truth for which WINDOW indexes
        // exist (0, 3, 39, 40, 123), so we must always read it regardless of
        // whether an SVG skin is selected. The renderer uses asyData.windows to
        // determine which attribute labels to draw.
        const asyText = await fetchAsy(sym.type);
        if (asyText) {
            sym.asyData = parseAsy(asyText);
        }
    });

    await Promise.all(promises);
}
