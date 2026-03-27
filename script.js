const fs = require('fs');
const path = require('path');
const dir = 'Assets/Component Symbols';
const files = [];
const walk = (d) => {
    fs.readdirSync(d).forEach(f => {
        const p = path.join(d, f);
        if (fs.statSync(p).isDirectory()) {
            walk(p);
        } else if (p.endsWith('.asy')) {
            const rel = p.substring(dir.length + 1).replace('.asy', '').replace(/\\/g, '/');
            files.push(rel);
        }
    });
};
walk(dir);
files.sort();
fs.writeFileSync('options.txt', files.map(f => `<option value="${f}">${f}</option>`).join('\n'));
