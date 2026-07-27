<script setup>
import { ref, watch, nextTick, onMounted } from 'vue';
import MTextarea from './mds/MTextarea.vue';
import MIcon from './mds/MIcon.vue';

// Trình soạn nội dung email 2 CHẾ ĐỘ XEM của CÙNG MỘT NGUỒN SỰ THẬT: chuỗi HTML
// (props.modelValue/v-model). Chuyển tab KHÔNG có bước chuyển đổi dữ liệu nào - Văn bản là
// WYSIWYG (contenteditable) ghi thẳng ra HTML, tab HTML là xem/sửa trực tiếp đúng chuỗi đó.
// Sửa dứt điểm 4 lỗi mất nội dung của bản cũ (ghi đè HTML khi chuyển tab không hỏi, mất định
// dạng khi chuyển Text->HTML->Text, chuyển tab rỗng xoá sạch HTML) - xem mục 6b kế hoạch nâng cấp.
const props = defineProps({ modelValue: { type: String, default: '' } });
const emit = defineEmits(['update:modelValue']);

const mode = ref('text'); // 'text' (WYSIWYG) | 'html' (xem mã nguồn)
const editorRef = ref(null);
const varHint = 'Có thể dùng các biến {{ho_ten}}, {{ten_su_kien}}, {{qr_code}}... (gõ thẳng dạng chữ thường).';

function setEditorHtml(html) {
  if (editorRef.value && editorRef.value.innerHTML !== (html || '')) editorRef.value.innerHTML = html || '';
}
onMounted(() => setEditorHtml(props.modelValue));
// Nội dung đổi từ bên ngoài (VD EmailTab.load() sau khi lưu/tải ảnh) trong khi đang ở tab Văn
// bản -> đồng bộ lại editor (bản cũ KHÔNG watch modelValue nên bị lệch, xem mục 6b).
watch(() => props.modelValue, (v) => { if (mode.value === 'text') setEditorHtml(v); });

function onEditorInput() { emit('update:modelValue', editorRef.value.innerHTML); }

function switchMode(to) {
  if (to === mode.value) return;
  mode.value = to;
  if (to === 'text') nextTick(() => setEditorHtml(props.modelValue));
}

function exec(cmd, value) {
  editorRef.value.focus();
  document.execCommand(cmd, false, value);
  onEditorInput();
}
function insertLink() {
  const url = prompt('Nhập địa chỉ liên kết (VD: https://...)');
  if (url) exec('createLink', url);
}

// Chèn nội dung gợi ý (nút "Chèn nội dung gợi ý" ở EmailTab.vue) - ghi thẳng HTML, không qua
// bước chuyển đổi nào nên không mất định dạng.
function insert(_legacyText, htmlVal) {
  emit('update:modelValue', htmlVal);
  if (mode.value === 'text') nextTick(() => setEditorHtml(htmlVal));
}
defineExpose({ insert, mode });
</script>

<template>
  <label class="fld">Nội dung email</label>
  <div class="body-tabs">
    <button type="button" class="body-tab" :class="{ active: mode === 'text' }" @click="switchMode('text')"><MIcon name="pencil" /> Văn bản (dễ dùng)</button>
    <button type="button" class="body-tab" :class="{ active: mode === 'html' }" @click="switchMode('html')">&lt;/&gt; HTML (nâng cao)</button>
  </div>

  <template v-if="mode === 'text'">
    <div class="rt-toolbar">
      <button type="button" title="Đậm" @mousedown.prevent @click="exec('bold')"><b>B</b></button>
      <button type="button" title="Nghiêng" @mousedown.prevent @click="exec('italic')"><i>I</i></button>
      <button type="button" title="Gạch chân" @mousedown.prevent @click="exec('underline')"><u>U</u></button>
      <span class="rt-sep"></span>
      <button type="button" title="Căn trái" @mousedown.prevent @click="exec('justifyLeft')"><MIcon name="align-left" /></button>
      <button type="button" title="Căn giữa" @mousedown.prevent @click="exec('justifyCenter')"><MIcon name="align-center" /></button>
      <button type="button" title="Căn phải" @mousedown.prevent @click="exec('justifyRight')"><MIcon name="align-right" /></button>
      <button type="button" title="Căn đều 2 bên" @mousedown.prevent @click="exec('justifyFull')"><MIcon name="align-justify" /></button>
      <span class="rt-sep"></span>
      <button type="button" title="Danh sách gạch đầu dòng" @mousedown.prevent @click="exec('insertUnorderedList')"><MIcon name="list" /></button>
      <button type="button" title="Chèn liên kết" @mousedown.prevent @click="insertLink"><MIcon name="link" /></button>
    </div>
    <div ref="editorRef" class="rich-editor" contenteditable="true" @input="onEditorInput"></div>
    <p class="muted" style="font-size:12px;margin-top:4px">{{ varHint }}</p>
  </template>
  <MTextarea v-else :modelValue="modelValue" @update:modelValue="v => emit('update:modelValue', v)" :rows="12"
    placeholder="Mã HTML - CÙNG nội dung với tab Văn bản, chỉ khác cách nhìn (sửa ở đây, quay lại tab Văn bản sẽ thấy đúng thay đổi)." />
</template>

<style scoped>
.body-tabs { display: flex; gap: 4px; margin-bottom: 8px; }
.body-tab { border: 1px solid var(--app-border); background: #fff; color: #374151; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; }
.body-tab.active { background: var(--mds-brand-50, #eff6ff); border-color: var(--mds-brand-300, #93c5fd); color: var(--mds-brand-700, #1d4ed8); }

.rt-toolbar { display: flex; align-items: center; gap: 2px; border: 1px solid var(--app-border); border-bottom: none; border-radius: 8px 8px 0 0; background: #f9fafb; padding: 6px; }
.rt-toolbar button { min-width: 30px; height: 30px; border: 1px solid transparent; background: transparent; border-radius: 6px; cursor: pointer; font-size: 13px; color: #374151; }
.rt-toolbar button:hover { background: #fff; border-color: var(--app-border); }
.rt-sep { width: 1px; height: 20px; background: var(--app-border); margin: 0 4px; }
.rich-editor {
  min-height: 220px; border: 1px solid var(--app-border); border-radius: 0 0 8px 8px; padding: 12px;
  font-size: 14px; line-height: 1.6; color: #111827; background: #fff; overflow-y: auto;
}
.rich-editor:focus { outline: 2px solid var(--mds-brand-300, #93c5fd); outline-offset: -1px; }
</style>
