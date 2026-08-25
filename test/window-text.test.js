const test = require('node:test');
const assert = require('node:assert');
const { loadEngine } = require('./helpers/load-engine.js');

const { getWindowText, resolveAttrValue, TRANSISTOR_BASENAMES } = loadEngine();

// Minimal stand-in for a parsed symbol.
function sym(type, attrs = {}, asyAttrs = null) {
    const s = { type, attrs, windows: [] };
    if (asyAttrs) s.asyData = { attrs: asyAttrs, windows: {}, graphics: {} };
    return s;
}

const WIN_INSTNAME = 0;
const WIN_VALUE = 3;

test('an absent attribute falls back to the .asy default', () => {
    const s = sym('res', {}, { Value: 'R' });
    assert.strictEqual(getWindowText(s, WIN_VALUE), 'R');
});

test('an explicitly empty attribute renders nothing and does NOT fall back', () => {
    // LTSpice writes SYMATTR Value "" when the user clears the field. That is a
    // deliberate "show nothing", not an absent attribute.
    const s = sym('res', { Value: '' }, { Value: 'R' });
    assert.strictEqual(getWindowText(s, WIN_VALUE), '');
});

test('resolveAttrValue distinguishes absent from explicitly empty', () => {
    assert.strictEqual(resolveAttrValue(sym('res', {}, { Value: 'R' }), 'Value'), 'R');
    assert.strictEqual(resolveAttrValue(sym('res', { Value: '' }, { Value: 'R' }), 'Value'), '');
});

test('transistors never inherit the bare type-name placeholder from the .asy', () => {
    for (const basename of TRANSISTOR_BASENAMES) {
        const s = sym(basename, {}, { Value: basename.toUpperCase() });
        assert.strictEqual(getWindowText(s, WIN_VALUE), '',
            `${basename} should not display its .asy placeholder`);
    }
});

test('a transistor with a real value still shows it', () => {
    const s = sym('npn', { Value: '2N2222' }, { Value: 'NPN' });
    assert.strictEqual(getWindowText(s, WIN_VALUE), '2N2222');
});

test('non-transistor parts keep their meaningful .asy defaults', () => {
    // These carry real information, unlike a bare "NPN".
    assert.strictEqual(getWindowText(sym('lpnp', {}, { Value: 'LPNP' }), WIN_VALUE), 'LPNP');
    assert.strictEqual(getWindowText(sym('NPN_ideal', {}, { Value: 'hfe=100' }), WIN_VALUE), 'hfe=100');
});

test('res/cap/ind get their unit suffix appended', () => {
    assert.strictEqual(getWindowText(sym('res', { Value: '10k' }), WIN_VALUE), '10k\u03A9');
    assert.strictEqual(getWindowText(sym('cap', { Value: '100n' }), WIN_VALUE), '100nF');
    assert.strictEqual(getWindowText(sym('ind', { Value: '10m' }), WIN_VALUE), '10mHy');
});

test('cap/ind strip a unit already present in the source value', () => {
    assert.strictEqual(getWindowText(sym('cap', { Value: '100nF' }), WIN_VALUE), '100nF');
    assert.strictEqual(getWindowText(sym('ind', { Value: '10mH' }), WIN_VALUE), '10mHy');
    assert.strictEqual(getWindowText(sym('ind', { Value: '10mHy' }), WIN_VALUE), '10mHy');
});

test('meg is normalised to M, and M/m both mean milli', () => {
    assert.strictEqual(getWindowText(sym('res', { Value: '1meg' }), WIN_VALUE), '1M\u03A9');
    assert.strictEqual(getWindowText(sym('res', { Value: '1M' }), WIN_VALUE), '1m\u03A9');
    assert.strictEqual(getWindowText(sym('res', { Value: '1m' }), WIN_VALUE), '1m\u03A9');
});

test('the bare placeholder letter is shown without a unit suffix', () => {
    assert.strictEqual(getWindowText(sym('res', {}, { Value: 'R' }), WIN_VALUE), 'R');
    assert.strictEqual(getWindowText(sym('cap', {}, { Value: 'C' }), WIN_VALUE), 'C');
    assert.strictEqual(getWindowText(sym('ind', {}, { Value: 'L' }), WIN_VALUE), 'L');
});

test('InstName and the SpiceLine indexes resolve through the same rules', () => {
    const s = sym('res', { InstName: 'R1', SpiceLine: 'tol=1%' }, { InstName: 'R', SpiceLine2: 'x' });
    assert.strictEqual(getWindowText(s, WIN_INSTNAME), 'R1');
    assert.strictEqual(getWindowText(s, 39), 'tol=1%');
    assert.strictEqual(getWindowText(s, 40), 'x');
    assert.strictEqual(getWindowText(s, 123), '');
});

test('an unknown window index yields nothing', () => {
    assert.strictEqual(getWindowText(sym('res', { Value: '1k' }), 99), '');
});
