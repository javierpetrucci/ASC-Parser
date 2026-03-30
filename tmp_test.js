const fs = require('fs');

const parserText = fs.readFileSync('engine/parser.js', 'utf8');
const analyzerText = fs.readFileSync('engine/analyzer.js', 'utf8');

eval(parserText);
global.fetch = async (url) => {
    try {
        const content = fs.readFileSync(url, 'utf8');
        return { ok: true, text: async () => content };
    } catch(e) {
        return { ok: false };
    }
};
eval(analyzerText);

async function runTest() {
    const ascContent = `Version 4.1
SHEET 1 1476 852
SYMBOL TCLib\\\\pot 336 496 R0
SYMATTR InstName U1
SYMBOL TCLib\\\\Vcc 512 512 R0
SYMATTR InstName U2`;

    const scene = parseAsc(ascContent);
    await analyzeSceneSymbols(scene);
    
    for (const sym of scene.symbols) {
        console.log('Symbol:', sym.type);
        if (sym.asyData) {
            console.log('  Windows in ASY:', Object.keys(sym.asyData.windows));
            console.log('  Texts in ASY:', sym.asyData.graphics.texts);
            console.log('  Lines in ASY:', sym.asyData.graphics.lines.length);
        } else {
            console.log('  No ASY data loaded!');
        }
    }
}
runTest();
