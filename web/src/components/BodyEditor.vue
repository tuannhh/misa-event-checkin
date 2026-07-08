<script setup>
import { ref, watch } from 'vue';
import { isHtmlBody, htmlToPlain, plainToHtml } from '../lib/emailBody';
import MTextarea from './mds/MTextarea.vue';

// Trình soạn nội dung email 2 chế độ: Văn bản (dễ dùng) và HTML (nâng cao).
// v-model = nội dung theo chế độ đang mở (chuỗi sẽ được lưu).
const props = defineProps({ modelValue: { type: String, default: '' } });
const emit = defineEmits(['update:modelValue']);

const initHtml = isHtmlBody(props.modelValue);
const mode = ref(initHtml ? 'html' : 'text');
const text = ref(initHtml ? htmlToPlain(props.modelValue) : (props.modelValue || ''));
const html = ref(initHtml ? props.modelValue : '');

function emitCurrent() { emit('update:modelValue', mode.value === 'html' ? html.value : text.value); }
watch(text, () => { if (mode.value === 'text') emitCurrent(); });
watch(html, () => { if (mode.value === 'html') emitCurrent(); });

function switchMode(to) {
  if (to === mode.value) return;
  if (to === 'html') {
    html.value = plainToHtml(text.value);
  } else {
    if (html.value.trim() && !confirm('Chuyển sang Văn bản? Định dạng HTML (màu sắc, cỡ chữ...) sẽ được giản lược thành văn bản thường.')) return;
    text.value = htmlToPlain(html.value);
  }
  mode.value = to; emitCurrent();
}

// Chèn nội dung gợi ý theo đúng chế độ đang mở (dùng bởi nút "Chèn nội dung gợi ý").
function insert(textVal, htmlVal) { text.value = textVal; html.value = htmlVal; emitCurrent(); }
defineExpose({ insert, mode });
</script>

<template>
  <label class="fld">Nội dung email</label>
  <div class="body-tabs">
    <button type="button" class="body-tab" :class="{ active: mode === 'text' }" @click="switchMode('text')">📝 Văn bản (dễ dùng)</button>
    <button type="button" class="body-tab" :class="{ active: mode === 'html' }" @click="switchMode('html')">&lt;/&gt; HTML (nâng cao)</button>
  </div>
  <MTextarea v-if="mode === 'text'" v-model="text" :rows="10" placeholder="Gõ nội dung như viết tin nhắn, xuống dòng để ngắt đoạn. Có thể dùng các biến {{ho_ten}}, {{ten_su_kien}}, {{qr_code}}..." />
  <MTextarea v-else v-model="html" :rows="10" placeholder="Dán mã HTML vào đây (dành cho người rành kỹ thuật)." />
</template>

<style scoped>
.body-tabs { display: flex; gap: 4px; margin-bottom: 8px; }
.body-tab { border: 1px solid var(--app-border); background: #fff; color: #374151; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; }
.body-tab.active { background: var(--mds-brand-50, #eff6ff); border-color: var(--mds-brand-300, #93c5fd); color: var(--mds-brand-700, #1d4ed8); }
</style>
