<script setup>
import { computed } from 'vue'

// MButton — nút chuẩn MDS 2.0 (Primary / Secondary / Danger / Link / Icon)
const props = defineProps({
  variant: {
    type: String,
    default: 'secondary',
    validator: (v) => ['primary', 'secondary', 'danger', 'link', 'icon'].includes(v),
  },
  size: {
    type: String,
    default: 'md', // 'md' 32px | 'lg' 40px
    validator: (v) => ['md', 'lg'].includes(v),
  },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

// Loading tự disable nút — chặn double-submit theo MDS
const isDisabled = computed(() => props.disabled || props.loading)

// Kích thước: cao 32/40px; min-width 80px (trừ icon button: hình vuông)
const sizeClasses = computed(() => {
  if (props.variant === 'icon') {
    return props.size === 'lg' ? 'h-10 w-10' : 'h-8 w-8'
  }
  return props.size === 'lg'
    ? 'h-10 min-w-[80px] px-[14px]'
    : 'h-8 min-w-[80px] px-[14px]'
})

// Màu theo variant; disabled dùng màu thật (không dùng opacity) theo quy ước MDS
const variantClasses = computed(() => {
  if (isDisabled.value) {
    // Link/icon disabled: chỉ đổi màu chữ, không đổ nền
    if (props.variant === 'link' || props.variant === 'icon') {
      return 'text-[var(--mds-text-placeholder)] cursor-not-allowed'
    }
    return 'bg-[var(--mds-bg-disabled)] text-[var(--mds-text-placeholder)] cursor-not-allowed'
  }
  switch (props.variant) {
    case 'primary':
      // Nền brand-600, hover 700, pressed 800, chữ trắng
      return 'bg-[var(--mds-brand-600)] text-white hover:bg-[var(--mds-brand-700)] active:bg-[var(--mds-brand-800)]'
    case 'danger':
      // Không có thang shade cho danger — hover/pressed làm tối bằng brightness
      return 'bg-[var(--mds-danger)] text-white hover:brightness-95 active:brightness-90'
    case 'link':
      return 'text-[var(--mds-brand-600)] hover:underline active:text-[var(--mds-brand-800)]'
    case 'icon':
      return 'text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)] active:bg-[var(--mds-brand-100)]'
    default: // secondary
      return 'bg-[var(--mds-bg)] text-[var(--mds-text)] border border-[var(--mds-border)] hover:bg-[var(--mds-bg-hover-soft)] active:bg-[var(--mds-brand-100)]'
  }
})
</script>

<template>
  <button
    type="button"
    :disabled="isDisabled"
    :aria-busy="loading || undefined"
    class="inline-flex select-none items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium leading-[18px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
    :class="[sizeClasses, variantClasses]"
  >
    <!-- Loading: spinner 16px thay chỗ icon, chữ giữ nguyên -->
    <svg
      v-if="loading"
      class="animate-spin shrink-0"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-dasharray="42"
        stroke-dashoffset="14"
      />
    </svg>
    <!-- Slot icon 16px trước chữ (inline SVG stroke 1.5 từ assets/icons/) -->
    <span
      v-else-if="$slots.icon"
      class="inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4"
      aria-hidden="true"
    >
      <slot name="icon" />
    </span>
    <slot />
  </button>
</template>
