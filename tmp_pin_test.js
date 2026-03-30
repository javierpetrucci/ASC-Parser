const fs = require('fs');
global.window = {}; global.document = { createElement: () => ({}), body: { appendChild: () => {}, removeChild: () => {} } };

let drawLog = '';
window.jspdf = { jsPDF: function() {
    this.setProperties = () => {}; this.addFileToVFS = () => {}; this.addFont = () => {}; this.setFont = () => {}; this.setLineWidth = () => {}; this.setDrawColor = () => {}; this.setFillColor = () => {}; this.setLineCap = () => {}; this.setLineJoin = () => {}; this.setLineDashPattern = () => {}; this.rect = () => {}; this.line = () => {}; this.ellipse = () => {}; this.setTextColor = () => {};
    this.setFontSize = (size) => { drawLog += `SIZE: ${size}\n`; };
    this.getTextWidth = (txt) => txt.length * 5; this.lines = () => {};
    this.text = (txt, x, y, opts) => {
        drawLog += `TEXT [${txt}] at (${Math.round(x)}, ${Math.round(y)}) align:${opts.align} angle:${opts.angle}\n`;
    };
    this.output = () => new ArrayBuffer(0);
}};

const parserText = fs.readFileSync('engine/parser.js', 'utf8');
const analyzerText = fs.readFileSync('engine/analyzer.js', 'utf8');
let defaultsText = fs.readFileSync('engine/component_defaults.js', 'utf8');
const rendererText = fs.readFileSync('engine/pdf_renderer.js', 'utf8');

eval(parserText);
global.fetch = async (url) => { return { ok: false }; }; // prevent fetching actual ASY files
eval(analyzerText);
eval(defaultsText);
eval(rendererText);

async function runTest() {
    const asyMock = `Version 4
SymbolType BLOCK
LINE Normal -159 48 -16 48 1
LINE Normal 208 96 368 96
RECTANGLE Normal 262 137 -16 -16
TEXT 113 137 Bottom 0 Small Text Inside
TEXT -16 -29 Left 2 Default Text LEFT Outside Rectangle
PIN -16 48 VRIGHT 8
PINATTR PinName In Pin
PINATTR SpiceOrder 1
PIN 208 96 RIGHT 8
PINATTR PinName RPin
PINATTR SpiceOrder 2
PIN 256 0 RIGHT 8
PINATTR PinName Pin Solo
PINATTR SpiceOrder 3`;

    const asyData = parseAsy(asyMock);
    
    // fake scene with 1 component giving it asyData directly
    const scene = {
        symbols: [{
            type: 'Test', x: 0, y: 0, orientation: 'R0',
            asyData: asyData,
            windows: [], attrs: {}
        }],
        wires: [], texts: [], flags: [], rectangles: [], circles: [], arcs: [], lines: []
    };
    
    // We will inject the pin rendering logic directly by modifying the renderer temporarily or just printing
    console.log("Pins parsed:", JSON.stringify(asyData.graphics.pins, null, 2));
}
runTest();
