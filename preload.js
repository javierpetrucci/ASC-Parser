const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: (options) => ipcRenderer.invoke('dialog:openDirectory', options),
    findAscFiles: (folderPath) => ipcRenderer.invoke('fs:findAscFiles', folderPath),
    readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
    savePdf: (filepath, pdfBytes, sourceDir, destDir) => ipcRenderer.invoke('fs:savePdf', { filepath, pdfBytes, sourceDir, destDir })
});
