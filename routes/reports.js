// Báo cáo sự kiện (chi tiết + xuất Excel) và số liệu ẩn danh cho vai trò "manager"
const express = require('express');
const XLSX = require('xlsx');
const db = require('../db');
const {
  requireLogin, getEventOr404, getAssignment, isEligible, fmtVN, VIEW_ONLY_TYPES,
  POSITIONS, COMPANY_SIZES, IMPORTANCES,
} = require('./lib/helpers');

const router = express.Router();

async function attachBoothVisits(eventId, rows) {
  const visits = await db.prepare(`SELECT v.attendee_id, v.visited_at, v.note, b.name FROM booth_visits v
    JOIN booths b ON b.id = v.booth_id WHERE v.event_id = ? ORDER BY v.visited_at`).all(eventId);
  const byAttendee = {};
  for (const v of visits) (byAttendee[v.attendee_id] = byAttendee[v.attendee_id] || []).push({ name: v.name, visited_at: v.visited_at, note: v.note || '' });
  return rows.map(r => ({ ...r, booth_visits: byAttendee[r.id] || [] }));
}

// Ghi chú "giám sát bóng ma" (booth_potential_notes) - TÁCH BIỆT khỏi booth_visits, không đếm vào lucky draw.
async function attachPotentialNotes(eventId, rows) {
  const notes = await db.prepare(`SELECT n.attendee_id, n.note, n.is_potential, b.name FROM booth_potential_notes n
    JOIN booths b ON b.id = n.booth_id WHERE n.event_id = ? ORDER BY n.updated_at`).all(eventId);
  const byAttendee = {};
  for (const n of notes) (byAttendee[n.attendee_id] = byAttendee[n.attendee_id] || []).push({ name: n.name, note: n.note || '', is_potential: !!n.is_potential });
  return rows.map(r => ({ ...r, potential_notes: byAttendee[r.id] || [] }));
}

async function blockViewOnlyReport(req, res, ev) {
  if (req.user.role !== 'checkin') return false;
  const mine = await getAssignment(req.user, ev.id);
  if (mine && VIEW_ONLY_TYPES.includes(mine.staff_type)) { res.status(403).json({ error: 'Bạn không có quyền xem báo cáo chi tiết' }); return true; }
  return false;
}

// Có ?page= -> lọc + phân trang THẬT SỰ ở phía server (LIMIT/OFFSET), cho sự kiện nhiều
// nghìn khách mở tab Báo cáo không bị tải hết về trình duyệt. KHÔNG có ?page= -> giữ NGUYÊN
// hành vi cũ (trả toàn bộ rows, không áp filter server) để tương thích ngược với frontend
// hiện tại - filter hiện đang làm ở client (ReportTab.vue); sẽ chuyển sang dùng phân trang
// khi làm lại UI (Đợt 5). Số liệu tổng quan (total/checkedin/walkin) LUÔN tính trên toàn bộ
// khách của sự kiện, không bị ảnh hưởng bởi tìm kiếm/trang - đúng ý nghĩa "tổng quan sự kiện".
router.get('/events/:id/report', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (await blockViewOnlyReport(req, res, ev)) return;

  const total = (await db.prepare('SELECT COUNT(*) AS c FROM attendees WHERE event_id = ?').get(ev.id)).c;
  const checkedin = (await db.prepare('SELECT COUNT(*) AS c FROM attendees WHERE event_id = ? AND checked_in_at IS NOT NULL').get(ev.id)).c;
  const walkin = (await db.prepare('SELECT COUNT(*) AS c FROM attendees WHERE event_id = ? AND is_walkin = 1').get(ev.id)).c;
  const booths = await db.prepare(`SELECT b.id, b.name, COUNT(v.id) AS visit_count FROM booths b
    LEFT JOIN booth_visits v ON v.booth_id = b.id WHERE b.event_id = ? GROUP BY b.id ORDER BY b.sort, b.id`).all(ev.id);

  let where = 'a.event_id = ?'; const params = [ev.id];
  const q = String(req.query.q || '').trim();
  if (q) { where += ' AND (a.name LIKE ? OR a.phone LIKE ? OR a.company LIKE ? OR a.email LIKE ?)'; const like = `%${q}%`; params.push(like, like, like, like); }
  if (req.query.status === 'checked_in') where += ' AND a.checked_in_at IS NOT NULL';
  else if (req.query.status === 'not_checked_in') where += ' AND a.checked_in_at IS NULL';
  if (req.query.importance) { where += ' AND a.importance = ?'; params.push(req.query.importance); }
  if (req.query.position) { where += ' AND a.position = ?'; params.push(req.query.position); }
  if (req.query.company_size) { where += ' AND a.company_size = ?'; params.push(req.query.company_size); }

  const page = req.query.page ? Math.max(1, Number(req.query.page) || 1) : null;
  const resBody = { total, checkedin, walkin, not_checkedin: total - checkedin, booths,
    positions: POSITIONS, company_sizes: COMPANY_SIZES, importances: IMPORTANCES };

  let rows;
  if (page) {
    const pageSize = Math.min(200, Math.max(10, Number(req.query.page_size) || 50));
    resBody.total_filtered = (await db.prepare(`SELECT COUNT(*) AS c FROM attendees a WHERE ${where}`).get(...params)).c;
    rows = await db.prepare(`SELECT a.*, u.name AS checked_in_by_name FROM attendees a
      LEFT JOIN users u ON u.id = a.checked_in_by WHERE ${where}
      ORDER BY a.checked_in_at DESC, a.id LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`).all(...params);
    resBody.page = page; resBody.page_size = pageSize;
  } else {
    rows = await db.prepare(`SELECT a.*, u.name AS checked_in_by_name FROM attendees a
      LEFT JOIN users u ON u.id = a.checked_in_by WHERE a.event_id = ? ORDER BY a.checked_in_at DESC, a.id`).all(ev.id);
  }
  rows = await attachBoothVisits(ev.id, rows);
  resBody.rows = (await attachPotentialNotes(ev.id, rows)).map(r => ({ ...r, eligible: isEligible(r, ev) }));
  res.json(resBody);
});

router.get('/events/:id/report/export', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (await blockViewOnlyReport(req, res, ev)) return;
  let rows = await db.prepare(`SELECT a.*, u.name AS checked_in_by_name FROM attendees a
    LEFT JOIN users u ON u.id = a.checked_in_by WHERE a.event_id = ? ORDER BY a.id`).all(ev.id);
  rows = await attachBoothVisits(ev.id, rows);
  rows = await attachPotentialNotes(ev.id, rows);
  // Lọc theo ngưỡng số booth tối thiểu đã ghé - dùng cho xuất danh sách đủ điều kiện quay số lucky draw.
  // Ngưỡng gõ mỗi lần trên UI, KHÔNG lưu cấu hình cố định theo sự kiện (mỗi sự kiện số booth khác nhau).
  const minBooths = Number(req.query.min_booths) || 0;
  if (minBooths > 0) rows = rows.filter(r => r.booth_visits.length >= minBooths);
  const data = rows.map(r => ({
    'Xưng hô': r.salutation, 'Họ và tên': r.name, 'Email': r.email, 'Số điện thoại': r.phone,
    'Chức vụ': r.position, 'Mức độ quan trọng': r.importance,
    'Nơi công tác/Tên công ty': r.company, 'MST công ty': r.tax_code, 'Quy mô nhân sự': r.company_size,
    'Đủ điều kiện': isEligible(r, ev) ? 'Có' : 'Không',
    'Đã check-in': r.checked_in_at ? 'Có' : 'Không',
    'Thời gian check-in': r.checked_in_at ? fmtVN(r.checked_in_at) : '',
    'Nhân viên check-in': r.checked_in_by_name || '',
    'Booth đã ghé': r.booth_visits.map(v => `${v.name} (${fmtVN(v.visited_at)})`).join('; '),
    'Số booth đã ghé': r.booth_visits.length,
    'Ghi chú giám sát (theo booth)': r.booth_visits.filter(v => v.note).map(v => `${v.name}: ${v.note}`).join(' | '),
    'Khách hàng tiềm năng': r.potential_notes.some(n => n.is_potential) ? 'Có' : 'Không',
    'Ghi chú tiềm năng (giám sát)': r.potential_notes.filter(n => n.note).map(n => `${n.name}: ${n.note}`).join(' | '),
    'Khách vãng lai': r.is_walkin ? 'Có' : '',
    'Đã gửi email xác nhận': r.confirm_email_sent_at ? 'Có' : 'Không',
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{ wch: 8 }, { wch: 25 }, { wch: 28 }, { wch: 14 }, { wch: 16 }, { wch: 15 }, { wch: 30 }, { wch: 13 }, { wch: 26 }, { wch: 11 }, { wch: 11 }, { wch: 19 }, { wch: 20 }, { wch: 45 }, { wch: 12 }, { wch: 50 }, { wch: 15 }, { wch: 50 }, { wch: 13 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BaoCao');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = minBooths > 0 ? `du-dieu-kien-quay-so-su-kien-${ev.id}.xlsx` : `bao-cao-su-kien-${ev.id}.xlsx`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buf);
});

router.get('/events/:id/stats', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  const rows = await db.prepare('SELECT id, position, company_size, importance, is_walkin, checked_in_at FROM attendees WHERE event_id = ?').all(ev.id);
  const visits = await db.prepare('SELECT attendee_id, booth_id FROM booth_visits WHERE event_id = ?').all(ev.id);
  const boothsByAtt = {};
  for (const v of visits) (boothsByAtt[v.attendee_id] = boothsByAtt[v.attendee_id] || []).push(v.booth_id);
  const data = rows.map(r => ({
    checked_in: !!r.checked_in_at,
    is_walkin: !!r.is_walkin,
    position: r.position || '',
    company_size: r.company_size || '',
    importance: r.importance || 'Bình thường',
    booths: boothsByAtt[r.id] || [],
  }));
  const booths = await db.prepare('SELECT id, name FROM booths WHERE event_id = ? ORDER BY sort, id').all(ev.id);
  res.json({ event: { name: ev.name, event_date: ev.event_date }, data, booths, positions: POSITIONS, company_sizes: COMPANY_SIZES, importances: IMPORTANCES });
});

module.exports = router;
