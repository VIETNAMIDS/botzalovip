const axios = require('axios');
const { TextStyle } = require('zca-js');

const AUTO_DELETE_TTL = 60000;

module.exports.config = {
  name: 'sr',
  aliases: ['search'],
  version: '1.0.0',
  role: 0,
  author: 'ShinTHL09',
  description: 'Tìm kiếm Google thông qua Custom Search API',
  category: 'Tiện ích',
  usage: 'sr <từ khóa>',
  cooldowns: 5,
  dependencies: { 'axios': '' }
};

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type, data } = event;
  const cfg = global?.config || {};
  const cse = cfg.google_cse || {};
  const API_KEY = cse.api_key || '';
  const CX = cse.cx || '';

  const senderId = data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}

  const query = (args || []).join(' ').trim();
  if (!query) {
    return sendMultiColorMessage(api, threadId, type, '⚠️ Dùng: sr <từ khóa>');
  }

  if (!API_KEY || !CX) {
    return sendMultiColorMessage(
      api,
      threadId,
      type,
      '⚠️ Thiếu cấu hình google_cse.api_key hoặc google_cse.cx trong config.yml'
    );
  }

  try {
    const url = 'https://www.googleapis.com/customsearch/v1';
    const params = {
      key: API_KEY,
      cx: CX,
      q: query,
      num: 5,
      hl: 'vi',
      safe: 'off'
    };

    const res = await axios.get(url, { params, timeout: 15000 });
    const items = Array.isArray(res?.data?.items) ? res.data.items : [];

    if (items.length === 0) {
      return sendMultiColorMessage(api, threadId, type, `❌ Không tìm thấy kết quả cho: ${query}`);
    }

    const header = [
      '🔎 KẾT QUẢ TÌM KIẾM',
      `👤 Người hỏi: ${userName}`,
      `📝 Từ khóa: ${query}`,
      ''
    ].join('\n');

    const body = items.map((it, idx) => {
      const title = it?.title || 'Không tiêu đề';
      const link = it?.link || it?.formattedUrl || '';
      const snippet = (it?.snippet || '').replace(/\s+/g, ' ').trim();
      const desc = snippet ? `\n   ${snippet}` : '';
      return `${idx + 1}. ${title}\n   ${link}${desc}`;
    }).join('\n\n');

    return sendMultiColorMessage(api, threadId, type, `${header}${body}`);
  } catch (error) {
    return sendMultiColorMessage(api, threadId, type, '❌ Lỗi khi tìm kiếm, vui lòng thử lại sau!');
  }
};

async function sendMultiColorMessage(api, threadId, type, text) {
  const message = typeof text === 'string' ? text : String(text ?? '');
  const payload = {
    msg: message,
    styles: buildMultiColorStyle(message),
    ttl: AUTO_DELETE_TTL
  };

  try {
    return await api.sendMessage(payload, threadId, type);
  } catch (error) {
    const errCode = error?.code || error?.statusCode;
    if (errCode === 112 || errCode === 400) {
      return api.sendMessage({ msg: message, ttl: AUTO_DELETE_TTL }, threadId, type);
    }
    throw error;
  }
}

function buildMultiColorStyle(text) {
  const cleanText = typeof text === 'string' ? text : String(text ?? '');
  if (!cleanText.length) return [{ start: 0, len: 0, st: TextStyle.Yellow }];

  const palette = [TextStyle.Yellow, TextStyle.Orange, TextStyle.Red, TextStyle.Green];
  const styles = [];
  let cursor = 0;
  const totalLength = cleanText.length;
  const MAX_SEGMENTS = 12;
  const baseChunk = Math.max(1, Math.floor(totalLength / MAX_SEGMENTS));

  while (cursor < totalLength) {
    const remaining = totalLength - cursor;
    let chunkSize;
    if (styles.length >= MAX_SEGMENTS - 1) {
      chunkSize = remaining;
    } else {
      const randomBoost = Math.floor(Math.random() * 4);
      chunkSize = Math.min(remaining, Math.max(3, baseChunk + randomBoost));
    }
    const st = palette[Math.floor(Math.random() * palette.length)];
    styles.push({ start: cursor, len: chunkSize, st });
    cursor += chunkSize;
  }

  return styles;
}
