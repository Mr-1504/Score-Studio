    const { contextBridge, ipcRenderer } = require('electron');

const electronAPI = {
    selectImageFiles: () => ipcRenderer.invoke('select-image-files'),
    uploadAndConvert: (filePath: string, engine: string) =>
        ipcRenderer.invoke('upload-and-convert', filePath, engine),
    downloadMusicXML: (jobId: string) =>
        ipcRenderer.invoke('download-musicxml', jobId),

    // Fetch 1 nốt soundfont mp3 qua main process (bypass CSP)
    // Trả về number[] (bytes của mp3), renderer tự decode thành AudioBuffer
    fetchSoundfontNote: (noteName: string): Promise<number[] | null> =>
        ipcRenderer.invoke('fetch-soundfont-note', noteName),

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
        },
    },
};

contextBridge.exposeInMainWorld('electron', electronAPI);