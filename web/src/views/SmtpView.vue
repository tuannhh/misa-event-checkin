<script setup>
import { ref, reactive, onMounted } from 'vue';
import { api } from '../api';
import { useToast } from '../components/mds/toast.js';
import MButton from '../components/mds/MButton.vue';
import MInput from '../components/mds/MInput.vue';
import MCheckbox from '../components/mds/MCheckbox.vue';

const toast = useToast();
const s = reactive({ host: '', port: 465, secure: true, smtp_user: '', smtp_pass: '', from_name: '', brevo_api_key: '', sender_email: '' });
const testing = ref(false);

onMounted(async () => { Object.assign(s, await api('/smtp')); s.secure = !!s.secure; });

async function save() {
  try {
    await api('/smtp', { method: 'PUT', body: { ...s, smtp_pass: (s.smtp_pass || '').replace(/\s/g, '') } });
    toast.success('Đã lưu cấu hình email');
  } catch (e) { toast.error(e.message); }
}
async function sendTest() {
  testing.value = true;
  try { const r = await api('/smtp/test', { method: 'POST' }); alert(r.message); }
  catch (e) { alert(e.message); }
  finally { testing.value = false; }
}
</script>

<template>
  <div class="page-head"><h2>Cấu hình gửi Email</h2></div>

  <div class="card" style="max-width:560px">
    <h3>⚡ Kênh 1: Brevo (khuyên dùng cho bản online)</h3>
    <p class="muted" style="margin:8px 0 12px">Nền tảng cloud thường chặn SMTP → dùng Brevo (miễn phí 300 email/ngày). Tạo API key tại brevo.com → SMTP &amp; API → API Keys.</p>
    <label class="fld">Brevo API Key</label>
    <MInput v-model="s.brevo_api_key" placeholder="xkeysib-..." />
    <label class="fld">Email người gửi (đã đăng ký Brevo)</label>
    <MInput v-model="s.sender_email" placeholder="ban@gmail.com" />
  </div>

  <div class="card" style="max-width:560px">
    <h3>📮 Kênh 2: Gmail/SMTP (khi chạy nội bộ)</h3>
    <div class="row2">
      <div><label class="fld">Máy chủ SMTP</label><MInput v-model="s.host" /></div>
      <div><label class="fld">Cổng</label><MInput v-model="s.port" type="number" /></div>
    </div>
    <div style="margin-top:10px"><MCheckbox v-model="s.secure" label="Kết nối bảo mật SSL (cổng 465)" /></div>
    <label class="fld">Email gửi đi (Gmail)</label>
    <MInput v-model="s.smtp_user" placeholder="ban@gmail.com" />
    <label class="fld">Mật khẩu (App Password 16 ký tự)</label>
    <MInput v-model="s.smtp_pass" placeholder="abcd efgh ijkl mnop" />
  </div>

  <div class="card" style="max-width:560px">
    <label class="fld" style="margin-top:0">Tên người gửi hiển thị (chung 2 kênh)</label>
    <MInput v-model="s.from_name" />
    <div style="display:flex;gap:10px;margin-top:16px">
      <MButton variant="primary" @click="save">💾 Lưu</MButton>
      <MButton variant="secondary" :loading="testing" @click="sendTest">📨 Gửi email kiểm tra</MButton>
    </div>
  </div>
</template>

<style scoped>
h3 { font-size: 15px; font-weight: 700; margin: 0; }
</style>
