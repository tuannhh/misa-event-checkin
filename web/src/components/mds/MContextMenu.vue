<script setup>
import { ref, computed, nextTick, onBeforeUnmount } from 'vue'

const props = defineProps({
  // Mảng item: { key, label, icon?, danger?, disabled?, divider?, children? }
  // - icon: tên file trong assets/icons (vd 'pencil', 'trash') — render inline SVG stroke 1.5, 16px
  // - danger: chữ đỏ --mds-danger (xóa/hủy)
  // - divider: true → chỉ vẽ đường kẻ phân cách nhóm (theo spec Context menu MDS)
  // - children: mảng item con — submenu mở sang phải khi hover
  items: { type: Array, default: () => [] },
})

const emit = defineEmits(['select'])

/* ── Bộ path icon lấy từ assets/icons (Tabler, stroke 1.5) ──
   Icon không có trong bộ này → để trống bên trái, vẫn giữ căn lề (theo spec). */
const ICON_PATHS = {
  pencil: ['M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4', 'M13.5 6.5l4 4'],
  trash: ['M4 7l16 0', 'M10 11l0 6', 'M14 11l0 6', 'M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12', 'M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3'],
  copy: ['M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666', 'M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1'],
  plus: ['M12 5l0 14', 'M5 12l14 0'],
  download: ['M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2', 'M7 11l5 5l5 -5', 'M12 4l0 12'],
  upload: ['M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2', 'M7 9l5 -5l5 5', 'M12 4l0 12'],
  share: ['M3 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0', 'M15 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0', 'M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0', 'M8.7 10.7l6.6 -3.4', 'M8.7 13.3l6.6 3.4'],
  eye: ['M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0', 'M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6'],
  'eye-off': ['M10.585 10.587a2 2 0 0 0 2.829 2.828', 'M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87', 'M3 3l18 18'],
  printer: ['M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2', 'M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4', 'M7 15a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2l0 -4'],
  'file-export': ['M14 3v4a1 1 0 0 0 1 1h4', 'M11.5 21h-4.5a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v5m-5 6h7m-3 -3l3 3l-3 3'],
  'file-import': ['M14 3v4a1 1 0 0 0 1 1h4', 'M5 13v-8a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2h-5.5m-9.5 -2h7m-3 -3l3 3l-3 3'],
  'file-text': ['M14 3v4a1 1 0 0 0 1 1h4', 'M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2', 'M9 9l1 0', 'M9 13l6 0', 'M9 17l6 0'],
  refresh: ['M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4', 'M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4'],
  star: ['M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245'],
  link: ['M9 15l6 -6', 'M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464', 'M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463'],
  settings: ['M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065', 'M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0'],
  check: ['M5 12l5 5l10 -10'],
  'external-link': ['M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6', 'M11 13l9 -9', 'M15 4h5v5'],
  lock: ['M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6', 'M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0', 'M8 11v-4a4 4 0 1 1 8 0v4'],
  'lock-open': ['M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2l0 -6', 'M11 16a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M8 11v-5a4 4 0 0 1 8 0'],
  tag: ['M6.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3'],
  bookmark: ['M18 7v14l-6 -4l-6 4v-14a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4'],
  send: ['M10 14l11 -11', 'M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5'],
  mail: ['M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10', 'M3 7l9 6l9 -6'],
  search: ['M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0', 'M21 21l-6 -6'],
  filter: ['M4 4h16v2.172a2 2 0 0 1 -.586 1.414l-4.414 4.414v7l-6 2v-8.5l-4.48 -4.928a2 2 0 0 1 -.52 -1.345v-2.227'],
  dots: ['M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0'],
  'dots-vertical': ['M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M11 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M11 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0'],
  'circle-x': ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M10 10l4 4m0 -4l-4 4'],
  'device-floppy': ['M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2', 'M10 14a2 2 0 1 0 4 0a2 2 0 1 0 -4 0'],
  x: ['M18 6l-12 12', 'M6 6l12 12'],
}

function iconPaths(name) {
  return name ? ICON_PATHS[name] || null : null
}

const visible = ref(false)
const pos = ref({ x: 0, y: 0 })
const payload = ref(null)
const activeIndex = ref(-1)
// Submenu: index item cha đang mở, index item con đang active, hướng lật
const subOpen = ref(-1)
const subActive = ref(-1)
const subLeft = ref(false)
const subUp = ref(false)

const menuEl = ref(null)
const activatorEl = ref(null)
let subEl = null
function setSubEl(el) {
  subEl = el
}

// Cột icon chỉ chừa chỗ khi có ít nhất 1 item mang icon (giữ nhãn thẳng hàng theo spec)
const hasIcons = computed(() => props.items.some((it) => it.icon))

function closeSub() {
  subOpen.value = -1
  subActive.value = -1
  subLeft.value = false
  subUp.value = false
}

/* ── Mở/đóng ───────────────────────────────────────────── */

// API public: menuRef.open(event, payload) — định vị theo tọa độ chuột,
// tự lật khi sát mép màn hình
async function open(evt, pl) {
  if (evt && typeof evt.preventDefault === 'function') evt.preventDefault()
  payload.value = pl !== undefined ? pl : null
  activeIndex.value = -1
  closeSub()
  visible.value = true
  pos.value = { x: evt?.clientX ?? 0, y: evt?.clientY ?? 0 }
  await nextTick()
  const m = menuEl.value?.getBoundingClientRect()
  if (!m) return
  let { x, y } = pos.value
  // Sát mép phải/dưới → lật menu về phía ngược lại của con trỏ
  if (x + m.width > window.innerWidth - 8) x = Math.max(8, x - m.width)
  if (y + m.height > window.innerHeight - 8) y = Math.max(8, y - m.height)
  pos.value = { x, y }
  bindGlobal()
}

// Chế độ activator: click nút (⋮ / dropdown) → menu neo dưới nút, căn trái
async function onActivatorClick() {
  if (visible.value) {
    close()
    return
  }
  const r = activatorEl.value?.getBoundingClientRect()
  if (!r) return
  payload.value = null
  activeIndex.value = -1
  closeSub()
  visible.value = true
  pos.value = { x: r.left, y: r.bottom + 4 }
  await nextTick()
  const m = menuEl.value?.getBoundingClientRect()
  if (!m) return
  let { x, y } = pos.value
  // Lật theo cạnh nút khi thiếu chỗ
  if (x + m.width > window.innerWidth - 8) x = Math.max(8, r.right - m.width)
  if (y + m.height > window.innerHeight - 8) y = Math.max(8, r.top - m.height - 4)
  pos.value = { x, y }
  bindGlobal()
}

function close() {
  visible.value = false
  closeSub()
  unbindGlobal()
}

/* ── Đóng khi click ngoài / cuộn / resize ─────────────────── */

function onDocMousedown(e) {
  if (menuEl.value && menuEl.value.contains(e.target)) return
  // Click lên activator để handler toggle của nó xử lý, không đóng 2 lần
  if (activatorEl.value && activatorEl.value.contains(e.target)) return
  close()
}

function onScroll(e) {
  // Cuộn bên trong menu (danh sách dài) thì giữ nguyên
  if (menuEl.value && e.target instanceof Node && menuEl.value.contains(e.target)) return
  close()
}

function bindGlobal() {
  document.addEventListener('mousedown', onDocMousedown, true)
  document.addEventListener('keydown', onKeydown, true)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', close)
}

function unbindGlobal() {
  document.removeEventListener('mousedown', onDocMousedown, true)
  document.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', close)
}

onBeforeUnmount(unbindGlobal)

/* ── Chọn item ────────────────────────────────────────────── */

function selectItem(item) {
  if (!item || item.disabled || item.divider) return
  emit('select', { key: item.key, payload: payload.value })
  close()
}

function onRootClick(item, i) {
  if (item.disabled) return
  // Item có submenu: click chỉ mở submenu, không emit
  if (item.children && item.children.length) {
    activeIndex.value = i
    openSubFor(i, false)
    return
  }
  selectItem(item)
}

/* ── Submenu: mở sang phải khi hover, tự lật khi sát mép ──── */

async function openSubFor(i, focusFirst) {
  subOpen.value = i
  subLeft.value = false
  subUp.value = false
  subActive.value = focusFirst ? nextEnabled(props.items[i].children, -1, 1) : -1
  await nextTick()
  const r = subEl?.getBoundingClientRect()
  if (!r) return
  if (r.right > window.innerWidth - 8) subLeft.value = true
  if (r.bottom > window.innerHeight - 8) subUp.value = true
}

function onRootEnter(item, i) {
  if (item.disabled) {
    activeIndex.value = -1
    closeSub()
    return
  }
  activeIndex.value = i
  subActive.value = -1
  if (item.children && item.children.length) openSubFor(i, false)
  else closeSub()
}

/* ── Bàn phím: ↑↓ di chuyển, Enter chọn, →/← mở/đóng submenu, Esc đóng ── */

// Tìm index item chọn được kế tiếp (bỏ qua divider và disabled), xoay vòng
function nextEnabled(list, from, dir) {
  const n = list.length
  let i = from
  for (let s = 0; s < n; s++) {
    i = (i + dir + n) % n
    if (i < 0) i = dir > 0 ? 0 : n - 1
    const it = list[i]
    if (it && !it.divider && !it.disabled) return i
  }
  return -1
}

function onKeydown(e) {
  if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Enter', ' ', 'Escape'].includes(e.key)) return
  e.preventDefault()
  e.stopPropagation()
  if (e.key === 'Escape') {
    close()
    return
  }
  const inSub = subOpen.value >= 0 && subActive.value >= 0
  const subItems = subOpen.value >= 0 ? props.items[subOpen.value]?.children || [] : []
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const dir = e.key === 'ArrowDown' ? 1 : -1
    if (inSub) {
      subActive.value = nextEnabled(subItems, subActive.value, dir)
    } else {
      activeIndex.value = nextEnabled(props.items, activeIndex.value, dir)
      closeSub()
    }
    return
  }
  const rootItem = props.items[activeIndex.value]
  if (e.key === 'ArrowRight') {
    if (!inSub && rootItem?.children?.length && !rootItem.disabled) openSubFor(activeIndex.value, true)
    return
  }
  if (e.key === 'ArrowLeft') {
    if (subOpen.value >= 0) closeSub()
    return
  }
  // Enter / Space
  if (inSub) {
    selectItem(subItems[subActive.value])
  } else if (rootItem?.children?.length) {
    openSubFor(activeIndex.value, true)
  } else {
    selectItem(rootItem)
  }
}

defineExpose({ open, close })
</script>

<template>
  <!-- Activator (tùy chọn): nút ⋮ / dropdown — click để mở menu neo dưới nút -->
  <span v-if="$slots.activator" ref="activatorEl" class="inline-flex" @click="onActivatorClick">
    <slot name="activator" />
  </span>

  <Teleport to="body">
    <div
      v-if="visible"
      ref="menuEl"
      class="fixed z-[1100] max-h-[70vh] min-w-[180px] overflow-y-auto rounded border border-[var(--mds-border)] bg-[var(--mds-bg)] py-1 shadow-lg"
      :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
      role="menu"
      @contextmenu.prevent
    >
      <template v-for="(item, i) in items" :key="item.key ?? i">
        <!-- Đường kẻ ngăn cách giữa các nhóm chức năng liên quan (theo spec) -->
        <div v-if="item.divider" class="my-1 border-t border-[var(--mds-border)]" role="separator" />
        <div v-else class="relative">
          <button
            type="button"
            role="menuitem"
            :aria-disabled="item.disabled || undefined"
            :aria-haspopup="item.children && item.children.length ? 'menu' : undefined"
            class="flex h-8 w-full items-center gap-2 px-3 text-left text-[13px] leading-[18px]"
            :class="[
              item.disabled
                ? 'cursor-not-allowed text-[var(--mds-text-placeholder)]'
                : item.danger
                  ? 'text-[var(--mds-danger)]'
                  : 'text-[var(--mds-text)]',
              !item.disabled && activeIndex === i ? 'bg-[var(--mds-bg-hover-soft)]' : '',
            ]"
            @mouseenter="onRootEnter(item, i)"
            @click="onRootClick(item, i)"
          >
            <!-- Icon 16px stroke 1.5; không có icon vẫn chừa chỗ để nhãn thẳng hàng -->
            <span
              v-if="hasIcons"
              class="flex w-4 shrink-0 items-center justify-center"
              :class="item.disabled || item.danger ? '' : 'text-[var(--mds-icon-neutral)]'"
            >
              <svg v-if="iconPaths(item.icon)" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path v-for="(d, di) in iconPaths(item.icon)" :key="di" :d="d" />
              </svg>
            </span>
            <span class="flex-1 truncate">{{ item.label }}</span>
            <!-- Mũi tên báo có submenu -->
            <svg v-if="item.children && item.children.length" class="shrink-0 text-[var(--mds-icon-neutral)]" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 6l6 6l-6 6" />
            </svg>
          </button>

          <!-- Submenu mở sang phải khi hover; lật sang trái/lên trên khi sát mép -->
          <div
            v-if="subOpen === i && item.children && item.children.length"
            :ref="setSubEl"
            class="absolute z-[1101] min-w-[180px] rounded border border-[var(--mds-border)] bg-[var(--mds-bg)] py-1 shadow-lg"
            :class="[subLeft ? 'right-full' : 'left-full', subUp ? 'bottom-0' : 'top-0']"
            role="menu"
          >
            <template v-for="(child, j) in item.children" :key="child.key ?? j">
              <div v-if="child.divider" class="my-1 border-t border-[var(--mds-border)]" role="separator" />
              <button
                v-else
                type="button"
                role="menuitem"
                :aria-disabled="child.disabled || undefined"
                class="flex h-8 w-full items-center gap-2 px-3 text-left text-[13px] leading-[18px]"
                :class="[
                  child.disabled
                    ? 'cursor-not-allowed text-[var(--mds-text-placeholder)]'
                    : child.danger
                      ? 'text-[var(--mds-danger)]'
                      : 'text-[var(--mds-text)]',
                  !child.disabled && subActive === j ? 'bg-[var(--mds-bg-hover-soft)]' : '',
                ]"
                @mouseenter="subActive = child.disabled ? -1 : j"
                @click="selectItem(child)"
              >
                <span
                  v-if="item.children.some((c) => c.icon)"
                  class="flex w-4 shrink-0 items-center justify-center"
                  :class="child.disabled || child.danger ? '' : 'text-[var(--mds-icon-neutral)]'"
                >
                  <svg v-if="iconPaths(child.icon)" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path v-for="(d, di) in iconPaths(child.icon)" :key="di" :d="d" />
                  </svg>
                </span>
                <span class="flex-1 truncate">{{ child.label }}</span>
              </button>
            </template>
          </div>
        </div>
      </template>
    </div>
  </Teleport>
</template>
