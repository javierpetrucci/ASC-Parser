const test = require('node:test');
const assert = require('node:assert');
const { loadEncoding } = require('./helpers/load-app.js');

const { decodeAscBytes, isLikelyUtf8 } = loadEncoding();

// Builds the {bytes, buffer} pair decodeAscBytes expects.
function input(bytes) {
    const u8 = Uint8Array.from(bytes);
    return [u8, u8.buffer];
}

const utf8 = (s) => [...Buffer.from(s, 'utf8')];
const latin1 = (s) => [...Buffer.from(s, 'latin1')];

test('a UTF-8 BOM is detected and stripped', () => {
    // LTspice 24.x writes UTF-8. Decoded as windows-1252 the first line became
    // "ï»¿Version 4" and parseAsc dropped the header entirely.
    const { text, encoding } = decodeAscBytes(...input([0xEF, 0xBB, 0xBF, ...utf8('Version 4.1')]));
    assert.strictEqual(encoding, 'utf-8');
    assert.strictEqual(text, 'Version 4.1');
    assert.ok(!text.startsWith('\uFEFF'), 'the BOM leaked into the text');
});

test('a UTF-16LE BOM is detected and stripped', () => {
    const bytes = [0xFF, 0xFE, ...Buffer.from('Version 4.1', 'utf16le')];
    const { text, encoding } = decodeAscBytes(...input(bytes));
    assert.strictEqual(encoding, 'utf-16le');
    assert.strictEqual(text, 'Version 4.1');
});

test('a UTF-16BE BOM is detected instead of producing garbage', () => {
    const le = Buffer.from('Version', 'utf16le');
    const be = Buffer.alloc(le.length);
    for (let i = 0; i < le.length; i += 2) { be[i] = le[i + 1]; be[i + 1] = le[i]; }
    const { text, encoding } = decodeAscBytes(...input([0xFE, 0xFF, ...be]));
    assert.strictEqual(encoding, 'utf-16be');
    assert.strictEqual(text, 'Version');
});

test('BOM-less UTF-8 with accents is not mangled into mojibake', () => {
    // Spanish net labels are common in this project.
    const { text, encoding } = decodeAscBytes(...input(utf8('FLAG 0 0 Tensión')));
    assert.strictEqual(encoding, 'utf-8');
    assert.strictEqual(text, 'FLAG 0 0 Tensión');
});

test('legacy windows-1252 stays the default for high bytes that are not UTF-8', () => {
    // 0xF3 alone is an invalid UTF-8 lead byte here, so this must fall back.
    const { text, encoding } = decodeAscBytes(...input(latin1('FLAG 0 0 Tensión')));
    assert.strictEqual(encoding, 'windows-1252');
    assert.strictEqual(text, 'FLAG 0 0 Tensión');
});

test('pure ASCII keeps the windows-1252 default (both decode identically)', () => {
    const { text, encoding } = decodeAscBytes(...input(latin1('Version 4.1')));
    assert.strictEqual(encoding, 'windows-1252');
    assert.strictEqual(text, 'Version 4.1');
});

test('an empty file does not throw', () => {
    const { text } = decodeAscBytes(...input([]));
    assert.strictEqual(text, '');
});

test('isLikelyUtf8 only fires on well-formed multi-byte sequences', () => {
    assert.strictEqual(isLikelyUtf8(Uint8Array.from(utf8('café'))), true);
    assert.strictEqual(isLikelyUtf8(Uint8Array.from(utf8('plain ascii'))), false,
        'ASCII is ambiguous and must not force UTF-8');
    assert.strictEqual(isLikelyUtf8(Uint8Array.from([0xF3, 0x6E])), false, 'invalid sequence');
    assert.strictEqual(isLikelyUtf8(Uint8Array.from([0xC3])), false, 'truncated sequence');
    assert.strictEqual(isLikelyUtf8(Uint8Array.from([0xFF, 0xFE])), false, 'not a UTF-8 lead byte');
});

test('all three line endings survive decoding', () => {
    for (const eol of ['\r\n', '\r', '\n']) {
        const { text } = decodeAscBytes(...input(utf8(`Version 4.1${eol}SHEET 1 880 680`)));
        assert.ok(text.includes('SHEET'), `lost content with ${JSON.stringify(eol)}`);
    }
});
