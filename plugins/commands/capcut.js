const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { processVideo } = require('../../utils/index');

const CONFIG = {
  baseUrl: 'https://edit-api-sg.capcut.com',
  searchPath: '/lv/v1/cc_web/replicate/search_templates',
  headers: {
    accept: 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9,vi;q=0.8',
    'app-sdk-version': '48.0.0',
    appvr: '5.8.0',
    'content-type': 'application/json',
    'device-time': '1734146729',
    lan: 'vi-VN',
    loc: 'va',
    origin: 'https://www.capcut.com',
    pf: '7',
    priority: 'u=1, i',
    referer: 'https://www.capcut.com/',
    'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    sign: '8c69245fb9e23bbe2401518a277ef9d4',
    'sign-ver': '1',
    'user-agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
  },
  maxResults: 10,
  selectionTtl: 60000
};

const TEMP_DIR = path.join(__dirname, 'temp');
const PLATFORM = 'capcut';
const PICK_ALIASES = ['chon', 'chọn', 'chon1', 'chon2', 'pick', 'select', 'chonvideo', 'chonv'];

function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

function ensureSelectionMap() {
  if (!(global.capcutSelections instanceof Map)) {
    global.capcutSelections = new Map();
  }
}

function ensureUserSelectionMap() {
  if (!(global.capcutUserSelections instanceof Map)) {
    global.capcutUserSelections = new Map();
  }
}

function ensureSelectionStores() {
  ensureSelectionMap();
  ensureUserSelectionMap();
}

ensureSelectionStores();

async function downloadTemplateVideo(url) {
  ensureTempDir();
  const filePath = path.join(TEMP_DIR, `capcut_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);

  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: 20000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', (err) => {
      writer.close(() => reject(err));
    });
  });

  return filePath;
}

function parseSelectionIndex(text) {
  if (text === null || text === undefined) return NaN;
  const match = String(text).match(/\d+/);
  if (!match) return NaN;
  const n = parseInt(match[0], 10);
  return Number.isFinite(n) ? n - 1 : NaN;
}

function buildTemplateCaption(selection, template, senderNameOverride) {
  const title = template.title || 'CapCut Template';
  const author = template.author?.nickname || 'CapCut Creator';
  const duration = template.duration ? `${Math.round(template.duration / 1000)}s` : 'Không rõ';
  const views = template.play_amount || 0;
  const likes = template.like_count || 0;
  const usage = template.usage_amount || 0;
  const templateUrl = template.template_url || '';

  return [
    `👤 Người chọn: ${senderNameOverride || selection?.senderName || 'Người dùng'}`,
    `🎬 Template: ${title}`,
    `👤 Tác giả: ${author}`,
    `⏱️ Thời lượng: ${duration}`,
    `👁️ ${views} | ❤️ ${likes} | ▶️ ${usage}`,
    templateUrl ? `🔗 Link: ${templateUrl}` : null
  ].filter(Boolean).join('\n');
}

async function sendTemplateVideo(api, context, selection, template) {
  if (!template?.video_url) {
    throw new Error('Template không có video hợp lệ.');
  }

  const videoPath = await downloadTemplateVideo(template.video_url);
  let videoData;
  try {
    videoData = await processVideo(videoPath, context.threadId, context.type);
  } catch (error) {
    throw new Error(error?.message || 'Không thể xử lý video từ CapCut');
  }

  const payload = {
    videoUrl: videoData.videoUrl,
    thumbnailUrl: videoData.thumbnailUrl,
    duration: videoData.metadata.duration,
    width: videoData.metadata.width,
    height: videoData.metadata.height,
    ttl: 3600000
  };

  const caption = buildTemplateCaption(selection, template, context.senderName);
  if (caption) {
    payload.msg = caption;
  }

  await api.sendVideo(payload, context.threadId, context.type);
}

function getSelectionBySender(senderId, threadId) {
  ensureSelectionStores();
  if (!senderId) return null;
  const record = global.capcutUserSelections.get(String(senderId));
  if (!record) return null;
  if (threadId && record.threadId && record.threadId !== threadId) return null;
  return record;
}

function deleteSelectionRecord(record) {
  ensureSelectionStores();
  if (!record) return;
  const aliases = Array.isArray(record.keyAliases) ? record.keyAliases : [];
  aliases.forEach((key) => global.capcutSelections.delete(String(key)));
  if (record.senderId) {
    const existing = global.capcutUserSelections.get(String(record.senderId));
    if (existing && existing === record) {
      global.capcutUserSelections.delete(String(record.senderId));
    }
  }
}

async function handleSelectionCommand({ api, event, senderId, senderName, args }) {
  const { threadId, type } = event;
  const selection = getSelectionBySender(senderId, threadId);

  if (!selection || !Array.isArray(selection.templates) || selection.templates.length === 0) {
    await api.sendMessage({ msg: '❌ Không tìm thấy danh sách template để chọn. Hãy tìm kiếm trước.' }, threadId, type);
    return;
  }

  if (!args.length) {
    await api.sendMessage({ msg: '⚠️ Vui lòng nhập số thứ tự muốn chọn. Ví dụ: capcut chọn 2' }, threadId, type);
    return;
  }

  const indexText = args.join(' ');
  const index = parseSelectionIndex(indexText);
  if (!Number.isFinite(index) || index < 0 || index >= selection.templates.length) {
    await api.sendMessage({ msg: '⚠️ Số thứ tự không hợp lệ. Vui lòng nhập số trong danh sách.' }, threadId, type);
    return;
  }

  const template = selection.templates[index];
  deleteSelectionRecord(selection);

  try {
    await sendTemplateVideo(api, { threadId, type, senderName }, selection, template);
  } catch (error) {
    console.error('[CAPCUT] Lỗi gửi template theo lệnh chọn:', error?.message || error);
    await api.sendMessage({ msg: `❌ Không thể gửi template: ${error?.message || error}` }, threadId, type);
  }
}

function ensureUserSelectionMap() {
  if (!(global.capcutUserSelections instanceof Map)) {
    global.capcutUserSelections = new Map();
  }
}

function ensureSelectionStores() {
  ensureSelectionMap();
  ensureUserSelectionMap();
}

ensureSelectionStores();

function getSelectionBySender(senderId, threadId) {
  ensureSelectionStores();
  if (!senderId) return null;
  const record = global.capcutUserSelections.get(String(senderId));
  if (!record) return null;
  if (threadId && record.threadId && record.threadId !== threadId) return null;
  return record;
}

function deleteSelectionRecord(record) {
  ensureSelectionStores();
  if (!record) return;
  const aliases = Array.isArray(record.keyAliases) ? record.keyAliases : [];
  aliases.forEach((key) => global.capcutSelections.delete(String(key)));
  if (record.senderId) {
    const existing = global.capcutUserSelections.get(String(record.senderId));
    if (existing && existing === record) {
      global.capcutUserSelections.delete(String(record.senderId));
    }
  }
}

if (!global.__capcutSelectionCleaner) {
  global.__capcutSelectionCleaner = setInterval(() => {
    const now = Date.now();
    ensureSelectionStores();
    for (const [key, info] of global.capcutSelections.entries()) {
      if (!info?.timestamp || now - info.timestamp > CONFIG.selectionTtl) {
        global.capcutSelections.delete(key);
      }
    }
    for (const [key, info] of global.capcutUserSelections.entries()) {
      if (!info?.timestamp || now - info.timestamp > CONFIG.selectionTtl) {
        global.capcutUserSelections.delete(key);
      }
    }
  }, 15000);
  if (typeof global.__capcutSelectionCleaner.unref === 'function') {
    global.__capcutSelectionCleaner.unref();
  }
}

async function searchCapcut(keyword, limit = CONFIG.maxResults) {
  try {
    const payload = {
      cc_web_version: 0,
      count: Math.max(1, Math.min(CONFIG.maxResults, Number(limit) || CONFIG.maxResults)),
      cursor: '0',
      enter_from: 'workspace',
      query: keyword,
      scene: 1,
      sdk_version: '86.0.0',
      search_version: 2
    };

    const response = await axios.post(`${CONFIG.baseUrl}${CONFIG.searchPath}`, payload, {
      headers: CONFIG.headers,
      timeout: 12000
    });

    const templates = response?.data?.data?.video_templates;
    if (!Array.isArray(templates)) {
      throw new Error('Không nhận được dữ liệu template');
    }

    return templates;
  } catch (error) {
    console.error('[CAPCUT] Lỗi tìm kiếm:', error?.message || error);
    return [];
  }
}

function buildResultMessage(keyword, templates) {
  const header = `🔎 Kết quả CapCut cho: ${keyword}\n`;
  const rows = templates.map((template, index) => {
    const title = template?.title || 'Không có tiêu đề';
    const author = template?.author?.nickname || 'CapCut Creator';
    const duration = template?.duration ? `${Math.round(template.duration / 1000)}s` : 'Không rõ';
    const view = template?.play_amount || 0;
    const like = template?.like_count || 0;
    const usage = template?.usage_amount || 0;
    return [
      `#${index + 1}. ${title}`,
      ` • 👤 ${author}`,
      ` • ⏱️ ${duration}`,
      ` • 👁️ ${view} | ❤️ ${like} | ▶️ ${usage}`
    ].join('\n');
  }).join('\n\n');

  const footer = '\n💬 Trả lời tin nhắn này bằng số thứ tự để nhận template.\n(Tự động hết hạn sau 60 giây)';
  return `${header}${rows}${footer}`;
}

async function sendSelectionMessage(api, event, message) {
  return api.sendMessage({ msg: message }, event.threadId, event.type);
}

function extractMessageIds(sendResult) {
  const ids = new Set();
  const collect = (payload) => {
    if (!payload || typeof payload !== 'object') return;
    ['globalMsgId', 'msgId', 'cliMsgId', 'messageId'].forEach((prop) => {
      if (payload[prop]) ids.add(String(payload[prop]));
    });
  };

  if (!sendResult) return [];
  collect(sendResult.message);
  if (Array.isArray(sendResult.attachment)) {
    sendResult.attachment.forEach(collect);
  }
  if (Array.isArray(sendResult.messages)) {
    sendResult.messages.forEach(collect);
  }

  return Array.from(ids);
}

function saveSelection(keys, data) {
  if (!Array.isArray(keys) || keys.length === 0) return false;
  ensureSelectionStores();
  const record = {
    ...data,
    timestamp: Date.now(),
    keyAliases: []
  };
  keys.forEach((key) => {
    const k = String(key);
    record.keyAliases.push(k);
    global.capcutSelections.set(k, record);
  });
  if (data?.senderId) {
    global.capcutUserSelections.set(String(data.senderId), record);
  }
  return true;
}

module.exports.config = {
  name: 'capcut',
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Tìm template CapCut và gửi video bằng cách reply lựa chọn',
  category: 'Tiện ích',
  usage: 'capcut <từ khóa> [&& số lượng]',
  cooldowns: 5,
  dependencies: {
    axios: ''
  }
};

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event.authorId;
  const senderName = data?.dName || 'Người dùng';

  if (!Array.isArray(args) || args.length === 0) {
    await api.sendMessage({
      msg: '📘 Cách dùng: capcut <từ khóa> [&& số lượng]\nVí dụ: capcut trend tết && 5'
    }, threadId, type);
    return;
  }

  const interactionMode = global?.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') return;

  const commandWord = args[0].toLowerCase();
  if (PICK_ALIASES.includes(commandWord)) {
    await handleSelectionCommand({ api, event, senderId, senderName, args: args.slice(1) });
    return;
  }

  const raw = args.join(' ').trim();
  const [keywordPart, limitPart] = raw.split('&&').map(part => part?.trim()).filter(Boolean);
  const keyword = keywordPart || raw;
  if (!keyword) {
    await api.sendMessage({ msg: '⚠️ Vui lòng nhập từ khóa cần tìm.' }, threadId, type);
    return;
  }

  const requestedLimit = limitPart ? parseInt(limitPart, 10) : CONFIG.maxResults;
  const safeLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, CONFIG.maxResults)
    : CONFIG.maxResults;

  const templates = await searchCapcut(keyword, safeLimit);

  if (templates.length === 0) {
    await api.sendMessage({ msg: `❌ Không tìm thấy template phù hợp với: ${keyword}` }, threadId, type);
    return;
  }

  const slicedTemplates = templates.slice(0, safeLimit);
  const message = buildResultMessage(keyword, slicedTemplates);
  try {
    const sendResult = await sendSelectionMessage(api, event, message);
    const keys = extractMessageIds(sendResult);
    if (!keys.length) {
      console.warn('[CAPCUT] Không thể lưu lựa chọn vì thiếu messageId');
      return;
    }

    const saved = saveSelection(keys, {
      templates: slicedTemplates,
      senderId,
      threadId,
      threadType: type,
      senderName,
      keyword,
      platform: PLATFORM
    });
    if (!saved) {
      console.warn('[CAPCUT] Không thể thiết lập lựa chọn cho CapCut');
    }
  } catch (error) {
    console.error('[CAPCUT] Lỗi gửi danh sách:', error?.message || error);
    await api.sendMessage({ msg: '❌ Không thể gửi danh sách template. Vui lòng thử lại.' }, threadId, type);
  }
};

module.exports.searchCapcut = searchCapcut;
module.exports.sendTemplateVideo = sendTemplateVideo;
