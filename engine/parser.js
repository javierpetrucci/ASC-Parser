function parseAsc(text) {
    const lines = text.split(/\r?\n/);
    const scene = {
        wires: [],
        symbols: [],
        texts: [],
        flags: [],
        rectangles: [],
        lines: [],
        circles: [],
        arcs: []
    };

    let currentSymbol = null;

    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length === 0 || !parts[0]) continue;

        const type = parts[0];

        if (type === 'WIRE') {
            currentSymbol = null; // reset
            if (parts.length >= 5) {
                scene.wires.push({
                    x1: parseFloat(parts[1]),
                    y1: parseFloat(parts[2]),
                    x2: parseFloat(parts[3]),
                    y2: parseFloat(parts[4])
                });
            }
        } else if (type === 'SYMBOL') {
            // The component type can contain escaped spaces (`\ `), so we cannot
            // simply split by whitespace. We scan the raw line character-by-character
            // to extract the full type token, then parse the remaining fields.
            const rawLine = line.trim();
            const matchSymbol = rawLine.match(/^SYMBOL\s+/i);
            if (matchSymbol) {
                let rest = rawLine.slice(matchSymbol[0].length);
                // Extract type, treating `\ ` as an escaped space within the token
                let symType = '';
                let i = 0;
                while (i < rest.length) {
                    if (rest[i] === '\\' && i + 1 < rest.length && rest[i + 1] === ' ') {
                        symType += ' '; // unescape `\ ` to a real space
                        i += 2;
                    } else if (rest[i] === ' ') {
                        break; // real word boundary
                    } else {
                        symType += rest[i];
                        i++;
                    }
                }
                const remaining = rest.slice(i).trim().split(/\s+/);
                if (remaining.length >= 3) {
                    currentSymbol = {
                        type: symType,
                        x: parseFloat(remaining[0]),
                        y: parseFloat(remaining[1]),
                        orientation: remaining[2],
                        windows: [],
                        attrs: {}
                    };
                    scene.symbols.push(currentSymbol);
                }
            }
        } else if (type === 'WINDOW') {
            if (currentSymbol && parts.length >= 6) {
                currentSymbol.windows.push({
                    index: parseInt(parts[1]),
                    offsetX: parseFloat(parts[2]),
                    offsetY: parseFloat(parts[3]),
                    alignment: parts[4],
                    fontSize: parseInt(parts[5])
                });
            }
        } else if (type === 'SYMATTR') {
            if (currentSymbol && parts.length >= 3) {
                const attrName = parts[1];
                const attrValue = line.substring(line.indexOf(attrName) + attrName.length).trim();
                currentSymbol.attrs[attrName] = attrValue;
            }
        } else if (type === 'FLAG') {
            currentSymbol = null;
            if (parts.length >= 4) {
                scene.flags.push({
                    x: parseFloat(parts[1]),
                    y: parseFloat(parts[2]),
                    name: parts[3]
                });
            }
        } else if (type === 'TEXT') {
            currentSymbol = null;
            if (parts.length >= 6) {
                const x = parseFloat(parts[1]);
                const y = parseFloat(parts[2]);
                const alignment = parts[3];
                const fontSize = parseInt(parts[4]);
                const contentIndex = line.indexOf(';');
                const content = (contentIndex !== -1) ? line.substring(contentIndex + 1) : '';
                scene.texts.push({ x, y, alignment, fontSize, content });
            }
        } else if (type === 'RECTANGLE') {
            currentSymbol = null;
            if (parts.length >= 6) {
                scene.rectangles.push({
                    x1: parseFloat(parts[2]),
                    y1: parseFloat(parts[3]),
                    x2: parseFloat(parts[4]),
                    y2: parseFloat(parts[5]),
                    style: parts[6] || 'Solid'
                });
            }
        } else if (type === 'LINE') {
            currentSymbol = null;
            if (parts.length >= 6) {
                scene.lines.push({
                    x1: parseFloat(parts[2]),
                    y1: parseFloat(parts[3]),
                    x2: parseFloat(parts[4]),
                    y2: parseFloat(parts[5]),
                    style: parts[6] || 'Solid'
                });
            }
        } else if (type === 'CIRCLE') {
            currentSymbol = null;
            if (parts.length >= 6) {
                scene.circles.push({
                    x1: parseFloat(parts[2]),
                    y1: parseFloat(parts[3]),
                    x2: parseFloat(parts[4]),
                    y2: parseFloat(parts[5]),
                    style: parts[6] || 'Solid'
                });
            }
        } else if (type === 'ARC') {
            currentSymbol = null;
            if (parts.length >= 10) {
                scene.arcs.push({
                    x1: parseFloat(parts[2]),
                    y1: parseFloat(parts[3]),
                    x2: parseFloat(parts[4]),
                    y2: parseFloat(parts[5]),
                    xs: parseFloat(parts[6]),
                    ys: parseFloat(parts[7]),
                    xe: parseFloat(parts[8]),
                    ye: parseFloat(parts[9]),
                    style: parts[10] || 'Solid'
                });
            }
        }
    }

    return scene;
}
