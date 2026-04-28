// src/renderer/types/electron.d.ts
// THÊM: fetchSoundfontNote type

export interface ElectronAPI {
    selectImageFiles: () => Promise<string[] | null>;
    uploadAndConvert: (filePath: string, engine: string) => Promise<any>;
    downloadMusicXML: (jobId: string, isZip: boolean) => Promise<{
        success: boolean;
        xmlContent: string;
        xmlPath: string;
        tempDir: string;
    }>;
    // Fetch soundfont note mp3 qua main process — trả number[] (raw mp3 bytes)
    fetchSoundfontNote: (noteName: string) => Promise<number[] | null>;
    ipcRenderer: {
        on: (channel: string, func: (...args: any[]) => void) => void;
        removeListener: (channel: string, func: (...args: any[]) => void) => void;
    };
}

declare global {
    interface Window {
        electron: ElectronAPI;
    }
}

export {};