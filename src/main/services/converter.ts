import { ipcMain, dialog, app } from "electron";
import axios from "axios";
import fs from "fs";
import path from "path";
import FormData from "form-data";
import AdmZip from "adm-zip";

// Load environment variables
const CONVERT_API_URL = process.env.VITE_CONVERT_API_URL || "http://localhost:8080/api/v1/musicxml/convert";
const DOWNLOAD_API_URL = process.env.VITE_DOWNLOAD_API_URL || "http://localhost:8080/api/v1/musicxml/download";
const STATUS_API_URL = process.env.VITE_STATUS_API_URL || "http://localhost:8080/api/v1/musicxml/status";

// Job status matching backend
const JobStatus = {
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED"
} as const;

// Tạo type từ object trên
type JobStatusType = typeof JobStatus[keyof typeof JobStatus];

interface ConversionJob {
    jobId: string;
    originalFileName?: string;
    fileSizeBytes?: number;
    status: JobStatusType; // Đổi type ở đây
    errorMessage?: string;
    createdAt?: string;
    startedAt?: string;
    completedAt?: string;
    processingTimeMillis?: number;
}

// Handler: Chọn file ảnh sheet nhạc
ipcMain.handle("select-image-files", async () => {
    try {
        const result = await dialog.showOpenDialog({
            properties: ["openFile", "multiSelections"],
            filters: [
                { name: "Images", extensions: ["jpg", "jpeg", "png"] },
                { name: "All Files", extensions: ["*"] }
            ]
        });

        if (result.canceled) {
            return null;
        }

        return result.filePaths;
    } catch (error) {
        console.error("Error selecting files:", error);
        throw error;
    }
});

ipcMain.handle("upload-and-convert", async (event, filePath: string, engine: string) => {
    try {
        console.log(`Processing with engine: ${engine}`);
        
        if (engine === 'CUSTOM_MODEL_KERN') {
            // TODO: Thay thế bằng API gọi Model AI Custom của bạn (trả về file **kern)
            // Ví dụ mock data trả về:
            event.sender.send('conversion-progress', { status: 'converting', progress: 50, message: 'Đang chạy Model AI...' });
            await new Promise(res => setTimeout(res, 2000));
            event.sender.send('conversion-progress', { status: 'COMPLETED', progress: 100, message: 'Hoàn thành!' });
            
            return {
                jobId: "mock-ai-job-123",
                status: JobStatus.COMPLETED,
                format: "kern"  
                // ...
            };
        }

        // --- Logic cho AUDIVERIS_XML giữ nguyên như cũ ---
        const formData = new FormData();
        formData.append("file", fs.createReadStream(filePath));

        console.log('Uploading to Audiveris API:', CONVERT_API_URL);
        
        const uploadResponse = await axios.post(CONVERT_API_URL, formData, {
            headers: formData.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 300000 
        });

        const responseData = uploadResponse.data;
        const jobId = responseData.jobID || responseData.jobId;

        if (!jobId) throw new Error('No jobId received from server');

        const job: ConversionJob = { ...responseData, jobId: jobId };

        if (job.status === JobStatus.PENDING || job.status === JobStatus.PROCESSING || job.status === JobStatus.IN_PROGRESS) {
            const maxAttempts = 60; 
            const pollInterval = 5000; 
            let attempts = 0;

            while (attempts < maxAttempts) {
                event.sender.send('conversion-progress', {
                    jobId,
                    status: job.status,
                    progress: Math.min((attempts / maxAttempts) * 100, 95),
                    message: `Đang xử lý... (${attempts * 5}s)`
                });

                await new Promise(resolve => setTimeout(resolve, pollInterval));
                attempts++;

                try {
                    const statusResponse = await axios.get(`${STATUS_API_URL}/${jobId}`, { timeout: 10000 });
                    const updatedJob: ConversionJob = statusResponse.data;

                    if (updatedJob.status === JobStatus.COMPLETED) {
                        event.sender.send('conversion-progress', {
                            jobId, status: 'COMPLETED', progress: 100, message: 'Hoàn thành!'
                        });
                        return updatedJob;
                    }
                    if (updatedJob.status === JobStatus.FAILED) throw new Error(updatedJob.errorMessage || 'Conversion failed');
                    Object.assign(job, updatedJob);
                } catch (statusError: any) {
                    if (statusError.response?.status === 404) throw new Error('Job not found');
                }
            }
            throw new Error('Timeout: Conversion took too long');
        }

        return job;
    } catch (error: any) {
        console.error("Error uploading and converting:", error.message);
        throw error;
    }
});

// Handler: Tải file MXL từ API và extract XML
ipcMain.handle("download-musicxml", async (_event, jobId: string) => {
    try {
        console.log('Downloading from:', `${DOWNLOAD_API_URL}/${jobId}`);
        
        const response = await axios.get(`${DOWNLOAD_API_URL}/${jobId}`, {
            responseType: "arraybuffer",
            timeout: 300000 // 5 minutes timeout
        });

        const dataBuffer = Buffer.from(response.data);
        const tempDir = path.join(app.getPath("temp"), "muse-parse", jobId);
        
        // Tạo thư mục temp nếu chưa có
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const mxlPath = path.join(tempDir, "music.mxl");
        fs.writeFileSync(mxlPath, dataBuffer);

        // Extract MXL file (MXL là file ZIP chứa XML)
        const zip = new AdmZip(mxlPath);
        zip.extractAllTo(tempDir, true);

        // Tìm file .xml trong thư mục
        const files = fs.readdirSync(tempDir);
        const xmlFile = files.find(file => file.endsWith(".xml") || file.endsWith(".musicxml"));
        
        if (!xmlFile) {
            throw new Error("Không tìm thấy file XML trong MXL");
        }

        const xmlPath = path.join(tempDir, xmlFile);
        const xmlContent = fs.readFileSync(xmlPath, "utf-8");

        console.log('Successfully extracted XML, content length:', xmlContent.length);

        return {
            success: true,
            xmlContent,
            xmlPath,
            tempDir
        };
    } catch (error) {
        console.error("Error downloading MusicXML:", error);
        throw error;
    }
});