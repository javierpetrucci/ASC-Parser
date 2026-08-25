// app.js is a DOM-driven script, so it cannot simply be required. Several of the
// functions inside it are pure, though: slice those blocks out by brace matching
// and evaluate them on their own.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');

// Pulls a top-level `function name(...) {...}` or single-line `const NAME = ...;`
// out of the source, starting from its declaration.
function extractBlock(src, declaration) {
    const start = src.indexOf(declaration);
    if (start === -1) throw new Error(`app.js no longer contains: ${declaration}`);

    if (declaration.startsWith('const')) {
        return src.slice(start, src.indexOf('\n', start) + 1);
    }

    let depth = 0;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
    }
    throw new Error(`Unbalanced braces after ${declaration}`);
}

// `declarations` must be ordered so each is defined before its callers.
// `exports` names the bindings to hand back.
function loadFromApp(declarations, exports) {
    const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    const combined = declarations.map(d => extractBlock(src, d)).join('\n\n');

    const sandbox = { console, TextDecoder };
    vm.createContext(sandbox);
    vm.runInContext(combined, sandbox, { filename: 'app.extracted.js' });

    return vm.runInContext('({' + exports.join(', ') + '})', sandbox);
}

const loadMarkdown = () => loadFromApp(
    ['const SAFE_URL', 'function parseInlineElements', 'function renderSpecTable', 'function parseMarkdown'],
    ['parseMarkdown', 'parseInlineElements']
);

const loadEncoding = () => loadFromApp(
    ['function decodeAscBytes', 'function isLikelyUtf8'],
    ['decodeAscBytes', 'isLikelyUtf8']
);

module.exports = { loadFromApp, loadMarkdown, loadEncoding, ROOT };
