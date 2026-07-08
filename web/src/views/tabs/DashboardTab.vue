<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { api } from '../../api';
import MSelect from '../../components/mds/MSelect.vue';
import MButton from '../../components/mds/MButton.vue';

const props = defineProps({ ev: Object });
const s = ref(null);
const dim = ref('importance');
const accOpen = ref(true);

// Bộ lọc đa chiều: TRONG 1 chiều = OR, GIỮA các chiều = AND.
const filters = reactive({ importance: [], position: [], company_size: [], booth: [] });

async function load() { s.value = await api(`/events/${props.ev.id}/stats`); }
onMounted(() => { accOpen.value = window.innerWidth > 640; load(); });

const pct = (n, d) => (d ? Math.round(n / d * 100) : 0);
const anyFilter = computed(() => Object.values(filters).some(a => a.length));
const boothName = (id) => (s.value?.booths.find(b => b.id === id)?.name) || ('#' + id);

function toggle(d, v) { const a = filters[d]; const i = a.indexOf(v); i >= 0 ? a.splice(i, 1) : a.push(v); }
function clearAll() { filters.importance = []; filters.position = []; filters.company_size = []; filters.booth = []; }
const isOn = (d, v) => filters[d].includes(v);

function matches(r) {
  if (filters.importance.length && !filters.importance.includes(r.importance)) return false;
  if (filters.position.length && !filters.position.includes(r.position)) return false;
  if (filters.company_size.length && !filters.company_size.includes(r.company_size)) return false;
  if (filters.booth.length && !(r.booths || []).some(id => filters.booth.includes(id))) return false;
  return true;
}

const scope = computed(() => (anyFilter.value ? s.value.data.filter(matches) : s.value.data));
const regAll = computed(() => s.value?.data.length || 0);
const attAll = computed(() => (s.value?.data || []).filter(r => r.checked_in).length);
const reg = computed(() => scope.value.length);
const att = computed(() => scope.value.filter(r => r.checked_in).length);
const walk = computed(() => scope.value.filter(r => r.is_walkin).length);
const rate = computed(() => pct(att.value, reg.value));
const fcount = computed(() => Object.values(filters).reduce((n, a) => n + a.length, 0));

const summary = computed(() => {
  const parts = [];
  for (const v of filters.importance) parts.push(v);
  for (const v of filters.position) parts.push(v);
  for (const v of filters.company_size) parts.push(v);
  for (const id of filters.booth) parts.push(boothName(id));
  return parts.join(' · ');
});

const dimOptions = computed(() => [
  { value: 'importance', label: 'Mức độ quan trọng' },
  { value: 'position', label: 'Chức vụ' },
  { value: 'company_size', label: 'Quy mô nhân sự' },
  ...(s.value?.booths.length ? [{ value: 'booth', label: 'Booth đã ghé' }] : []),
]);

const breakdown = computed(() => {
  if (!s.value) return [];
  let groups;
  if (dim.value === 'booth') {
    groups = s.value.booths.map(b => ({ label: b.name, test: r => (r.booths || []).includes(b.id) }));
  } else {
    const opts = dim.value === 'importance' ? s.value.importances : dim.value === 'position' ? s.value.positions : s.value.company_sizes;
    groups = [...opts.map(o => ({ label: o, test: r => r[dim.value] === o })), { label: '(Chưa nhập)', test: r => !r[dim.value] }];
  }
  return groups.map(g => {
    const sub = scope.value.filter(g.test);
    return { label: g.label, reg: sub.length, att: sub.filter(r => r.checked_in).length };
  }).filter(g => g.reg > 0).sort((a, b) => b.reg - a.reg);
});

const chipGroups = computed(() => [
  { dim: 'importance', label: 'Mức độ', items: (s.value?.importances || []).map(v => ({ v, label: v })) },
  { dim: 'position', label: 'Chức vụ', items: (s.value?.positions || []).map(v => ({ v, label: v })) },
  { dim: 'company_size', label: 'Quy mô nhân sự', items: (s.value?.company_sizes || []).map(v => ({ v, label: v })) },
  ...(s.value?.booths.length ? [{ dim: 'booth', label: 'Đã ghé booth', items: s.value.booths.map(b => ({ v: b.id, label: b.name })) }] : []),
]);
</script>

<template>
  <div v-if="s">
    <!-- Hero -->
    <div class="hero">
      <div class="scope">{{ anyFilter ? '🔎 Đang lọc: ' + summary : '📊 Toàn sự kiện' }}</div>
      <div class="rate">{{ rate }}%</div>
      <div class="headline">Đã đến <b>{{ att }}</b> / {{ reg }} khách</div>
      <div class="bar"><div class="fill" :style="{ width: rate + '%' }"></div></div>
      <div class="mini">
        Chưa đến: <b>{{ reg - att }}</b> · Vãng lai: <b>{{ walk }}</b>
        <template v-if="anyFilter"> · Chiếm <b>{{ pct(reg, regAll) }}%</b> tổng ĐK, <b>{{ pct(att, attAll) }}%</b> tổng đã đến</template>
      </div>
    </div>

    <!-- Bộ lọc -->
    <div class="card">
      <div class="acc-head" @click="accOpen = !accOpen">
        <b>🎛 Bộ lọc {{ fcount ? '(' + fcount + ')' : '' }}</b>
        <span>{{ accOpen ? '▲' : '▼' }}</span>
      </div>
      <div v-show="accOpen" style="margin-top:12px">
        <div v-for="g in chipGroups" :key="g.dim" class="chip-group">
          <div class="cg-label">{{ g.label }}</div>
          <div class="chips">
            <button v-for="it in g.items" :key="it.v" class="chip" :class="{ on: isOn(g.dim, it.v) }" @click="toggle(g.dim, it.v)">{{ it.label }}</button>
          </div>
        </div>
        <MButton v-if="anyFilter" variant="link" size="md" @click="clearAll">✕ Xoá tất cả lọc</MButton>
      </div>
    </div>

    <!-- Tỷ trọng -->
    <div class="card">
      <div class="page-head" style="margin-bottom:12px">
        <h3>📋 Tỷ trọng theo</h3>
        <div style="width:220px"><MSelect v-model="dim" :options="dimOptions" /></div>
      </div>
      <div v-if="!breakdown.length" class="muted">Không có dữ liệu phù hợp bộ lọc.</div>
      <div v-for="g in breakdown" :key="g.label" class="bd-row">
        <div class="bd-top"><span>{{ g.label }}</span><span class="muted">ĐK {{ g.reg }} · Đến {{ g.att }} ({{ pct(g.att, g.reg) }}%)</span></div>
        <div class="bar sm"><div class="fill" :style="{ width: pct(g.att, g.reg) + '%' }"></div></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
h3 { font-size: 16px; font-weight: 700; margin: 0; }
.hero { background: linear-gradient(135deg, var(--mds-brand-600, #2563eb), var(--mds-brand-700, #1d4ed8)); color: #fff; border-radius: 14px; padding: 22px 24px; margin-bottom: 16px; }
.hero .scope { font-size: 13px; opacity: .9; }
.hero .rate { font-size: 52px; font-weight: 800; line-height: 1.1; }
.hero .headline { font-size: 16px; margin-bottom: 10px; }
.hero .mini { font-size: 13px; opacity: .92; margin-top: 8px; }
.bar { height: 12px; background: rgba(255, 255, 255, .3); border-radius: 999px; overflow: hidden; }
.bar .fill { height: 100%; background: #fff; border-radius: 999px; transition: width .3s; }
.bar.sm { background: var(--app-border); }
.bar.sm .fill { background: var(--mds-brand-500, #3b82f6); }
.acc-head { display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; }
.chip-group { margin-bottom: 12px; }
.cg-label { font-weight: 600; font-size: 12px; color: #6b7280; margin-bottom: 6px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { border: 1px solid var(--app-border); background: #fff; color: #374151; border-radius: 999px; padding: 5px 12px; font-size: 12px; cursor: pointer; }
.chip.on { background: var(--mds-brand-600, #2563eb); border-color: var(--mds-brand-600, #2563eb); color: #fff; font-weight: 600; }
.bd-row { margin-bottom: 12px; }
.bd-top { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
</style>
