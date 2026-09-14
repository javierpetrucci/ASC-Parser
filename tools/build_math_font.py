"""
Builds Assets/Fonts/lmmath-subset.ttf from Latin Modern Math.

Run through tools/build_math_font.js, which supplies the glyph list read from
engine/latex_text.js so the font and the symbol table cannot drift apart.

Three things happen here:

1. SUBSET. Latin Modern Math is 717 KB and we need a few dozen glyphs.

2. CFF -> glyf. latinmodern-math.otf is an OTF with CFF (cubic) outlines. The
   vendored jsPDF only parses 'glyf' (TrueType, quadratic), so an unconverted
   OTF embeds as nothing at all.

3. CMAP REMAP. TeX sets \\alpha..\\omega from the Mathematical Italic block
   (U+1D6FC..), which is outside the BMP. A JS string holds those as surrogate
   pairs and jsPDF's cmap lookup works in UTF-16 code units, so it would never
   find them. Each glyph is therefore re-exposed at a plain BMP codepoint.

Usage:  python tools/build_math_font.py <spec.json> <source.otf> <out.ttf>
"""

import json
import sys

from fontTools.ttLib import TTFont, newTable
from fontTools.subset import Subsetter, Options
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

# Max deviation, in font units, when approximating cubics with quadratics.
# 1.0 at 1000 upem is far below anything visible.
MAX_ERR = 1.0


def otf_to_ttf(font):
    """Replaces CFF outlines with a glyf table, in place."""
    if font.sfntVersion != "OTTO":
        raise SystemExit("expected an OTTO/CFF font, got " + font.sfntVersion)

    glyph_order = font.getGlyphOrder()
    glyph_set = font.getGlyphSet()

    glyf = newTable("glyf")
    glyf.glyphOrder = glyph_order
    glyf.glyphs = {}
    for name in glyph_order:
        pen = TTGlyphPen(glyph_set)
        glyph_set[name].draw(Cu2QuPen(pen, MAX_ERR, reverse_direction=True))
        glyf.glyphs[name] = pen.glyph()
    font["glyf"] = glyf
    # loca is derived when glyf compiles, but the table directory is built from
    # the keys present BEFORE compiling — without this the font ships with a
    # glyf and no loca, and every TrueType parser fails to find any outline.
    font["loca"] = newTable("loca")

    maxp = font["maxp"]
    maxp.tableVersion = 0x00010000
    maxp.maxZones = 1
    maxp.maxTwilightPoints = 0
    maxp.maxStorage = 0
    maxp.maxFunctionDefs = 0
    maxp.maxInstructionDefs = 0
    maxp.maxStackElements = 0
    maxp.maxSizeOfInstructions = 0
    maxp.maxComponentElements = max(
        (len(g.components) if hasattr(g, "components") else 0)
        for g in glyf.glyphs.values()
    )

    post = font["post"]
    post.formatType = 3.0
    for attr in ("mapping", "extraNames", "glyphOrder"):
        if hasattr(post, attr):
            setattr(post, attr, {} if attr == "mapping" else [])

    font["head"].indexToLocFormat = 0
    font.sfntVersion = "\000\001\000\000"

    for tag in ("CFF ", "VORG", "MATH", "GSUB", "GPOS", "GDEF", "FFTM", "BASE"):
        if tag in font:
            del font[tag]


def build_cmap(font, mapping):
    """Replaces the cmap with a single BMP subtable holding exactly `mapping`."""
    cmap = newTable("cmap")
    cmap.tableVersion = 0
    sub4 = cmap.tables = []

    from fontTools.ttLib.tables._c_m_a_p import CmapSubtable

    for platform_id, plat_enc_id in ((3, 1), (0, 3)):
        table = CmapSubtable.newSubtable(4)
        table.platformID = platform_id
        table.platEncID = plat_enc_id
        table.language = 0
        table.cmap = dict(mapping)
        sub4.append(table)

    font["cmap"] = cmap


def main():
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    spec_path, src_path, out_path = sys.argv[1:4]

    with open(spec_path, "r", encoding="utf-8") as fh:
        spec = json.load(fh)

    font = TTFont(src_path)
    best = font.getBestCmap()

    # dst codepoint -> glyph name, resolved against the ORIGINAL cmap.
    mapping = {}
    missing = []
    for entry in spec:
        name = best.get(entry["src"])
        if name is None:
            missing.append("%s (U+%04X)" % (entry.get("cmd", "?"), entry["src"]))
            continue
        mapping[entry["dst"]] = name

    # Loud, not silent: a glyph discovered missing at render time would surface
    # as a blank box in someone's schematic.
    if missing:
        raise SystemExit(
            "these glyphs are not in the source font:\n  " + "\n  ".join(missing)
        )

    options = Options()
    options.layout_features = []
    options.hinting = False
    options.notdef_outline = True
    options.recalc_bounds = True
    options.drop_tables += ["MATH", "FFTM", "VORG"]
    options.name_IDs = [1, 2, 3, 4, 6]

    subsetter = Subsetter(options=options)
    subsetter.populate(glyphs=sorted(set(mapping.values())))
    subsetter.subset(font)

    otf_to_ttf(font)
    build_cmap(font, mapping)

    font.save(out_path)
    print("wrote %s  (%d glyphs, %d codepoints)" % (out_path, len(font.getGlyphOrder()), len(mapping)))


if __name__ == "__main__":
    main()
