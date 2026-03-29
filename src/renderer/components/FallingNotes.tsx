// src/renderer/components/FallingNotes.tsx
import { useEffect, useRef } from 'react';
import { usePlaybackStore } from '../store/usePlaybackStore';

const FIRST_MIDI = 36;
const LAST_MIDI  = 96;

// ─── Logic copy từ PianoKeyboard để đảm bảo tọa độ X khớp 100% ──────────────
function isBlack(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

const ALL_KEYS = (() => {
  const keys: { midi: number; black: boolean; name: string }[] = [];
  for (let m = FIRST_MIDI; m <= LAST_MIDI; m++) {
    keys.push({ midi: m, black: isBlack(m), name: '' });
  }
  return keys;
})();

const WHITE_KEYS = ALL_KEYS.filter(k => !k.black);
const WHITE_X    = new Map<number, number>();
WHITE_KEYS.forEach((k, i) => WHITE_X.set(k.midi, i * 36));

function getBlackKeyX(midi: number): number {
  const lx = WHITE_X.get(midi - 1);
  return lx !== undefined ? lx + 36 - 11 : 0;
}

// ─── Constants cho Canvas ────────────────────────────────────────────────────
const CANVAS_HEIGHT = 300; // Chiều cao vùng nốt rơi
const PIXELS_PER_SEC = 150; // Tốc độ rơi (pixel/giây)

export default function FallingNotes() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Chiều rộng tổng y hệt PianoKeyboard
    const totalWidth = WHITE_KEYS.length * 36;
    canvas.width = totalWidth;
    canvas.height = CANVAS_HEIGHT;

    let animationFrameId: number;
    let lastTime = performance.now();
    let displaySec = usePlaybackStore.getState().currentSec;

    const renderLoop = () => {
      const state = usePlaybackStore.getState();
      const music = state.music;
      const status = state.status;
      const targetSec = state.currentSec;
      const speed = state.speed;

      // Tính delta time để nội suy (interpolate) 60FPS cực mượt
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      if (status === 'playing') {
        displaySec += dt * speed;
        // Nếu chênh lệch giữa store và display quá lớn (>0.2s), thì sync lại
        if (Math.abs(displaySec - targetSec) > 0.2) {
          displaySec = targetSec;
        }
      } else {
        displaySec = targetSec;
      }

      // Xóa khung hình cũ
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (music && music.notes) {
        // Vẽ nốt nhạc
        music.notes.forEach(note => {
          // Tính Y tọa độ
          const bottomY = CANVAS_HEIGHT - (note.startSec - displaySec) * PIXELS_PER_SEC;
          const height = note.durationSec * PIXELS_PER_SEC;
          const topY = bottomY - height;

          // Bỏ qua nếu nốt nằm ngoài màn hình (tối ưu hiệu năng)
          if (bottomY < 0 || topY > CANVAS_HEIGHT) return;

          const isBlk = isBlack(note.midiNote);
          const x = isBlk ? getBlackKeyX(note.midiNote) : WHITE_X.get(note.midiNote)!;
          // Phím trắng rộng 34px, đen 22px
          const w = isBlk ? 22 : 34;

          // Màu nốt (giống hình bạn gửi: vàng cam cho nốt melody/hợp âm)
          ctx.fillStyle = isBlk ? '#f59e0b' : '#fbbf24'; // Màu vàng Synthesia

          // Vẽ khối nốt bo góc (Rounded Rectangle)
          const radius = 4;
          ctx.beginPath();
          ctx.roundRect(x, topY, w, height, radius);
          ctx.fill();

          // Vẽ viền mờ cho đẹp
          ctx.strokeStyle = 'rgba(0,0,0,0.1)';
          ctx.lineWidth = 1;
          ctx.stroke();

          // Vẽ Text bên trong nốt (chữ A, B, C...)
          if (height > 15) { // Chỉ hiển thị chữ nếu nốt đủ dài
            ctx.fillStyle = '#1a1814';
            ctx.font = 'bold 11px "DM Sans", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            // Cắt lấy chữ cái đầu tiên (vd: C#4 -> C)
            const noteLetter = note.pitch.charAt(0);
            ctx.fillText(noteLetter, x + w / 2, bottomY - 4);
          }
        });
      }

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <div style={{ height: CANVAS_HEIGHT, background: '#111827', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  );
}