// Composable quản lý vòng đời máy quét QR (html5-qrcode).
// Dùng chung cho tab Quét QR và tab Gán thẻ. CHỈ 1 camera chạy 1 lúc:
// tự khởi động khi mount, tự dừng+clear khi unmount (đổi tab/rời trang).
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { Html5Qrcode } from 'html5-qrcode';

export function useScanner(elementId, onScan) {
  let scanner = null;
  const failed = ref(false);   // true khi không mở được camera (không phải HTTPS/localhost, hoặc bị chặn)

  async function start() {
    try {
      scanner = new Html5Qrcode(elementId);
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (text) => onScan(text.trim()),
        () => {}, // callback lỗi từng khung hình - bỏ qua
      );
    } catch {
      failed.value = true;
      scanner = null;
    }
  }

  async function stop() {
    if (scanner) {
      try { await scanner.stop(); scanner.clear(); } catch {}
      scanner = null;
    }
  }

  onMounted(start);
  onBeforeUnmount(stop);

  return { failed };
}

// Rung phản hồi khi quét (nếu thiết bị hỗ trợ).
export function vibrate(pattern) {
  try { navigator.vibrate && navigator.vibrate(pattern); } catch {}
}
