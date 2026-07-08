<script setup>
import { computed, ref } from 'vue'
import MCheckbox from './MCheckbox.vue'
import MSpinner from './MSpinner.vue'
import MEmptyState from './MEmptyState.vue'

const props = defineProps({
  // Cột: { key, label, width? (số px hoặc 'auto'), align? 'left'|'right'|'center', sortable? }
  // Theo chuẩn MISA: văn bản/số cố định ký tự căn trái, số tiền/số liệu so sánh căn PHẢI
  columns: { type: Array, required: true },
  rows: { type: Array, default: () => [] },
  rowKey: { type: String, default: 'id' },
  // Hiện cột checkbox đầu tiên để chọn dòng
  selectable: { type: Boolean, default: false },
  // Overlay spinner đè lên bảng khi đang tải dữ liệu
  loading: { type: Boolean, default: false },
  // Phân trang kiểu prev/next KHÔNG đánh số trang (spec MDS mục Paging:
  // SaaS dữ liệu lớn dùng tìm kiếm/lọc thay vì nhảy trang theo số)
  page: { type: Number, default: 1 },
  hasNext: { type: Boolean, default: false },
  pageSize: { type: Number, default: 20 },
  pageSizeOptions: { type: Array, default: () => [20, 50, 100] },
  // v-model:selected — mảng rowKey của các dòng đang được chọn
  selected: { type: Array, default: () => [] },
})

const emit = defineEmits([
  'update:selected',
  'update:page',
  'update:pageSize',
  'row-click',
  'sort',
])

/* ── Chọn dòng bằng checkbox ─────────────────────────────── */

const pageKeys = computed(() => props.rows.map((r) => r[props.rowKey]))

const isSelected = (key) => props.selected.includes(key)

// Checkbox header: check hết trang / indeterminate khi chọn một phần (spec MDS)
const allChecked = computed(
  () => pageKeys.value.length > 0 && pageKeys.value.every((k) => props.selected.includes(k))
)
const isIndeterminate = computed(
  () => !allChecked.value && pageKeys.value.some((k) => props.selected.includes(k))
)

// Check header = chọn cả trang hiện tại, uncheck = bỏ chọn cả trang
// (vẫn giữ các dòng đã chọn ở trang khác — spec cho phép gom chọn nhiều trang)
function toggleAll() {
  if (allChecked.value) {
    emit(
      'update:selected',
      props.selected.filter((k) => !pageKeys.value.includes(k))
    )
  } else {
    emit('update:selected', [...new Set([...props.selected, ...pageKeys.value])])
  }
}

function toggleRow(key) {
  emit(
    'update:selected',
    isSelected(key) ? props.selected.filter((k) => k !== key) : [...props.selected, key]
  )
}

function clearSelected() {
  emit('update:selected', [])
}

/* ── Sort phía server: xoay vòng asc → desc → none ───────── */

const sortState = ref({ key: null, direction: null })

function cycleSort(col) {
  if (!col.sortable) return
  let direction
  if (sortState.value.key !== col.key) direction = 'asc'
  else if (sortState.value.direction === 'asc') direction = 'desc'
  else direction = null // desc → none: bỏ sắp xếp
  sortState.value = { key: direction ? col.key : null, direction }
  // Component KHÔNG tự sort — cha nhận event và sort phía server
  emit('sort', { key: col.key, direction })
}

/* ── Layout cột ──────────────────────────────────────────── */

const alignClass = (col) =>
  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'

// min-width bảng theo tổng độ rộng cột để scroll ngang khi màn hẹp
const minTableWidth = computed(() => {
  const cols = props.columns.reduce(
    (sum, c) => sum + (typeof c.width === 'number' ? c.width : 120),
    0
  )
  return cols + (props.selectable ? 40 : 0)
})

const colWidth = (col) => (typeof col.width === 'number' ? `${col.width}px` : 'auto')

const totalCols = computed(() => props.columns.length + (props.selectable ? 1 : 0))

/* ── Phân trang ──────────────────────────────────────────── */

function goPrev() {
  if (props.page > 1) emit('update:page', props.page - 1)
}
function goNext() {
  if (props.hasNext) emit('update:page', props.page + 1)
}
// Đổi số dòng/trang thì quay về trang 1 (tránh rơi vào trang không tồn tại)
function changePageSize(e) {
  emit('update:pageSize', Number(e.target.value))
  emit('update:page', 1)
}
</script>

<template>
  <div
    class="relative flex flex-col overflow-hidden rounded-lg border border-[var(--mds-border)] bg-[var(--mds-bg)]"
  >
    <!-- Bulk action bar: đè lên header khi có ≥1 dòng được chọn (spec MDS 6.1) -->
    <div
      v-if="selected.length > 0"
      class="absolute inset-x-0 top-0 z-20 flex h-10 items-center gap-3 border-b border-[var(--mds-border)] bg-[var(--mds-brand-50)] px-4"
    >
      <span class="text-[13px] font-medium leading-[18px] text-[var(--mds-text)]">
        Đã chọn {{ selected.length }}
      </span>
      <button
        type="button"
        class="text-[13px] font-medium leading-[18px] text-[var(--mds-brand-600)] hover:text-[var(--mds-brand-700)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
        @click="clearSelected"
      >
        Bỏ chọn
      </button>
      <!-- Slot cho các nút thao tác hàng loạt (>5 nút thì cha tự gom vào nút ...) -->
      <div class="ml-auto flex items-center gap-2">
        <slot name="bulk-actions" :selected="selected" />
      </div>
    </div>

    <!-- Vùng bảng: scroll dọc + ngang, header sticky -->
    <div class="min-h-0 flex-1 overflow-auto">
      <table
        class="w-full border-collapse text-[13px] leading-[18px] text-[var(--mds-text)]"
        :style="{ minWidth: minTableWidth + 'px' }"
      >
        <colgroup>
          <col v-if="selectable" style="width: 40px" />
          <col v-for="col in columns" :key="col.key" :style="{ width: colWidth(col) }" />
        </colgroup>

        <!-- Header sticky top-0 khi scroll dọc trong bảng (spec MDS mục Scroll) -->
        <thead>
          <tr class="h-10">
            <th
              v-if="selectable"
              class="sticky top-0 z-10 border-b border-[var(--mds-border)] bg-[var(--mds-bg)] px-3"
            >
              <MCheckbox
                :model-value="allChecked"
                :indeterminate="isIndeterminate"
                @update:model-value="toggleAll"
              />
            </th>
            <th
              v-for="col in columns"
              :key="col.key"
              class="group sticky top-0 z-10 border-b border-[var(--mds-border)] bg-[var(--mds-bg)] px-3 text-[12px] font-semibold text-[var(--mds-text-muted)]"
              :class="[alignClass(col), col.sortable ? 'cursor-pointer select-none' : '']"
              :aria-sort="
                sortState.key === col.key
                  ? sortState.direction === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : undefined
              "
              @click="cycleSort(col)"
            >
              <span
                class="inline-flex items-center gap-1"
                :class="col.align === 'right' ? 'flex-row-reverse' : ''"
              >
                {{ col.label }}
                <!-- Icon sort: mũi tên lên (asc) / xuống (desc); chưa sort thì chỉ hiện mờ khi hover header -->
                <svg
                  v-if="col.sortable"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="shrink-0"
                  :class="
                    sortState.key === col.key
                      ? 'text-[var(--mds-brand-600)]'
                      : 'opacity-0 group-hover:opacity-100 text-[var(--mds-icon-neutral)]'
                  "
                  aria-hidden="true"
                >
                  <template v-if="sortState.key === col.key && sortState.direction === 'desc'">
                    <path d="M12 5v14" /><path d="M6 13l6 6l6 -6" />
                  </template>
                  <template v-else>
                    <path d="M12 19V5" /><path d="M6 11l6 -6l6 6" />
                  </template>
                </svg>
              </span>
            </th>
          </tr>
        </thead>

        <tbody>
          <!-- Empty state: rows rỗng và không loading (spec MDS Empty) -->
          <tr v-if="rows.length === 0 && !loading">
            <td :colspan="totalCols" class="p-0">
              <slot name="empty">
                <MEmptyState
                  type="no-result"
                  title="Không tìm thấy kết quả"
                  description="Thử thay đổi từ khóa hoặc điều kiện lọc"
                />
              </slot>
            </td>
          </tr>

          <!-- Dòng dữ liệu: cao 40px, hover nền nhạt, click mở chi tiết (row-click) -->
          <tr
            v-for="row in rows"
            :key="row[rowKey]"
            class="group h-10 cursor-pointer border-b border-[var(--mds-bg-disabled)] transition-colors last:border-b-0 hover:bg-[var(--mds-bg-hover-soft)]"
            :class="isSelected(row[rowKey]) ? 'bg-[var(--mds-brand-50)]' : ''"
            @click="emit('row-click', row)"
          >
            <!-- Cột checkbox: click KHÔNG trigger row-click (stop) -->
            <td v-if="selectable" class="px-3" @click.stop>
              <MCheckbox
                :model-value="isSelected(row[rowKey])"
                @update:model-value="toggleRow(row[rowKey])"
              />
            </td>
            <td
              v-for="(col, ci) in columns"
              :key="col.key"
              class="truncate px-3"
              :class="alignClass(col)"
            >
              <!-- Cột cuối: chứa row-actions ẩn, hiện khi hover dòng (spec MDS mục 4) -->
              <div v-if="ci === columns.length - 1" class="relative">
                <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]">
                  {{ row[col.key] }}
                </slot>
                <!-- Row actions căn phải, nền theo màu hover để che chữ bên dưới;
                     click action KHÔNG trigger row-click (stop) -->
                <div
                  class="absolute inset-y-0 right-0 hidden items-center gap-1 bg-[var(--mds-bg-hover-soft)] pl-2 group-hover:flex"
                  @click.stop
                >
                  <slot name="row-actions" :row="row" />
                </div>
              </div>
              <slot v-else :name="`cell-${col.key}`" :row="row" :value="row[col.key]">
                {{ row[col.key] }}
              </slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Overlay loading đè lên bảng -->
    <div v-if="loading" class="absolute inset-0 z-30 flex items-center justify-center">
      <div class="absolute inset-0 bg-[var(--mds-bg)] opacity-60"></div>
      <MSpinner :size="28" class="relative text-[var(--mds-brand-600)]" />
    </div>

    <!-- Footer phân trang: prev/next, KHÔNG đánh số trang (spec MDS mục 9) -->
    <div
      class="flex h-12 shrink-0 items-center justify-between gap-4 border-t border-[var(--mds-border)] px-4 text-[13px] leading-[18px] text-[var(--mds-text)]"
    >
      <div class="text-[var(--mds-text-muted)]">
        <slot name="footer-info" :count="rows.length">
          Tổng số bản ghi hiển thị: {{ rows.length }}
        </slot>
      </div>

      <div class="flex items-center gap-2">
        <!-- Chọn số dòng/trang -->
        <select
          class="h-8 cursor-pointer rounded-lg border border-[var(--mds-border)] bg-[var(--mds-bg)] px-2 text-[13px] leading-[18px] text-[var(--mds-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
          :value="pageSize"
          aria-label="Số dòng mỗi trang"
          @change="changePageSize"
        >
          <option v-for="opt in pageSizeOptions" :key="opt" :value="opt">{{ opt }}/trang</option>
        </select>

        <!-- Prev: disabled khi đang ở trang 1 -->
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--mds-border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
          :class="
            page <= 1
              ? 'cursor-not-allowed bg-[var(--mds-bg-disabled)] text-[var(--mds-text-placeholder)]'
              : 'bg-[var(--mds-bg)] text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)]'
          "
          :disabled="page <= 1"
          aria-label="Trang trước"
          @click="goPrev"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M15 6l-6 6l6 6" />
          </svg>
        </button>

        <!-- Next: disabled khi không còn trang sau (!hasNext) -->
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--mds-border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
          :class="
            !hasNext
              ? 'cursor-not-allowed bg-[var(--mds-bg-disabled)] text-[var(--mds-text-placeholder)]'
              : 'bg-[var(--mds-bg)] text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)]'
          "
          :disabled="!hasNext"
          aria-label="Trang sau"
          @click="goNext"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M9 6l6 6l-6 6" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
