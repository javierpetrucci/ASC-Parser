const fs = require('fs');

global.window = {};
global.document = {
    createElement: () => ({}),
    body: { appendChild: () => {}, removeChild: () => {} }
};

window.jspdf = {
    jsPDF: function() {
        this.setProperties = () => {};
        this.addFileToVFS = () => {};
        this.addFont = () => {};
        this.setFont = () => {};
        this.setLineWidth = () => {};
        this.setDrawColor = () => {};
        this.setFillColor = () => {};
        this.setLineCap = () => {};
        this.setLineJoin = () => {};
        this.setLineDashPattern = () => {};
        this.rect = () => {};
        this.line = () => {};
        this.ellipse = () => {};
        this.setTextColor = () => {};
        this.setFontSize = (size) => { this.currentFontSize = size; };
        this.getTextWidth = (txt) => txt.length * 5;
        this.lines = () => {};
        this.text = (txt, x, y, opts) => {
            console.log(`doc.text called -> text: "${txt}"`);
        };
        this.output = () => new ArrayBuffer(0);
    }
};

const parserText = fs.readFileSync('c:\\_DATA\\Desktop\\ASC Parser\\engine\\parser.js', 'utf8');
const analyzerText = fs.readFileSync('c:\\_DATA\\Desktop\\ASC Parser\\engine\\analyzer.js', 'utf8');
const defaultsText = fs.readFileSync('c:\\_DATA\\Desktop\\ASC Parser\\engine\\component_defaults.js', 'utf8');
const rendererText = fs.readFileSync('c:\\_DATA\\Desktop\\ASC Parser\\engine\\pdf_renderer.js', 'utf8');

eval(parserText);
global.fetch = async (url) => {
    try {
        const content = fs.readFileSync('c:\\_DATA\\Desktop\\ASC Parser\\' + url, 'utf8');
        return { ok: true, text: async () => content };
    } catch(e) {
        return { ok: false };
    }
};
eval(analyzerText);
eval(defaultsText);
eval(rendererText);

async function runTest() {
    const ascContent = `Version 4.1
SHEET 1 1476 852
SYMBOL TCLib\\\\pot 336 496 R0
SYMATTR InstName U1
SYMBOL TCLib\\\\Vcc 512 512 R0
SYMATTR InstName U2`;

    const scene = parseAsc(ascContent);
    const assets = { fontBase64: 'fake', svgStrings: new Map() };

    console.log("=== Options: Override = true ===");
    await window.LTSpiceEngine.render(scene, assets, 'test', {
        canvasBasedOnRectangle: false, showTextAnchors: false, overrideAnchors: true
    });

    console.log("=== Options: Override = false ===");
    await window.LTSpiceEngine.render(scene, assets, 'test', {
        canvasBasedOnRectangle: false, showTextAnchors: false, overrideAnchors: false
    });
}
runTest();
