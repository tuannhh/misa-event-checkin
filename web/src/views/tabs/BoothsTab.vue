<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../../api';
import { useToast } from '../../components/mds/toast.js';
import MButton from '../../components/mds/MButton.vue';
import MInput from '../../components/mds/MInput.vue';

const props = defineProps({ ev: Object });
const toast = useToast();
const data = ref(null);
const newName = ref('');

async function load() { data.value = await api('/events/' + props.ev.id); }
onMounted(load);

const canManage = computed(() => data.value?.can_manage);
const typeTag = (t) => t === 'reception' ? ' (Lễ tân in QR)' : t === 'supervisor' ? ' (Giám sát)' : t === 'manager' ? ' (Quản lý)' : '';
const staffByBooth = computed(() => {
  const m = {};
  for (const s of (data.value?.staff || [])) { const k = s.booth_id || 0; (m[k] = m[k] || []).push(s.name + typeTag(s.staff_type)); }
  return m;
});

async function addBooth() {
  const name = newName.value.trim(); if (!name) return;
  try { await api(`/events/${props.ev.id}/booths`, { method: 'POST', body: { name } }); newName.value = ''; load(); }
  catch (e) { toast.error(e.message); }
}
async function delBooth(b) {
  if (!confirm('Xoá booth này? Lịch sử quét tại booth cũng sẽ bị xoá.')) return;
  await api('/booths/' + b.id, { method: 'DELETE' }); load();
}
</script>

<template>
  <div v-if="data" class="card" style="max-width:700px">
    <h3>🧭 Hành trình booth của sự kiện</h3>
    <p class="muted" style="margin:6px 0 14px">Tạo danh sách booth/gian hàng. Mỗi nhân viên được gán 1 vị trí ở tab <b>Nhân viên</b>. Chỉ nhân viên được gán đúng booth quét mới ghi nhận lượt ghé.</p>
    <div class="gate">🚪 <b>Cổng check-in</b> — Nhân viên:
      <span v-if="staffByBooth[0]">{{ staffByBooth[0].join(', ') }}</span>
      <span v-else class="muted">chưa gán ai</span>
    </div>
    <div v-if="data.booths.length">
      <div v-for="(b, i) in data.booths" :key="b.id" class="booth-row">
        <span class="num">{{ i + 1 }}</span>
        <div style="flex:1">
          <b>{{ b.name }}</b><br>
          <span class="muted">👤 {{ (staffByBooth[b.id] || []).length ? staffByBooth[b.id].join(', ') : 'chưa gán ai' }}</span>
        </div>
        <MButton v-if="canManage" variant="danger" size="md" @click="delBooth(b)">✕</MButton>
      </div>
    </div>
    <p v-else class="muted">Chưa có booth nào.</p>
    <div v-if="canManage" style="display:flex;gap:8px;margin-top:14px">
      <div style="flex:1"><MInput v-model="newName" placeholder="Tên booth mới, VD: Booth AI - MISA AMIS" @keyup.enter="addBooth" /></div>
      <MButton variant="primary" @click="addBooth">+ Thêm</MButton>
    </div>
  </div>
</template>

<style scoped>
h3 { font-size: 16px; font-weight: 700; margin: 0; }
.gate { padding: 8px 10px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; margin-bottom: 10px; }
.booth-row { display: flex; align-items: center; gap: 10px; padding: 10px 8px; border-bottom: 1px solid var(--app-border); }
.num { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 22px; background: var(--mds-brand-100, #dbeafe); color: var(--mds-brand-700, #1e40af); border-radius: 999px; font-size: 12px; font-weight: 700; padding: 0 8px; }
</style>
