// src/main/services/converter.ts
// FIXED: chỉ load các nốt thực sự có trên CDN (A và C notes),
//        Tone.Sampler tự interpolate phần còn lại

import { ipcMain, dialog, app, net } from "electron";
import axios from "axios";
import fs from "fs";
import path from "path";
import FormData from "form-data";
import AdmZip from "adm-zip";

// ─── Soundfont ────────────────────────────────────────────────────────────────

const soundfontCache = new Map<string, Buffer>();

// Chỉ các nốt THỰC SỰ tồn tại trên gleitz FluidR3_GM CDN
// (A và C notes — CDN không có D#/F# cho piano này)
const AVAILABLE_NOTES = [
  "A0",
  "C1", "A1",
  "C2", "A2",
  "C3", "A3",
  "C4", "A4",
  "C5", "A5",
  "C6", "A6",
  "C7",
];

const SOUNDFONT_BASE =
  "https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/acoustic_grand_piano-mp3/";

ipcMain.handle("fetch-soundfont-note", async (_event, noteName: string): Promise<number[] | null> => {
  // Chỉ fetch các nốt hợp lệ
  if (!AVAILABLE_NOTES.includes(noteName)) {
    return null;
  }

  if (soundfontCache.has(noteName)) {
    return Array.from(soundfontCache.get(noteName)!);
  }

  const url = `${SOUNDFONT_BASE}${noteName}.mp3`;

  try {
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const request = net.request(url);
      const chunks: Buffer[] = [];

      request.on("response", (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode} for ${url}`));
          return;
        }
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      });
      request.on("error", reject);
      request.end();
    });

    soundfontCache.set(noteName, buffer);
    console.log(`[Soundfont] Loaded ${noteName} (${buffer.length} bytes)`);
    return Array.from(buffer);
  } catch (err) {
    console.error(`[Soundfont] Failed ${noteName}:`, err);
    return null;
  }
});

// Export list để renderer biết cần fetch bao nhiêu nốt
ipcMain.handle("get-soundfont-note-list", () => AVAILABLE_NOTES);

// ─── Existing handlers ────────────────────────────────────────────────────────

const getApiUrls = () => ({
  convert: process.env.VITE_CONVERT_API_URL || "http://localhost:8080/api/v1/musicxml/convert",
  download: process.env.VITE_DOWNLOAD_API_URL || "http://localhost:8080/api/v1/musicxml/download",
  status: process.env.VITE_STATUS_API_URL || "http://localhost:8080/api/v1/musicxml/status",
});

const JobStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

type JobStatusType = typeof JobStatus[keyof typeof JobStatus];

interface ConversionJob {
  jobId: string;
  originalFileName?: string;
  fileSizeBytes?: number;
  status: JobStatusType;
  errorMessage?: string;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  processingTimeMillis?: number;
}

ipcMain.handle("select-image-files", async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Images", extensions: ["jpg", "jpeg", "png"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (result.canceled) return null;
    return result.filePaths;
  } catch (error) {
    console.error("Error selecting files:", error);
    throw error;
  }
});

ipcMain.handle("upload-and-convert", async (event, filePath: string, engine: string) => {
  try {
    console.log(`Processing with engine: ${engine}`);
    const apis = getApiUrls();

    if (engine === "CUSTOM_MODEL_KERN") {
      event.sender.send("conversion-progress", { status: "converting", progress: 50, message: "Đang chạy Model AI..." });
      await new Promise((res) => setTimeout(res, 2000));
      event.sender.send("conversion-progress", { status: "COMPLETED", progress: 100, message: "Hoàn thành!" });
      return { jobId: "mock-ai-job-123", status: JobStatus.COMPLETED, format: "kern" };
    }

    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath));
    console.log("Uploading to Audiveris API:", apis.convert);

    const uploadResponse = await axios.post(apis.convert, formData, {
      headers: formData.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 300000,
    });

    const responseData = uploadResponse.data;
    const jobId = responseData.jobID || responseData.jobId;
    if (!jobId) throw new Error("No jobId received from server");

    const job: ConversionJob = { ...responseData, jobId };

    const pendingStatuses = [JobStatus.PENDING, JobStatus.PROCESSING, JobStatus.IN_PROGRESS] as const;
    if ((pendingStatuses as readonly string[]).includes(job.status)) {
      const maxAttempts = 60;
      const pollInterval = 5000;
      let attempts = 0;

      while (attempts < maxAttempts) {
        event.sender.send("conversion-progress", {
          jobId,
          status: job.status,
          progress: Math.min((attempts / maxAttempts) * 100, 95),
          message: `Đang xử lý... (${attempts * 5}s)`,
        });

        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        attempts++;

        let currentStatus = job.status;
        let errorMessage = "Conversion failed";

        try {
          const statusResponse = await axios.get(`${apis.status}/${jobId}`, { timeout: 10000 });
          const updatedJob: ConversionJob = statusResponse.data;

          console.log(`Status check #${attempts}:`, updatedJob.status);

          currentStatus = updatedJob.status;
          errorMessage = updatedJob.errorMessage || errorMessage;

          if (currentStatus === JobStatus.COMPLETED) {
            event.sender.send("conversion-progress", { jobId, status: "COMPLETED", progress: 100, message: "Hoàn thành!" });
            return updatedJob;
          }

          Object.assign(job, updatedJob);
        } catch (statusError: any) {
          if (statusError.response?.status === 404) {
            throw new Error("Job not found");
          }
        }
        console.log(currentStatus === JobStatus.FAILED)
        if (currentStatus === JobStatus.FAILED) {
          event.sender.send("conversion-progress", {
            jobId,
            status: "FAILED",
            progress: 100,
            message: 'Có lỗi trong quá trình xử lý. Vui lòng thử lại với hình ảnh chất lượng tốt hơn (300 DPI).',
          });
          throw new Error(errorMessage);
        }
      }
      throw new Error("Timeout: Conversion took too long");

      return job;
    }
  } catch (error: any) {
  console.error("Error uploading and converting:", error);

  const code = error?.code;
  const msg = error?.message || "";

  if (
    code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ECONNABORTED" ||
    code === "ECONNRESET" || code === "EHOSTUNREACH" || code === "ENETUNREACH"
  ) {
    console.error("Connection error:", error);
    event.sender.send("conversion-progress", {
      status: "FAILED",
      progress: 100,
      message: "Không thể kết nối tới máy chủ. Vui lòng thử lại sau.",
    });
    return; 
    // throw new Error("Connection failed"); 
  }

  if (code === "ECONNABORTED" || msg.includes("timeout")) {
    event.sender.send("conversion-progress", {
      status: "FAILED",
      progress: 100,
      message: "Kết nối tới máy chủ quá lâu. Vui lòng thử lại.",
    });
    return;
    // throw new Error("Connection timeout"); 
  }

  if (error.response) {
    event.sender.send("conversion-progress", {
      status: "FAILED",
      progress: 100,
      message: `Máy chủ lỗi (${error.response.status}). Vui lòng thử lại.`,
    });
    return;
    // throw new Error(`Server error: ${error.response.status}`); // <--- THAY return; BẰNG throw
  }

  event.sender.send("conversion-progress", {
    status: "FAILED",
    progress: 100,
    message: 'Lỗi khi chuyển đổi, vui lòng thay đổi hình ảnh chất lượng tốt hơn (300 DPI) và thử lại.',
  });
}
});

ipcMain.handle("download-musicxml", async (_event, jobId: string) => {
  try {
    const apis = getApiUrls();
    console.log("Downloading from:", `${apis.download}/${jobId}`);

    const response = await axios.get(`${apis.download}/${jobId}`, {
      responseType: "arraybuffer",
      timeout: 300000,
    });

    const dataBuffer = Buffer.from(response.data);
    const tempDir = path.join(app.getPath("temp"), "muse-parse", jobId);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const mxlPath = path.join(tempDir, "music.mxl");
    fs.writeFileSync(mxlPath, dataBuffer);

    const zip = new AdmZip(mxlPath);
    zip.extractAllTo(tempDir, true);

    const files = fs.readdirSync(tempDir);
    const xmlFile = files.find((f) => f.endsWith(".xml") || f.endsWith(".musicxml"));
    if (!xmlFile) throw new Error("Không tìm thấy file XML trong MXL");

    const xmlPath = path.join(tempDir, xmlFile);
    const xmlContent = fs.readFileSync(xmlPath, "utf-8");

    console.log("Successfully extracted XML, content length:", xmlContent.length);
    return { success: true, xmlContent, xmlPath, tempDir };
  } catch (error) {
    console.error("Error downloading MusicXML:", error);
    throw error;
  }
});