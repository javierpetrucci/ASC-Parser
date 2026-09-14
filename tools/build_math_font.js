// tools/build_math_font.js
//
// Regenerates Assets/Fonts/lmmath-subset.ttf, the font that supplies the glyphs
// the schematic font genuinely lacks — every lowercase Greek letter, plus the
// relations and big operators.
//
// This is NOT part of the build. Run it once, by hand, and commit the result:
//
//     node tools/build_math_font.js [path/to/latinmodern-math.otf]
//
// The glyph list is read straight out of engine/latex_text.js, so the font can
// never fall out of step with the symbol table. Needs Python with fonttools.
//
// Source font: Latin Modern Math, GUST Font License (permissive: modification
// and redistribution allowed). See Assets/Fonts/README.md.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'Assets', 'Fonts', 'lmmath-subset.ttf');

// Where TeX Live and MiKTeX keep it, newest first.
const CANDIDATES = [
    'C:/texlive/2025/texmf-dist/fonts/opentype/public/lm-math/latinmodern-math.otf',
    'C:/texlive/2024/texmf-dist/fonts/opentype/public/lm-math/latinmodern-math.otf',
    '/usr/share/texmf/fonts/opentype/public/lm-math/latinmodern-math.otf',
    '/usr/local/texlive/2025/texmf-dist/fonts/opentype/public/lm-math/latinmodern-math.otf',
];

function findSource() {
    if (process.argv[2]) {
        if (!fs.existsSync(process.argv[2])) {
            console.error(`No existe: ${process.argv[2]}`);
            process.exit(1);
        }
        return process.argv[2];
    }
    for (const c of CANDIDATES) if (fs.existsSync(c)) return c;
    console.error('No encontré latinmodern-math.otf. Pasá la ruta como argumento.');
    console.error('Viene con TeX Live y MiKTeX, en fonts/opentype/public/lm-math/.');
    process.exit(1);
}

// Reads LATEX_SYMBOLS out of the engine without a bundler: the file is a plain
// script whose top-level consts are not exported, so it is evaluated in a vm and
// the binding pulled out by name — the same trick test/helpers/load-engine.js
// uses.
function readEngine() {
    const src = fs.readFileSync(path.join(ROOT, 'engine', 'latex_text.js'), 'utf8');
    const sandbox = { console };
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox, { filename: 'latex_text.js' });
    return {
        symbols: vm.runInContext('LATEX_SYMBOLS', sandbox),
        letters: vm.runInContext('mathItalicLetters()', sandbox),
    };
}

function main() {
    const source = findSource();
    const { symbols, letters } = readEngine();

    // The space is not a symbol anyone writes, but jsPDF encodes a whole string
    // against one font and stops dead at the first codepoint the font does not
    // cover. Without U+0020 any math run containing a space is truncated.
    const spec = [{ cmd: 'space', src: 0x20, dst: 0x20 }];
    for (const [cmd, def] of Object.entries(symbols)) {
        if (def.font !== 'math') continue; // the text font already has it
        spec.push({ cmd, src: def.src !== undefined ? def.src : def.cp, dst: def.cp });
    }
    // The Latin alphabet in math italic, remapped onto plain ASCII. A letter in
    // maths is a variable, so "$g_{m1}$" has to come out slanted.
    spec.push(...letters);
    if (spec.length === 0) {
        console.error('La tabla de símbolos no pide ningún glifo de la fuente matemática.');
        process.exit(1);
    }

    const specFile = path.join(os.tmpdir(), `lmmath-spec-${process.pid}.json`);
    fs.writeFileSync(specFile, JSON.stringify(spec), 'utf8');

    console.log(`origen : ${source}`);
    console.log(`glifos : ${spec.length}`);

    const py = spawnSync('python', [path.join(__dirname, 'build_math_font.py'), specFile, source, OUT],
        { stdio: 'inherit' });
    fs.unlinkSync(specFile);

    if (py.error) {
        console.error('No pude ejecutar python:', py.error.message);
        process.exit(1);
    }
    if (py.status !== 0) process.exit(py.status);

    const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
    console.log(`destino: ${path.relative(ROOT, OUT)}  (${kb} kB)`);
    console.log('Commiteá el .ttf — no se regenera durante el build.');
}

main();
