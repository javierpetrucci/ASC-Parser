// engine/index.js
// Exports the unified Engine API to be used by web/desktop platforms

window.LTSpiceEngine = {
    parse: typeof parseAsc !== 'undefined' ? parseAsc : null,
    render: typeof convertSceneToPdf !== 'undefined' ? convertSceneToPdf : null,
    convert: async (ascText, assets) => {
        if (typeof parseAsc === 'undefined' || typeof convertSceneToPdf === 'undefined') {
            throw new Error('Engine modules not loaded');
        }
        const scene = parseAsc(ascText);
        return await convertSceneToPdf(scene, assets);
    }
};
