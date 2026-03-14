# 🎵 Muse Parse - Quick Start Guide

**Muse Parse** là một ứng dụng Desktop (Electron + React) mô phỏng không gian Studio học nhạc chuyên nghiệp. Ứng dụng cho phép chuyển đổi ảnh sheet nhạc thành bản nhạc số có thể phát âm thanh, đồng thời tích hợp hệ thống gamification (bàn phím ảo, tính điểm) để người dùng luyện tập.

---

## ⚡ Fast Setup (2 minutes)


### 1. Cài đặt dependencies
```
npm install
```

### 2. Tạo file biến môi trường
```
cp .env.example .env
```

### 3. Khởi chạy ứng dụng (Môi trường dev)
```
npm run dev
```

Ứng dụng Electron sẽ tự động mở lên với giao diện Studio!

---

## Configuration

Chỉnh sửa file `.env` ở thư mục gốc. Đảm bảo bạn đã cấu hình đủ các API endpoints cho quá trình xử lý:

```
# URL để upload ảnh và nhận JobID
VITE_CONVERT_API_URL=http://localhost:2104/api/v1/musicxml/convert

# URL để polling kiểm tra trạng thái Job
VITE_STATUS_API_URL=http://localhost:2104/api/v1/musicxml/status

# URL để tải file MXL sau khi hoàn thành
VITE_DOWNLOAD_API_URL=http://localhost:2104/api/v1/musicxml/download
```

*(Thay thế bằng các API endpoint thực tế của backend)*


## 🎮 Using the App

1. **Chọn Engine** → Tại thanh Sidebar bên trái, chọn phương thức xử lý (Audiveris API hoặc Custom AI Model).
2. **Chọn ảnh** → Bấm "📄 Chọn ảnh Sheet nhạc" và tải lên hình ảnh bản nhạc.
3. **Chuyển đổi** → Bấm "Bắt đầu Chuyển đổi" và đợi thanh tiến trình hoàn tất.
4. **Luyện tập (Gamification)**:
   - Bấm **▶️ Play** ở thanh công cụ phía trên để nghe máy phát mẫu.
   - Sử dụng bàn phím máy tính (các phím \`A, W, S, E, D, F...\`) để tương tác với **Bàn phím ảo (Virtual Piano)** ở dưới cùng.
   - Hệ thống sẽ tự động ghi nhận Combo và Điểm số (Score) ở góc phải!

---

## 📦 What Was Built

### ✅ Main Features
- **Dual Processing Engine:** Hỗ trợ linh hoạt giữa API Audiveris (xuất MusicXML) và Custom AI Model (xuất \`**kern\`).
- **Professional UI/UX:** Giao diện Split-pane phong cách Studio tĩnh lặng, tập trung vào bản nhạc.
- **Smart Sheet Viewer:** Tự động điều hướng bộ render tùy theo định dạng file (\`xml\` hoặc \`kern\`).
- **Audio & Gamification:** Tích hợp Soundfont-player phát âm thanh Piano chuẩn, kèm Bàn phím ảo (Virtual Keyboard) và hệ thống tính điểm theo thời gian thực.
- **Resilient Upload:** Cơ chế upload file lớn với hệ thống Polling API theo dõi trạng thái job tự động.

### ✅ Architecture
```
Main Process (Node.js) -> Quản lý File Hệ thống & Gọi API
    ↕ IPC (Inter-Process Communication)
Preload (Security Bridge) -> Expose API an toàn
    ↕ window.electron
Renderer (React UI + Vite) -> Quản lý State & Giao diện
```

### ✅ Security
- Bật Context Isolation (Cách ly ngữ cảnh).
- Tắt Node Integration trên Renderer.
- Giới hạn các kênh giao tiếp IPC chặt chẽ qua file \`preload/index.ts\`.

---

## 📝 Project Structure

Cấu trúc thư mục cốt lõi của dự án:

```
src/
├── main/
│   ├── index.ts              # Khởi tạo cửa sổ Electron
│   └── services/
│       └── converter.ts      # Xử lý IPC Upload/Download/Polling
├── preload/
│   └── index.ts              # Cầu nối bảo mật (Context Bridge)
└── renderer/
    ├── App.tsx               # Layout chính (Sidebar & Workspace)
    ├── App.css               # CSS biến toàn cục phong cách Studio
    ├── components/
    │   ├── SmartSheetViewer.tsx # Routing hiển thị sheet nhạc
    │   ├── SheetMusicViewer.tsx # Render MusicXML (OSMD)
    │   ├── AudioPlayer.tsx      # Quản lý phát nhạc & nhịp điệu
    │   └── VirtualPiano.tsx     # Bàn phím ảo & bắt sự kiện gõ phím
    └── types/
        ├── index.ts          # Type Definitions (MusicData, Engine...)
        └── electron.d.ts     # TypeScript declarations cho window.electron
```

---

## 🐛 Troubleshooting

### Lỗi khi khởi chạy ứng dụng (Màn hình trắng / Không load được)
```
# Xóa bộ nhớ đệm của Vite và cài đặt lại
rm -rf dist-electron node_modules/.vite
npm install
npm run dev
```

### Âm thanh không phát ra
- Lần đầu tiên chạy, thư viện \`soundfont-player\` cần tải file âm thanh từ CDN. Hãy kiểm tra kết nối mạng.

### Hiển thị định dạng \`**kern\` trống
- Hiện tại hệ thống đang hiển thị mã raw \`**kern\` như một bước đệm. Cần tích hợp thêm thư viện **Verovio** để render nốt nhạc đồ họa cho định dạng này (Sẽ phát triển sau).

---

## 🚀 Production Build

Khi muốn đóng gói ứng dụng thành file \`.exe\` (Windows) hoặc \`.dmg\` (Mac):

```
npm run build
npm run electron:build
```