<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { api } from '../../api';
import { useToast } from '../../components/mds/toast.js';
import { SUGGEST } from '../../lib/emailBody';
import MButton from '../../components/mds/MButton.vue';
import MInput from '../../components/mds/MInput.vue';
import MCheckbox from '../../components/mds/MCheckbox.vue';
import MDialog from '../../components/mds/MDialog.vue';
import MTabs from '../../components/mds/MTabs.vue';
import MTag from '../../components/mds/MTag.vue';
import BodyEditor from '../../components/BodyEditor.vue';
import MIcon from '../../components/mds/MIcon.vue';

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

/* ============ Nhóm khách - mỗi nhóm có thể có nội dung email riêng (mục 6 kế hoạch nâng cấp).
   Khách được gán vào nhóm (tab Người tham dự / import Excel) -> gửi email TỰ ĐỘNG chọn đúng
   mẫu của nhóm đó, không cần chọn tay ở bước gửi. Nhóm không soạn mẫu riêng -> dùng mặc định
   ở trên. ============ */
const groups = ref([]);
const newGroupName = ref('');
async function loadGroups() { groups.value = await api(`/events/${props.ev.id}/groups`); }

async function addGroup() {
  const name = newGroupName.value.trim();
  if (!name) return;
  try { await api(`/events/${props.ev.id}/groups`, { method: 'POST', body: { name } }); newGroupName.value = ''; loadGroups(); }
  catch (e) { toast.error(e.message); }
}
async function deleteGroup(g) {
  if (!confirm(`Xoá nhóm "${g.name}"? Khách trong nhóm sẽ chuyển về không thuộc nhóm nào (không mất dữ liệu khách).`)) return;
  try { await api(`/groups/${g.id}`, { method: 'DELETE' }); loadGroups(); }
  catch (e) { toast.error(e.message); }
}

// Dialog soạn mẫu email riêng của 1 nhóm
const groupDlgOpen = ref(false);
const editingGroup = ref(null);
const groupTplType = ref('confirm');
const gf = reactive({ subject: '', body: '', header_image: '', footer_image: '', header_width: 100, footer_width: 100, _templateId: null });
const groupImgVer = ref(1);
const groupHeaderInput = ref(null);
const groupFooterInput = ref(null);

async function loadGroupTemplate() {
  const t = await api(`/groups/${editingGroup.value.id}/email-template?type=${groupTplType.value}`);
  Object.assign(gf, {
    subject: t.subject || '', body: t.body || '',
    header_image: t.header_image || '', footer_image: t.footer_image || '',
    header_width: t.header_width ?? 100, footer_width: t.footer_width ?? 100,
    _templateId: t.id || null,
  });
  groupImgVer.value++;
}
function openGroupEmail(g) { editingGroup.value = g; groupTplType.value = 'confirm'; groupDlgOpen.value = true; loadGroupTemplate(); }
watch(groupTplType, () => { if (groupDlgOpen.value) loadGroupTemplate(); });

async function saveGroupTemplate(silent) {
  await api(`/groups/${editingGroup.value.id}/email-template`, { method: 'PUT', body: {
    type: groupTplType.value, subject: gf.subject, body: gf.body,
    header_width: Number(gf.header_width), footer_width: Number(gf.footer_width),
  } });
  if (!silent) toast.success('Đã lưu mẫu email của nhóm');
}
const groupImgSrc = (kind) => `/api/email-templates/${gf._templateId || 0}/image/${kind}.img?t=${groupImgVer.value}`;
async function onGroupUpload(kind, e) {
  const file = e.target.files[0]; if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  try {
    await saveGroupTemplate(true);
    const r = await api(`/groups/${editingGroup.value.id}/email-template/${groupTplType.value}/image/${kind}`, { method: 'POST', body: fd });
    gf._templateId = r.template_id;
    toast.success('Đã tải ảnh lên'); loadGroupTemplate();
  } catch (err) { toast.error(err.message); }
  e.target.value = '';
}
async function delGroupImg(kind) {
  if (!confirm('Xoá ảnh này?')) return;
  try { await saveGroupTemplate(true); await api(`/groups/${editingGroup.value.id}/email-template/${groupTplType.value}/image/${kind}`, { method: 'DELETE' }); loadGroupTemplate(); }
  catch (e) { toast.error(e.message); }
}
const gPvOpen = ref(false); const gPvSubject = ref(''); const gPvHtml = ref('');
async function previewGroup() {
  try {
    await saveGroupTemplate(true);
    const p = await api(`/groups/${editingGroup.value.id}/email-preview?type=${groupTplType.value}`);
    gPvSubject.value = p.subject; gPvHtml.value = p.html; gPvOpen.value = true;
  } catch (e) { toast.error(e.message); }
}

onMounted(loadGroups);
</script>

<template>
  <div v-if="loaded">
    <div class="hint">
      <MIcon name="mail" /> Dùng các biến trong tiêu đề/nội dung, hệ thống tự thay khi gửi:
      <code v-for="v in tplVars" :key="v">{{ v }}</code>
      <span class="muted">(<code>{{ tplVars[5] }}</code> là vị trí chèn mã QR — bỏ trống thì QR gắn cuối thư). Ảnh header/footer dùng chung cho cả 2 thư.</span>
    </div>

    <!-- Email xác nhận -->
    <div class="card">
      <div class="page-head" style="margin-bottom:4px">
        <h3>Email xác nhận (gửi khi thêm người)</h3>
        <div style="display:flex;gap:8px">
          <MButton variant="secondary" size="md" @click="applySuggest('confirm')"><MIcon name="sparkles" /> Chèn nội dung gợi ý</MButton>
          <MButton variant="secondary" size="md" @click="preview('confirm')"><MIcon name="eye" /> Xem trước</MButton>
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
          <MButton variant="secondary" size="md" @click="applySuggest('thank')"><MIcon name="sparkles" /> Chèn nội dung gợi ý</MButton>
          <MButton variant="secondary" size="md" @click="preview('thank')"><MIcon name="eye" /> Xem trước</MButton>
        </div>
      </div>
      <MCheckbox v-model="f.thank_enabled" label="Bật gửi email cảm ơn tự động" style="margin:8px 0" />
      <label class="fld">Gửi sau khi check-in (phút)</label>
      <div style="width:160px"><MInput v-model="f.thank_delay_minutes" type="number" /></div>
      <label class="fld">Tiêu đề</label><MInput v-model="f.thank_subject" />
      <BodyEditor ref="thankEditor" v-model="f.thank_body" />
    </div>

    <MButton v-if="canManage" variant="primary" @click="onSave"><MIcon name="device-floppy" /> Lưu cài đặt</MButton>

    <!-- Nhóm khách - mỗi nhóm có thể soạn nội dung email riêng, tự động chọn đúng khi gửi -->
    <div class="card">
      <h3><MIcon name="users" /> Nhóm khách &amp; nội dung email riêng</h3>
      <p class="muted" style="margin:6px 0 14px">Gán khách vào nhóm ở tab Người tham dự/import Excel (cột "Nhóm khách"). Nhóm nào không soạn mẫu riêng ở đây sẽ dùng nội dung mặc định phía trên.</p>
      <div v-if="canManage" style="display:flex;gap:8px;margin-bottom:14px">
        <div style="flex:1;max-width:280px"><MInput v-model="newGroupName" placeholder="VD: Khách VIP, Hiệp hội..." @keyup.enter="addGroup" /></div>
        <MButton variant="secondary" @click="addGroup">+ Thêm nhóm</MButton>
      </div>
      <p v-if="!groups.length" class="muted">Chưa có nhóm khách nào - toàn bộ khách dùng nội dung mặc định.</p>
      <div v-else class="group-list">
        <div v-for="g in groups" :key="g.id" class="group-row">
          <b style="flex:1">{{ g.name }}</b>
          <MButton variant="secondary" @click="openGroupEmail(g)"><MIcon name="mail" /> Soạn email riêng</MButton>
          <MButton v-if="canManage" variant="danger" @click="deleteGroup(g)">Xoá</MButton>
        </div>
      </div>
    </div>
  </div>

  <MDialog v-model="pvOpen" title="Xem trước email" :width="760" confirm-text="Đóng" @confirm="pvOpen = false">
    <p class="muted" style="margin-bottom:8px"><b>Tiêu đề:</b> {{ pvSubject }}</p>
    <iframe :srcdoc="pvHtml" style="width:100%;height:56vh;border:1px solid var(--app-border);border-radius:8px;background:#f3f4f6"></iframe>
  </MDialog>

  <MDialog v-model="groupDlgOpen" :title="`Email riêng - nhóm ${editingGroup?.name || ''}`" :width="760">
    <MTabs v-model="groupTplType" :tabs="[{ key: 'confirm', label: 'Email xác nhận' }, { key: 'thank', label: 'Email cảm ơn' }]" variant="pill" />
    <div style="margin-top:14px">
      <label class="fld">Tiêu đề</label>
      <MInput v-model="gf.subject" :placeholder="`Để trống thì dùng tiêu đề mặc định của sự kiện`" />
      <BodyEditor v-model="gf.body" />
      <p class="muted" style="font-size:12px;margin-top:2px">Để trống nội dung/tiêu đề thì mục đó lùi về mặc định của sự kiện; chỉ cần soạn phần muốn khác đi.</p>

      <label class="fld" style="margin-top:14px">Ảnh header/footer riêng của nhóm (để trống thì dùng ảnh mặc định)</label>
      <div class="row2" style="margin-top:6px">
        <div v-for="kind in ['header', 'footer']" :key="kind" class="imgblock">
          <label class="fld" style="margin-top:0">{{ kind === 'header' ? 'Ảnh đầu thư' : 'Ảnh cuối thư' }}</label>
          <template v-if="gf[kind + '_image']">
            <img :src="groupImgSrc(kind)" class="preview-img" :style="{ width: (kind === 'header' ? gf.header_width : gf.footer_width) + '%' }" />
            <div style="display:flex;gap:8px;margin-top:8px">
              <MButton variant="secondary" @click="(kind === 'header' ? groupHeaderInput : groupFooterInput).click()">Đổi ảnh</MButton>
              <MButton variant="danger" @click="delGroupImg(kind)">Xoá</MButton>
            </div>
          </template>
          <MButton v-else variant="secondary" @click="(kind === 'header' ? groupHeaderInput : groupFooterInput).click()">Tải ảnh lên</MButton>
        </div>
      </div>
      <input ref="groupHeaderInput" type="file" accept="image/*" hidden @change="e => onGroupUpload('header', e)" />
      <input ref="groupFooterInput" type="file" accept="image/*" hidden @change="e => onGroupUpload('footer', e)" />

      <div style="display:flex;gap:8px;margin-top:16px">
        <MButton variant="secondary" @click="previewGroup"><MIcon name="eye" /> Xem trước</MButton>
        <MButton variant="primary" @click="saveGroupTemplate()"><MIcon name="device-floppy" /> Lưu mẫu của nhóm</MButton>
      </div>
    </div>
  </MDialog>

  <MDialog v-model="gPvOpen" title="Xem trước email (nhóm)" :width="760" confirm-text="Đóng" @confirm="gPvOpen = false">
    <p class="muted" style="margin-bottom:8px"><b>Tiêu đề:</b> {{ gPvSubject }}</p>
    <iframe :srcdoc="gPvHtml" style="width:100%;height:56vh;border:1px solid var(--app-border);border-radius:8px;background:#f3f4f6"></iframe>
  </MDialog>
</template>

<style scoped>
.hint { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 12px 16px; margin-bottom: 14px; font-size: 13px; line-height: 1.7; }
.hint code { background: #dbeafe; color: #1e40af; padding: 1px 6px; border-radius: 5px; font-size: 12px; }
h3 { font-size: 16px; font-weight: 700; margin: 0; }
.imgblock { border: 1px dashed var(--app-border); border-radius: 10px; padding: 14px; }
.preview-img { display: block; max-width: 100%; border-radius: 6px; border: 1px solid var(--app-border); }
</style>
