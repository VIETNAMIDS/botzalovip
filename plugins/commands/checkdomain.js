const axios = require('axios');

module.exports.config = {
  name: 'checkdomain',
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Tra cứu trạng thái tên miền với inet.vn',
  category: 'Tiện ích',
  usage: 'checkdomain <domain>',
  cooldowns: 5
};

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type, data } = event;
  const uid = data?.uidFrom || event?.authorId;
  const domainInput = Array.isArray(args) ? args.join(' ').trim() : '';

  const parts = domainInput.split(/\s+/).filter(Boolean);
  let domain = parts[0] || '';
  domain = domain.replace(/[^a-zA-Z0-9.-]/g, '').toLowerCase();

  if (!domain) {
    return sendMessage(api, threadId, type, `❌ Vui lòng nhập tên miền. Cú pháp: ${global?.config?.prefix || '/'}checkdomain <domain>`, 60000);
  }

  const isDotVN = domain.endsWith('.vn');
  const apiUrl = `https://whois.inet.vn/api/whois/domainspecify/${encodeURIComponent(domain)}`;

  try {
    const res = await axios.get(apiUrl, { timeout: 15000 });
    const data = res?.data;

    const messageLower = typeof data?.message === 'string' ? data.message.toLowerCase() : '';

    if (data?.code === '1' || messageLower.includes('does not exist')) {
      const fee = formatCurrency(data?.fee);
      const reg = formatCurrency(data?.reg);
      const ren = formatCurrency(data?.ren);

      const feeMsg = [
        `🔍 Thông Tin Tên Miền: ${domain}`,
        '⚠️ Tên miền chưa được đăng ký.',
        '',
        `💰 Phí đăng ký: ${reg}`,
        `♻️ Phí gia hạn: ${ren}`,
        `🛒 Tổng giá (năm đầu): ${fee}`,
        '🔗 Đăng ký tại: https://inet.vn',
        '',
        '👤 Founder: HÀ HUY HOÀNG'
      ].join('\n');

      return sendMessage(api, threadId, type, feeMsg, 86400000);
    }

    if (data?.code !== '0') {
      throw new Error(typeof data?.message === 'string' ? data.message : 'Không thể lấy thông tin domain.');
    }

    const nameServers = Array.isArray(data?.nameServer) && data.nameServer.length
      ? `[ ${data.nameServer.join(', ')} ]`
      : 'Không rõ';

    const status = Array.isArray(data?.status) && data.status.length
      ? `[ ${data.status.join(', ')} ]`
      : 'Không rõ';

    const msgLines = [
      `🔍 Thông Tin Tên Miền: ${data?.domainName || domain}`,
      `👤 Người Đăng Ký: ${isDotVN ? (data?.registrantName || 'Không công khai') : 'Không rõ'}`,
      `🏢 Đơn Vị Đăng Ký: ${data?.registrar || 'Không rõ'}`,
      `📅 Ngày Đăng Ký: ${data?.creationDate || 'Không rõ'}`,
      `📅 Ngày Hết Hạn: ${data?.expirationDate || 'Không rõ'}`,
      `🔐 DNSSEC: ${data?.DNSSEC || 'Không rõ'}`,
      `🖥️ Tên Máy Chủ: ${nameServers}`,
      `⚙️ Trạng Thái: ${status}`,
      '✅✅✅'
    ];

    return sendMessage(api, threadId, type, msgLines.join('\n'), 86400000);
  } catch (error) {
    const errMessage = error?.message || 'Không xác định';
    console.error(`❌ Lỗi tra cứu tên miền "${domain}":`, errMessage);
    return sendMessage(
      api,
      threadId,
      type,
      `❌ Không thể tra cứu tên miền "${domain}".\n📛 Lỗi: ${errMessage}`,
      60000
    );
  }
};

function formatCurrency(value) {
  const num = Number(value);
  if (Number.isFinite(num)) {
    return `${num.toLocaleString('vi-VN')}đ`;
  }
  const str = typeof value === 'string' && value.trim() ? value.trim() : null;
  return str ? `${str}đ` : 'Không rõ';
}

async function sendMessage(api, threadId, type, message, ttl) {
  try {
    return await api.sendMessage({ msg: message, ttl }, threadId, type);
  } catch (error) {
    console.error('[checkdomain] sendMessage error:', error?.message || error);
  }
}
