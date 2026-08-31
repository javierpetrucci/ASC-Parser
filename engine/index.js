// engine/index.js
// Exports the unified Engine API to be used by web/desktop platforms.
// This is the ONLY definition of window.LTSpiceEngine — pdf_renderer.js used to
// assign it too, and that assignment was silently overwritten by this one.

window.LTSpiceEngine = {
    parse: typeof parseAsc !== 'undefined' ? parseAsc : null,
    render: typeof convertSceneToPdf !== 'undefined' ? convertSceneToPdf : null,
    // Same scene, same renderer, different output document — see engine/tikz_renderer.js.
    renderTikz: typeof convertSceneToTikz !== 'undefined' ? convertSceneToTikz : null,
    defaults: typeof COMPONENT_DEFAULTS !== 'undefined' ? COMPONENT_DEFAULTS : {},
    // filename and options are forwarded so a programmatic convert() renders
    // identically to the app. Omitting options left overrideAnchors falsy while
    // the UI defaults it to true, so the same schematic came out with different
    // label placement depending on which entry point was used.
    convert: async (ascText, assets, filename = 'Schematic', options = { overrideAnchors: true }) => {
        if (typeof parseAsc === 'undefined' || typeof convertSceneToPdf === 'undefined') {
            throw new Error('Engine modules not loaded');
        }
        const scene = parseAsc(ascText);
        return await convertSceneToPdf(scene, assets, filename, options);
    },
    convertTikz: async (ascText, assets, filename = 'Schematic', options = { overrideAnchors: true }) => {
        if (typeof parseAsc === 'undefined' || typeof convertSceneToTikz === 'undefined') {
            throw new Error('Engine modules not loaded');
        }
        const scene = parseAsc(ascText);
        return await convertSceneToTikz(scene, assets, filename, options);
    }
};
