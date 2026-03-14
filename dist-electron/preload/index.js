const { contextBridge, ipcRenderer } = require("electron");
const electronAPI = {
  selectImageFiles: () => ipcRenderer.invoke("select-image-files"),
  // Thêm tham số engine
  uploadAndConvert: (filePath, engine) => ipcRenderer.invoke("upload-and-convert", filePath, engine),
  downloadMusicXML: (jobId) => ipcRenderer.invoke("download-musicxml", jobId),
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
