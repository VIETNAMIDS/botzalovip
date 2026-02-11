const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const { TextStyle } = require('zca-js');

const DEFAULT_DELAY_MS = 20000;
const DEFAULT_TTL_MS = 60000;
const MAX_STYLE_SEGMENTS = 12;
const sessions = new Map(); // threadId -> { intervalId, delayMs, ttlMs, lines, index }

function setTreoToolMode(enabled) {
  if (enabled) {
    if (global.__treoToolMode !== true) {
      global.__treoToolMode = true;
      console.log('[TREO] TREO đang chạy thành công • Bot chuyển sang chế độ TOOL (chỉ lệnh treo hoạt động).');
    }
  } else if (global.__treoToolMode === true) {
    delete global.__treoToolMode;
    console.log('[TREO] Đã thoát chế độ TOOL • Bot nghe lại tất cả lệnh.');
  }
}
const NGON_FILE = path.join(__dirname, 'ngôn.txt');
const CONFIG_PATH = path.join(__dirname, '../../config.yml');

module.exports.config = {
  name: 'treo',
  aliases: [],
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Treo ngôn tự động với delay và TTL tùy chỉnh',
  category: 'Tiện ích',
  usage: 'treo | treo start [delay] [ttl] | treo stop | treo status',
  cooldowns: 3
};

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type } = event || {};
  if (!threadId) return;

  const sub = (args[0] || '').toLowerCase();

  if (!sub) {
    return sendGuide(api, threadId, type);
  }

  if (sub === 'status') {
    return showStatus(api, threadId, type);
  }

  if (sub === 'stop' || sub === 'off') {
    return stopTreo(api, threadId, type);
  }

  if (sub === 'start' || sub === 'on') {
    const delayArg = args[1];
    const ttlArg = args[2];
    const delayMs = parseDuration(delayArg, DEFAULT_DELAY_MS);
    const ttlMs = parseDuration(ttlArg, DEFAULT_TTL_MS);
    return startTreo(api, threadId, type, { delayMs, ttlMs });
  }

  return sendGuide(api, threadId, type);
};

function parseDuration(value, fallback) {
  if (!value && value !== 0) return fallback;
  const str = String(value).trim().toLowerCase();
  if (!str.length) return fallback;

  const match = str.match(/^(\d+)(ms|s)?$/);
  if (!match) return fallback;

  const amount = parseInt(match[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) return fallback;

  const unit = match[2];
  if (unit === 'ms') return amount;
  if (unit === 's') return amount * 1000;

  return amount >= 1000 ? amount : amount * 1000;
}

async function sendGuide(api, threadId, type) {
  const guide = [
    '📌 HƯỚNG DẪN LỆNH TREO NGÔN',
    '',
    '• treo start [delay] [ttl] – bắt đầu treo ngôn, đọc nội dung trong file ngôn.txt',
    `   ↳ delay mặc định ${DEFAULT_DELAY_MS / 1000}s (ghi "20s" hoặc 20000)`,
    `   ↳ ttl mặc định ${DEFAULT_TTL_MS / 1000}s (hỗ trợ 45s, 60000ms, ...)`,
    '• treo stop – dừng treo hiện tại (bot sẽ bật lại nếu do treo tắt)',
    '• treo status – xem trạng thái',
    '',
    '⚠️ Khi treo chạy, bot sẽ tự chuyển sang chế độ TOOL (bot off).',
    'Ví dụ: treo start 30s 45s'
  ].join('\n');

  return sendStyledMessage(api, threadId, type, guide, DEFAULT_TTL_MS);
}

async function showStatus(api, threadId, type) {
  const session = sessions.get(String(threadId));
  if (!session) {
    return sendStyledMessage(api, threadId, type, '⚠️ Hiện không có treo ngôn nào đang chạy.', DEFAULT_TTL_MS);
  }

  const info = [
    '📊 TRẠNG THÁI TREO NGÔN',
    `• Delay: ${session.delayMs}ms`,
    `• TTL: ${session.ttlMs}ms`,
    `• Số câu: ${session.lines.length}`,
    `• Đang ở câu: ${session.index % session.lines.length + 1}`,
    session.didToggleBotOff
      ? '• Bot đang ở chế độ TOOL (tự tắt do treo).'
      : '• Bot đã ở trạng thái TOOL sẵn hoặc đang bật từ trước.',
    global.__treoToolMode ? '• Nghe lệnh: chỉ còn "treo".' : '• Nghe lệnh: đầy đủ (treo không chạy).'
  ].join('\n');

  return sendStyledMessage(api, threadId, type, info, DEFAULT_TTL_MS);
}

async function stopTreo(api, threadId, type) {
  const key = String(threadId);
  const session = sessions.get(key);
  if (!session) {
    return sendStyledMessage(api, threadId, type, '✅ Không có treo ngôn nào để dừng.', DEFAULT_TTL_MS);
  }

  clearInterval(session.intervalId);
  sessions.delete(key);

  if (session.didToggleBotOff) {
    await setBotOfflineState(false);
  }

  if (!sessions.size) {
    setTreoToolMode(false);
  }

  return sendStyledMessage(api, threadId, type, '🛑 Đã dừng treo ngôn.', DEFAULT_TTL_MS);
}

async function startTreo(api, threadId, type, { delayMs, ttlMs }) {
  const key = String(threadId);
  if (sessions.has(key)) {
    return sendStyledMessage(api, threadId, type, '⚠️ Đang treo ngôn rồi! Dùng "treo stop" trước.', DEFAULT_TTL_MS);
  }

  const lines = loadNgonLines();
  if (lines.length === 0) {
    return sendStyledMessage(api, threadId, type, '❌ File ngôn.txt trống hoặc không đọc được.', DEFAULT_TTL_MS);
  }

  const botAlreadyOffline = global.config?.bot_offline === true;
  let toggledBotOff = false;
  if (!botAlreadyOffline) {
    const updated = await setBotOfflineState(true);
    if (updated) toggledBotOff = true;
  }

  let index = 0;

  const sendNext = async () => {
    try {
      const line = lines[index % lines.length];
      index++;
      await sendStyledMessage(api, threadId, type, line, ttlMs);
    } catch (error) {
      console.log('[treo] lỗi khi gửi tin:', error.message);
    }
  };

  await sendNext();
  const intervalId = setInterval(sendNext, delayMs);

  sessions.set(key, { intervalId, delayMs, ttlMs, lines, index, didToggleBotOff: toggledBotOff });
  setTreoToolMode(true);

  const startMsg = [
    '🎯 ĐÃ BẮT ĐẦU TREO NGÔN',
    `• Delay: ${delayMs}ms`,
    `• TTL: ${ttlMs}ms`,
    `• Tổng câu: ${lines.length}`,
    toggledBotOff
      ? '• Bot đã tự động OFF để chuyển sang chế độ TOOL.'
      : '• Bot đang ở chế độ TOOL sẵn hoặc đã bị admin tắt trước đó.',
    '• Listening: chỉ còn lệnh "treo" hoạt động.',
    '⚠️ Dùng "treo stop" để dừng.'
  ].join('\n');

  return sendStyledMessage(api, threadId, type, startMsg, DEFAULT_TTL_MS);
}

function loadNgonLines() {
  try {
    if (!fs.existsSync(NGON_FILE)) return [];
    const raw = fs.readFileSync(NGON_FILE, 'utf-8');
    const normalized = raw.replace(/\r\n/g, '\n').trim();
    if (!normalized.length) return [];

    const delimiter = /\n-{3,}\n/;
    if (delimiter.test(normalized)) {
      return normalized.split(delimiter).map(block => block.trim()).filter(Boolean);
    }

    return [normalized];
  } catch (error) {
    console.log('[treo] lỗi đọc ngôn.txt:', error.message);
    return [];
  }
}

function shouldStripStyles(error) {
  const code = error?.code || error?.statusCode;
  return code === 112 || code === 400;
}

async function sendStyledMessage(api, threadId, type, text, ttlMs = DEFAULT_TTL_MS) {
  const message = typeof text === 'string' ? text : String(text ?? '');
  const payload = {
    msg: message,
    ttl: ttlMs,
    styles: buildMultiColorStyle(message)
  };

  try {
    await api.sendMessage(payload, threadId, type);
    console.log(`[TREO] Đã gửi tin nhắn treo thành công: ${message.slice(0, 60)}${message.length > 60 ? '…' : ''}`);
  } catch (error) {
    if (shouldStripStyles(error)) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.styles;
      await api.sendMessage(fallbackPayload, threadId, type);
      console.log(`[TREO] Đã gửi tin nhắn treo thành công (fallback): ${message.slice(0, 60)}${message.length > 60 ? '…' : ''}`);
    } else {
      throw error;
    }
  }
}

function buildMultiColorStyle(text) {
  const cleanText = typeof text === 'string' ? text : String(text ?? '');
  if (!cleanText.length) return [{ start: 0, len: 0, st: TextStyle.Yellow }];

  const palette = [TextStyle.Yellow, TextStyle.Orange, TextStyle.Red, TextStyle.Green];
  const styles = [];
  let cursor = 0;
  const totalLength = cleanText.length;
  const baseChunk = Math.max(1, Math.floor(totalLength / MAX_STYLE_SEGMENTS));

  while (cursor < totalLength) {
    const remaining = totalLength - cursor;
    let chunkSize;
    if (styles.length >= MAX_STYLE_SEGMENTS - 1) {
      chunkSize = remaining;
    } else {
      const randomBoost = Math.floor(Math.random() * 4);
      chunkSize = Math.min(remaining, Math.max(3, baseChunk + randomBoost));
    }

    const style = palette[Math.floor(Math.random() * palette.length)];
    styles.push({ start: cursor, len: chunkSize, st: style });
    cursor += chunkSize;
  }

  return styles;
}

async function setBotOfflineState(shouldOffline) {
  try {
    if (!global.config) global.config = {};
    global.config.bot_offline = shouldOffline;

    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      const config = YAML.parse(raw);
      config.bot_offline = shouldOffline;
      const updated = YAML.stringify(config);
      fs.writeFileSync(CONFIG_PATH, updated, 'utf8');
    }

    return true;
  } catch (error) {
    console.log('[treo] lỗi cập nhật bot_offline:', error.message);
    return false;
  }
}
