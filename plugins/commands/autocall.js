const axios = require('axios');
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { processVideo } = require('../../utils/index');

const __tikCache = new Map();
const __TIK_TTL = 10 * 60 * 1000; // 10 phút
const __TIK_MESSAGE_TTL = 60000;
const __TIK_SELECT_ALIASES = ['chọn', 'chon', 'chonvideo', 'chonv', 'pick', 'select', 'số', 'so'];

function __tikKey(threadId, uid) {
  return `${threadId}:${uid}`;
}

function __isTikSelectKeyword(word = '') {
  return __TIK_SELECT_ALIASES.includes(String(word || '').toLowerCase());
}

function __ensureTikSelectionStores() {
  if (!(global.__tikSelectionsByMessage instanceof Map)) {
    global.__tikSelectionsByMessage = new Map();
  }
  if (!(global.__tikSelectionsByUser instanceof Map)) {
    global.__tikSelectionsByUser = new Map();
  }
}

function __storeTikSelection(keys, record) {
  if (!record) return null;
  __ensureTikSelectionStores();

  const selectionKeys = Array.isArray(keys) ? keys.map((key) => String(key)) : [];
  if (Array.isArray(record.selectionKeys)) {
    record.selectionKeys.forEach((key) => global.__tikSelectionsByMessage.delete(String(key)));
  }

  record.selectionKeys = selectionKeys;
  record.at = record.at || Date.now();

  if (record.senderId) {
    global.__tikSelectionsByUser.set(String(record.senderId), record);
  }

  selectionKeys.forEach((key) => {
    global.__tikSelectionsByMessage.set(key, record);
  });

  if (record.threadId && record.senderId) {
    __tikCache.set(__tikKey(record.threadId, record.senderId), record);
  }

  return record;
}

function __getTikSelectionBySender(senderId, threadId) {
  __ensureTikSelectionStores();
  if (!senderId) return null;
  const record = global.__tikSelectionsByUser.get(String(senderId));
  if (!record) return null;
  if (threadId && record.threadId && record.threadId !== threadId) return null;
  if (!record.at || Date.now() - record.at > __TIK_TTL) {
    __removeTikSelection(record);
    return null;
  }
  return record;
}

function __removeTikSelection(record) {
  __ensureTikSelectionStores();
  if (!record) return;
  if (Array.isArray(record.selectionKeys)) {
    record.selectionKeys.forEach((key) => global.__tikSelectionsByMessage.delete(String(key)));
  }
  if (record.senderId) {
    const current = global.__tikSelectionsByUser.get(String(record.senderId));
    if (current && current === record) {
      global.__tikSelectionsByUser.delete(String(record.senderId));
    }
  }
  if (record.threadId && record.senderId) {
    const cacheKey = __tikKey(record.threadId, record.senderId);
    const cached = __tikCache.get(cacheKey);
    if (cached && cached === record) {
      __tikCache.delete(cacheKey);
    }
  }
}

if (!global.__tikSelectionCleaner) {
  global.__tikSelectionCleaner = setInterval(() => {
    try {
      __ensureTikSelectionStores();
      const now = Date.now();
      for (const record of global.__tikSelectionsByUser.values()) {
        if (!record?.at || now - record.at > __TIK_TTL) {
          __removeTikSelection(record);
        }
      }
      for (const [cacheKey, record] of __tikCache.entries()) {
        if (!record?.at || now - record.at > __TIK_TTL) {
          __tikCache.delete(cacheKey);
        }
      }
    } catch (err) {
      console.warn('[bonztik] Selection cleaner error:', err?.message || err);
    }
  }, 15000);
  if (typeof global.__tikSelectionCleaner.unref === 'function') {
    global.__tikSelectionCleaner.unref();
  }
}

async function handleTikTokSearch(api, event, query) {
  const { threadId, type, data } = event || {};
  const senderId = data?.uidFrom || event?.authorId;

  if (!threadId) return null;

  const trimmed = String(query || '').trim();
  if (!trimmed) {
    return api.sendMessage({ msg: '📝 Dùng: bonztik <từ khóa>', ttl: __TIK_MESSAGE_TTL }, threadId, type);
  }

  try {
    const url = `https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(trimmed)}&count=10`;
    const res = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const body = res?.data;
    const videos = Array.isArray(body?.data?.videos) ? body.data.videos : [];

    if (videos.length === 0) {
      return api.sendMessage({ msg: '❌ Không tìm thấy video TikTok nào với từ khóa bạn yêu cầu.', ttl: __TIK_MESSAGE_TTL }, threadId, type);
    }

    const entry = { videos, at: Date.now(), threadId, senderId };
    __tikCache.set(__tikKey(threadId, senderId), entry);

    const lines = [`🎯 Kết quả TikTok cho: ${trimmed}`];
    videos.forEach((v, i) => {
      const title = String(v?.title || 'No title');
      const views = Number(v?.play_count || 0).toLocaleString('vi-VN');
      const likes = Number(v?.digg_count || 0).toLocaleString('vi-VN');
      const comments = Number(v?.comment_count || 0).toLocaleString('vi-VN');
      const shares = Number(v?.share_count || 0).toLocaleString('vi-VN');
      lines.push('');
      lines.push(`${i + 1}. ${title}`);
      lines.push(`   👁️ ${views} | ❤️ ${likes} | 💬 ${comments} | 📮 ${shares}`);
    });
    lines.push('');
    lines.push('✨ Gửi số (1-10) hoặc dùng: bonztik chọn <số>');

    const sendResult = await api.sendMessage({ msg: lines.join('\n'), ttl: __TIK_MESSAGE_TTL }, threadId, type);
    if (sendResult) {
      const keys = [];
      const collectKeys = (payload) => {
        if (!payload || typeof payload !== 'object') return;
        ['globalMsgId', 'msgId', 'cliMsgId', 'messageId'].forEach((prop) => {
          if (payload[prop]) keys.push(String(payload[prop]));
        });
      };

      collectKeys(sendResult.message);
      if (Array.isArray(sendResult.messages)) {
        sendResult.messages.forEach(collectKeys);
      }
      if (Array.isArray(sendResult.attachment)) {
        sendResult.attachment.forEach(collectKeys);
      }
      if (keys.length) {
        __storeTikSelection(keys, entry);
      }
    }

    return sendResult;
  } catch (error) {
    const msg = error?.message || String(error);
    return api.sendMessage(`❌ Lỗi tìm kiếm TikTok: ${msg}`, threadId, type);
  }
}

async function handleTikTokSelect(api, event, n) {
  const { threadId, type, data, messageID } = event || {};
  const senderId = data?.uidFrom || event?.authorId;
  const numericIndex = Number(n);

  if (!threadId || !senderId || !Number.isFinite(numericIndex)) {
    return null;
  }

  const idx = numericIndex - 1;
  const key = __tikKey(threadId, senderId);
  let entry = __tikCache.get(key) || __getTikSelectionBySender(senderId, threadId);

  if (!entry || !Array.isArray(entry.videos) || (Date.now() - entry.at) > __TIK_TTL) {
    return api.sendMessage({ msg: '❌ Danh sách tìm kiếm đã hết hạn hoặc không có. Vui lòng tìm lại bằng: bonztik <từ khóa>', ttl: __TIK_MESSAGE_TTL }, threadId, type);
  }

  if (idx < 0 || idx >= entry.videos.length) {
    return api.sendMessage({ msg: '❌ Số thứ tự không hợp lệ. Dùng: bonztik chọn <số>', ttl: __TIK_MESSAGE_TTL }, threadId, type);
  }

  __removeTikSelection(entry);
  const video = entry.videos[idx] || {};
  const title = video?.title || 'No title';
  const noWm = video?.play || video?.wmplay || video?.hdplay || video?.url || video?.download_url;
  const cover = video?.origin_cover || video?.dynamic_cover || video?.cover || null;
  const author = video?.author || video?.author_name || '';
  const caption = [
    `🎬 ${title}`,
    author ? `👤 ${author}` : '',
    noWm ? `🔗 ${noWm}` : ''
  ].filter(Boolean).join('\n');

  if (!noWm) {
    return api.sendMessage({ msg: caption || '❌ Không có link tải hợp lệ.', ttl: __TIK_MESSAGE_TTL }, threadId, type);
  }

  try {
    if (messageID && typeof api.setMessageReaction === 'function') {
      try {
        await api.setMessageReaction('💗', messageID, threadId, true);
      } catch (reactionErr) {
        console.warn('[bonztik] Không thể thả tim:', reactionErr?.message || reactionErr);
      }
    }

    const tempDir = path.join(__dirname, 'temp');
    await fsPromises.mkdir(tempDir, { recursive: true });
    const filePath = path.join(tempDir, `tik_${Date.now()}_${senderId || 'user'}.mp4`);

    const resp = await axios.get(noWm, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    await fsPromises.writeFile(filePath, resp.data);

    let sent = false;

    if (typeof processVideo === 'function' && typeof api.sendVideo === 'function') {
      try {
        const videoData = await processVideo(filePath, threadId, type);
        if (videoData?.videoUrl) {
          await api.sendVideo({
            videoUrl: videoData.videoUrl,
            thumbnailUrl: videoData.thumbnailUrl,
            duration: videoData.metadata?.duration,
            width: videoData.metadata?.width,
            height: videoData.metadata?.height,
            msg: caption,
            ttl: __TIK_MESSAGE_TTL
          }, threadId, type);
          sent = true;
        }
      } catch (err) {
        console.warn('[bonztik] processVideo/sendVideo failed:', err?.message || err);
      }
    }

    if (!sent && typeof api.uploadAttachment === 'function') {
      try {
        const buf = await fsPromises.readFile(filePath);
        let attachment = null;
        try { attachment = await api.uploadAttachment(buf, 'video/mp4'); } catch {}
        if (!attachment) {
          attachment = await api.uploadAttachment({ data: buf, filename: 'video.mp4', contentType: 'video/mp4' });
        }
        if (attachment) {
          await api.sendMessage({ msg: caption, attachment, ttl: __TIK_MESSAGE_TTL }, threadId, type);
          sent = true;
        }
      } catch (err) {
        console.warn('[bonztik] uploadAttachment fallback failed:', err?.message || err);
      }
    }

    if (!sent) {
      try {
        await api.sendMessage({ msg: caption, attachments: [filePath] }, threadId, type);
        sent = true;
      } catch (err) {
        console.warn('[bonztik] attachment path fallback failed:', err?.message || err);
      }
    }

    if (!sent) {
      const buf = await fsPromises.readFile(filePath);
      try {
        await api.sendMessage({ msg: caption, attachment: buf, filename: 'video.mp4', mime: 'video/mp4', ttl: __TIK_MESSAGE_TTL }, threadId, type);
        sent = true;
      } catch (err) {
        console.warn('[bonztik] buffer fallback failed:', err?.message || err);
      }
    }

    if (!sent) {
      await api.sendMessage({ msg: caption, ttl: __TIK_MESSAGE_TTL }, threadId, type);
    }

    setTimeout(async () => {
      try { await fsPromises.unlink(filePath); } catch {}
    }, 5 * 60 * 1000);
    return true;
  } catch (e) {
    const em = e?.message || String(e);
    try {
      if (cover) {
        await api.sendMessage({ msg: `❌ Lỗi tải video: ${em}\n\n${caption}`, attachment: cover, ttl: __TIK_MESSAGE_TTL }, threadId, type);
      } else {
        await api.sendMessage({ msg: `❌ Lỗi tải video: ${em}\n\n${caption}`, ttl: __TIK_MESSAGE_TTL }, threadId, type);
      }
      return false;
    } catch {}
    return api.sendMessage({ msg: `❌ Lỗi tải video: ${em}\n\n${caption}`, ttl: __TIK_MESSAGE_TTL }, threadId, type);
  }
}

async function run({ api, event, args }) {
  const { threadId, type, data } = event || {};
  const senderId = data?.uidFrom || event?.authorId;
  if (!threadId) return;

  const parsedArgs = Array.isArray(args) ? args.filter((arg) => String(arg || '').trim().length > 0) : [];

  if (parsedArgs.length === 0) {
    return api.sendMessage([
      '✨ BonzTik - Tìm & gửi video TikTok',
      '',
      '📝 Cách dùng:',
      '• bonztik <từ khóa>',
      '• bonztik chọn <số>',
      '• Gõ số trực tiếp sau khi bot trả kết quả',
      '',
      '⏱️ Danh sách có hiệu lực ~10 phút'
    ].join('\n'), threadId, type);
  }

  if (parsedArgs.length === 1 && /^\d+$/.test(parsedArgs[0])) {
    const selection = __getTikSelectionBySender(senderId, threadId);
    if (selection) {
      return handleTikTokSelect(api, event, parseInt(parsedArgs[0], 10));
    }
  }

  let cursorArgs = parsedArgs.slice();
  if ((cursorArgs[0] || '').toLowerCase() === 'tik') {
    cursorArgs = cursorArgs.slice(1);
  }

  if (cursorArgs.length === 0) {
    return api.sendMessage(`❌ Thiếu từ khóa tìm kiếm.
📝 Dùng: bonztik <từ khóa>`, threadId, type);
  }

  const first = (cursorArgs[0] || '').toLowerCase();
  if (__isTikSelectKeyword(first)) {
    const nRaw = cursorArgs[1];
    if (!nRaw || !/^\d+$/.test(nRaw)) {
      return api.sendMessage('❌ Thiếu số thứ tự. Dùng: bonztik chọn <số>', threadId, type);
    }
    return handleTikTokSelect(api, event, parseInt(nRaw, 10));
  }

  const query = cursorArgs.join(' ').trim();
  return handleTikTokSearch(api, event, query);
}

async function handleEvent({ eventType, event, api }) {
  if (eventType !== 'message') return false;
  const { threadId, data } = event || {};
  const uid = data?.uidFrom;
  if (!threadId || !uid) return false;

  const numericText = String(data?.message ?? data?.content ?? '').trim();
  if (/^\d+$/.test(numericText)) {
    const selection = __getTikSelectionBySender(uid, threadId);
    if (selection) {
      const selectionEvent = {
        ...event,
        messageID: event?.messageID || event?.messageId || data?.msgId || data?.messageId || data?.globalMsgId || data?.cliMsgId
      };
      await handleTikTokSelect(api, selectionEvent, parseInt(numericText, 10));
      return true;
    }
  }

  return false;
}

module.exports = {
  config: {
    name: 'bonztik',
    aliases: ['tikvideo', 'video tik', 'tikvid', 'tiktok'],
    version: '1.0.0',
    role: 0,
    author: 'Cascade',
    description: 'Tìm kiếm và gửi video TikTok, hỗ trợ chọn bằng số.',
    category: 'Tiện ích',
    usage: 'bonztik <từ khóa> | bonztik chọn <số>',
    cooldowns: 2,
    dependencies: {
      axios: ''
    }
  },
  run,
  handleEvent,
  handleTikTokSearch,
  handleTikTokSelect,
  isSelectKeyword: __isTikSelectKeyword
};
