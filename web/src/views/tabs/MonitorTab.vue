<script setup>
import { ref, computed, reactive, onMounted } from 'vue';
import { api, fmtDate } from '../../api';
import { useToast } from '../../components/mds/toast.js';
import MButton from '../../components/mds/MButton.vue';
import MInput from '../../components/mds/MInput.vue';
import MTextarea from '../../components/mds/MTextarea.vue';

const props = defineProps({ ev: Object });
const toast = useToast();
const data = ref(null);
const err = ref('');
const q = ref('');
const notes = reactive({});   // attendee_id -> note đang soạn
const saving = reactive({});  // attendee_id -> 'saving' | 'ok' | error string

async function load() {
  err.value = '';
  try {
    data.value = await api(`/events/${props.ev.id}/booth-monitor`);
    for (const r of data.value.rows) notes[r.id] = r.note || '';
  } catch (e) { err.value = e.message; }
}
onMounted(load);

const filtered = computed(() => (data.value?.rows || []).filter(r =>
  !q.value || (r.name + ' ' + (r.company || '') + ' ' + (r.position || '')).toLowerCase().includes(q.value.toLowerCase())));

async function saveNote(r) {
  saving[r.id] = 'saving';
  try {
    await api(`/events/${props.ev.id}/booth-note`, { method: 'PUT', body: { attendee_id: Number(r.id), note: notes[r.id] } });
    r.note = notes[r.id]; saving[r.id] = 'ok';
    setTimeout(() => { if (saving[r.id] === 'ok') saving[r.id] = ''; }, 2000);
  } catch (e) { saving[r.id] = e.message; }
}
</script>

<template>
  <div v-if="err" class="card muted">{{ err }}</div>
  <div v-else-if="data">
    <div class="info">🧭 <b>Booth phụ trách: {{ data.booth.name }}</b> — Ghi chú nhu cầu/đặc điểm của khách đã ghé booth. Khách xuất hiện sau khi được quét QR tại booth này.</div>

    <div class="toolbar">
      <div style="flex:1;min-width:200px"><MInput v-model="q" placeholder="🔍 Tìm theo tên, công ty, chức vụ..." clearable /></div>
      <MButton variant="secondary" @click="load">🔄 Tải lại</MButton>
    </div>
    <div class="muted" style="margin-bottom:10px">Có <b>{{ filtered.length }}</b> / {{ data.rows.length }} khách đã ghé booth</div>

    <div v-if="!data.rows.length" class="card muted" style="text-align:center;padding:30px">Chưa có khách nào ghé booth. Khách xuất hiện sau khi được quét QR tại booth.</div>

    <div v-for="r in filtered" :key="r.id" class="card visitor">
      <div class="v-head">
        <div>
          <b>{{ (r.salutation ? r.salutation + ' ' : '') + r.name }}</b>
          <div class="muted">{{ [r.position, r.company].filter(Boolean).join(' · ') }}</div>
        </div>
        <span class="muted" style="font-size:12px">🕒 {{ fmtDate(r.visited_at, true) }}</span>
      </div>
      <MTextarea v-model="notes[r.id]" :rows="2" placeholder="Ghi chú nhu cầu, sản phẩm quan tâm, hẹn liên hệ lại..." />
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
        <MButton variant="primary" size="md" :disabled="saving[r.id] === 'saving'" @click="saveNote(r)">💾 Lưu ghi chú</MButton>
        <span v-if="saving[r.id] === 'ok'" style="color:#15803d">✓ Đã lưu</span>
        <span v-else-if="saving[r.id] && saving[r.id] !== 'saving'" style="color:#dc2626">{{ saving[r.id] }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.info { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 12px 16px; margin-bottom: 14px; font-size: 13px; line-height: 1.5; }
.visitor { padding: 14px 16px; }
.v-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
</style>
