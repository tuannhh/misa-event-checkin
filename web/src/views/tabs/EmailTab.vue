<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { api } from '../../api';
import { useToast } from '../../components/mds/toast.js';
import { SUGGEST } from '../../lib/emailBody';
import MButton from '../../components/mds/MButton.vue';
import MInput from '../../components/mds/MInput.vue';
import MCheckbox from '../../components/mds/MCheckbox.vue';
import MDialog from '../../components/mds/MDialog.vue';
import BodyEditor from '../../components/BodyEditor.vue';

const props = defineProps({ ev: Object });
const toast = useToast();
const canManage = computed(() => props.ev.can_manage);

const loaded = ref(false);
const imgVer = ref(1);   // cache-buster cho ảnh header/footer
const f = reactive({
  confirm_subject: '', confirm_body: '', auto_send_confirm: false,
  thank_subject: '', thank_body: '', thank_delay_minutes: 60, thank_enabled: false,
  header_image: '', footer_image: '', header_width: 100, footer_width: 100,
});
const tplVars = ['{{xung_ho}}', '{{ho_ten}}', '{{ten_su_kien}}', '{{thoi_gian}}', '{{cong_ty}}', '{{qr_code}}'];
const confirmEditor = ref(null);
const thankEditor = ref(null);
const headerInput = ref(null);
const footerInput = ref(null);

async function load() {
  const s = await api(`/events/${props.ev.id}/email-settings`);
  Object.assign(f, {
    confirm_subject: s.confirm_subject || '', confirm_body: s.confirm_body || '',
    auto_send_confirm: !!s.auto_send_confirm,
    thank_subject: s.thank_subject || '', thank_body: s.thank_body || '',
    thank_delay_minutes: s.thank_delay_minutes ?? 60, thank_enabled: !!s.thank_enabled,
    header_image: s.header_image || '', footer_image: s.footer_image || '',
    header_width: s.header_width ?? 100, footer_width: s.footer_width ?? 100,
  });
  imgVer.value++;
  loaded.value = true;
}
onMounted(load);

const imgSrc = (type) => `/api/events/${props.ev.id}/email-image/${type}.img?t=${imgVer.value}`;

async function saveSettings(silent) {
  await api(`/events/${props.ev.id}/email-settings`, { method: 'PUT', body: {
    confirm_subject: f.confirm_subject, confirm_body: f.confirm_body, auto_send_confirm: f.auto_send_confirm,
    thank_subject: f.thank_subject, thank_body: f.thank_body, thank_delay_minutes: Number(f.thank_delay_minutes) || 60,
    thank_enabled: f.thank_enabled, header_width: Number(f.header_width), footer_width: Number(f.footer_width),
  } });
  if (!silent) toast.success('Đã lưu cài đặt email');
}
async function onSave() { try { await saveSettings(); } catch (e) { toast.error(e.message); } }

function applySuggest(type) {
  const editor = type === 'confirm' ? confirmEditor.value : thankEditor.value;
  const mode = editor.mode;
  const cur = type === 'confirm' ? f.confirm_body : f.thank_body;
  if (cur.trim() && !confirm('Nội dung hiện tại sẽ bị thay bằng nội dung gợi ý. Tiếp tục?')) return;
  if (type === 'confirm') f.confirm_subject = SUGGEST.confirm.subject; else f.thank_subject = SUGGEST.thank.subject;
  editor.insert(SUGGEST[type].text, SUGGEST[type].body);
  toast.success('Đã chèn nội dung gợi ý - bạn sửa lại hotline/link rồi bấm Lưu nhé');
}

/* Ảnh header/footer */
async function onUpload(type, e) {
  const file = e.target.files[0]; if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  try {
    await saveSettings(true); // giữ nội dung đang soạn
    await api(`/events/${props.ev.id}/email-image/${type}`, { method: 'POST', body: fd });
    toast.success('Đã tải ảnh lên'); load();
  } catch (err) { toast.error(err.message); }
  e.target.value = '';
}
async function delImg(type) {
  if (!confirm('Xoá ảnh này?')) return;
  try { await saveSettings(true); await api(`/events/${props.ev.id}/email-image/${type}`, { method: 'DELETE' }); load(); }
  catch (e) { toast.error(e.message); }
}

/* Xem trước */
const pvOpen = ref(false); const pvSubject = ref(''); const pvHtml = ref('');
async function preview(type) {
  try {
    await saveSettings(true);
    const p = await api(`/events/${props.ev.id}/email-preview?type=${type}`);
    pvSubject.value = p.subject; pvHtml.value = p.html; pvOpen.value = true;
  } catch (e) { toast.error(e.message); }
}
</script>

<template>
  <div v-if="loaded">
    <div class="hint">
      ✉️ Dùng các biến trong tiêu đề/nội dung, hệ thống tự thay khi gửi:
      <code v-for="v in tplVars" :key="v">{{ v }}</code>
      <span class="muted">(<code>{{ tplVars[5] }}</code> là vị trí chèn mã QR — bỏ trống thì QR gắn cuối thư). Ảnh header/footer dùng chung cho cả 2 thư.</span>
    </div>

    <!-- Email xác nhận -->
    <div class="card">
      <div class="page-head" style="margin-bottom:4px">
        <h3>Email xác nhận (gửi khi thêm người)</h3>
        <div style="display:flex;gap:8px">
          <MButton variant="secondary" size="md" @click="applySuggest('confirm')">✨ Chèn nội dung gợi ý</MButton>
          <MButton variant="secondary" size="md" @click="preview('confirm')">👁 Xem trước</MButton>
        </div>
      </div>
      <MCheckbox v-model="f.auto_send_confirm" label="Tự động gửi ngay khi thêm người tham dự" style="margin:8px 0" />
      <label class="fld">Tiêu đề</label><MInput v-model="f.confirm_subject" />
      <BodyEditor ref="confirmEditor" v-model="f.confirm_body" />
    </div>

    <!-- Ảnh header/footer -->
    <div class="card">
      <h3>Ảnh header / footer (dùng chung 2 thư)</h3>
      <div class="row2" style="margin-top:12px">
        <div v-for="type in ['header', 'footer']" :key="type" class="imgblock">
          <label class="fld" style="margin-top:0">{{ type === 'header' ? 'Ảnh đầu thư (header)' : 'Ảnh cuối thư (footer)' }}</label>
          <template v-if="f[type + '_image']">
            <img :src="imgSrc(type)" class="preview-img" :style="{ width: (type === 'header' ? f.header_width : f.footer_width) + '%' }" />
            <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
              <span class="muted">Rộng</span>
              <input type="range" min="10" max="100" v-model="f[type + '_width']" style="flex:1" />
              <span style="width:44px;text-align:right">{{ f[type + '_width'] }}%</span>
            </div>
            <div style="display:flex;gap:8px">
              <MButton variant="secondary" size="md" @click="(type === 'header' ? headerInput : footerInput).click()">Đổi ảnh khác</MButton>
              <MButton variant="danger" size="md" @click="delImg(type)">Xoá ảnh</MButton>
            </div>
          </template>
          <template v-else>
            <p class="muted">Chưa có ảnh.</p>
            <MButton variant="secondary" size="md" @click="(type === 'header' ? headerInput : footerInput).click()">Tải ảnh lên</MButton>
          </template>
        </div>
      </div>
      <input ref="headerInput" type="file" accept="image/*" hidden @change="e => onUpload('header', e)" />
      <input ref="footerInput" type="file" accept="image/*" hidden @change="e => onUpload('footer', e)" />
    </div>

    <!-- Email cảm ơn -->
    <div class="card">
      <div class="page-head" style="margin-bottom:4px">
        <h3>Email cảm ơn (gửi tự động sau check-in)</h3>
        <div style="display:flex;gap:8px">
          <MButton variant="secondary" size="md" @click="applySuggest('thank')">✨ Chèn nội dung gợi ý</MButton>
          <MButton variant="secondary" size="md" @click="preview('thank')">👁 Xem trước</MButton>
        </div>
      </div>
      <MCheckbox v-model="f.thank_enabled" label="Bật gửi email cảm ơn tự động" style="margin:8px 0" />
      <label class="fld">Gửi sau khi check-in (phút)</label>
      <div style="width:160px"><MInput v-model="f.thank_delay_minutes" type="number" /></div>
      <label class="fld">Tiêu đề</label><MInput v-model="f.thank_subject" />
      <BodyEditor ref="thankEditor" v-model="f.thank_body" />
    </div>

    <MButton v-if="canManage" variant="primary" @click="onSave">💾 Lưu cài đặt</MButton>
  </div>

  <MDialog v-model="pvOpen" title="👁 Xem trước email" :width="760" confirm-text="Đóng" @confirm="pvOpen = false">
    <p class="muted" style="margin-bottom:8px"><b>Tiêu đề:</b> {{ pvSubject }}</p>
    <iframe :srcdoc="pvHtml" style="width:100%;height:56vh;border:1px solid var(--app-border);border-radius:8px;background:#f3f4f6"></iframe>
  </MDialog>
</template>

<style scoped>
.hint { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 12px 16px; margin-bottom: 14px; font-size: 13px; line-height: 1.7; }
.hint code { background: #dbeafe; color: #1e40af; padding: 1px 6px; border-radius: 5px; font-size: 12px; }
h3 { font-size: 16px; font-weight: 700; margin: 0; }
.imgblock { border: 1px dashed var(--app-border); border-radius: 10px; padding: 14px; }
.preview-img { display: block; max-width: 100%; border-radius: 6px; border: 1px solid var(--app-border); }
</style>
