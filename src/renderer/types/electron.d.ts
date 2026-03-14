export interface ElectronAPI {
    selectImageFiles: () => Promise<string[] | null>;
    uploadAndConvert: (filePath: string, engine: string) => Promise<any>;
    downloadMusicXML: (jobId: string) => Promise<{
        success: boolean;
        xmlContent: string;
        xmlPath: string;
        tempDir: string;
    }>;
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