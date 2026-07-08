<script setup>
// Container toast — đặt DUY NHẤT 1 lần ở App.vue: <MToast />
// Hành vi MDS: góc trên phải, stack dọc mới nhất trên cùng, tối đa 3,
// tự đóng sau 5s (logic ở toast.js), rộng tối đa 400px.
import { useToast } from './toast.js'

const { toasts, remove } = useToast()

// Icon trạng thái theo loại toast — inline SVG stroke 1.5 (path từ assets/icons/)
const icons = {
  success: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M9 12l2 2l4 -4'], // circle-check
  error: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M10 10l4 4m0 -4l-4 4'], // circle-x
  warning: [
    'M12 9v4',
    'M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0',
    'M12 16h.01',
  ], // alert-triangle
  info: ['M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0', 'M12 9h.01', 'M11 12h1v4h1'], // info-circle
}

// Màu icon theo token trạng thái MDS
const iconColor = {
  success: 'text-[var(--mds-success)]',
  error: 'text-[var(--mds-danger)]',
  warning: 'text-[var(--mds-warning)]',
  info: 'text-[var(--mds-info)]',
}
</script>

<template>
  <Teleport to="body">
    <!-- Vị trí MDS: góc trên bên phải, phía dưới thanh header -->
    <div class="pointer-events-none fixed right-4 top-4 z-[1100] flex flex-col items-end gap-2">
      <TransitionGroup
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-x-full opacity-0"
        enter-to-class="translate-x-0 opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="translate-x-4 opacity-0"
        move-class="transition-transform duration-200"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto flex max-w-[400px] items-start gap-2 rounded-lg bg-[var(--mds-bg)] py-2.5 pl-3 pr-2 shadow-lg ring-1 ring-[var(--mds-border)]"
          role="status"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="mt-px shrink-0"
            :class="iconColor[toast.type]"
          >
            <path v-for="(d, i) in icons[toast.type]" :key="i" :d="d" />
          </svg>
          <!-- Message 13px — MDS khuyến nghị xuống dòng tối đa 2 dòng -->
          <p class="min-w-0 flex-1 text-[13px] leading-[18px] text-[var(--mds-text)]">
            {{ toast.message }}
          </p>
          <!-- Nút x đóng thủ công -->
          <button
            type="button"
            class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)] hover:text-[var(--mds-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
            aria-label="Đóng thông báo"
            @click="remove(toast.id)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6l-12 12" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
