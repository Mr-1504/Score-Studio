import { ipcMain, dialog, app, BrowserWindow, Menu } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import AdmZip from "adm-zip";
const CONVERT_API_URL = process.env.VITE_CONVERT_API_URL || "http://localhost:8080/api/v1/musicxml/convert";
const DOWNLOAD_API_URL = process.env.VITE_DOWNLOAD_API_URL || "http://localhost:8080/api/v1/musicxml/download";
const STATUS_API_URL = process.env.VITE_STATUS_API_URL || "http://localhost:8080/api/v1/musicxml/status";
const JobStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED"
};
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
ipcMain.handle("upload-and-convert", async (event, filePath, engine) => {
  try {
    console.log(`Processing with engine: ${engine}`);
    if (engine === "CUSTOM_MODEL_KERN") {
      event.sender.send("conversion-progress", { status: "converting", progress: 50, message: "Đang chạy Model AI..." });
      await new Promise((res) => setTimeout(res, 2e3));
      event.sender.send("conversion-progress", { status: "COMPLETED", progress: 100, message: "Hoàn thành!" });
      return {
        jobId: "mock-ai-job-123",
        status: JobStatus.COMPLETED,
        format: "kern"
        // ...
      };
    }
    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath));
    console.log("Uploading to Audiveris API:", CONVERT_API_URL);
    const uploadResponse = await axios.post(CONVERT_API_URL, formData, {
      headers: formData.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 3e5
    });
    const responseData = uploadResponse.data;
    const jobId = responseData.jobID || responseData.jobId;
    if (!jobId) throw new Error("No jobId received from server");
    const job = { ...responseData, jobId };
    if (job.status === JobStatus.PENDING || job.status === JobStatus.PROCESSING || job.status === JobStatus.IN_PROGRESS) {
      const maxAttempts = 60;
      const pollInterval = 5e3;
      let attempts = 0;
      while (attempts < maxAttempts) {
        event.sender.send("conversion-progress", {
          jobId,
          status: job.status,
          progress: Math.min(attempts / maxAttempts * 100, 95),
          message: `Đang xử lý... (${attempts * 5}s)`
        });
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        attempts++;
        try {
          const statusResponse = await axios.get(`${STATUS_API_URL}/${jobId}`, { timeout: 1e4 });
          const updatedJob = statusResponse.data;
          if (updatedJob.status === JobStatus.COMPLETED) {
            event.sender.send("conversion-progress", {
              jobId,
              status: "COMPLETED",
              progress: 100,
              message: "Hoàn thành!"
            });
            return updatedJob;
          }
          if (updatedJob.status === JobStatus.FAILED) throw new Error(updatedJob.errorMessage || "Conversion failed");
          Object.assign(job, updatedJob);
        } catch (statusError) {
          if (statusError.response?.status === 404) throw new Error("Job not found");
        }
      }
      throw new Error("Timeout: Conversion took too long");
    }
    return job;
  } catch (error) {
    console.error("Error uploading and converting:", error.message);
    throw error;
  }
});
ipcMain.handle("download-musicxml", async (_event, jobId) => {
  try {
    console.log("Downloading from:", `${DOWNLOAD_API_URL}/${jobId}`);
    const response = await axios.get(`${DOWNLOAD_API_URL}/${jobId}`, {
      responseType: "arraybuffer",
      timeout: 3e5
      // 5 minutes timeout
    });
    const dataBuffer = Buffer.from(response.data);
    const tempDir = path.join(app.getPath("temp"), "muse-parse", jobId);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const mxlPath = path.join(tempDir, "music.mxl");
    fs.writeFileSync(mxlPath, dataBuffer);
    const zip = new AdmZip(mxlPath);
    zip.extractAllTo(tempDir, true);
    const files = fs.readdirSync(tempDir);
    const xmlFile = files.find((file) => file.endsWith(".xml") || file.endsWith(".musicxml"));
    if (!xmlFile) {
      throw new Error("Không tìm thấy file XML trong MXL");
    }
    const xmlPath = path.join(tempDir, xmlFile);
    const xmlContent = fs.readFileSync(xmlPath, "utf-8");
    console.log("Successfully extracted XML, content length:", xmlContent.length);
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
const __filename$1 = fileURLToPath(import.meta.url);
const __dirname$1 = path.dirname(__filename$1);
dotenv.config();
function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname$1, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.once("ready-to-show", () => {
    win.show();
    win.webContents.openDevTools({ mode: "detach" });
  });
  const template = [
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  win.webContents.on("console-message", (_event, _level, message, _line, _sourceId) => {
    console.log(`[RENDERER]: ${message}`);
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname$1, "../renderer/index.html"));
  }
}
app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
