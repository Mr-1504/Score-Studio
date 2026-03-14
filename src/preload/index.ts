const { contextBridge, ipcRenderer } = require('electron');

const electronAPI = {
    selectImageFiles: () => ipcRenderer.invoke('select-image-files'),
    // Thêm tham số engine
    uploadAndConvert: (filePath: string, engine: string) => ipcRenderer.invoke('upload-and-convert', filePath, engine),
    downloadMusicXML: (jobId: string) => ipcRenderer.invoke('download-musicxml', jobId),
    ipcRenderer: {
        on: (channel: string, func: (...args: any[]) => void) => {
            const validChannels = ['conversion-progress'];
            if (validChannels.includes(channel)) {
                const listener = (_event: any, ...args: any[]) => func(...args);
                ipcRenderer.on(channel, listener);
            }
        },
        removeListener: (channel: string, _func: (...args: any[]) => void) => {
            const validChannels = ['conversion-progress'];
            if (validChannels.includes(channel)) {
                ipcRenderer.removeAllListeners(channel);
            }
        }
    }
};

contextBridge.exposeInMainWorld('electron', electronAPI);