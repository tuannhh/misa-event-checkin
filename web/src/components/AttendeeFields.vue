<script setup>
import { auth } from '../api';
import MInput from './mds/MInput.vue';
import MSelect from './mds/MSelect.vue';
// Form dùng chung cho Thêm/Sửa người tham dự và Khách vãng lai.
// Cha truyền 1 object reactive `form`, component sửa trực tiếp trên đó.
defineProps({ form: { type: Object, required: true } });
const opt = (arr) => arr.map(v => ({ value: v, label: v }));
</script>

<template>
  <div class="row2">
    <div>
      <label class="fld">Xưng hô</label>
      <MSelect v-model="form.salutation" :options="[{ value: '', label: '-- Chọn --' }, ...opt(auth.options.salutations)]" />
    </div>
    <div><label class="fld">Họ và tên *</label><MInput v-model="form.name" /></div>
    <div><label class="fld">Email</label><MInput v-model="form.email" type="email" /></div>
    <div><label class="fld">Số điện thoại</label><MInput v-model="form.phone" /></div>
    <div>
      <label class="fld">Chức vụ</label>
      <MSelect v-model="form.position" :options="[{ value: '', label: '-- Chọn --' }, ...opt(auth.options.positions)]" />
    </div>
    <div>
      <label class="fld">Mức độ quan trọng</label>
      <MSelect v-model="form.importance" :options="opt(auth.options.importances)" />
    </div>
    <div><label class="fld">Nơi công tác/Tên công ty</label><MInput v-model="form.company" /></div>
    <div><label class="fld">MST công ty</label><MInput v-model="form.tax_code" /></div>
  </div>
  <label class="fld">Quy mô nhân sự công ty</label>
  <MSelect v-model="form.company_size" :options="[{ value: '', label: '-- Chọn --' }, ...opt(auth.options.company_sizes)]" />
</template>
