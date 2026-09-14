# Fonts

## `lmroman10-regular.ttf`

Latin Modern Roman 10pt — the OpenType descendant of Knuth's `cmr10`, and the
face a LaTeX document gets from `\usepackage{lmodern}`. Every label in the PDF is
set in it, which is why a schematic dropped into a LaTeX document matches.

GUST Font License (GFL), a free licence in the spirit of the LaTeX Project
Public License. <https://www.gust.org.pl/projects/e-foundry/latin-modern>

## `lmmath-subset.ttf`

A subset of **Latin Modern Math**, carrying only the glyphs `lmroman10` does not
have: the lowercase Greek alphabet, the relations and big operators, and the
Latin alphabet **in math italic**.

That last one is not decoration. In maths a letter is a variable, and TeX sets
variables slanted — `$g_{m1}$` is italic while the `1` beside it stays upright.
Setting a formula in the text roman would make it read as a word.

That gap is not an oversight in the text font — it is how TeX works. Uppercase
Greek is upright and lives in the text font, while lowercase Greek is italic and
comes from the *math italic* face (`cmmi10` / `lmmi10`). So `$\Omega$` is set
from `lmroman10` and `$\omega$` from here, exactly as LaTeX would.

Three things are done to the source font, all of them necessary:

- **Subset** — the original is 717 kB for a few dozen glyphs.
- **CFF → glyf** — `latinmodern-math.otf` is an OTF with cubic (CFF) outlines,
  and the vendored jsPDF only parses TrueType `glyf`. Unconverted, it embeds as
  nothing at all.
- **Remap onto the BMP** — TeX takes `\alpha`…`\omega`, and the italic Latin
  letters, from the Mathematical Italic block (U+1D6FC…, U+1D434…), which is
  outside the BMP. A JS string holds those as surrogate pairs and jsPDF's cmap
  lookup works in UTF-16 code units, so it would never find them. Each glyph is
  re-exposed at its plain Greek or ASCII codepoint, which also means a run of
  letters can simply be drawn with this face.

  One oddity to know about: there is no italic small `h` in that block. Unicode
  had already assigned it as U+210E PLANCK CONSTANT, leaving a hole at U+1D455,
  so `h` is pulled from there instead.

U+0020 is included on purpose: jsPDF encodes a whole string against one face and
stops at the first codepoint that face cannot map, so a maths run containing a
space would otherwise be truncated at the space.

### Regenerating

Not part of the build — run it by hand and commit the result. Needs Python with
`fonttools`, and Latin Modern Math, which ships with TeX Live and MiKTeX.

```bash
node tools/build_math_font.js [path/to/latinmodern-math.otf]
```

The glyph list is read out of `engine/latex_text.js`, so the font cannot drift
away from the symbol table; the script fails loudly if a glyph is missing.
`test/latex-text.test.js` checks the built font against that same table.

GUST Font License — modification and redistribution permitted.
<https://www.gust.org.pl/projects/e-foundry/lm-math>
