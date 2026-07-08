<script setup>
import { ref } from 'vue';
import { login } from '../api';
import MInput from '../components/mds/MInput.vue';
import MButton from '../components/mds/MButton.vue';

const email = ref('');
const password = ref('');
const err = ref('');
const busy = ref(false);

async function submit() {
  if (busy.value) return;
  err.value = '';
  busy.value = true;
  try { await login(email.value.trim(), password.value); }
  catch (e) { err.value = e.message; }
  finally { busy.value = false; }
}
</script>

<template>
  <div class="login-wrap">
    <div class="login-box">
      <div class="brand">🎟️ MISA Event Check-in</div>
      <p class="muted" style="margin: 4px 0 20px">Đăng nhập để tiếp tục</p>
      <form @submit.prevent="submit">
        <label class="fld">Email</label>
        <MInput v-model="email" type="email" placeholder="email@misa.com.vn" />
        <label class="fld">Mật khẩu</label>
        <MInput v-model="password" type="password" placeholder="••••••••" />
        <div class="err">{{ err }}</div>
        <MButton variant="primary" size="lg" :loading="busy" class="w-full !justify-center" @click="submit">
          Đăng nhập
        </MButton>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, var(--mds-brand-800, #1e3a8a), var(--mds-brand-600, #2563eb)); }
.login-box { background: #fff; padding: 36px; border-radius: 14px; width: 380px; max-width: 92vw; box-shadow: 0 20px 50px rgba(0,0,0,.3); }
.brand { font-size: 21px; font-weight: 700; color: var(--mds-brand-700, #1d4ed8); }
.err { color: #dc2626; font-size: 13px; min-height: 18px; margin: 10px 0 4px; }
</style>
