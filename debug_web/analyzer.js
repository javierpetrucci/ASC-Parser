// analyzer.js
// Fetches and parses .asy files to extract default WINDOW positions and SYMATTR values
// for special/custom components.

async function fetchAsy(componentPath) {
    // Expected componentPath looks like "TCLib\Special\arrow_curve"
    // We map this to "/Assets/Component Symbols/TCLib/Special/arrow_curve.asy"
    const cleanedPath = componentPath.replace(/\\/g, '/');
    const url = `/Assets/Component Symbols/${cleanedPath}.asy`;

    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        return await response.text();
    } catch (e) {
        return null;
    }
}

function parseAsy(asyText) {
    const lines = asyText.split(/\r?\n/);
    const asyData = {
        windows: {},
        attrs: {},
        graphics: {
            lines: [],
            rectangles: [],
            circles: [],
            arcs: [],
            texts: []
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
                    fontSize: parseInt(parts[5])
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
                const headerLen = [type, parts[1], parts[2], align, parts[4]].join(' ').length;
                const content = line.substring(line.indexOf(parts[4]) + parts[4].length).trim();
                asyData.graphics.texts.push({
                    x: parseFloat(parts[1]),
                    y: parseFloat(parts[2]),
                    align: align,
                    fontSize: fontSize,
                    content: content
                });
            }
        }
    }

    return asyData;
}

async function analyzeSceneSymbols(scene) {
    const promises = scene.symbols.map(async (sym) => {
        // Only fetch .asy for components with a directory path (non-standard)
        if (sym.type.includes('\\') || sym.type.includes('/')) {
            const asyText = await fetchAsy(sym.type);
            if (asyText) {
                sym.asyData = parseAsy(asyText);
            }
        }
    });

    await Promise.all(promises);
}
