const dropzone = document.getElementById('dropzone');
const canvas = document.getElementById('schematic-canvas');

dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    
    if (e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (!file.name.toLowerCase().endsWith('.asc')) {
            alert('Please drop a valid .asc file.');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target.result;
            processFile(text);
        };
        reader.readAsText(file);
    }
});

async function processFile(text) {
    try {
        console.log("Parsing file...");
        const scene = parseAsc(text);
        console.log("Scene parsed:", scene);
        
        // Find all unique types
        const types = new Set(scene.symbols.map(s => s.type));
        for (const flag of scene.flags) {
            if (flag.name === '0') types.add('gnd');
            else types.add('flag');
        }
        const svgs = new Map();
        
        // Fetch them
        for (const type of types) {
            // Strip any library prefix e.g. "TCLib\\OA_param2" -> "OA_param2"
            const basename = type.split('\\').pop().split('/').pop();
            try {
                const url = `../Assets/Skins/Default/${basename}.svg`;
                const res = await fetch(url);
                if (res.ok) {
                    const svgText = await res.text();
                    svgs.set(type, svgText);
                } else {
                    console.warn(`Could not fetch SVG for ${type} at ${url}`);
                }
            } catch (e) {
                console.warn(`Error fetching SVG for ${type}`, e);
            }
        }
        
        console.log("Rendering scene with SVGs:", svgs.size);
        await renderScene(canvas, scene, { svgs });
    } catch (err) {
        console.error("Error processing file:", err);
        alert("Error processing file. Check console. If fetch failed, run a local web server.");
    }
}
