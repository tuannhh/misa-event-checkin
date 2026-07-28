import { reactive } from 'vue'

// Singleton THẬT (module thường, không phải <script setup>) — <script setup>
// chạy lại toàn bộ cho MỖI instance component nên khai báo reactive([]) trong
// đó KHÔNG dùng chung được giữa các MDialog. File .js độc lập này chỉ được
// Vue/ESM khởi tạo 1 lần, mọi MDialog import cùng 1 mảng.
export const openStack = reactive([])
