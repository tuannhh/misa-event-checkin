<script setup>
// MHeaderBar — Thanh điều hướng trên cùng (Header bar) chuẩn MDS 2.0
// Nền brand-600 (theme của app), chữ/icon trắng.
// Trái: logo + tên app · Giữa: ô tìm kiếm · Phải: slot actions + chuông + thiết lập + avatar.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  /** Tên app hiển thị cạnh logo */
  appName: { type: String, default: '' },
  /** Placeholder ô tìm kiếm */
  searchPlaceholder: { type: String, default: 'Tìm kiếm (Ctrl+K)' },
  /** Số thông báo — badge đỏ trên chuông, hiện '99+' khi >99 */
  notificationCount: { type: Number, default: 0 },
  /** Người dùng: { name, avatarUrl? } */
  user: { type: Object, default: null },
})

const emit = defineEmits(['search', 'notifications', 'settings', 'user-click', 'logo-click'])

const searchInput = ref(null)
const searchText = ref('')

// Nội dung badge chuông: vượt 99 thì hiện '99+'
const badgeText = computed(() =>
  props.notificationCount > 99 ? '99+' : String(props.notificationCount)
)

// Chữ cái đầu tên app cho logo mặc định
const appInitial = computed(() => (props.appName || '').trim().charAt(0).toUpperCase())

// 2 chữ cái đầu tên người dùng (VD: "Nguyễn Văn Tuấn" → "NV"); 1 từ thì lấy 2 ký tự đầu
const userInitials = computed(() => {
  const name = (props.user && props.user.name ? props.user.name : '').trim()
  if (!name) return ''
  const words = name.split(/\s+/)
  return (words.length >= 2 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase()
})

// Phím tắt Ctrl+K (Windows) / Cmd+K (macOS) → focus ô tìm kiếm
function onGlobalKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault()
    if (searchInput.value) searchInput.value.focus()
  }
}
onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))

// Enter trong ô tìm kiếm → emit từ khóa
function onSearchEnter() {
  emit('search', searchText.value)
}

// Hành vi MDS: focus input tự SelectAll nội dung
function onSearchFocus(e) {
  e.target.select()
}
</script>

<template>
  <header
    class="flex h-12 w-full items-center gap-3 bg-[var(--mds-brand-600)] px-4 text-[13px] leading-[18px] text-white"
  >
    <!-- ── Trái: logo + tên app (click → về màn hình chính) ── -->
    <button
      type="button"
      class="flex shrink-0 items-center gap-2 rounded-lg px-1 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      :title="appName"
      @click="emit('logo-click')"
    >
      <slot name="logo">
        <!-- Logo mặc định: ô vuông 32px chứa chữ cái đầu tên app -->
        <span
          class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-[16px] font-semibold"
          >{{ appInitial }}</span
        >
      </slot>
      <span class="text-[16px] font-semibold leading-[22px]">{{ appName }}</span>
    </button>

    <!-- ── Giữa: ô tìm kiếm ── -->
    <div class="flex min-w-0 flex-1 justify-center">
      <div class="relative w-full max-w-[360px]">
        <input
          ref="searchInput"
          v-model="searchText"
          type="text"
          :placeholder="searchPlaceholder"
          class="peer h-8 w-full rounded-lg bg-white/15 pl-9 pr-3 text-white outline-none transition-colors placeholder:text-white/70 focus:bg-white focus:text-[var(--mds-text)] focus:placeholder:text-[var(--mds-text-placeholder)]"
          @keydown.enter="onSearchEnter"
          @focus="onSearchFocus"
        />
        <!-- Icon tìm kiếm (assets/icons/search.svg) — đổi màu neutral khi input focus nền trắng -->
        <svg
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/70 peer-focus:text-[var(--mds-icon-neutral)]"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
          <path d="M21 21l-6 -6" />
        </svg>
      </div>
    </div>

    <!-- ── Phải: actions + chuông + thiết lập + avatar ── -->
    <div class="flex shrink-0 items-center gap-1">
      <!-- Slot icon button bổ sung, đặt trước chuông -->
      <slot name="actions" />

      <!-- Chuông thông báo + badge đỏ -->
      <button
        type="button"
        class="relative flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        title="Thông báo"
        @click="emit('notifications')"
      >
        <!-- assets/icons/bell.svg -->
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" />
          <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
        </svg>
        <span
          v-if="notificationCount > 0"
          class="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--mds-danger)] px-1 text-[10px] font-medium leading-none text-white"
          >{{ badgeText }}</span
        >
      </button>

      <!-- Thiết lập -->
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        title="Thiết lập"
        @click="emit('settings')"
      >
        <!-- assets/icons/settings.svg -->
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065" />
          <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
        </svg>
      </button>

      <!-- Avatar người dùng: có ảnh thì hiện ảnh, không thì 2 chữ cái đầu tên -->
      <button
        v-if="user"
        type="button"
        class="ml-1 h-8 w-8 shrink-0 overflow-hidden rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        :title="user.name"
        @click="emit('user-click')"
      >
        <img
          v-if="user.avatarUrl"
          :src="user.avatarUrl"
          :alt="user.name"
          class="h-full w-full object-cover"
        />
        <span
          v-else
          class="flex h-full w-full items-center justify-center bg-white/20 text-[12px] font-semibold"
          >{{ userInitials }}</span
        >
      </button>
    </div>
  </header>
</template>
