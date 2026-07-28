<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

/**
 * MDatePicker — control chọn ngày chuẩn MDS 2.0, định dạng dd/MM/yyyy.
 * Cho phép GÕ TAY vào input (parse khi blur/Enter, gõ sai thì revert)
 * hoặc chọn trên lịch popover. Picker KHÔNG có nút Đồng ý → chọn ngày
 * là submit và đóng popover luôn (quy tắc chung MDS).
 *
 * showTime: true → thêm 2 ô giờ/phút trong popover, format input thành
 * dd/MM/yyyy HH:mm, thay cho <input type="datetime-local"> gốc trình
 * duyệt (không đồng bộ giao diện, không style được theo MDS).
 */
const props = defineProps({
  modelValue: { type: Date, default: null },
  placeholder: { type: String, default: 'dd/MM/yyyy' },
  disabled: { type: Boolean, default: false },
  error: { type: String, default: '' }, // có giá trị → viền danger + message đỏ dưới control
  min: { type: Date, default: null }, // ngày nhỏ nhất chọn được
  max: { type: Date, default: null }, // ngày lớn nhất chọn được
  showTime: { type: Boolean, default: false }, // true → kết hợp chọn giờ:phút
})

const emit = defineEmits(['update:modelValue', 'change', 'focus', 'blur'])

/* ── Tiện ích ngày thuần JS (không dùng thư viện ngoài) ─────── */
function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatDate(d) {
  if (!d) return ''
  const base = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`
  return props.showTime ? `${base} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : base
}

// Parse chuỗi dd/MM/yyyy[ HH:mm] → Date; trả null nếu sai định dạng, ngày
// không tồn tại (vd 31/02/2024), hoặc giờ/phút ngoài khoảng hợp lệ.
function parseDate(text) {
  const re = props.showTime
    ? /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/
    : /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  const m = text.trim().match(re)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  const hours = props.showTime ? Number(m[4]) : 0
  const minutes = props.showTime ? Number(m[5]) : 0
  if (props.showTime && (hours > 23 || minutes > 59)) return null
  const d = new Date(year, month - 1, day, hours, minutes)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null
  }
  return d
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function isSameDay(a, b) {
  return (
    !!a &&
    !!b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

// Ngày nằm ngoài giới hạn min/max (so sánh theo ngày, bỏ phần giờ)
function isOutOfRange(d) {
  if (props.min && startOfDay(d) < startOfDay(props.min)) return true
  if (props.max && startOfDay(d) > startOfDay(props.max)) return true
  return false
}

/* ── State ──────────────────────────────────────────────────── */
const open = ref(false)
const view = ref('days') // days | months | years — drill-down chọn nhanh tháng/năm
const inputText = ref(formatDate(props.modelValue))
const today = startOfDay(new Date())

const viewMonth = ref((props.modelValue || today).getMonth())
const viewYear = ref((props.modelValue || today).getFullYear())
const yearPageStart = ref(0) // năm đầu của trang 12 năm trong view chọn năm

const triggerRef = ref(null)
const inputRef = ref(null)
const popoverRef = ref(null)
const popoverStyle = ref({})

// Ô giờ/phút (chỉ dùng khi showTime) — giữ dạng chuỗi để gõ tự do,
// clamp về số hợp lệ khi commit.
const hh = ref(pad2((props.modelValue || today).getHours()))
const mm = ref(pad2((props.modelValue || today).getMinutes()))

// Đồng bộ text trong input khi giá trị đổi từ bên ngoài
watch(
  () => props.modelValue,
  (val) => {
    inputText.value = formatDate(val)
    if (val) {
      hh.value = pad2(val.getHours())
      mm.value = pad2(val.getMinutes())
    }
  }
)

// Kết hợp ngày (không giờ) với giờ:phút đang chọn trong ô time
function combineWithTime(dateOnly) {
  if (!props.showTime) return dateOnly
  const h = Math.min(23, Math.max(0, parseInt(hh.value, 10) || 0))
  const mi = Math.min(59, Math.max(0, parseInt(mm.value, 10) || 0))
  return new Date(dateOnly.getFullYear(), dateOnly.getMonth(), dateOnly.getDate(), h, mi)
}

// Gõ tay giờ/phút: clamp, cập nhật lại ô hiển thị, áp vào ngày đang chọn
function commitTime() {
  const h = Math.min(23, Math.max(0, parseInt(hh.value, 10) || 0))
  const mi = Math.min(59, Math.max(0, parseInt(mm.value, 10) || 0))
  hh.value = pad2(h)
  mm.value = pad2(mi)
  setValue(combineWithTime(props.modelValue || today))
}

const weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] // tuần bắt đầu Thứ 2 — chuẩn VN

// Lưới luôn đủ 6 hàng × 7 cột; ngày tháng trước/sau lấp đầy lưới
const dayCells = computed(() => {
  const first = new Date(viewYear.value, viewMonth.value, 1)
  const offset = (first.getDay() + 6) % 7 // getDay: CN=0 → quy về T2=0
  const cells = []
  for (let i = 0; i < 42; i++) {
    const date = new Date(viewYear.value, viewMonth.value, 1 - offset + i)
    cells.push({
      date,
      inMonth: date.getMonth() === viewMonth.value,
      isToday: isSameDay(date, today),
      isSelected: isSameDay(date, props.modelValue),
      isDisabled: isOutOfRange(date),
    })
  }
  return cells
})

// 12 năm hiển thị trong view chọn năm
const yearCells = computed(() =>
  Array.from({ length: 12 }, (_, i) => yearPageStart.value + i)
)

/* ── Định vị popover (teleport ra body), tự lật lên khi thiếu chỗ ── */
function updatePosition() {
  const trigger = triggerRef.value
  const pop = popoverRef.value
  if (!trigger || !pop) return
  const rect = trigger.getBoundingClientRect()
  const gap = 4
  const popH = pop.offsetHeight
  const popW = pop.offsetWidth
  const spaceBelow = window.innerHeight - rect.bottom
  const openUp = spaceBelow < popH + gap && rect.top > popH + gap
  // Không cho popover tràn khỏi mép phải màn hình
  let left = rect.left
  if (left + popW > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - 8 - popW)
  }
  popoverStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    top: openUp ? `${rect.top - popH - gap}px` : `${rect.bottom + gap}px`,
  }
}

/* ── Mở / đóng ──────────────────────────────────────────────── */
function openPopover() {
  if (props.disabled || open.value) return
  open.value = true
  view.value = 'days'
  // Mở lịch tại tháng của giá trị đang chọn (hoặc tháng hiện tại)
  const base = props.modelValue || today
  viewMonth.value = base.getMonth()
  viewYear.value = base.getFullYear()
  nextTick(updatePosition)
}

function closePopover() {
  open.value = false
  view.value = 'days'
}

/* ── Chọn giá trị ───────────────────────────────────────────── */
function setValue(d) {
  // Chỉ emit khi giá trị thực sự đổi — showTime phải so cả giờ/phút,
  // isSameDay chỉ so ngày nên sẽ bỏ sót lúc người dùng chỉ đổi giờ.
  const changed = props.showTime
    ? d?.getTime() !== props.modelValue?.getTime()
    : !isSameDay(d, props.modelValue)
  if (changed) {
    emit('update:modelValue', d)
    emit('change', d)
  }
  inputText.value = formatDate(d)
}

function selectDay(cell) {
  if (cell.isDisabled) return
  setValue(combineWithTime(startOfDay(cell.date)))
  // showTime: giữ popover mở để chọn giờ ngay sau khi chọn ngày
  if (!props.showTime) closePopover()
}

// Nút tắt "Hôm nay" ở footer — chọn nhanh ngày hiện tại
function selectToday() {
  if (isOutOfRange(today)) return
  setValue(combineWithTime(today))
  if (!props.showTime) closePopover()
}

/* ── Điều hướng header ──────────────────────────────────────── */
function changeMonth(dir) {
  const d = new Date(viewYear.value, viewMonth.value + dir, 1)
  viewMonth.value = d.getMonth()
  viewYear.value = d.getFullYear()
}

// Click tên tháng → view chọn nhanh 12 tháng
function openMonthsView() {
  view.value = 'months'
}

// Click tên năm → view chọn nhanh lưới 12 năm (trang chứa năm đang xem)
function openYearsView() {
  yearPageStart.value = viewYear.value - (viewYear.value % 12)
  view.value = 'years'
}

function selectMonth(m) {
  viewMonth.value = m
  view.value = 'days'
}

// Chọn năm xong drill-down tiếp về chọn tháng
function selectYear(y) {
  viewYear.value = y
  view.value = 'months'
}

/* ── Gõ tay: parse khi blur/Enter, gõ sai thì revert ────────── */
function commitInput() {
  const text = inputText.value.trim()
  if (!text) {
    setValue(null)
    return
  }
  const d = parseDate(text)
  if (d && !isOutOfRange(d)) {
    setValue(d)
    // Nhảy lịch tới tháng vừa nhập
    viewMonth.value = d.getMonth()
    viewYear.value = d.getFullYear()
  } else {
    // Gõ sai định dạng / ngoài min-max → revert về giá trị cũ
    inputText.value = formatDate(props.modelValue)
  }
}

function onInputFocus(e) {
  // Hành vi MDS bắt buộc: focus tự select-all nội dung
  e.target.select()
  openPopover()
  emit('focus', e)
}

function onInputBlur(e) {
  commitInput()
  emit('blur', e)
}

function onInputKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    commitInput()
    closePopover()
  } else if (e.key === 'Escape') {
    // Esc đóng popover
    e.preventDefault()
    closePopover()
  }
}

// Nút × xóa giá trị khi đang có ngày chọn
function clear() {
  setValue(null)
  inputRef.value?.focus()
}

/* ── Click ngoài đóng + bám theo trigger khi scroll/resize ──── */
function onDocMousedown(e) {
  if (
    !triggerRef.value?.contains(e.target) &&
    !popoverRef.value?.contains(e.target)
  ) {
    closePopover()
  }
}

function onReposition() {
  if (open.value) updatePosition()
}

watch(open, (val) => {
  if (val) {
    document.addEventListener('mousedown', onDocMousedown)
    // capture=true để bắt cả scroll của container cha
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
  } else {
    document.removeEventListener('mousedown', onDocMousedown)
    window.removeEventListener('scroll', onReposition, true)
    window.removeEventListener('resize', onReposition)
  }
})

// View đổi (days ↔ months ↔ years) làm chiều cao popover đổi → định vị lại
watch(view, () => nextTick(onReposition))

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMousedown)
  window.removeEventListener('scroll', onReposition, true)
  window.removeEventListener('resize', onReposition)
})
</script>

<template>
  <div class="w-full">
    <!-- Trigger giống input 32px: icon calendar trái + input gõ tay + nút × -->
    <div
      ref="triggerRef"
      class="flex h-8 w-full items-center gap-2 rounded-lg border bg-[var(--mds-bg)] px-3 transition-colors"
      :class="[
        error ? 'border-[var(--mds-danger)]' : 'border-[var(--mds-border)]',
        disabled
          ? 'cursor-not-allowed bg-[var(--mds-bg-disabled)]'
          : !error
            ? 'hover:border-[var(--mds-brand-600)] focus-within:border-[var(--mds-brand-600)] focus-within:shadow-[0_0_0_2px_var(--mds-brand-100)]'
            : '',
      ]"
      @click="!disabled && inputRef?.focus()"
    >
      <!-- Icon calendar (stroke 1.5, từ assets/icons/calendar.svg) -->
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="h-4 w-4 shrink-0 text-[var(--mds-icon-neutral)]"
      >
        <path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12" />
        <path d="M16 3v4" />
        <path d="M8 3v4" />
        <path d="M4 11h16" />
        <path d="M11 15h1" />
        <path d="M12 15v3" />
      </svg>

      <input
        ref="inputRef"
        v-model="inputText"
        type="text"
        :placeholder="placeholder"
        :disabled="disabled"
        role="combobox"
        :aria-expanded="open"
        aria-haspopup="dialog"
        class="h-full w-full min-w-0 flex-1 bg-transparent text-[13px] leading-[18px] text-[var(--mds-text)] outline-none placeholder:text-[var(--mds-text-placeholder)]"
        :class="disabled ? 'cursor-not-allowed' : ''"
        @focus="onInputFocus"
        @blur="onInputBlur"
        @keydown="onInputKeydown"
      />

      <!-- Nút × xóa khi có giá trị -->
      <button
        v-if="modelValue && !disabled"
        type="button"
        tabindex="-1"
        aria-label="Xóa ngày"
        class="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--mds-icon-neutral)] hover:text-[var(--mds-text)]"
        @mousedown.prevent
        @click.stop="clear"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3">
          <path d="M18 6l-12 12" />
          <path d="M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Popover lịch teleport ra body, radius 4px theo spec popup -->
    <Teleport to="body">
      <div
        v-if="open"
        ref="popoverRef"
        role="dialog"
        aria-label="Chọn ngày"
        :style="popoverStyle"
        class="z-[1000] w-[240px] rounded border border-[var(--mds-border)] bg-[var(--mds-bg)] py-2 shadow-lg"
        @mousedown.prevent
      >
        <!-- Header điều hướng: ‹ › đổi tháng + click tên tháng/năm chọn nhanh -->
        <div class="flex items-center justify-between px-2 pb-2">
          <button
            type="button"
            aria-label="Tháng trước"
            class="flex h-6 w-6 items-center justify-center rounded text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)]"
            @click="view === 'years' ? (yearPageStart -= 12) : view === 'months' ? viewYear-- : changeMonth(-1)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
              <path d="M15 6l-6 6l6 6" />
            </svg>
          </button>

          <!-- Nhãn giữa header theo từng view -->
          <div class="flex items-center gap-1 text-[13px] leading-[18px] font-medium text-[var(--mds-text)]">
            <template v-if="view === 'days'">
              <button
                type="button"
                class="rounded px-1 py-0.5 hover:bg-[var(--mds-bg-hover-soft)]"
                @click="openMonthsView"
              >
                Tháng {{ viewMonth + 1 }},
              </button>
              <button
                type="button"
                class="rounded px-1 py-0.5 hover:bg-[var(--mds-bg-hover-soft)]"
                @click="openYearsView"
              >
                {{ viewYear }}
              </button>
            </template>
            <button
              v-else-if="view === 'months'"
              type="button"
              class="rounded px-1 py-0.5 hover:bg-[var(--mds-bg-hover-soft)]"
              @click="openYearsView"
            >
              {{ viewYear }}
            </button>
            <span v-else class="px-1 py-0.5">
              {{ yearPageStart }} - {{ yearPageStart + 11 }}
            </span>
          </div>

          <button
            type="button"
            aria-label="Tháng sau"
            class="flex h-6 w-6 items-center justify-center rounded text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)]"
            @click="view === 'years' ? (yearPageStart += 12) : view === 'months' ? viewYear++ : changeMonth(1)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
              <path d="M9 6l6 6l-6 6" />
            </svg>
          </button>
        </div>

        <div class="border-t border-[var(--mds-border)]" />

        <!-- View lưới ngày -->
        <template v-if="view === 'days'">
          <div class="grid grid-cols-7 px-2 pt-2">
            <!-- Hàng tên thứ: T2→CN, CN màu đỏ theo spec -->
            <div
              v-for="wd in weekdays"
              :key="wd"
              class="flex h-8 w-8 items-center justify-center text-[13px] leading-[18px] font-medium"
              :class="wd === 'CN' ? 'text-[var(--mds-danger)]' : 'text-[var(--mds-text)]'"
            >
              {{ wd }}
            </div>

            <!-- Ô ngày 32px -->
            <button
              v-for="cell in dayCells"
              :key="cell.date.getTime()"
              type="button"
              :disabled="cell.isDisabled"
              :aria-label="formatDate(cell.date)"
              class="flex h-8 w-8 items-center justify-center rounded text-[13px] leading-[18px]"
              :class="[
                cell.isSelected
                  ? 'bg-[var(--mds-brand-600)] font-medium text-white'
                  : cell.isDisabled
                    ? 'cursor-not-allowed text-[var(--mds-text-placeholder)]'
                    : cell.isToday
                      ? 'border border-[var(--mds-brand-600)] font-medium text-[var(--mds-brand-600)] hover:bg-[var(--mds-bg-hover-soft)]'
                      : cell.inMonth
                        ? 'text-[var(--mds-text)] hover:bg-[var(--mds-bg-hover-soft)]'
                        : 'text-[var(--mds-text-placeholder)] hover:bg-[var(--mds-bg-hover-soft)]',
              ]"
              @click="selectDay(cell)"
            >
              {{ cell.date.getDate() }}
            </button>
          </div>

          <div class="mt-2 border-t border-[var(--mds-border)]" />

          <!-- Ô giờ:phút (chỉ khi showTime) -->
          <div v-if="showTime" class="flex items-center justify-center gap-1.5 px-2 pt-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 shrink-0 text-[var(--mds-icon-neutral)]">
              <path d="M12 12l3 2" />
              <path d="M12 7v5" />
              <path d="M21 12a9 9 0 1 1 -18 0a9 9 0 0 1 18 0" />
            </svg>
            <input
              v-model="hh"
              type="text"
              inputmode="numeric"
              maxlength="2"
              aria-label="Giờ"
              class="h-7 w-9 rounded border border-[var(--mds-border)] text-center text-[13px] leading-[18px] text-[var(--mds-text)] outline-none focus:border-[var(--mds-brand-600)]"
              @blur="commitTime"
              @keydown.enter="commitTime"
            />
            <span class="text-[13px] font-medium text-[var(--mds-text)]">:</span>
            <input
              v-model="mm"
              type="text"
              inputmode="numeric"
              maxlength="2"
              aria-label="Phút"
              class="h-7 w-9 rounded border border-[var(--mds-border)] text-center text-[13px] leading-[18px] text-[var(--mds-text)] outline-none focus:border-[var(--mds-brand-600)]"
              @blur="commitTime"
              @keydown.enter="commitTime"
            />
          </div>

          <!-- Footer: nút tắt "Hôm nay" + "Xong" (khi showTime, cần chốt sau khi chỉnh giờ) -->
          <div class="flex items-center justify-center gap-2 px-2 pt-2">
            <button
              type="button"
              class="rounded px-2 py-1 text-[13px] leading-[18px] font-medium text-[var(--mds-brand-600)] hover:bg-[var(--mds-bg-hover-soft)] active:text-[var(--mds-brand-800)]"
              @click="selectToday"
            >
              Hôm nay
            </button>
            <button
              v-if="showTime"
              type="button"
              class="rounded bg-[var(--mds-brand-600)] px-3 py-1 text-[13px] leading-[18px] font-medium text-white hover:bg-[var(--mds-brand-700)]"
              @click="commitTime(); closePopover()"
            >
              Xong
            </button>
          </div>
        </template>

        <!-- View chọn nhanh tháng: 12 ô "Thg 1"…"Thg 12" -->
        <div v-else-if="view === 'months'" class="grid grid-cols-3 gap-1 px-2 pt-2">
          <button
            v-for="m in 12"
            :key="m"
            type="button"
            class="flex h-8 items-center justify-center rounded text-[13px] leading-[18px]"
            :class="
              m - 1 === viewMonth
                ? 'bg-[var(--mds-brand-600)] font-medium text-white'
                : 'text-[var(--mds-text)] hover:bg-[var(--mds-bg-hover-soft)]'
            "
            @click="selectMonth(m - 1)"
          >
            Thg {{ m }}
          </button>
        </div>

        <!-- View chọn nhanh năm: lưới 12 năm -->
        <div v-else class="grid grid-cols-3 gap-1 px-2 pt-2">
          <button
            v-for="y in yearCells"
            :key="y"
            type="button"
            class="flex h-8 items-center justify-center rounded text-[13px] leading-[18px]"
            :class="
              y === viewYear
                ? 'bg-[var(--mds-brand-600)] font-medium text-white'
                : 'text-[var(--mds-text)] hover:bg-[var(--mds-bg-hover-soft)]'
            "
            @click="selectYear(y)"
          >
            {{ y }}
          </button>
        </div>
      </div>
    </Teleport>

    <!-- Message lỗi đỏ 12px dưới control -->
    <p v-if="error" class="mt-1 text-[12px] leading-4 text-[var(--mds-danger)]">
      {{ error }}
    </p>
  </div>
</template>
