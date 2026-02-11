const { ThreadType } = require("zca-js");

module.exports.config = {
  event_type: ["message"],
  name: "antiGroupPlus",
  version: "1.0.0",
  author: "Cascade",
  description: "Bộ anti nâng cao cho group: mention/caps/zalgo/phish/emoji/voice/forward"
};

const ACTION_COOLDOWN_MS = 3000;
const userActionCooldown = new Map();
const violationBuckets = new Map();

const MAX_VIOLATIONS = 3;
const VIOLATION_WINDOW_MS = 10 * 60 * 1000;
const WARNING_DELETE_MS = 60000;

function now() {
  return Date.now();
}

function extractMessageIds(payload) {
  try {
    const data = payload?.data || payload;
    const msgId = data?.msgId || data?.messageId;
    const cliMsgId = data?.cliMsgId || data?.clientMsgId;
    return {
      msgId: msgId ?? null,
      cliMsgId: cliMsgId ?? null
    };
  } catch {
    return { msgId: null, cliMsgId: null };
  }
}

async function safeDelete(api, threadId, type, ids) {
  try {
    if (!ids?.msgId && !ids?.cliMsgId) return;
    await api.deleteMessage(
      {
        threadId,
        type,
        data: {
          msgId: ids.msgId || "",
          cliMsgId: ids.cliMsgId || 0
        }
      },
      false
    );
  } catch {}
}

function scheduleDelete(api, threadId, type, ids, delayMs) {
  try {
    setTimeout(() => safeDelete(api, threadId, type, ids), Math.max(0, Number(delayMs) || 0));
  } catch {}
}

function keyOf(threadId, userId, feature) {
  return `${threadId}:${userId}:${feature}`;
}

function isBotStaffUid(uid) {
  const id = String(uid || "").trim();
  if (!id) return false;
  const buckets = [
    global?.config?.admin_bot,
    global?.config?.owner_bot,
    global?.config?.support_bot,
    global?.users?.admin,
    global?.users?.owner,
    global?.users?.support
  ];
  for (const bucket of buckets) {
    if (Array.isArray(bucket) && bucket.map(String).includes(id)) return true;
  }
  return false;
}

function isWhitelisted(config, userId) {
  const list = config?.whitelist;
  if (!Array.isArray(list)) return false;
  return list.map(String).includes(String(userId));
}

function getThreadConfig(threadData) {
  return threadData?.data || {};
}

function safeText(content) {
  if (typeof content === "string") return content;
  if (content == null) return "";
  try {
    return String(content);
  } catch {
    return "";
  }
}

function isLink(text) {
  return /(https?:\/\/|www\.|zalo\.me\/|chat\.zalo\.me\/|t\.me\/|telegram\.me\/|fb\.me\/|m\.me\/|wa\.me\/|bit\.ly|tinyurl|goo\.gl)/i.test(text);
}

function markViolation(threadId, userId, feature, windowMs) {
  const k = keyOf(threadId, userId, feature);
  const bucket = violationBuckets.get(k) || [];
  const t = now();
  const kept = bucket.filter((ts) => t - ts <= windowMs);
  kept.push(t);
  violationBuckets.set(k, kept);
  return kept.length;
}

function allowAction(threadId, userId, feature) {
  const k = keyOf(threadId, userId, feature);
  const t = now();
  const last = userActionCooldown.get(k) || 0;
  if (t - last < ACTION_COOLDOWN_MS) return false;
  userActionCooldown.set(k, t);
  return true;
}

async function deleteMessageSafe(api, event) {
  try {
    if (typeof api?.deleteMessage === "function") {
      await api.deleteMessage(event, false);
      return true;
    }
  } catch {}
  return false;
}

async function kickUserSafe(api, threadId, userId) {
  const attempts = [
    async () => {
      if (typeof api?.removeUserFromGroup === "function") {
        await api.removeUserFromGroup(String(userId), String(threadId));
        return true;
      }
      return false;
    },
    async () => {
      if (typeof api?.kick === "function") {
        await api.kick(String(userId), String(threadId));
        return true;
      }
      return false;
    }
  ];

  for (const fn of attempts) {
    try {
      const ok = await fn();
      if (ok) return true;
    } catch {}
  }
  return false;
}

function parseMentionsCount(event) {
  const mentions = event?.data?.mentions;
  if (!Array.isArray(mentions)) return 0;
  return mentions.length;
}

function countCombiningMarks(text) {
  const m = text.match(/[\u0300-\u036f]/g);
  return m ? m.length : 0;
}

function countEmojiLike(text) {
  const m = text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu);
  return m ? m.length : 0;
}

function alphaUpperRatio(text) {
  const letters = text.match(/[A-Za-zÀ-ỹ]/g);
  if (!letters || letters.length === 0) return 0;
  const uppers = text.match(/[A-ZÀ-Ỹ]/g);
  return (uppers ? uppers.length : 0) / letters.length;
}

function detectForward(event) {
  const data = event?.data || {};
  const msgType = String(data.msgType || data.type || "").toLowerCase();
  if (msgType.includes("forward")) return true;
  const forwardInfo = data?.propertyExt?.forwardInfo;
  if (forwardInfo) return true;
  return false;
}

function detectVoice(event) {
  const data = event?.data || {};
  const msgType = String(data.msgType || data.type || "").toLowerCase();
  return msgType.includes("voice") || msgType.includes("audio");
}

function looksLikeMediaType(t = "") {
  const s = String(t || "").toLowerCase();
  if (!s) return false;
  if (s.includes("sticker")) return true;
  if (s.includes("photo") || s.includes("image")) return true;
  if (s.includes("video")) return true;
  if (s.includes("voice") || s.includes("audio")) return true;
  return false;
}

function pickFilename(att = {}) {
  return String(att?.name || att?.fileName || att?.filename || att?.title || att?.displayName || "");
}

function isFileLikeAttachment(att = {}) {
  const type = String(att?.type || att?.mediaType || att?.msgType || "").toLowerCase();
  if (looksLikeMediaType(type)) return false;

  const mime = String(att?.mimeType || att?.mimetype || att?.mime || "").toLowerCase();
  if (mime.startsWith("image/") || mime.startsWith("video/") || mime.startsWith("audio/")) return false;

  const file = pickFilename(att);
  const ext = String(att?.ext || att?.extension || "").toLowerCase();
  const url = String(att?.url || att?.href || att?.downloadUrl || att?.download_url || "");

  const typeHit = /(\bfile\b|document|doc|pdf|ppt|pptx|xls|xlsx|zip|rar|7z|apk|exe|msi)/i.test(type);
  const mimeHit = /(application\/|text\/plain|text\/csv)/i.test(mime);
  const nameHit = /(\.pdf|\.docx?|\.xlsx?|\.pptx?|\.txt|\.csv|\.zip|\.rar|\.7z|\.apk|\.exe|\.msi)$/i.test(file);
  const extHit = /(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|zip|rar|7z|apk|exe|msi)$/i.test(ext);

  if (typeHit || mimeHit || nameHit || extHit) return true;
  if ((file && file.length >= 3) && url) return true;
  if (url && /download|file|document/i.test(url) && !looksLikeMediaType(url)) return true;

  return false;
}

function detectFileAttachment(event) {
  const data = event?.data || {};
  const msgType = String(data.msgType || data.type || "").toLowerCase();
  if (looksLikeMediaType(msgType)) return { has: false, name: "" };
  if (/(^|\b)(file|document|doc|pdf)(\b|$)/i.test(msgType)) return { has: true, name: "" };

  const candidates = [];
  const propAtt = data?.propertyExt?.attachments;
  const propMedia = data?.propertyExt?.mediaList;
  const rootAtt = data?.attachments;

  if (Array.isArray(propAtt)) candidates.push(...propAtt);
  if (Array.isArray(propMedia)) candidates.push(...propMedia);
  if (Array.isArray(rootAtt)) candidates.push(...rootAtt);

  for (const att of candidates) {
    if (!att || typeof att !== "object") continue;
    if (!isFileLikeAttachment(att)) continue;
    return { has: true, name: pickFilename(att) };
  }

  try {
    const raw = JSON.stringify(data?.propertyExt || {}).toLowerCase();
    if (raw.includes("filename") || raw.includes("mimetype") || raw.includes("application/")) {
      if (!raw.includes("sticker") && !raw.includes("photo") && !raw.includes("image") && !raw.includes("video") && !raw.includes("audio")) {
        return { has: true, name: "" };
      }
    }
  } catch {}

  return { has: false, name: "" };
}

function fileLooksDangerous(filename = "") {
  const lower = String(filename || "").toLowerCase();
  return /(\.apk|\.exe|\.msi|\.bat|\.cmd|\.scr|\.com|\.jar|\.zip|\.rar|\.7z)$/i.test(lower);
}

function detectPhish(text) {
  const t = text.toLowerCase();
  const hasLink = isLink(t);
  const keywords = [
    "otp",
    "ma otp",
    "mã otp",
    "nhận tiền",
    "nhan tien",
    "trúng thưởng",
    "trung thuong",
    "xác minh",
    "xac minh",
    "đăng nhập",
    "dang nhap",
    "tài khoản",
    "tai khoan",
    "lấy lại",
    "lay lai",
    "click",
    "bấm vào",
    "bam vao"
  ];
  const hit = keywords.some((k) => t.includes(k));
  return hasLink && hit;
}

async function warn(api, threadId, type, message) {
  try {
    await api.sendMessage({ msg: message, ttl: 15000 }, threadId, type);
  } catch {}
}

async function sendAntiWarning({ api, threadId, type, senderId, senderName, featureTitle, count, max, note }) {
  const lines = [
    featureTitle,
    `ng vi phạm : ${senderName}`,
    `số lần : ${count}/${max}`,
    "bot by : bonz",
    `thông báo : ${note}`
  ];

  const msg = lines.join("\n");
  const mentionPos = msg.indexOf(senderName);
  const mentions = [{ pos: mentionPos >= 0 ? mentionPos : 0, uid: senderId, len: String(senderName).length }];

  try {
    const sent = await api.sendMessage({ msg, mentions }, threadId, type);
    const ids = extractMessageIds(sent);
    scheduleDelete(api, threadId, type, ids, WARNING_DELETE_MS);
  } catch {}
}

module.exports.run = async ({ api, event, eventType, Threads }) => {
  if (!event || !event.threadId) return;

  const threadId = String(event.threadId);
  const type = event.type;
  if (Number(type) !== Number(ThreadType.Group)) return;

  const data = event?.data;
  if (!data) return;

  const senderId = String(data.uidFrom || "").trim();
  if (!senderId) return;

  const senderName = String(data.dName || data.displayName || "Người dùng");

  const botId = String(
    api?.getCurrentUserID?.() ||
    api?.getCurrentUserId?.() ||
    api?.getOwnId?.() ||
    global?.botID ||
    global?.config?.bot_id ||
    ""
  );
  if (botId && senderId === botId) return;
  if (event.isSelf) return;
  if (isBotStaffUid(senderId)) return;

  let threadData;
  try {
    threadData = await Threads.getData(threadId);
  } catch {
    return;
  }

  const cfg = getThreadConfig(threadData);

  if (eventType !== "message") return;

  const msgContent = safeText(data.msg || data.body || data.content || "");

  const handlers = [
    async () => {
      const c = cfg?.antiMention;
      if (!c?.enabled) return false;
      if (isWhitelisted(c, senderId)) return false;
      const max = Number.isFinite(Number(c.maxMentions)) ? Number(c.maxMentions) : 5;
      const mentions = parseMentionsCount(data);
      if (mentions <= max) return false;

      const count = markViolation(threadId, senderId, "mention", VIOLATION_WINDOW_MS);
      await deleteMessageSafe(api, event);
      if (c.autoKick && count >= MAX_VIOLATIONS) {
        await kickUserSafe(api, threadId, senderId);
      }

      if (!allowAction(threadId, senderId, "mention")) return true;
      await sendAntiWarning({
        api,
        threadId,
        type,
        senderId,
        senderName,
        featureTitle: "ANTI MENTION",
        count,
        max: MAX_VIOLATIONS,
        note: "vui lòng không tag quá nhiều người trong nhóm này"
      });
      return true;
    },
    async () => {
      const c = cfg?.antiCaps;
      if (!c?.enabled) return false;
      if (isWhitelisted(c, senderId)) return false;
      const minLen = Number.isFinite(Number(c.minLength)) ? Number(c.minLength) : 12;
      const ratio = Number.isFinite(Number(c.ratio)) ? Number(c.ratio) : 0.75;
      if (msgContent.length < minLen) return false;
      if (alphaUpperRatio(msgContent) < ratio) return false;

      const count = markViolation(threadId, senderId, "caps", VIOLATION_WINDOW_MS);
      await deleteMessageSafe(api, event);
      if (c.autoKick && count >= MAX_VIOLATIONS) {
        await kickUserSafe(api, threadId, senderId);
      }

      if (!allowAction(threadId, senderId, "caps")) return true;
      await sendAntiWarning({
        api,
        threadId,
        type,
        senderId,
        senderName,
        featureTitle: "ANTI CAPS",
        count,
        max: MAX_VIOLATIONS,
        note: "vui lòng không viết HOA quá nhiều trong nhóm này"
      });
      return true;
    },
    async () => {
      const c = cfg?.antiZalgo;
      if (!c?.enabled) return false;
      if (isWhitelisted(c, senderId)) return false;
      const limit = Number.isFinite(Number(c.limit)) ? Number(c.limit) : 10;
      if (countCombiningMarks(msgContent) < limit) return false;

      const count = markViolation(threadId, senderId, "zalgo", VIOLATION_WINDOW_MS);
      await deleteMessageSafe(api, event);
      if (c.autoKick && count >= MAX_VIOLATIONS) {
        await kickUserSafe(api, threadId, senderId);
      }

      if (!allowAction(threadId, senderId, "zalgo")) return true;
      await sendAntiWarning({
        api,
        threadId,
        type,
        senderId,
        senderName,
        featureTitle: "ANTI ZALGO",
        count,
        max: MAX_VIOLATIONS,
        note: "vui lòng không dùng ký tự biến dạng trong nhóm này"
      });
      return true;
    },
    async () => {
      const c = cfg?.antiPhish;
      if (!c?.enabled) return false;
      if (isWhitelisted(c, senderId)) return false;
      if (!detectPhish(msgContent)) return false;

      const count = markViolation(threadId, senderId, "phish", VIOLATION_WINDOW_MS);
      await deleteMessageSafe(api, event);
      if (c.autoKick && count >= MAX_VIOLATIONS) {
        await kickUserSafe(api, threadId, senderId);
      }

      if (!allowAction(threadId, senderId, "phish")) return true;
      await sendAntiWarning({
        api,
        threadId,
        type,
        senderId,
        senderName,
        featureTitle: "ANTI PHISH",
        count,
        max: MAX_VIOLATIONS,
        note: "vui lòng không gửi nội dung nghi lừa đảo/phishing trong nhóm này"
      });
      return true;
    },
    async () => {
      const c = cfg?.antiEmoji;
      if (!c?.enabled) return false;
      if (isWhitelisted(c, senderId)) return false;
      const limit = Number.isFinite(Number(c.limit)) ? Number(c.limit) : 12;
      if (countEmojiLike(msgContent) < limit) return false;

      const count = markViolation(threadId, senderId, "emoji", VIOLATION_WINDOW_MS);
      await deleteMessageSafe(api, event);
      if (c.autoKick && count >= MAX_VIOLATIONS) {
        await kickUserSafe(api, threadId, senderId);
      }

      if (!allowAction(threadId, senderId, "emoji")) return true;
      await sendAntiWarning({
        api,
        threadId,
        type,
        senderId,
        senderName,
        featureTitle: "ANTI EMOJI",
        count,
        max: MAX_VIOLATIONS,
        note: "vui lòng không spam emoji trong nhóm này"
      });
      return true;
    },
    async () => {
      const c = cfg?.antiVoice;
      if (!c?.enabled) return false;
      if (isWhitelisted(c, senderId)) return false;
      if (!detectVoice(event)) return false;

      const count = markViolation(threadId, senderId, "voice", VIOLATION_WINDOW_MS);
      await deleteMessageSafe(api, event);
      if (c.autoKick && count >= MAX_VIOLATIONS) {
        await kickUserSafe(api, threadId, senderId);
      }

      if (!allowAction(threadId, senderId, "voice")) return true;
      if (c.notify !== false) {
        await sendAntiWarning({
          api,
          threadId,
          type,
          senderId,
          senderName,
          featureTitle: "ANTI VOICE",
          count,
          max: MAX_VIOLATIONS,
          note: "vui lòng không gửi voice trong nhóm này"
        });
      }
      return true;
    },
    async () => {
      const c = cfg?.antiForward;
      if (!c?.enabled) return false;
      if (isWhitelisted(c, senderId)) return false;
      if (!detectForward(event)) return false;

      const count = markViolation(threadId, senderId, "forward", VIOLATION_WINDOW_MS);
      await deleteMessageSafe(api, event);
      if (c.autoKick && count >= MAX_VIOLATIONS) {
        await kickUserSafe(api, threadId, senderId);
      }

      if (!allowAction(threadId, senderId, "forward")) return true;
      await sendAntiWarning({
        api,
        threadId,
        type,
        senderId,
        senderName,
        featureTitle: "ANTI FORWARD",
        count,
        max: MAX_VIOLATIONS,
        note: "vui lòng không forward tin nhắn trong nhóm này"
      });
      return true;
    },
    // antiSpoof removed
  ];

  for (const h of handlers) {
    try {
      const handled = await h();
      if (handled) return;
    } catch {
      continue;
    }
  }
};
