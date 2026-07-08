<script setup>
import { computed } from 'vue'

// MTag — nhãn (tag) kiểu soft chuẩn MDS: nền nhạt + chữ đậm cùng tông
const props = defineProps({
  color: {
    type: String,
    default: 'neutral',
    validator: (v) => ['brand', 'success', 'warning', 'danger', 'neutral', 'info'].includes(v),
  },
  size: {
    type: String,
    default: 'md', // 'sm' 20px | 'md' 24px
    validator: (v) => ['sm', 'md'].includes(v),
  },
  closable: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

// Nền nhạt tạo từ chính token màu (color-mix 12% trên nền trong suốt) — không hard-code hex
const colorClasses = computed(() => {
  switch (props.color) {
    case 'brand':
      return 'bg-[var(--mds-brand-100)] text-[var(--mds-brand-700)]'
    case 'success':
      return 'bg-[color-mix(in_srgb,var(--mds-success)_12%,transparent)] text-[var(--mds-success)]'
    case 'warning':
      return 'bg-[color-mix(in_srgb,var(--mds-warning)_12%,transparent)] text-[var(--mds-warning)]'
    case 'danger':
      return 'bg-[color-mix(in_srgb,var(--mds-danger)_12%,transparent)] text-[var(--mds-danger)]'
    case 'info':
      return 'bg-[color-mix(in_srgb,var(--mds-info)_12%,transparent)] text-[var(--mds-info)]'
    default: // neutral
      return 'bg-[var(--mds-bg-disabled)] text-[var(--mds-text)]'
  }
})

const sizeClasses = computed(() => (props.size === 'sm' ? 'h-5' : 'h-6'))
</script>

<template>
  <span
    class="inline-flex select-none items-center gap-1 rounded px-2 text-[12px] font-medium leading-none"
    :class="[colorClasses, sizeClasses]"
  >
    <slot />
    <!-- Nút đóng: icon x.svg 12px, emit 'close' để cha tự xóa tag -->
    <button
      v-if="closable"
      type="button"
      class="-mr-1 inline-flex shrink-0 items-center justify-center rounded hover:bg-[color-mix(in_srgb,currentColor_15%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
      aria-label="Đóng"
      @click="emit('close')"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M18 6l-12 12" />
        <path d="M6 6l12 12" />
      </svg>
    </button>
  </span>
</template>
