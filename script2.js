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

const opts = files.map(f => '                    <option value="' + f + '">' + f + '</option>').join('\n');

let html = fs.readFileSync('dev_window_tuner.html', 'utf8');

// Replace everything inside the <select id="comp-select"> tag
html = html.replace(/<select id="comp-select"[^>]*>[\s\S]*?<\/select>/, '<select id="comp-select" style="margin-top:4px; width:160px;">\n' + opts + '\n                </select>');

fs.writeFileSync('dev_window_tuner.html', html);
console.log('Updated dev_window_tuner.html');
