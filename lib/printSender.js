// Gửi lệnh in thẳng qua TCP tới máy in mạng (cổng RAW/JetDirect, thường là 9100) - KHÔNG cần
// máy tính trung gian, KHÔNG cần Chrome/driver. Chỉ hoạt động khi máy chủ "nhìn thấy" được IP
// máy in (cùng mạng LAN, hoặc VPN) - xem mục 5 kế hoạch nâng cấp, hướng "Trạm in LAN".
const net = require('net');

function sendToLan(host, port, payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      err ? reject(err) : resolve();
    };
    socket.setTimeout(timeoutMs);
    socket.once('timeout', () => finish(new Error('Hết thời gian kết nối - kiểm tra IP/mạng máy in')));
    socket.once('error', (e) => finish(new Error('Không kết nối được máy in: ' + e.message)));
    socket.connect(port, host, () => {
      socket.write(payload, (err) => {
        if (err) return finish(new Error('Gửi lệnh in thất bại: ' + err.message));
        finish(null);
      });
    });
  });
}

module.exports = { sendToLan };
