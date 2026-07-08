<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { api, auth } from '../../api';
import { useToast } from '../../components/mds/toast.js';
import { useScanner, vibrate } from '../../lib/scanner';
import { printQr } from '../../lib/print';
import MButton from '../../components/mds/MButton.vue';
import MInput from '../../components/mds/MInput.vue';
import MSelect from '../../components/mds/MSelect.vue';
import MTag from '../../components/mds/MTag.vue';
import MCheckbox from '../../components/mds/MCheckbox.vue';
import MDialog from '../../components/mds/MDialog.vue';
import AttendeeFields from '../../components/AttendeeFields.vue';

const props = defineProps({ ev: Object });
const toast = useToast();

const isCheckin = computed(() => auth.user.role === 'checkin');
const myPos = computed(() => props.ev.my_position || null);

// Vị trí quét: nhân viên checkin bị khoá cứng theo phân công; quản lý/admin tự chọn.
const locStorageKey = 'scanLocation-' + props.ev.id;
const location = ref(isCheckin.value ? (myPos.value?.booth_id ? String(myPos.value.booth_id) : '') : (localStorage.getItem(locStorageKey) || ''));
const locOptions = computed(() => [{ value: '', label: '🚪 Cổng check-in' }, ...props.ev.booths.map(b => ({ value: String(b.id), label: '🧭 Booth: ' + b.name }))]);
const atBooth = computed(() => !!location.value);
const boothId = computed(() => location.value ? Number(location.value) : null);
function onLocChange() { localStorage.setItem(locStorageKey, location.value); result.value = null; }

// Tự động check-in ngay tại cổng (mặc định bật). Ẩn khi quét tại booth.
const autoConfirm = ref(localStorage.getItem('autoConfirm') !== '0');
function onAutoChange() { localStorage.setItem('autoConfirm', autoConfirm.value ? '1' : '0'); }

const manualToken = ref('');
const result = ref(null);   // response gần nhất của /scan
let busy = false;

const STATUS_UI = {
  checked_in:       { cls: 'ok',   icon: '✅', title: 'CHECK-IN THÀNH CÔNG' },
  booth_recorded:   { cls: 'ok',   icon: '🧭', title: 'ĐÃ GHI NHẬN BOOTH' },
  valid:            { cls: 'ok',   icon: '🟢', title: 'KHÁCH HỢP LỆ' },
  booth_already:    { cls: 'warn', icon: '🔁', title: 'ĐÃ GHI NHẬN TRƯỚC ĐÓ' },
  already_checked:  { cls: 'warn', icon: 'ℹ️', title: 'KHÁCH ĐÃ CHECK-IN RỒI' },
  expired:          { cls: 'warn', icon: '⚠️', title: 'MÃ ĐÃ HẾT HẠN' },
  wrong_event:      { cls: 'warn', icon: '⚠️', title: 'SAI SỰ KIỆN' },
  invalid:          { cls: 'bad',  icon: '❌', title: 'MÃ KHÔNG HỢP LỆ' },
  badge_stopped:    { cls: 'bad',  icon: '❌', title: 'THẺ ĐÃ NGỪNG' },
  badge_unassigned: { cls: 'bad',  icon: '❌', title: 'THẺ CHƯA GÁN' },
};
const ui = computed(() => (result.value && STATUS_UI[result.value.status]) || null);
const att = computed(() => result.value?.attendee || null);
const impDanger = (i) => ['VIP', 'VVIP', 'Ban lãnh đạo'].includes(i);

async function handleToken(token) {
  if (busy || !token) return;
  busy = true; setTimeout(() => (busy = false), 1500);
  try {
    const r = await api(`/events/${props.ev.id}/scan`, { method: 'POST', body: { token, booth_id: boothId.value, auto_confirm: autoConfirm.value } });
    result.value = r;
    const good = ['checked_in', 'valid', 'booth_recorded'].includes(r.status);
    vibrate(good ? 100 : [80, 60, 80, 60, 80]);
  } catch (e) { toast.error(e.message); }
}
function onManual() { const t = manualToken.value.trim(); if (t) { handleToken(t); manualToken.value = ''; } }

async function confirmCheckin() {
  const a = att.value; if (!a) return;
  try {
    await api(`/events/${props.ev.id}/checkin/${a.id}`, { method: 'POST' });
    result.value = { status: 'checked_in', message: 'Check-in thành công!', attendee: { ...a, checked_in_at: new Date().toISOString() } };
    vibrate(100);
  } catch (e) { toast.error(e.message); }
}

const { failed } = useScanner('qr-reader', handleToken);

/* Khách vãng lai */
const dlgOpen = ref(false);
const form = reactive({});
function emptyForm() { return { salutation: '', name: '', email: '', phone: '', position: '', importance: 'Bình thường', company: '', tax_code: '', company_size: '' }; }
function openWalkin() { Object.assign(form, emptyForm()); dlgOpen.value = true; }
async function saveWalkin() {
  if (!form.name) { toast.warning('Cần nhập Họ và tên'); return; }
  try {
    const r = await api(`/events/${props.ev.id}/walkin`, { method: 'POST', body: { ...form, booth_id: boothId.value } });
    dlgOpen.value = false;
    toast.success(atBooth.value ? 'Đã thêm khách vãng lai tại booth' : 'Đã thêm & check-in khách vãng lai');
    result.value = { status: atBooth.value ? 'booth_recorded' : 'checked_in', message: 'Khách vãng lai đã được ghi nhận', attendee: { ...form, id: r.id, checked_in_at: new Date().toISOString(), is_walkin: 1 } };
  } catch (e) { toast.error(e.message); }
}
</script>

<template>
  <div class="scan-layout">
    <div class="card">
      <!-- Vị trí -->
      <div v-if="isCheckin" class="loc-fixed">
        {{ myPos?.booth_id ? '🧭 Booth: ' + myPos.name : '🚪 Cổng check-in' }}
      </div>
      <div v-else style="margin-bottom:14px">
        <label class="fld">Vị trí quét</label>
        <MSelect v-model="location" :options="locOptions" @update:modelValue="onLocChange" />
      </div>

      <h3>📷 Camera quét mã</h3>
      <div v-if="!failed" id="qr-reader" class="qr-reader"></div>
      <div v-else class="qr-fail">📷 Không mở được camera (cần HTTPS hoặc localhost). Hãy nhập mã thủ công bên dưới.</div>

      <MCheckbox v-if="!atBooth" v-model="autoConfirm" label="Tự động check-in ngay khi quét (tại cổng)" style="margin:12px 0" @change="onAutoChange" />

      <label class="fld">Nhập mã thủ công</label>
      <div style="display:flex;gap:8px">
        <div style="flex:1"><MInput v-model="manualToken" placeholder="Dán / gõ mã QR rồi bấm Kiểm tra" @keyup.enter="onManual" /></div>
        <MButton variant="primary" @click="onManual">Kiểm tra</MButton>
      </div>

      <MButton variant="secondary" style="margin-top:12px" @click="openWalkin">
        {{ atBooth ? '+ Thêm khách vãng lai tại booth này' : '+ Khách chưa đăng ký trước (vãng lai)' }}
      </MButton>
    </div>

    <!-- Kết quả -->
    <div class="card result" :class="ui ? ui.cls : 'idle'">
      <template v-if="ui">
        <div class="r-head"><span class="r-icon">{{ ui.icon }}</span><span class="r-title">{{ ui.title }}</span></div>
        <p class="r-msg">{{ result.message }}</p>
        <div v-if="att" class="r-info">
          <div><span>Họ tên</span><b>{{ (att.salutation ? att.salutation + ' ' : '') + att.name }}</b></div>
          <div><span>Mức độ</span><b :style="impDanger(att.importance) ? 'color:#dc2626' : ''">{{ att.importance || 'Bình thường' }}</b></div>
          <div v-if="att.position"><span>Chức vụ</span><b>{{ att.position }}</b></div>
          <div v-if="att.company"><span>Công ty</span><b>{{ att.company }}</b></div>
          <div v-if="att.company_size"><span>Quy mô</span><b>{{ att.company_size }}</b></div>
          <div v-if="att.phone"><span>SĐT</span><b>{{ att.phone }}</b></div>
          <div v-if="att.email"><span>Email</span><b>{{ att.email }}</b></div>
        </div>
        <MButton v-if="result.status === 'valid'" variant="primary" style="margin-top:14px;width:100%" @click="confirmCheckin">✅ XÁC NHẬN CHECK-IN</MButton>
        <MButton v-if="att && !atBooth" variant="secondary" style="margin-top:10px;width:100%" @click="printQr(att)">🖨 In thẻ QR cho khách</MButton>
      </template>
      <div v-else class="r-idle">
        <div style="font-size:44px">{{ atBooth ? '🧭' : '📷' }}</div>
        <p class="muted">{{ atBooth ? 'Quét QR của khách để ghi nhận ghé booth.' : 'Đưa mã QR vào khung camera để check-in.' }}</p>
      </div>
    </div>
  </div>

  <MDialog v-model="dlgOpen" type="confirm" confirm-text="Lưu & check-in" title="Khách vãng lai (chưa đăng ký)" :width="560" @confirm="saveWalkin">
    <AttendeeFields :form="form" />
  </MDialog>
</template>

<style scoped>
.scan-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
@media (max-width: 820px) { .scan-layout { grid-template-columns: 1fr; } }
h3 { font-size: 15px; font-weight: 700; margin: 0 0 10px; }
.loc-fixed { display: inline-block; background: var(--mds-brand-50, #eff6ff); color: var(--mds-brand-700, #1d4ed8); border: 1px solid var(--mds-brand-200, #bfdbfe); border-radius: 8px; padding: 8px 14px; font-weight: 700; margin-bottom: 14px; }
.qr-reader { width: 100%; border-radius: 10px; overflow: hidden; background: #000; min-height: 220px; }
.qr-fail { padding: 30px 16px; text-align: center; background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; color: #991b1b; }
.result { min-height: 260px; }
.result.idle .r-idle { text-align: center; padding: 40px 10px; }
.result.ok { border-color: #86efac; background: #f0fdf4; }
.result.warn { border-color: #fdba74; background: #fff7ed; }
.result.bad { border-color: #fca5a5; background: #fef2f2; }
.r-head { display: flex; align-items: center; gap: 10px; }
.r-icon { font-size: 30px; }
.r-title { font-size: 18px; font-weight: 800; }
.result.ok .r-title { color: #15803d; }
.result.warn .r-title { color: #c2410c; }
.result.bad .r-title { color: #b91c1c; }
.r-msg { margin: 8px 0 12px; }
.r-info { display: grid; gap: 6px; background: #fff; border: 1px solid var(--app-border); border-radius: 10px; padding: 12px 14px; }
.r-info > div { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
.r-info span { color: #6b7280; }
.r-info b { text-align: right; }
</style>
