import { app, BrowserWindow, Menu } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
console.log('Environment variables loaded:', {
  CONVERT_API_URL: process.env.VITE_CONVERT_API_URL,
  DOWNLOAD_API_URL: process.env.VITE_DOWNLOAD_API_URL,
  STATUS_API_URL: process.env.VITE_STATUS_API_URL,
});

import './services/converter.js';

let mainWin: BrowserWindow | null = null;

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
    },
  });
  mainWin.maximize();

  const win = mainWin;

  // 1. Dùng role chuẩn của Electron thay vì gán click thủ công
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
  ]));

  win.webContents.on('console-message', (_e, _lvl, message) => {
    console.log(`[RENDERER]: ${message}`);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  win.setMenuBarVisibility(false);
  win.webContents.openDevTools({ mode: 'right' });

  win.on('closed', () => { mainWin = null; });
}

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});