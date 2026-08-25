const test = require('node:test');
const assert = require('node:assert');
const { loadMarkdown } = require('./helpers/load-app.js');

const { parseMarkdown, parseInlineElements } = loadMarkdown();

const DOLLAR = String.fromCharCode(36);

test('a code block containing $& survives verbatim', () => {
    // Restoring placeholders with a string replacement made JS interpret $&,
    // which spliced the matched placeholder back into the output.
    const md = '```\nSPICE .param x=' + DOLLAR + '&y\n```';
    const html = parseMarkdown(md);

    assert.ok(!html.includes('CODE_BLOCK_PLACEHOLDER'), 'placeholder leaked into the output');
    assert.ok(html.includes('x=' + DOLLAR + '&amp;y'), `lost the dollar sequence: ${html}`);
});

test('other $ substitution patterns survive too', () => {
    for (const seq of [DOLLAR + '`', DOLLAR + "'", DOLLAR + '1', DOLLAR + DOLLAR]) {
        const md = '```\nvalue' + seq + 'tail\n```';
        const html = parseMarkdown(md);
        assert.ok(!html.includes('CODE_BLOCK_PLACEHOLDER'), `placeholder leaked for ${seq}`);
    }
});

test('multiple code blocks are restored independently', () => {
    const md = '```\nfirst\n```\n\ntext\n\n```\nsecond\n```';
    const html = parseMarkdown(md);
    assert.ok(html.includes('first'), 'lost the first block');
    assert.ok(html.includes('second'), 'lost the second block');
    assert.ok(!html.includes('CODE_BLOCK_PLACEHOLDER'));
});

test('a link URL cannot break out of the href attribute', () => {
    // The spec markdown can be fetched from GitHub over the network, so its
    // content is not fully trusted.
    const html = parseMarkdown('[click](" onmouseover="X)');
    assert.ok(!/onmouseover\s*=/.test(html), `attribute injection succeeded: ${html}`);
});

test('a double quote in the source prose is escaped', () => {
    // Check the SOURCE text specifically: the generated markup legitimately
    // contains quotes of its own in class="..." attributes.
    const html = parseMarkdown('He said "hello" loudly.');
    assert.ok(html.includes('He said &quot;hello&quot; loudly.'),
        `prose quotes were not escaped: ${html}`);
});

test('javascript: and data: URLs do not become links', () => {
    for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<b>x', 'vbscript:x']) {
        const html = parseInlineElements(`[label](${bad})`);
        assert.ok(!html.includes('<a '), `${bad} produced an anchor: ${html}`);
        assert.ok(html.includes('label'), 'the label text should still be shown');
    }
});

test('ordinary links still render, with noopener', () => {
    const html = parseInlineElements('[spec](https://example.com/a.md)');
    assert.ok(html.includes('href="https://example.com/a.md"'), html);
    assert.ok(html.includes('rel="noopener noreferrer"'), html);
});

test('relative and anchor links still render', () => {
    for (const url of ['./doc.md', '../up.md', '#section', 'LTSpice_ASC_ASY_Format_Specification.md']) {
        const html = parseInlineElements(`[x](${url})`);
        assert.ok(html.includes('<a '), `${url} should stay a link: ${html}`);
    }
});

test('inline code and bold still work', () => {
    const html = parseInlineElements('**bold** and `code`');
    assert.ok(html.includes('<strong class="spec-strong">bold</strong>'), html);
    assert.ok(html.includes('<code class="spec-code">code</code>'), html);
});
