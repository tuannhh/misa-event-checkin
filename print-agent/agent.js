#!/usr/bin/env node
// MISA Event Check-in - Print Agent
// Chương trình nhỏ chạy trên 1 máy tính tại sự kiện, thay cho file .bat mở Chrome
// --kiosk-printing. Nhân viên bấm "In" trên ĐIỆN THOẠI -> máy chủ đưa lệnh in vào hàng đợi
// -> agent này (đang chạy trên máy tính, không cần mở Chrome) tự lấy về và in.
//
// Cách in (agent tự chọn theo cấu hình, xem README.md):
//   1) Máy in mạng (LAN)  - agent gửi thẳng lệnh TSPL qua TCP tới IP:port máy in. Dùng khi
//      máy in có cổng LAN và cùng mạng với máy tính chạy agent.
//   2) Máy in USB dùng chung (Windows) - agent copy lệnh in thẳng vào máy in đã CHIA SẺ
//      (Sharing) trong Windows, không cần hộp thoại in, không cần driver hiểu TSPL.
//
// Chạy: node agent.js   (hoặc file .exe đóng gói bằng `npm run build`, xem README.md)
'use strict';
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { execFile } = require('child_process');

const CONFIG_PATH = path.join(process.cwd(), 'print-agent-config.json');
const POLL_INTERVAL_MS = 3000;

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (e) { /* file hỏng - hỏi lại */ }
  }
  return null;
}
function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}
function localIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net_ of nets[name]) {
      if (net_.family === 'IPv4' && !net_.internal) return net_.address;
    }
  }
  return '';
}

async function firstRunSetup() {
  console.log('=== MISA Event Check-in - Print Agent (thiết lập lần đầu) ===');
  const serverUrl = (await ask('Địa chỉ máy chủ (VD https://checkin.congty.com): ')).replace(/\/$/, '');
  const pairingCode = (await ask('Mã ghép nối trạm in (lấy trong Cấu hình > Trạm in trên trình duyệt): ')).toUpperCase();
  console.log('\nMáy in kết nối kiểu gì?');
  console.log('  1) Máy in mạng (có địa chỉ IP riêng)');
  console.log('  2) Máy in USB cắm vào máy tính này, đã CHIA SẺ (Sharing) trong Windows');
  const choice = await ask('Chọn 1 hoặc 2: ');
  const cfg = { serverUrl, pairingCode, printerMode: choice === '2' ? 'shared' : 'lan' };
  if (cfg.printerMode === 'lan') {
    cfg.printerHost = await ask('Địa chỉ IP máy in: ');
    cfg.printerPort = Number(await ask('Cổng máy in (Enter để dùng mặc định 9100): ')) || 9100;
  } else {
    cfg.sharedPrinterName = await ask('Tên máy in đã chia sẻ (VD PD304, xem trong Windows > Printers): ');
  }
  saveConfig(cfg);
  console.log('\nĐã lưu cấu hình vào print-agent-config.json. Đang ghép nối với máy chủ...');
  return cfg;
}

async function pair(cfg) {
  const res = await fetch(cfg.serverUrl + '/api/print-stations/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pairing_code: cfg.pairingCode,
      printer_name: cfg.sharedPrinterName || '',
      host: cfg.printerMode === 'lan' ? localIp() : '',
    }),
  });
  if (!res.ok) throw new Error('Ghép nối thất bại (' + res.status + '): kiểm tra lại địa chỉ máy chủ và mã ghép nối');
  return res.json();
}

// Gửi lệnh in qua TCP tới máy in mạng - dùng được cả khi máy in cùng mạng với agent nhưng
// máy chủ (cloud) không với tới (đây là lý do chính cần agent thay vì máy chủ tự gửi thẳng).
function sendToLan(host, port, payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (err) => { if (settled) return; settled = true; socket.destroy(); err ? reject(err) : resolve(); };
    socket.setTimeout(timeoutMs);
    socket.once('timeout', () => finish(new Error('Hết thời gian kết nối máy in')));
    socket.once('error', (e) => finish(new Error('Không kết nối được máy in: ' + e.message)));
    socket.connect(port, host, () => socket.write(payload, (err) => err ? finish(err) : finish(null)));
  });
}

// In qua máy in USB đã CHIA SẺ trong Windows: ghi lệnh ra file tạm rồi COPY /B thẳng vào hàng
// đợi in (\\localhost\TênChiaSẻ) - cách phổ biến để gửi lệnh in thô (raw) không qua driver,
// không hiện hộp thoại in. CHỈ chạy được trên Windows.
function sendToSharedPrinter(printerName, payload) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') return reject(new Error('In qua máy in chia sẻ chỉ hỗ trợ Windows'));
    const tmp = path.join(os.tmpdir(), `tem-${Date.now()}.prn`);
    fs.writeFileSync(tmp, payload, 'binary');
    execFile('cmd.exe', ['/c', 'copy', '/b', tmp, `\\\\localhost\\${printerName}`], (err, stdout, stderr) => {
      fs.unlink(tmp, () => {});
      if (err) return reject(new Error('Lỗi in (kiểm tra máy in đã Chia sẻ - Sharing - trong Windows chưa): ' + (stderr || err.message)));
      resolve();
    });
  });
}

async function printJob(cfg, job) {
  if (cfg.printerMode === 'shared') return sendToSharedPrinter(cfg.sharedPrinterName, job.payload);
  return sendToLan(cfg.printerHost, cfg.printerPort, job.payload);
}

async function reportResult(cfg, jobId, ok, error) {
  try {
    await fetch(`${cfg.serverUrl}/api/print-jobs/${jobId}/result`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: ok ? 'done' : 'failed', error: error || null }),
    });
  } catch (e) { console.error('Không báo được kết quả in về máy chủ:', e.message); }
}

async function pollLoop(cfg) {
  console.log(`\n✔ Đang chạy. Trạm: ${cfg.pairingCode} - kiểu in: ${cfg.printerMode === 'shared' ? 'USB chia sẻ (' + cfg.sharedPrinterName + ')' : 'LAN (' + cfg.printerHost + ':' + cfg.printerPort + ')'}`);
  console.log('Để cửa sổ này MỞ trong suốt sự kiện. Đóng cửa sổ = dừng nhận lệnh in.\n');
  for (;;) {
    try {
      const res = await fetch(`${cfg.serverUrl}/api/print-stations/${cfg.pairingCode}/jobs`);
      if (res.ok) {
        const jobs = await res.json();
        for (const job of jobs) {
          try {
            await printJob(cfg, job);
            await reportResult(cfg, job.id, true);
            console.log(`[${new Date().toLocaleTimeString('vi-VN')}] Đã in lệnh #${job.id}`);
          } catch (e) {
            await reportResult(cfg, job.id, false, e.message);
            console.error(`[${new Date().toLocaleTimeString('vi-VN')}] LỖI in lệnh #${job.id}: ${e.message}`);
          }
        }
      }
    } catch (e) {
      console.error(`[${new Date().toLocaleTimeString('vi-VN')}] Mất kết nối máy chủ, thử lại sau ${POLL_INTERVAL_MS / 1000}s: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

async function main() {
  let cfg = loadConfig();
  if (!cfg) cfg = await firstRunSetup();
  try {
    const info = await pair(cfg);
    console.log(`Ghép nối thành công với trạm "${info.name}".`);
  } catch (e) {
    console.error('✖ ' + e.message);
    console.error('Xoá file print-agent-config.json rồi chạy lại để nhập lại thông tin.');
    process.exitCode = 1;
    return;
  }
  await pollLoop(cfg);
}

main();
