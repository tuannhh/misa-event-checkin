<script setup>
import { ref, computed } from 'vue';
import { api, fmtDate } from '../../api';
import { useToast } from '../../components/mds/toast.js';
import { useScanner, vibrate } from '../../lib/scanner';
import MButton from '../../components/mds/MButton.vue';
import MInput from '../../components/mds/MInput.vue';
import MTag from '../../components/mds/MTag.vue';

const props = defineProps({ ev: Object });
const toast = useToast();

const guest = ref(null);   // { attendee, badges } | null
const manual = ref('');
let busy = false;

const step = computed(() => (guest.value ? 2 : 1));

async function handleToken(token) {
  if (busy || !token) return;
  busy = true; setTimeout(() => (busy = false), 1200);
  if (!guest.value) {
    // Bước 1: tra khách theo mã QR khách hoặc mã thẻ đã gán
    try {
      guest.value = await api(`/events/${props.ev.id}/badges/lookup?token=${encodeURIComponent(token)}`);
      vibrate(100);
    } catch (e) { toast.error(e.message); vibrate([80, 60, 80]); }
  } else {
    await pair(token, false);
  }
}
function onManual() { const t = manual.value.trim(); if (t) { handleToken(t); manual.value = ''; } }

async function pair(badgeToken, force) {
  try {
    const r = await api(`/events/${props.ev.id}/badges/pair`, { method: 'POST', body: { attendee_token: guest.value.attendee.qr_token, badge_code: badgeToken, force } });
    guest.value = { attendee: r.attendee, badges: r.badges };
    toast.success(r.message || 'Đã gán thẻ');
    vibrate(100);
  } catch (e) {
    if (e.data && e.data.duplicate && confirm(e.message)) return pair(badgeToken, true);
    toast.error(e.message); vibrate([80, 60, 80, 60, 80]);
  }
}

async function setBadgeStatus(b, status) {
  try {
    await api(`/events/${props.ev.id}/badges/${b.id}/status`, { method: 'PUT', body: { status } });
    b.status = status;
    toast.success(status === 'stopped' ? 'Đã ngừng thẻ' : 'Đã kích hoạt lại thẻ');
  } catch (e) { toast.error(e.message); }
}

function reset() { guest.value = null; }

const { failed } = useScanner('pair-reader', handleToken);
</script>

<template>
  <div class="hint">
    🎫 <b>Gán thẻ cho khách:</b> Bước 1 — quét mã QR của khách (trên email/thẻ cũ). Bước 2 — quét mã phôi thẻ mới để gán.
    Khách <b>báo mất thẻ</b>: gán thẻ mới rồi bấm <b>Ngừng</b> thẻ cũ để chống gian lận.
  </div>

  <div class="scan-layout">
    <div class="card">
      <div class="step-lbl">Bước {{ step }}: {{ step === 1 ? 'Quét mã QR của KHÁCH' : 'Quét mã PHÔI THẺ để gán' }}</div>
      <div v-if="!failed" id="pair-reader" class="qr-reader"></div>
      <div v-else class="qr-fail">📷 Không mở được camera. Hãy nhập mã thủ công.</div>

      <label class="fld">Nhập mã thủ công</label>
      <div style="display:flex;gap:8px">
        <div style="flex:1"><MInput v-model="manual" :placeholder="step === 1 ? 'Mã QR khách' : 'Mã phôi thẻ'" @keyup.enter="onManual" /></div>
        <MButton variant="primary" @click="onManual">OK</MButton>
      </div>

      <MButton v-if="guest" variant="secondary" style="margin-top:12px" @click="reset">↺ Chuyển sang khách mới</MButton>
    </div>

    <div class="card">
      <div v-if="!guest" class="r-idle">
        <div style="font-size:44px">🎫</div>
        <p class="muted">Quét mã QR của khách để bắt đầu gán thẻ.</p>
      </div>
      <template v-else>
        <h3>{{ (guest.attendee.salutation ? guest.attendee.salutation + ' ' : '') + guest.attendee.name }}</h3>
        <p class="muted" style="margin:4px 0 10px">{{ guest.attendee.company || '—' }}</p>
        <div style="margin-bottom:12px">
          Check-in:
          <MTag v-if="guest.attendee.checked_in_at" color="success" size="sm">✓ {{ fmtDate(guest.attendee.checked_in_at, true) }}</MTag>
          <MTag v-else color="neutral" size="sm">Chưa</MTag>
        </div>
        <div class="bd-title">Thẻ đã gán ({{ guest.badges.length }})</div>
        <div v-if="!guest.badges.length" class="muted" style="padding:8px 0">Chưa có thẻ. Quét mã phôi để gán.</div>
        <div v-for="b in guest.badges" :key="b.id" class="badge-row">
          <b>#{{ b.code }}</b>
          <MTag :color="b.status === 'stopped' ? 'danger' : 'success'" size="sm">{{ b.status === 'stopped' ? 'Đã ngừng' : 'Đang dùng' }}</MTag>
          <span style="flex:1"></span>
          <MButton v-if="b.status !== 'stopped'" variant="danger" size="md" @click="setBadgeStatus(b, 'stopped')">Ngừng</MButton>
          <MButton v-else variant="secondary" size="md" @click="setBadgeStatus(b, 'active')">Dùng lại</MButton>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.hint { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 12px 16px; margin-bottom: 14px; font-size: 13px; line-height: 1.5; }
.scan-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
@media (max-width: 820px) { .scan-layout { grid-template-columns: 1fr; } }
h3 { font-size: 16px; font-weight: 700; margin: 0; }
.step-lbl { font-weight: 700; color: var(--mds-brand-700, #1d4ed8); margin-bottom: 10px; }
.qr-reader { width: 100%; border-radius: 10px; overflow: hidden; background: #000; min-height: 220px; }
.qr-fail { padding: 30px 16px; text-align: center; background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; color: #991b1b; }
.r-idle { text-align: center; padding: 40px 10px; }
.bd-title { font-weight: 600; margin-bottom: 6px; }
.badge-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--app-border); }
</style>
