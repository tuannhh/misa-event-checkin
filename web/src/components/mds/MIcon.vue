<script setup>
import { iconPaths } from './icons.js'

/**
 * MIcon — wrapper icon dùng chung MDS (Tabler Icons, stroke 1.5, kích thước 1em theo
 * font-size nơi đặt). Dùng thay cho emoji/ký tự Unicode trang trí ở khắp ứng dụng.
 */
const props = defineProps({
  name: { type: String, required: true },
  size: { type: [String, Number], default: null }, // vd 16, '20px' - để trống dùng 1em
  strokeWidth: { type: [String, Number], default: 1.5 },
})
</script>

<template>
  <svg
    v-if="iconPaths(name)"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="m-icon"
    :style="size ? { width: typeof size === 'number' ? size + 'px' : size, height: typeof size === 'number' ? size + 'px' : size } : null"
    aria-hidden="true"
  >
    <path v-for="(d, i) in iconPaths(name)" :key="i" :d="d" />
  </svg>
</template>

<style scoped>
.m-icon { width: 1em; height: 1em; display: inline-block; vertical-align: -0.125em; flex-shrink: 0; }
</style>
