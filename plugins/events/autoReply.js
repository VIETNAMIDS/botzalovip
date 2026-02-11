const axios = require('axios');

module.exports.config = {
  event_type: ["message"],
  name: "autoReply",
  version: "1.0.0",
  author: "Cascade",
  description: "Tự động trả lời tin nhắn trong nhóm bằng AI khi đã bật autochat",
  dependencies: {}
};

function getZeidBaseAndHeaders() {
  const cfg = global?.config || {};
  const baseUrl = 'https://api.zeidteam.xyz/ai/chatgpt4';
  const key = cfg.zeid_api_key || process.env.ZEID_API_KEY || '';
  const headers = {};
  if (key) {
    headers['apikey'] = key;
    headers['Authorization'] = `Bearer ${key}`;
  }
  return { baseUrl, headers };
}

async function getThreadConf(Threads, threadId) {
  try {
    const data = await Threads.getData(threadId);
    return (data && data.data && data.data.bonz_autochat) ? data.data.bonz_autochat : { enabled: false };
  } catch {
    return { enabled: false };
  }
}

module.exports.run = async function({ api, event }) {
  const { threadId, type, data } = event;
  if (!threadId) return;

  // Bỏ qua nếu không phải tin nhắn text
  const content = typeof data?.content === 'string' ? data.content : '';
  if (!content) return;

  // Bỏ qua nếu là lệnh (tránh trả lời đè)
  const prefix = (global.config && global.config.prefix) ? global.config.prefix : '/';
  const lower = content.trim().toLowerCase();
  if (lower.startsWith(prefix) || lower.startsWith('bonz ')) return;

  // Bỏ qua nếu là tin do bot gửi chính nó
  const selfUid = (global.api && global.api.getCurrentUserID) ? global.api.getCurrentUserID() : null;
  const senderId = event?.data?.uidFrom || event?.authorId;
  if (selfUid && String(senderId) === String(selfUid)) return;

  // Ngăn trả lời lặp: cooldown theo nhóm + dedupe nội dung
  if (!global.__bonzAutoReplyState) {
    global.__bonzAutoReplyState = { lastAt: new Map(), lastMsg: new Map() };
  }
  const now = Date.now();
  const cooldownMs = 5000; // 5 giây giữa các lần trả lời trong cùng nhóm
  const lastAt = global.__bonzAutoReplyState.lastAt.get(threadId) || 0;
  if (now - lastAt < cooldownMs) return;
  const keyLast = global.__bonzAutoReplyState.lastMsg.get(threadId) || { text: '', senderId: null, at: 0 };
  if (keyLast && keyLast.text === content.trim() && now - (keyLast.at || 0) < 30000) {
    // cùng nội dung trong 30s -> bỏ qua để tránh lặp
    return;
  }

  // Kiểm tra cấu hình theo nhóm
  let Threads;
  try { Threads = require('../../core/controller/controllerThreads'); } catch {}
  const conf = await getThreadConf(Threads, threadId);
  if (!conf.enabled) return;

  const systemPrompt = conf.systemPrompt || '';
  const userText = content.trim();

  // Gọi API ZeidTeam
  const { baseUrl, headers } = getZeidBaseAndHeaders();
  let prompt = userText;
  if (systemPrompt) {
    prompt = `${systemPrompt}\n\nNgười dùng: ${userText}`;
  }
  const url = `${baseUrl}?prompt=${encodeURIComponent(prompt)}`;

  try {
    let resp;
    try {
      resp = await axios.get(url, { headers, timeout: 20000 });
    } catch (e) {
      if (headers.Authorization) {
        const alt = `${baseUrl}?prompt=${encodeURIComponent(prompt)}&apikey=${encodeURIComponent(headers.Authorization.replace('Bearer ', ''))}`;
        resp = await axios.get(alt, { timeout: 20000 });
      } else {
        throw e;
      }
    }
    const data = resp?.data || {};
    const text = data.response || data.result || data.answer || '';
    if (text) {
      const replyTarget = event?.data?.msgId ? { data: { msgId: event.data.msgId, cliMsgId: event.data.cliMsgId }, threadId, type } : null;
      if (replyTarget && typeof api?.replyMessage === 'function') {
        await api.replyMessage(text, replyTarget);
      } else {
        await api.sendMessage(text, threadId, type);
      }
      // cập nhật state sau khi gửi
      global.__bonzAutoReplyState.lastAt.set(threadId, Date.now());
      global.__bonzAutoReplyState.lastMsg.set(threadId, { text: content.trim(), senderId, at: Date.now() });
    }
  } catch (err) {
    // Im lặng nếu lỗi để tránh spam lỗi
  }
};
