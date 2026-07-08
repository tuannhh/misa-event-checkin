<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

/**
 * MDropdownMenu — menu thao tác gắn với nút, chuẩn MDS 2.0.
 * Dùng cho nút More (⋯) của MDS: các hành động phụ trên hàng danh
 * sách/card được gom vào menu này. Activator mặc định là icon button
 * ⋯ 32px vuông radius 8px đúng spec nút More.
 */
const props = defineProps({
  // [{ key, label, icon?, danger?, disabled?, divider? }]
  // icon: tên file SVG trong assets/icons (vd 'pencil', 'trash')
  items: { type: Array, default: () => [] },
  placement: {
    type: String,
    default: 'bottom-end', // menu căn mép phải activator (chuẩn nút More cuối hàng)
    validator: (v) => ['bottom-end', 'bottom-start'].includes(v),
  },
})

const emit = defineEmits(['select'])

/* ── Icon dùng chung MDS ────────────────────────────────────────
   Path copy nguyên văn từ assets/icons/<tên>.svg (bộ icon chính thức,
   stroke 1.5) để component tự chứa — không import file ngoài.
   Cần icon khác: copy thêm path từ assets/icons vào map này. */
const ICON_PATHS = {
  dots: ['M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0'],
  'dots-vertical': ['M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M11 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M11 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0'],
  pencil: ['M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4', 'M13.5 6.5l4 4'],
  trash: ['M4 7l16 0', 'M10 11l0 6', 'M14 11l0 6', 'M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12', 'M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3'],
  copy: ['M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666', 'M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1'],
  plus: ['M12 5l0 14', 'M5 12l14 0'],
  download: ['M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2', 'M7 11l5 5l5 -5', 'M12 4l0 12'],
  upload: ['M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2', 'M7 9l5 -5l5 5', 'M12 4l0 12'],
  printer: ['M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2', 'M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4', 'M7 15a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2l0 -4'],
  refresh: ['M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4', 'M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4'],
  settings: ['M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065', 'M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0'],
  eye: ['M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0', 'M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6'],
  'file-export': ['M14 3v4a1 1 0 0 0 1 1h4', 'M11.5 21h-4.5a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v5m-5 6h7m-3 -3l3 3l-3 3'],
  'file-import': ['M14 3v4a1 1 0 0 0 1 1h4', 'M5 13v-8a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2h-5.5m-9.5 -2h7m-3 -3l3 3l-3 3'],
  share: ['M3 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0', 'M15 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0', 'M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0', 'M8.7 10.7l6.6 -3.4', 'M8.7 13.3l6.6 3.4'],
  star: ['M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245'],
  lock: ['M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6', 'M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0', 'M8 11v-4a4 4 0 1 1 8 0v4'],
  link: ['M9 15l6 -6', 'M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464', 'M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463'],
  'external-link': ['M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6', 'M11 13l9 -9', 'M15 4h5v5'],
  x: ['M18 6l-12 12', 'M6 6l12 12'],
  check: ['M5 12l5 5l10 -10'],
  search: ['M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0', 'M21 21l-6 -6'],
  send: ['M10 14l11 -11', 'M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5'],
  bookmark: ['M18 7v14l-6 -4l-6 4v-14a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4'],
}

// Chấp nhận cả 'pencil' lẫn 'pencil.svg'
function iconPaths(name) {
  return ICON_PATHS[String(name || '').replace(/\.svg$/, '')] || null
}

const open = ref(false)
const activatorRef = ref(null)
const menuRef = ref(null)
const activeIndex = ref(-1) // index item đang "sáng" khi điều hướng bàn phím
const menuStyle = ref({ position: 'fixed', top: '-9999px', left: '-9999px' })

// Các index có thể chọn (bỏ qua divider và item disabled)
const enabledIndexes = computed(() =>
  props.items
    .map((it, i) => (!it.divider && !it.disabled ? i : -1))
    .filter((i) => i >= 0)
)

/* ── Định vị menu (teleport ra body) ────────────────────────────
   bottom-end: căn mép phải menu với mép phải activator (mặc định —
   nút More thường nằm cuối hàng). Tự lật lên trên khi sát mép dưới
   viewport; kẹp ngang để không tràn màn hình. */
function updatePosition() {
  const anchor = activatorRef.value?.firstElementChild
  const menu = menuRef.value
  if (!anchor || !menu) return
  const rect = anchor.getBoundingClientRect()
  const mw = menu.offsetWidth
  const mh = menu.offsetHeight
  const gap = 4
  const pad = 8
  const spaceBelow = window.innerHeight - rect.bottom
  // Lật lên trên khi bên dưới không đủ chỗ mà bên trên đủ
  const openUp = spaceBelow < mh + gap && rect.top > mh + gap
  let left =
    props.placement === 'bottom-end' ? rect.right - mw : rect.left
  left = Math.min(Math.max(left, pad), window.innerWidth - pad - mw)
  menuStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    top: openUp ? `${rect.top - mh - gap}px` : `${rect.bottom + gap}px`,
  }
}

/* ── Mở / đóng ──────────────────────────────────────────────── */
function openMenu(focusFirst = true) {
  if (open.value) return
  open.value = true
  // Đặt con trỏ bàn phím vào item khả dụng đầu tiên
  activeIndex.value = focusFirst ? (enabledIndexes.value[0] ?? -1) : -1
  nextTick(() => {
    updatePosition()
    // Chuyển focus vào menu để nhận phím ↑↓/Enter/Esc
    menuRef.value?.focus()
  })
}

function closeMenu(returnFocus = true) {
  if (!open.value) return
  open.value = false
  activeIndex.value = -1
  // Esc/chọn xong: trả focus về activator (spec bàn phím MDS)
  if (returnFocus) focusActivator()
}

function focusActivator() {
  const el = activatorRef.value?.querySelector(
    'button, [href], [tabindex]:not([tabindex="-1"])'
  )
  ;(el || activatorRef.value?.firstElementChild)?.focus?.()
}

function toggle() {
  open.value ? closeMenu(false) : openMenu()
}

function selectItem(item) {
  if (!item || item.divider || item.disabled) return
  emit('select', item.key)
  closeMenu()
}

/* ── Bàn phím ───────────────────────────────────────────────────
   Trên activator: Enter/Space/↓ mở menu. Trong menu: ↑↓ di chuyển
   (bỏ qua divider + disabled, xoay vòng), Enter chọn, Esc đóng và
   trả focus về activator, Tab đóng. */
function onActivatorKeydown(e) {
  if (['Enter', ' ', 'ArrowDown'].includes(e.key)) {
    e.preventDefault()
    openMenu()
  }
}

function moveActive(dir) {
  const idxs = enabledIndexes.value
  if (!idxs.length) return
  const pos = idxs.indexOf(activeIndex.value)
  const next =
    pos < 0
      ? dir > 0
        ? idxs[0]
        : idxs[idxs.length - 1]
      : idxs[(pos + dir + idxs.length) % idxs.length]
  activeIndex.value = next
  nextTick(() => {
    menuRef.value
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  })
}

function onMenuKeydown(e) {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      moveActive(1)
      break
    case 'ArrowUp':
      e.preventDefault()
      moveActive(-1)
      break
    case 'Enter':
    case ' ':
      e.preventDefault()
      if (activeIndex.value >= 0) selectItem(props.items[activeIndex.value])
      break
    case 'Escape':
      e.preventDefault()
      closeMenu()
      break
    case 'Tab':
      // Tab rời menu thì đóng, không chặn Tab
      closeMenu(false)
      break
  }
}

/* ── Click ngoài đóng + bám theo activator khi scroll/resize ── */
function onDocMousedown(e) {
  if (
    !activatorRef.value?.contains(e.target) &&
    !menuRef.value?.contains(e.target)
  ) {
    closeMenu(false)
  }
}

function onReposition() {
  if (open.value) updatePosition()
}

watch(open, (val) => {
  if (val) {
    document.addEventListener('mousedown', onDocMousedown)
    // capture=true để bắt cả scroll của container cha (không chỉ window)
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
  } else {
    document.removeEventListener('mousedown', onDocMousedown)
    window.removeEventListener('scroll', onReposition, true)
    window.removeEventListener('resize', onReposition)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMousedown)
  window.removeEventListener('scroll', onReposition, true)
  window.removeEventListener('resize', onReposition)
})
</script>

<template>
  <!-- display:contents — wrapper không ảnh hưởng layout -->
  <span
    ref="activatorRef"
    class="contents"
    @click="toggle"
    @keydown="onActivatorKeydown"
  >
    <!-- Activator tùy biến qua slot; mặc định là nút More ⋯ chuẩn MDS -->
    <slot name="activator" :open="open">
      <button
        type="button"
        aria-haspopup="menu"
        :aria-expanded="open"
        aria-label="Thêm thao tác"
        class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--mds-icon-neutral)] transition-colors hover:bg-[var(--mds-bg-hover-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
        :class="open ? 'bg-[var(--mds-bg-hover-soft)]' : ''"
      >
        <!-- Icon ⋯ (assets/icons/dots.svg) -->
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-4 w-4"
        >
          <path v-for="(d, i) in ICON_PATHS.dots" :key="i" :d="d" />
        </svg>
      </button>
    </slot>
  </span>

  <!-- Menu teleport ra body, radius 4px theo spec popup -->
  <Teleport to="body">
    <div
      v-if="open"
      ref="menuRef"
      role="menu"
      tabindex="-1"
      :style="menuStyle"
      class="z-[1000] max-h-[320px] min-w-[180px] overflow-y-auto rounded border border-[var(--mds-border)] bg-[var(--mds-bg)] py-1 shadow-lg outline-none"
      @keydown="onMenuKeydown"
    >
      <template v-for="(item, i) in items" :key="item.key ?? i">
        <!-- Divider: kẻ phân nhóm -->
        <div
          v-if="item.divider"
          role="separator"
          class="my-1 border-t border-[var(--mds-border)]"
        />
        <div
          v-else
          role="menuitem"
          :aria-disabled="item.disabled || undefined"
          :data-active="i === activeIndex"
          class="flex h-8 items-center gap-2 whitespace-nowrap px-3 text-[13px] leading-[18px]"
          :class="[
            item.disabled
              ? 'cursor-not-allowed text-[var(--mds-text-placeholder)]'
              : 'cursor-pointer',
            !item.disabled && i === activeIndex
              ? 'bg-[var(--mds-bg-hover-soft)]'
              : '',
            // Item nguy hiểm (Xóa...): chữ + icon màu danger
            !item.disabled &&
              (item.danger
                ? 'text-[var(--mds-danger)]'
                : 'text-[var(--mds-text)]'),
          ]"
          @mouseenter="!item.disabled && (activeIndex = i)"
          @click="selectItem(item)"
        >
          <!-- Icon inline 16px stroke 1.5 từ bộ icon MDS -->
          <svg
            v-if="iconPaths(item.icon)"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-4 w-4 shrink-0"
            :class="
              item.disabled || item.danger
                ? ''
                : 'text-[var(--mds-icon-neutral)]'
            "
          >
            <path v-for="(d, j) in iconPaths(item.icon)" :key="j" :d="d" />
          </svg>
          <span class="flex-1">{{ item.label }}</span>
        </div>
      </template>
    </div>
  </Teleport>
</template>
