import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const { contextBridge, ipcRenderer } = require2("electron");
const electronAPI = {
  selectImageFiles: () => ipcRenderer.invoke("select-image-files"),
  uploadAndConvert: (filePath, engine) => ipcRenderer.invoke("upload-and-convert", filePath, engine),
  downloadMusicXML: (jobId) => ipcRenderer.invoke("download-musicxml", jobId),
  // Fetch 1 nốt soundfont mp3 qua main process (bypass CSP)
  // Trả về number[] (bytes của mp3), renderer tự decode thành AudioBuffer
  fetchSoundfontNote: (noteName) => ipcRenderer.invoke("fetch-soundfont-note", noteName),
  ipcRenderer: {
    on: (channel, func) => {
      const validChannels = ["conversion-progress"];
      if (validChannels.includes(channel)) {
        const listener = (_event, ...args) => func(...args);
        ipcRenderer.on(channel, listener);
      }
    },
    removeListener: (channel, _func) => {
      const validChannels = ["conversion-progress"];
      if (validChannels.includes(channel)) {
        ipcRenderer.removeAllListeners(channel);
      }
    }
  }
};
contextBridge.exposeInMainWorld("electron", electronAPI);
