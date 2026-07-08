<script setup>
import { ref, computed, reactive, onMounted } from 'vue';
import { api, fmtDate } from '../../api';
import { useToast } from '../../components/mds/toast.js';
import MButton from '../../components/mds/MButton.vue';
import MInput from '../../components/mds/MInput.vue';
import MTextarea from '../../components/mds/MTextarea.vue';
import MCheckbox from '../../components/mds/MCheckbox.vue';

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

/* Giám sát "bóng ma": tra khách bằng mã thẻ (không cần khách ghé booth mình), ghi chú + tick tiềm năng
   lưu tách biệt khỏi danh sách khách đã ghé booth ở trên - không ảnh hưởng điều kiện lucky draw. */
const ghostCode = ref('');
const ghost = ref(null); // { attendee, note, is_potential }
const ghostBusy = ref(false);
const ghostSaved = ref(false);

async function ghostLookup() {
  const code = ghostCode.value.trim();
  if (!code || ghostBusy.value) return;
  ghostBusy.value = true; ghostSaved.value = false;
  try {
    ghost.value = await api(`/events/${props.ev.id}/booth-monitor/lookup?code=${encodeURIComponent(code)}`);
  } catch (e) { toast.error(e.message); ghost.value = null; }
  finally { ghostBusy.value = false; }
}

async function ghostSave() {
  if (!ghost.value) return;
  ghostBusy.value = true;
  try {
    await api(`/events/${props.ev.id}/booth-monitor/potential-note`, {
      method: 'PUT',
      body: { attendee_id: ghost.value.attendee.id, note: ghost.value.note, is_potential: ghost.value.is_potential },
    });
    ghostSaved.value = true;
    setTimeout(() => (ghostSaved.value = false), 2000);
  } catch (e) { toast.error(e.message); }
  finally { ghostBusy.value = false; }
}

function ghostReset() { ghost.value = null; ghostCode.value = ''; }
</script>

<template>
  <div v-if="err" class="card muted">{{ err }}</div>
  <div v-else-if="data">
    <div class="info">🧭 <b>Booth phụ trách: {{ data.booth.name }}</b> — Ghi chú nhu cầu/đặc điểm của khách đã ghé booth. Khách xuất hiện sau khi được quét QR tại booth này.</div>

    <div v-if="ev.badge_count" class="card ghost-card">
      <h3>🕵️ Tra cứu bóng ma (theo mã thẻ)</h3>
      <p class="muted" style="margin:2px 0 12px">Liếc thấy mã số in trên thẻ khách (VD 0005) → gõ vào đây để tra tên, ghi chú nhanh nhu cầu và đánh dấu khách hàng tiềm năng. Không cần khách ghé đúng booth này, và không tính vào số booth đã ghé (lucky draw).</p>
      <div style="display:flex;gap:8px">
        <div style="flex:1;max-width:220px"><MInput v-model="ghostCode" placeholder="Mã thẻ, VD 0005" @keyup.enter="ghostLookup" /></div>
        <MButton variant="primary" :disabled="ghostBusy" @click="ghostLookup">🔍 Tra cứu</MButton>
        <MButton v-if="ghost" variant="secondary" @click="ghostReset">↺ Tra mã khác</MButton>
      </div>

      <div v-if="ghost" class="ghost-result">
        <div class="v-head">
          <div>
            <b>{{ (ghost.attendee.salutation ? ghost.attendee.salutation + ' ' : '') + ghost.attendee.name }}</b>
            <div class="muted">{{ [ghost.attendee.position, ghost.attendee.company].filter(Boolean).join(' · ') }}</div>
          </div>
        </div>
        <MTextarea v-model="ghost.note" :rows="2" placeholder="Ghi chú nhu cầu, sản phẩm quan tâm, hẹn liên hệ lại..." />
        <MCheckbox v-model="ghost.is_potential" label="⭐ Khách hàng tiềm năng" style="margin-top:8px" />
        <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
          <MButton variant="primary" size="md" :disabled="ghostBusy" @click="ghostSave">💾 Lưu</MButton>
          <span v-if="ghostSaved" style="color:#15803d">✓ Đã lưu</span>
        </div>
      </div>
    </div>

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
.ghost-card { margin-bottom: 16px; }
.ghost-card h3 { font-size: 15px; font-weight: 700; margin: 0; }
.ghost-result { margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--app-border); }
</style>
