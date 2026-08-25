const test = require('node:test');
const assert = require('node:assert');
const { loadEngine } = require('./helpers/load-engine.js');

const { parseAsc, parseAsy, normalizeAttrValue } = loadEngine();

// Backslash built at runtime: literal backslashes do not survive every
// editing path reliably, and .asc files are full of them.
const BS = String.fromCharCode(92);

test('normalizeAttrValue turns LTSpice\'s empty-quote marker into an empty string', () => {
    assert.strictEqual(normalizeAttrValue('""'), '');
    assert.strictEqual(normalizeAttrValue('10k'), '10k');
    assert.strictEqual(normalizeAttrValue('"quoted"'), '"quoted"');
});

test('an explicitly cleared SYMATTR Value parses to empty, not the literal ""', () => {
    const scene = parseAsc([
        'Version 4.1',
        'SHEET 1 880 680',
        'SYMBOL res 176 112 R0',
        'SYMATTR InstName R1',
        'SYMATTR Value ""',
    ].join('\n'));

    assert.strictEqual(scene.symbols.length, 1);
    assert.strictEqual(scene.symbols[0].attrs.Value, '');
    // The key must still EXIST — that is how the renderer tells "user cleared it"
    // apart from "never set", which resolve differently.
    assert.ok('Value' in scene.symbols[0].attrs);
});

test('symbol types keep escaped spaces and doubled separators', () => {
    // Real .asc files store library paths with DOUBLED backslashes and escape a
    // space in the component name as "backslash space".
    const raw = 'SYMBOL TCLib' + BS + BS + 'Special' + BS + BS + '74HCU04' + BS + ' Not -144 432 R0';
    const scene = parseAsc(raw);

    assert.strictEqual(scene.symbols.length, 1);
    // The escaped space becomes a real space; the doubled separators are kept
    // verbatim (asyPathToUrlPath is what collapses them for the URL).
    assert.strictEqual(
        scene.symbols[0].type,
        'TCLib' + BS + BS + 'Special' + BS + BS + '74HCU04 Not'
    );
    assert.strictEqual(scene.symbols[0].orientation, 'R0');
    assert.strictEqual(scene.symbols[0].x, -144);
});

test('all three line-ending conventions parse identically', () => {
    const lines = ['Version 4.1', 'WIRE 0 0 10 0', 'SYMBOL res 16 16 R0', 'SYMATTR InstName R1'];
    const results = ['\r\n', '\r', '\n'].map(eol => parseAsc(lines.join(eol)));
    for (const scene of results) {
        assert.strictEqual(scene.wires.length, 1, 'wire count');
        assert.strictEqual(scene.symbols.length, 1, 'symbol count');
        assert.strictEqual(scene.symbols[0].attrs.InstName, 'R1');
    }
});

test('WINDOW hidden flags are recognised', () => {
    const scene = parseAsc([
        'SYMBOL res 0 0 R0',
        'WINDOW 0 3 56 Invisible 2',
        'WINDOW 3 27 56 VTop 2 0',
        'WINDOW 39 10 10 Left 2',
    ].join('\n'));

    const w = Object.fromEntries(scene.symbols[0].windows.map(x => [x.index, x]));
    assert.strictEqual(w[0].isHidden, true, 'Invisible alignment');
    assert.strictEqual(w[3].isHidden, true, 'trailing 0 flag');
    assert.strictEqual(w[39].isHidden, false, 'normal window');
});

test('TEXT content keeps semicolons that appear inside it', () => {
    const scene = parseAsc('TEXT -32 96 Left 2 ;.tran 0 1m 0; step v=1');
    assert.strictEqual(scene.texts.length, 1);
    assert.strictEqual(scene.texts[0].content, '.tran 0 1m 0; step v=1');
});

test('SYMATTR values containing the attribute name are not truncated', () => {
    const scene = parseAsc([
        'SYMBOL res 0 0 R0',
        'SYMATTR Value Value=10k',
    ].join('\n'));
    assert.strictEqual(scene.symbols[0].attrs.Value, 'Value=10k');
});

test('parseAsy reads windows, attrs and pins', () => {
    const asy = [
        'Version 4',
        'SymbolType CELL',
        'LINE Normal 0 0 10 10',
        'WINDOW 0 36 40 Left 2',
        'WINDOW 3 36 76 Invisible 2',
        'SYMATTR Value NPN',
        'PIN 0 0 NONE 8',
        'PINATTR PinName C',
    ].join('\n');
    const d = parseAsy(asy);

    assert.strictEqual(d.attrs.Value, 'NPN');
    assert.strictEqual(d.windows[0].align, 'Left');
    assert.strictEqual(d.windows[3].isHidden, true);
    assert.strictEqual(d.graphics.lines.length, 1);
    assert.strictEqual(d.graphics.pins.length, 1);
    assert.strictEqual(d.graphics.pins[0].attrs.PinName, 'C');
});
