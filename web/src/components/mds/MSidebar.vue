<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

/**
 * MSidebar — thanh điều hướng trái chuẩn MDS 2.0 (style sidebar TRẮNG).
 * 2 chế độ: Mở rộng (~240px, icon + label, nhóm con xổ dọc) và Thu gọn
 * (~56px, chỉ icon; hover hiện popover bên phải với label/menu con).
 * Active: nền brand-50, chữ/icon brand-600 semibold + thanh chỉ báo 3px trái.
 */
const props = defineProps({
  // [{ key, label, icon?, children?: [{ key, label }], badge? }]
  // icon: tên file SVG trong assets/icons (vd 'home', 'users'), không đuôi .svg
  items: { type: Array, default: () => [] },
  // key của item/child đang active (v-model)
  modelValue: { type: String, default: '' },
  // trạng thái thu gọn (v-model:collapsed)
  collapsed: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'update:collapsed'])

/* ── Icon dùng chung MDS ────────────────────────────────────────
   Path copy nguyên văn từ assets/icons/<tên>.svg (bộ icon chính thức,
   stroke 1.5) để component tự chứa — không import file ngoài.
   Tên icon không có trong map → fallback ô tròn chữ cái đầu label. */
const ICON_PATHS = {
  'alert-circle': ['M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0', 'M12 8v4', 'M12 16h.01'],
  'alert-triangle': ['M12 9v4', 'M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0', 'M12 16h.01'],
  'arrow-down': ['M12 5l0 14', 'M18 13l-6 6', 'M6 13l6 6'],
  'arrow-left': ['M5 12l14 0', 'M5 12l6 6', 'M5 12l6 -6'],
  'arrow-right': ['M5 12l14 0', 'M13 18l6 -6', 'M13 6l6 6'],
  'arrow-up': ['M12 5l0 14', 'M18 11l-6 -6', 'M6 11l6 -6'],
  'arrows-sort': ['M3 9l4 -4l4 4m-4 -4v14', 'M21 15l-4 4l-4 -4m4 4v-14'],
  bell: ['M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6', 'M9 17v1a3 3 0 0 0 6 0v-1'],
  bookmark: ['M18 7v14l-6 -4l-6 4v-14a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4'],
  briefcase: ['M3 9a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2l0 -9', 'M8 7v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2', 'M12 12l0 .01', 'M3 13a20 20 0 0 0 18 0'],
  building: ['M3 21l18 0', 'M9 8l1 0', 'M9 12l1 0', 'M9 16l1 0', 'M14 8l1 0', 'M14 12l1 0', 'M14 16l1 0', 'M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16'],
  calendar: ['M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12', 'M16 3v4', 'M8 3v4', 'M4 11h16', 'M11 15h1', 'M12 15v3'],
  camera: ['M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2', 'M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0'],
  cash: ['M7 15h-3a1 1 0 0 1 -1 -1v-8a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v3', 'M7 10a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v8a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1l0 -8', 'M12 14a2 2 0 1 0 4 0a2 2 0 0 0 -4 0'],
  'chart-bar': ['M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -6', 'M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -10', 'M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -14', 'M4 20h14'],
  'chart-pie': ['M10 3.2a9 9 0 1 0 10.8 10.8a1 1 0 0 0 -1 -1h-6.8a2 2 0 0 1 -2 -2v-7a.9 .9 0 0 0 -1 -.8', 'M15 3.5a9 9 0 0 1 5.5 5.5h-4.5a1 1 0 0 1 -1 -1v-4.5'],
  check: ['M5 12l5 5l10 -10'],
  'chevron-down': ['M6 9l6 6l6 -6'],
  'chevron-left': ['M15 6l-6 6l6 6'],
  'chevron-right': ['M9 6l6 6l-6 6'],
  'chevron-up': ['M6 15l6 -6l6 6'],
  'chevrons-left': ['M11 7l-5 5l5 5', 'M17 7l-5 5l5 5'],
  'chevrons-right': ['M7 7l5 5l-5 5', 'M13 7l5 5l-5 5'],
  'circle-check': ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M9 12l2 2l4 -4'],
  'circle-x': ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M10 10l4 4m0 -4l-4 4'],
  clock: ['M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0', 'M12 7v5l3 3'],
  'cloud-download': ['M19 18a3.5 3.5 0 0 0 0 -7h-1a5 4.5 0 0 0 -11 -2a4.6 4.4 0 0 0 -2.1 8.4', 'M12 13l0 9', 'M9 19l3 3l3 -3'],
  'cloud-upload': ['M7 18a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7h-1', 'M9 15l3 -3l3 3', 'M12 12l0 9'],
  copy: ['M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666', 'M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1'],
  'credit-card': ['M3 8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3l0 -8', 'M3 10l18 0', 'M7 15l.01 0', 'M11 15l2 0'],
  database: ['M4 6a8 3 0 1 0 16 0a8 3 0 1 0 -16 0', 'M4 6v6a8 3 0 0 0 16 0v-6', 'M4 12v6a8 3 0 0 0 16 0v-6'],
  'device-floppy': ['M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2', 'M10 14a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', 'M14 4l0 4l-6 0l0 -4'],
  'dots-vertical': ['M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M11 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M11 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0'],
  dots: ['M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0'],
  download: ['M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2', 'M7 11l5 5l5 -5', 'M12 4l0 12'],
  'external-link': ['M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6', 'M11 13l9 -9', 'M15 4h5v5'],
  'eye-off': ['M10.585 10.587a2 2 0 0 0 2.829 2.828', 'M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87', 'M3 3l18 18'],
  eye: ['M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0', 'M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6'],
  'file-export': ['M14 3v4a1 1 0 0 0 1 1h4', 'M11.5 21h-4.5a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v5m-5 6h7m-3 -3l3 3l-3 3'],
  'file-import': ['M14 3v4a1 1 0 0 0 1 1h4', 'M5 13v-8a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2h-5.5m-9.5 -2h7m-3 -3l3 3l-3 3'],
  'file-text': ['M14 3v4a1 1 0 0 0 1 1h4', 'M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2', 'M9 9l1 0', 'M9 13l6 0', 'M9 17l6 0'],
  file: ['M14 3v4a1 1 0 0 0 1 1h4', 'M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2'],
  'filter-off': ['M8 4h12v2.172a2 2 0 0 1 -.586 1.414l-3.914 3.914m-.5 3.5v4l-6 2v-8.5l-4.48 -4.928a2 2 0 0 1 -.52 -1.345v-2.227', 'M3 3l18 18'],
  filter: ['M4 4h16v2.172a2 2 0 0 1 -.586 1.414l-4.414 4.414v7l-6 2v-8.5l-4.48 -4.928a2 2 0 0 1 -.52 -1.345v-2.227'],
  folder: ['M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2'],
  help: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M12 17l0 .01', 'M12 13.5a1.5 1.5 0 0 1 1 -1.5a2.6 2.6 0 1 0 -3 -4'],
  home: ['M5 12l-2 0l9 -9l9 9l-2 0', 'M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7', 'M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6'],
  'info-circle': ['M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0', 'M12 9h.01', 'M11 12h1v4h1'],
  'layout-grid': ['M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4', 'M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4', 'M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4', 'M14 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4'],
  link: ['M9 15l6 -6', 'M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464', 'M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463'],
  list: ['M9 6l11 0', 'M9 12l11 0', 'M9 18l11 0', 'M5 6l0 .01', 'M5 12l0 .01', 'M5 18l0 .01'],
  'lock-open': ['M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2l0 -6', 'M11 16a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M8 11v-5a4 4 0 0 1 8 0'],
  lock: ['M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6', 'M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0', 'M8 11v-4a4 4 0 1 1 8 0v4'],
  login: ['M15 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2', 'M21 12h-13l3 -3', 'M11 15l-3 -3'],
  logout: ['M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2', 'M9 12h12l-3 -3', 'M18 15l3 -3'],
  mail: ['M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10', 'M3 7l9 6l9 -6'],
  'map-pin': ['M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0', 'M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0'],
  'menu-2': ['M4 6l16 0', 'M4 12l16 0', 'M4 18l16 0'],
  message: ['M8 9h8', 'M8 13h6', 'M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12'],
  paperclip: ['M15 7l-6.5 6.5a1.5 1.5 0 0 0 3 3l6.5 -6.5a3 3 0 0 0 -6 -6l-6.5 6.5a4.5 4.5 0 0 0 9 9l6.5 -6.5'],
  pencil: ['M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4', 'M13.5 6.5l4 4'],
  phone: ['M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2'],
  photo: ['M15 8h.01', 'M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12', 'M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5', 'M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3'],
  plus: ['M12 5l0 14', 'M5 12l14 0'],
  printer: ['M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2', 'M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4', 'M7 15a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2l0 -4'],
  receipt: ['M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2m4 -14h6m-6 4h6m-2 4h2'],
  refresh: ['M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4', 'M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4'],
  search: ['M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0', 'M21 21l-6 -6'],
  send: ['M10 14l11 -11', 'M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5'],
  settings: ['M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065', 'M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0'],
  share: ['M3 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0', 'M15 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0', 'M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0', 'M8.7 10.7l6.6 -3.4', 'M8.7 13.3l6.6 3.4'],
  'sort-ascending': ['M4 6l7 0', 'M4 12l7 0', 'M4 18l9 0', 'M15 9l3 -3l3 3', 'M18 6l0 12'],
  'sort-descending': ['M4 6l9 0', 'M4 12l7 0', 'M4 18l7 0', 'M15 15l3 3l3 -3', 'M18 6l0 12'],
  star: ['M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245'],
  tag: ['M6.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3'],
  trash: ['M4 7l16 0', 'M10 11l0 6', 'M14 11l0 6', 'M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12', 'M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3'],
  upload: ['M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2', 'M7 9l5 -5l5 5', 'M12 4l0 12'],
  user: ['M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0', 'M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2'],
  users: ['M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0', 'M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2', 'M16 3.13a4 4 0 0 1 0 7.75', 'M21 21v-2a4 4 0 0 0 -3 -3.85'],
  wallet: ['M17 8v-3a1 1 0 0 0 -1 -1h-10a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3m0 4v3a1 1 0 0 1 -1 1h-12a2 2 0 0 1 -2 -2v-12', 'M20 12v4h-4a2 2 0 0 1 0 -4h4'],
  x: ['M18 6l-12 12', 'M6 6l12 12'],
}

// Chấp nhận cả 'home' lẫn 'home.svg'; không có trong bộ → null (dùng fallback)
function iconPaths(name) {
  return ICON_PATHS[String(name || '').replace(/\.svg$/, '')] || null
}

/* ── Trạng thái active ──────────────────────────────────────────
   Quy tắc MDS: item con active thì cha KHÔNG cần thể hiện active ở
   chế độ mở rộng; nhưng khi THU GỌN (con bị ẩn) thì cha phải active
   để người dùng biết đang ở phân hệ nào. */
const isActive = (key) => props.modelValue === key

function hasActiveChild(item) {
  return (item.children || []).some((c) => c.key === props.modelValue)
}

// Active hiển thị của item cấp 1 tùy theo chế độ
function parentActive(item) {
  if (isActive(item.key)) return true
  return props.collapsed && hasActiveChild(item)
}

/* ── Xổ / đóng nhóm con (chế độ mở rộng) ───────────────────── */
const openGroups = ref([]) // danh sách key nhóm đang xổ

function toggleGroup(key) {
  const i = openGroups.value.indexOf(key)
  i >= 0 ? openGroups.value.splice(i, 1) : openGroups.value.push(key)
}

const isOpen = (key) => openGroups.value.includes(key)

// Tự xổ nhóm chứa item con đang active (kể cả giá trị khởi tạo)
watch(
  () => props.modelValue,
  (val) => {
    const parent = props.items.find((it) =>
      (it.children || []).some((c) => c.key === val)
    )
    if (parent && !openGroups.value.includes(parent.key)) {
      openGroups.value.push(parent.key)
    }
  },
  { immediate: true }
)

/* ── Popover khi thu gọn ────────────────────────────────────────
   Hover item → popover nổi bên phải (teleport body, định vị theo
   getBoundingClientRect): item thường hiện label, item có children
   hiện menu con chọn được. Rời chuột khỏi cả item lẫn popover thì
   tự ẩn (delay nhỏ để kịp di chuột vào popover). */
const pop = ref(null) // { item, style }
const popRef = ref(null)
let hideTimer = null

function showPopover(item, ev) {
  if (!props.collapsed) return
  clearTimeout(hideTimer)
  const rect = ev.currentTarget.getBoundingClientRect()
  pop.value = {
    item,
    style: {
      position: 'fixed',
      left: `${rect.right + 6}px`,
      top: `${rect.top}px`,
    },
  }
  // Sau khi render: kẹp theo mép dưới viewport để menu con không tràn
  nextTick(() => {
    const el = popRef.value
    if (!el || !pop.value) return
    const maxTop = window.innerHeight - el.offsetHeight - 8
    if (rect.top > maxTop) {
      pop.value.style = { ...pop.value.style, top: `${Math.max(8, maxTop)}px` }
    }
  })
}

function scheduleHidePopover() {
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => (pop.value = null), 120)
}

function cancelHidePopover() {
  clearTimeout(hideTimer)
}

// Cuộn/resize khi popover đang mở → đóng (anchor đã dịch chuyển)
function closePopover() {
  clearTimeout(hideTimer)
  pop.value = null
}

watch(pop, (val) => {
  if (val) {
    window.addEventListener('scroll', closePopover, true)
    window.addEventListener('resize', closePopover)
  } else {
    window.removeEventListener('scroll', closePopover, true)
    window.removeEventListener('resize', closePopover)
  }
})

// Đổi chế độ thu gọn/mở rộng thì dọn popover
watch(
  () => props.collapsed,
  () => closePopover()
)

onBeforeUnmount(() => {
  clearTimeout(hideTimer)
  window.removeEventListener('scroll', closePopover, true)
  window.removeEventListener('resize', closePopover)
})

/* ── Chọn item ─────────────────────────────────────────────── */
function selectKey(key) {
  emit('update:modelValue', key)
  closePopover()
}

function onItemClick(item, ev) {
  if (props.collapsed) {
    // Thu gọn: item có con → mở popover menu con (hỗ trợ cả touch);
    // item thường → chọn luôn
    item.children?.length ? showPopover(item, ev) : selectKey(item.key)
  } else {
    item.children?.length ? toggleGroup(item.key) : selectKey(item.key)
  }
}

function toggleCollapsed() {
  emit('update:collapsed', !props.collapsed)
}
</script>

<template>
  <!-- Sidebar trắng, border phải, transition width 200ms giữa 2 chế độ -->
  <aside
    class="flex h-full shrink-0 flex-col overflow-hidden border-r border-[var(--mds-border)] bg-[var(--mds-bg)] transition-[width] duration-200"
    :class="collapsed ? 'w-14' : 'w-60'"
  >
    <nav class="flex-1 overflow-y-auto overflow-x-hidden py-2" aria-label="Menu chính">
      <template v-for="item in items" :key="item.key">
        <!-- ── Item cấp 1 ── -->
        <button
          type="button"
          class="relative flex h-9 w-full items-center text-[13px] leading-[18px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
          :class="[
            collapsed ? 'justify-center' : 'gap-2.5 px-4 text-left',
            parentActive(item)
              ? 'bg-[var(--mds-brand-50)] font-semibold text-[var(--mds-brand-600)]'
              : 'text-[var(--mds-text)] hover:bg-[var(--mds-bg-disabled)]',
          ]"
          :aria-expanded="item.children?.length ? (collapsed ? undefined : isOpen(item.key)) : undefined"
          :aria-current="parentActive(item) ? 'page' : undefined"
          :title="collapsed ? undefined : item.label"
          @click="onItemClick(item, $event)"
          @mouseenter="collapsed && showPopover(item, $event)"
          @mouseleave="collapsed && scheduleHidePopover()"
        >
          <!-- Thanh chỉ báo active 3px bên trái -->
          <span
            v-if="parentActive(item)"
            class="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-[var(--mds-brand-600)]"
            aria-hidden="true"
          />

          <!-- Icon 20px stroke 1.5 (wrapper relative để gắn chấm badge khi thu gọn) -->
          <span class="relative flex h-5 w-5 shrink-0 items-center justify-center">
            <svg
              v-if="iconPaths(item.icon)"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-5 w-5"
              :class="parentActive(item) ? '' : 'text-[var(--mds-icon-neutral)]'"
            >
              <path v-for="(d, i) in iconPaths(item.icon)" :key="i" :d="d" />
            </svg>
            <!-- Fallback: icon không có trong bộ → ô tròn chữ cái đầu label -->
            <span
              v-else
              class="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--mds-brand-100)] text-[10px] font-semibold uppercase text-[var(--mds-brand-600)]"
            >
              {{ String(item.label || '?').trim().charAt(0) }}
            </span>
            <!-- Badge thu gọn: chấm đỏ góc trên phải icon -->
            <span
              v-if="collapsed && item.badge"
              class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--mds-danger)]"
              aria-hidden="true"
            />
          </span>

          <template v-if="!collapsed">
            <span class="flex-1 truncate">{{ item.label }}</span>
            <!-- Badge mở rộng: pill đỏ nhỏ cạnh label -->
            <span
              v-if="item.badge"
              class="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--mds-danger)] px-1 text-[11px] font-medium leading-none text-white"
            >
              {{ item.badge }}
            </span>
            <!-- Chevron xổ nhóm: xoay 180° khi đang mở -->
            <svg
              v-if="item.children?.length"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4 shrink-0 text-[var(--mds-icon-neutral)] transition-transform duration-200"
              :class="isOpen(item.key) ? 'rotate-180' : ''"
            >
              <path v-for="(d, i) in ICON_PATHS['chevron-down']" :key="i" :d="d" />
            </svg>
          </template>
        </button>

        <!-- ── Nhóm con xổ dọc (chỉ ở chế độ mở rộng) ── -->
        <template v-if="!collapsed && item.children?.length && isOpen(item.key)">
          <button
            v-for="child in item.children"
            :key="child.key"
            type="button"
            class="relative flex h-9 w-full items-center pl-[46px] pr-4 text-left text-[13px] leading-[18px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
            :class="
              isActive(child.key)
                ? 'bg-[var(--mds-brand-50)] font-semibold text-[var(--mds-brand-600)]'
                : 'text-[var(--mds-text)] hover:bg-[var(--mds-bg-disabled)]'
            "
            :aria-current="isActive(child.key) ? 'page' : undefined"
            @click="selectKey(child.key)"
          >
            <span
              v-if="isActive(child.key)"
              class="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-[var(--mds-brand-600)]"
              aria-hidden="true"
            />
            <span class="truncate">{{ child.label }}</span>
          </button>
        </template>
      </template>
    </nav>

    <!-- ── Nút Thu gọn / Mở rộng: cuối sidebar, kẻ border-top ── -->
    <button
      type="button"
      class="flex h-10 w-full shrink-0 items-center border-t border-[var(--mds-border)] text-[13px] leading-[18px] text-[var(--mds-icon-neutral)] transition-colors hover:bg-[var(--mds-bg-disabled)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
      :class="collapsed ? 'justify-center' : 'gap-2.5 px-4'"
      :aria-label="collapsed ? 'Mở rộng menu' : 'Thu gọn menu'"
      @click="toggleCollapsed"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="h-5 w-5 shrink-0"
      >
        <path
          v-for="(d, i) in ICON_PATHS[collapsed ? 'chevrons-right' : 'chevrons-left']"
          :key="i"
          :d="d"
        />
      </svg>
      <span v-if="!collapsed">Thu gọn</span>
    </button>
  </aside>

  <!-- ── Popover chế độ thu gọn (teleport body, nổi che giao diện) ── -->
  <Teleport to="body">
    <div
      v-if="pop"
      ref="popRef"
      :style="pop.style"
      class="z-[1000] min-w-[160px] max-w-[280px] rounded border border-[var(--mds-border)] bg-[var(--mds-bg)] py-1 shadow-lg"
      role="menu"
      @mouseenter="cancelHidePopover"
      @mouseleave="scheduleHidePopover"
    >
      <!-- Item có children: tên nhóm + menu con chọn được -->
      <template v-if="pop.item.children?.length">
        <div
          class="px-3 py-1.5 text-[13px] font-semibold leading-[18px] text-[var(--mds-text)]"
        >
          {{ pop.item.label }}
        </div>
        <button
          v-for="child in pop.item.children"
          :key="child.key"
          type="button"
          role="menuitem"
          class="flex h-8 w-full items-center px-3 text-left text-[13px] leading-[18px] transition-colors"
          :class="
            isActive(child.key)
              ? 'bg-[var(--mds-brand-50)] font-semibold text-[var(--mds-brand-600)]'
              : 'text-[var(--mds-text)] hover:bg-[var(--mds-bg-disabled)]'
          "
          @click="selectKey(child.key)"
        >
          <span class="truncate">{{ child.label }}</span>
        </button>
      </template>

      <!-- Item thường: chỉ hiện label (kèm badge nếu có) -->
      <div
        v-else
        class="flex items-center gap-2 px-3 py-1.5 text-[13px] leading-[18px] text-[var(--mds-text)]"
      >
        <span>{{ pop.item.label }}</span>
        <span
          v-if="pop.item.badge"
          class="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--mds-danger)] px-1 text-[11px] font-medium leading-none text-white"
        >
          {{ pop.item.badge }}
        </span>
      </div>
    </div>
  </Teleport>
</template>
