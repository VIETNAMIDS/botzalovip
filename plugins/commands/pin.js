const axios = require('axios');
const fs = require('fs');
const path = require('path');

module.exports.config = {
  name: 'pin',
  aliases: ['pinterest'],
  version: '1.0.0',
  role: 1,
  author: 'Cascade',
  description: 'Tìm ảnh Pinterest. Dùng: pin <từ khóa> [số lượng] | pin on/off',
  category: 'Tiện ích',
  usage: 'pin on|off | pin <từ khóa> [số lượng]',
  cooldowns: 2
};

const SAVE_DIR = path.join(__dirname, '../../temp');
if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true });

const SEARCH_TIMEOUT = 20; // giây
// Lưu vết tìm kiếm gần nhất theo thread để chống spam
if (!global.__pinLastSearch) global.__pinLastSearch = new Map();

function isBotManager(uid) {
  try {
    const admins = (global.users && Array.isArray(global.users.admin)) ? global.users.admin : [];
    const supports = (global.users && Array.isArray(global.users.support)) ? global.users.support : [];
    return admins.includes(uid) || supports.includes(uid);
  } catch (_) { return false; }
}

async function setThreadPinConf(Threads, threadId, enabled) {
  const data = await Threads.getData(threadId);
  const tdata = data?.data || {};
  tdata.bonz_pin = { enabled: !!enabled };
  await Threads.setData(threadId, tdata);
  return tdata.bonz_pin;
}

async function getThreadPinConf(Threads, threadId) {
  const data = await Threads.getData(threadId);
  const tdata = data?.data || {};
  return tdata.bonz_pin || { enabled: false };
}

async function fetchPinterestImages(query) {
  const url = `https://subhatde.id.vn/pinterest?search=${encodeURIComponent(query)}`;
  try {
    const resp = await axios.get(url, { timeout: 20000 });
    const data = resp?.data || {};
    let items = data.data || [];
    // Chuẩn hóa thành list URL string
    items = items.map(x => (typeof x === 'string' ? x : (x?.url || ''))).filter(Boolean);
    // Loại trùng
    const uniq = Array.from(new Set(items));
    return uniq;
  } catch (e) {
    return [];
  }
}

async function trySendWithUrls(api, event, urls, caption) {
  const { threadId, type } = event;
  try {
    // Thử gửi nhiều ảnh trong 1 message nếu SDK hỗ trợ
    await api.sendMessage({ msg: caption, attachments: urls.slice(0, 10) }, threadId, type);
    return true;
  } catch (_) {
    // Thử gửi từng cái
    for (const u of urls.slice(0, 10)) {
      try {
        await api.sendMessage({ msg: caption, attachments: [u] }, threadId, type);
      } catch (_) {}
    }
    return true;
  }
}

async function downloadAndSend(api, event, urls, caption) {
  const { threadId, type } = event;
  const sentFiles = [];
  try {
    for (let i = 0; i < Math.min(urls.length, 10); i++) {
      const u = urls[i];
      const file = path.join(SAVE_DIR, `pin_${Date.now()}_${i}.jpg`);
      try {
        const resp = await axios.get(u, { responseType: 'arraybuffer', timeout: 20000 });
        fs.writeFileSync(file, resp.data);
        sentFiles.push(file);
      } catch (_) {}
    }
    if (sentFiles.length === 0) return false;

    try {
      await api.sendMessage({ msg: caption, attachments: sentFiles }, threadId, type);
      return true;
    } catch (_) {
      // Gửi từng file
      for (const f of sentFiles) {
        try { await api.sendMessage({ msg: caption, attachments: [f] }, threadId, type); } catch (_) {}
      }
      return true;
    }
  } finally {
    // Dọn file tạm
    setTimeout(() => {
      for (const f of sentFiles) {
        try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
      }
    }, 5000);
  }
}

module.exports.run = async ({ api, event, args, Threads }) => {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom;

  // Kiểm tra chế độ silent mode - vô hiệu hóa hoàn toàn
  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') return;

  const action = (args[0] || '').toLowerCase();

  // Bật/tắt
  if (action === 'on' || action === 'off') {
    if (!isBotManager(senderId)) {
      return api.sendMessage('❌ Bạn không có quyền bật/tắt lệnh này.', threadId, type);
    }
    const enabled = action === 'on';
    const conf = await setThreadPinConf(Threads || require('../../core/controller/controllerThreads'), threadId, enabled);
    return api.sendMessage(`🚦 Lệnh pin đã được ${conf.enabled ? 'BẬT' : 'TẮT'} trong nhóm này.`, threadId, type);
  }

  // Kiểm tra đã bật chưa
  const conf = await getThreadPinConf(Threads || require('../../core/controller/controllerThreads'), threadId);
  if (!conf.enabled) return; // không phản hồi nếu chưa bật

  // Parse query và count
  const raw = args.join(' ').trim();
  if (!raw) {
    const pfx = (global.config && global.config.prefix) ? global.config.prefix : '/';
    return api.sendMessage(
      [
        `➜ Dùng: ${pfx}pin [từ khóa] [số lượng]`,
        `➜ Bật/Tắt: ${pfx}pin on | ${pfx}pin off`,
        `Ví dụ: ${pfx}pin meme con mèo 5`
      ].join('\n'),
      threadId,
      type
    );
  }

  let count = 10;
  let query = raw;
  const parts = raw.split(/\s+/);
  const last = parts[parts.length - 1];
  if (/^\d+$/.test(last)) {
    count = Math.min(20, Math.max(1, parseInt(last, 10)));
    query = parts.slice(0, -1).join(' ');
  }

  // Chống spam theo thread
  const now = Date.now();
  const lastInfo = global.__pinLastSearch.get(threadId) || 0;
  const diff = (now - lastInfo) / 1000;
  if (diff < SEARCH_TIMEOUT) {
    const remain = Math.ceil(SEARCH_TIMEOUT - diff);
    return api.sendMessage(`⏳ Vui lòng chờ ${remain}s trước khi tìm kiếm mới.`, threadId, type);
  }
  global.__pinLastSearch.set(threadId, now);

  await api.sendMessage(`🔎 Đang tìm ảnh Pinterest: "${query}" ...`, threadId, type);

  const urls = await fetchPinterestImages(query);
  if (!urls.length) {
    return api.sendMessage('❌ Không tìm thấy ảnh nào trên Pinterest.', threadId, type);
  }

  // Chọn số lượng
  const selected = urls.slice(0, count);

  const caption = `[Pinterest] ${query}`;

  // Thử gửi bằng URL trước
  let ok = await trySendWithUrls(api, event, selected, caption);
  if (!ok) {
    ok = await downloadAndSend(api, event, selected, caption);
  }
  if (!ok) {
    return api.sendMessage('❌ Lỗi khi gửi ảnh.', threadId, type);
  }
};
