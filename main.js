const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

async function handleOpenDirectory(event, options = {}) {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: options.title || 'Select Folder',
        properties: ['openDirectory']
    });
    if (canceled) {
        return null;
    } else {
        return filePaths[0]; // Return the selected folder path
    }
}

// Recursively find all .asc files
function findAscFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            findAscFiles(filePath, fileList);
        } else if (file.toLowerCase().endsWith('.asc')) {
            fileList.push(filePath);
        }
    }
    return fileList;
}

ipcMain.handle('fs:findAscFiles', async (event, folderPath) => {
    try {
        return findAscFiles(folderPath); // Return array of absolute paths
    } catch (e) {
        console.error('Error scanning folder', e);
        throw e;
    }
});

ipcMain.handle('fs:readFile', async (event, filePath) => {
    try {
        const buffer = fs.readFileSync(filePath);
        // We can send the Node Buffer directly; it natively serializes to a Uint8Array in the Renderer process!
        return buffer;
    } catch (e) {
        console.error('Error reading file', e);
        throw e;
    }
});

ipcMain.handle('fs:savePdf', async (event, { filepath, pdfBytes, sourceDir, destDir }) => {
    try {
        // Calculate relative path from the scanned root folder to recreate the structure
        const relativePath = path.relative(sourceDir, filepath);
        const relativePdfPath = relativePath.replace(/\.asc$/i, '.pdf');
        
        // Target destination
        const finalPdfPath = path.join(destDir, relativePdfPath);
        
        // Ensure the subdirectories exist
        const outDir = path.dirname(finalPdfPath);
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }
        
        fs.writeFileSync(finalPdfPath, Buffer.from(pdfBytes));
        return { success: true, path: finalPdfPath };
    } catch (e) {
        console.error('Error saving PDF', e);
        throw e;
    }
});

function createWindow () {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, 'Assets/UI/favicon/favicon-32x32.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            // WebSecurity applies CORS to file:// protocol. 
            // Disabling it allows the unchanged web code to fetch local assets flawlessly
            webSecurity: false 
        }
    });

    // Remove the native application menu for a cleaner look
    mainWindow.setMenu(null);

    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    ipcMain.handle('dialog:openDirectory', handleOpenDirectory);
    
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});
