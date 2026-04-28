import { ipcMain, net, dialog, app, BrowserWindow, Menu } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import AdmZip from "adm-zip";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const soundfontCache = /* @__PURE__ */ new Map();
const AVAILABLE_NOTES = [
  "A0",
  "C1",
  "A1",
  "C2",
  "A2",
  "C3",
  "A3",
  "C4",
  "A4",
  "C5",
  "A5",
  "C6",
  "A6",
  "C7"
];
const SOUNDFONT_BASE = "https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/acoustic_grand_piano-mp3/";
ipcMain.handle("fetch-soundfont-note", async (_event, noteName) => {
  if (!AVAILABLE_NOTES.includes(noteName)) {
    return null;
  }
  if (soundfontCache.has(noteName)) {
    return Array.from(soundfontCache.get(noteName));
  }
  const url = `${SOUNDFONT_BASE}${noteName}.mp3`;
  try {
    const buffer = await new Promise((resolve, reject) => {
      const request = net.request(url);
      const chunks = [];
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
ipcMain.handle("get-soundfont-note-list", () => AVAILABLE_NOTES);
const getApiUrls = () => ({
  convert: process.env.VITE_CONVERT_API_URL || "http://localhost:8080/api/v1/musicxml/convert",
  download: process.env.VITE_DOWNLOAD_API_URL || "http://localhost:8080/api/v1/download",
  status: process.env.VITE_STATUS_API_URL || "http://localhost:8080/api/v1/musicxml/status"
});
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
    if (result.canceled) return null;
    return result.filePaths;
  } catch (error) {
    console.error("Error selecting files:", error);
    throw error;
  }
});
ipcMain.handle("upload-and-convert", async (event, filePath, engine) => {
  try {
    console.log(`Processing with engineeee: ${engine}`);
    const apis = getApiUrls();
    const type = engine === "AUDIVERIS_XML" ? 0 : 1;
    const convertUrl = `${apis.convert}/${type}`;
    console.log(`Converting to API:`, convertUrl);
    console.log(`Type:`, type);
    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath));
    console.log(`Uploading to API:`, convertUrl);
    const uploadResponse = await axios.post(convertUrl, formData, {
      headers: formData.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 3e5
    });
    const responseData = uploadResponse.data;
    const jobId = responseData.jobID || responseData.jobId;
    if (!jobId) throw new Error("No jobId received from server");
    const job = { ...responseData, jobId };
    const pendingStatuses = [JobStatus.PENDING, JobStatus.PROCESSING, JobStatus.IN_PROGRESS];
    if (pendingStatuses.includes(job.status)) {
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
        let currentStatus = job.status;
        let errorMessage = "Conversion failed";
        try {
          const statusResponse = await axios.get(`${apis.status}/${jobId}`, { timeout: 1e4 });
          const updatedJob = statusResponse.data;
          console.log(`Status check #${attempts}:`, updatedJob.status);
          currentStatus = updatedJob.status;
          errorMessage = updatedJob.errorMessage || errorMessage;
          if (currentStatus === JobStatus.COMPLETED) {
            event.sender.send("conversion-progress", { jobId, status: "COMPLETED", progress: 100, message: "Hoàn thành!" });
            return updatedJob;
          }
          Object.assign(job, updatedJob);
        } catch (statusError) {
          if (statusError.response?.status === 404) {
            throw new Error("Job not found");
          }
        }
        console.log(currentStatus === JobStatus.FAILED);
        if (currentStatus === JobStatus.FAILED) {
          event.sender.send("conversion-progress", {
            jobId,
            status: "FAILED",
            progress: 100,
            message: "Có lỗi trong quá trình xử lý. Vui lòng thử lại với hình ảnh chất lượng tốt hơn (300 DPI)."
          });
          throw new Error(errorMessage);
        }
      }
      throw new Error("Timeout: Conversion took too long");
      return job;
    }
  } catch (error) {
    console.error("Error uploading and converting:", error);
    const code = error?.code;
    const msg = error?.message || "";
    if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ECONNABORTED" || code === "ECONNRESET" || code === "EHOSTUNREACH" || code === "ENETUNREACH") {
      console.error("Connection error:", error);
      event.sender.send("conversion-progress", {
        status: "FAILED",
        progress: 100,
        message: "Không thể kết nối tới máy chủ. Vui lòng thử lại sau."
      });
      return;
    }
    if (code === "ECONNABORTED" || msg.includes("timeout")) {
      event.sender.send("conversion-progress", {
        status: "FAILED",
        progress: 100,
        message: "Kết nối tới máy chủ quá lâu. Vui lòng thử lại."
      });
      return;
    }
    if (error.response) {
      event.sender.send("conversion-progress", {
        status: "FAILED",
        progress: 100,
        message: `Máy chủ lỗi (${error.response.status}). Vui lòng thử lại.`
      });
      return;
    }
    event.sender.send("conversion-progress", {
      status: "FAILED",
      progress: 100,
      message: "Lỗi khi chuyển đổi, vui lòng thay đổi hình ảnh chất lượng tốt hơn (300 DPI) và thử lại."
    });
  }
});
ipcMain.handle("download-musicxml", async (_event, jobId) => {
  try {
    const apis = getApiUrls();
    console.log("Downloading from:", `${apis.download}/${jobId}`);
    const response = await axios.get(`${apis.download}/${jobId}`, {
      responseType: "arraybuffer",
      timeout: 3e5
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
const __filename$1 = fileURLToPath(import.meta.url);
const __dirname$1 = path.dirname(__filename$1);
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
console.log("Environment variables loaded:", {
  CONVERT_API_URL: process.env.VITE_CONVERT_API_URL,
  DOWNLOAD_API_URL: process.env.VITE_DOWNLOAD_API_URL,
  STATUS_API_URL: process.env.VITE_STATUS_API_URL
});
let mainWin = null;
function createWindow() {
  mainWin = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname$1, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true
    }
  });
  mainWin.maximize();
  const win = mainWin;
  Menu.setApplicationMenu(Menu.buildFromTemplate([
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
  ]));
  win.webContents.on("console-message", (_e, _lvl, message) => {
    console.log(`[RENDERER]: ${message}`);
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname$1, "../renderer/index.html"));
  }
  win.setMenuBarVisibility(false);
  win.webContents.openDevTools({ mode: "right" });
  win.on("closed", () => {
    mainWin = null;
  });
}
app.whenReady().then(() => {
  createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
