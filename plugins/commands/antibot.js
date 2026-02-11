let scanForNsfw = async () => null;
let formatNsfwProbability = (value) => {
  if (!Number.isFinite(value)) return "0.0%";
  const pct = Math.min(Math.max(value * 100, 0), 100);
  return `${pct.toFixed(1)}%`;
};
let nsfwSupportAvailable = false;
let nsfwMissing = [];

try {
  const nsfwHelpers = require("../../modules/anti18plus");
  if (nsfwHelpers && typeof nsfwHelpers.scanForNsfw === "function") {
    scanForNsfw = nsfwHelpers.scanForNsfw;
    if (typeof nsfwHelpers.formatProbability === "function") {
      formatNsfwProbability = nsfwHelpers.formatProbability;
    }
    nsfwSupportAvailable = !!nsfwHelpers.isNsfwSupported;
    if (!nsfwSupportAvailable && Array.isArray(nsfwHelpers.missingDependencies)) {
      nsfwMissing = nsfwHelpers.missingDependencies;
    }
  } else {
    console.warn('[antibot] NSFW helpers missing expected exports, sensitive image detection disabled.');
  }
} catch (error) {
  console.warn('[antibot] Không thể tải module anti18plus:', error?.message || error);
}

const DEFAULT_THRESHOLD_MS = 1_000_000; // 1000 giay - nguong mac dinh TTL (legacy)
const NOTICE_TTL_MS = 60_000; // 60 giay tu dong xoa thong bao
const ALERT_COOLDOWN_MS = 20_000; // 20 giay giam spam canh bao
const VIOLATION_RESET_MS = 300_000; // 5 phut reset vi pham
const DEFAULT_SCORE_THRESHOLD = 50; // diem nghi ngo toi thieu cho he thong moi
const DEFAULT_BURST_LIMIT = 4;
const DEFAULT_BURST_WINDOW_MS = 7000;
const DEFAULT_REPEAT_LIMIT = 3;
const DEFAULT_LINK_BURST_LIMIT = 2;
const DEFAULT_LINK_WINDOW_MS = 20000;
const MAX_PATTERN_HISTORY = 20;
const CARD_SUSPICION_SCORE = 75;
const DEFAULT_NSFW_THRESHOLD = 0.88;

// Tracking he thong
const recentAlerts = new Map();
const userViolations = new Map(); // Theo doi so lan vi pham
const suspiciousPatterns = new Map(); // Phat hien pattern dang ngo

module.exports.config = {
  name: "antibot",
  version: "2.0.0",
  role: 1,
  author: "Cascade Enhanced",
  description: "Chong bot Zalo nang cao - Phat hien spam tu dong, link doc va tin nhan auto-delete",
  category: "Nhom",
  usage: "antibot <on|off|status|heavy|threshold|strict|autokick|limit|whitelist|stats|kick>",
  cooldowns: 2,
  aliases: ["antibotguard", "ab", "antibot2"]
};

function ensureGuard(threadData) {
  if (!threadData.data.antiBotGuard) {
    threadData.data.antiBotGuard = {
      enabled: false,
      heavyMode: false,
      heavySilent: false,
      threshold: DEFAULT_THRESHOLD_MS,
      whitelist: [],
      autoKick: true,
      strictMode: true,
      violationLimit: 3,
      detectionLog: [],
      scoreThreshold: DEFAULT_SCORE_THRESHOLD,
      burstLimit: DEFAULT_BURST_LIMIT,
      burstWindow: DEFAULT_BURST_WINDOW_MS,
      repeatLimit: DEFAULT_REPEAT_LIMIT,
      linkBurstLimit: DEFAULT_LINK_BURST_LIMIT,
      linkWindow: DEFAULT_LINK_WINDOW_MS,
      detectQuickDelete: true,
      detectBurstSpam: true,
      detectRepeats: true,
      detectLinkStorm: true,
      detectCardMessage: true,
      detectSensitiveImage: nsfwSupportAvailable,
      nsfwThreshold: DEFAULT_NSFW_THRESHOLD
    };
  } else {
    const guard = threadData.data.antiBotGuard;
    if (typeof guard.heavyMode !== "boolean") {
      guard.heavyMode = false;
    }
    if (typeof guard.heavySilent !== "boolean") {
      guard.heavySilent = false;
    }
    if (typeof guard.threshold !== "number" || guard.threshold <= 0) {
      guard.threshold = DEFAULT_THRESHOLD_MS;
    }
    if (!Array.isArray(guard.whitelist)) {
      guard.whitelist = [];
    }
    if (typeof guard.autoKick !== "boolean") {
      guard.autoKick = true;
    }
    if (typeof guard.strictMode !== "boolean") {
      guard.strictMode = true;
    }
    if (typeof guard.violationLimit !== "number" || guard.violationLimit < 1) {
      guard.violationLimit = 3;
    }
    if (!Array.isArray(guard.detectionLog)) {
      guard.detectionLog = [];
    }
    if (typeof guard.scoreThreshold !== "number") {
      guard.scoreThreshold = DEFAULT_SCORE_THRESHOLD;
    }
    if (typeof guard.burstLimit !== "number") {
      guard.burstLimit = DEFAULT_BURST_LIMIT;
    }
    if (typeof guard.burstWindow !== "number") {
      guard.burstWindow = DEFAULT_BURST_WINDOW_MS;
    }
    if (typeof guard.repeatLimit !== "number") {
      guard.repeatLimit = DEFAULT_REPEAT_LIMIT;
    }
    if (typeof guard.linkBurstLimit !== "number") {
      guard.linkBurstLimit = DEFAULT_LINK_BURST_LIMIT;
    }
    if (typeof guard.linkWindow !== "number") {
      guard.linkWindow = DEFAULT_LINK_WINDOW_MS;
    }
    if (typeof guard.detectQuickDelete !== "boolean") {
      guard.detectQuickDelete = true;
    }
    if (typeof guard.detectBurstSpam !== "boolean") {
      guard.detectBurstSpam = true;
    }
    if (typeof guard.detectRepeats !== "boolean") {
      guard.detectRepeats = true;
    }
    if (typeof guard.detectLinkStorm !== "boolean") {
      guard.detectLinkStorm = true;
    }
    if (typeof guard.detectCardMessage !== "boolean") {
      guard.detectCardMessage = true;
    }
    if (typeof guard.detectSensitiveImage !== "boolean") {
      guard.detectSensitiveImage = nsfwSupportAvailable;
    }
    if (!Number.isFinite(guard.nsfwThreshold) || guard.nsfwThreshold <= 0 || guard.nsfwThreshold >= 1) {
      guard.nsfwThreshold = DEFAULT_NSFW_THRESHOLD;
    }
  }
  return threadData.data.antiBotGuard;
}

function sendReply(api, threadId, type, message, mentions = []) {
  const ttlSeconds = NOTICE_TTL_MS / 1000;
  return api.sendMessage({
    msg: `${message}\n\n⏱️ Tin nhan se tu dong xoa sau ${ttlSeconds}s`,
    mentions,
    ttl: NOTICE_TTL_MS
  }, threadId, type);
}

function getOrCreatePatternState(senderId) {
  if (!suspiciousPatterns.has(senderId)) {
    suspiciousPatterns.set(senderId, {
      messages: [],
      lastLinks: [],
      tokens: []
    });
  }
  return suspiciousPatterns.get(senderId);
}

function tokeniseMessage(content = "") {
  return content
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' [link] ')
    .replace(/[^a-z0-9\s\p{L}\p{N}]/giu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 50);
}

function isLink(content = "") {
  const linkRegex = /(https?:\/\/|zalo\.me\/|chat\.zalo\.me\/|invite|bit\.ly|tinyurl|goo\.gl)/i;
  return linkRegex.test(content);
}

function isHighRiskLink(content = "") {
  const highRisk = /(chat\.zalo\.me\/(?:g|invite)|zalo\.me\/(?:g|invite)|t\.me\/|telegram\.me\/|fb\.me\/|m\.me\/|wa\.me\/|bit\.ly|tinyurl|goo\.gl)/i;
  return highRisk.test(content);
}

function looksLikePhoneSpam(content = "") {
  const normalized = content.replace(/\s+/g, " ");
  return /(\d[\s\-\.]*){9,}/.test(normalized);
}

function hasGarbageRun(content = "") {
  return /(.)(\1){7,}/.test(content);
}

function normalizeForSimilarity(content = "") {
  return String(content)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " [link] ")
    .replace(/\b\d{3,}\b/g, " [num] ")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function detectBotPrefix(content = "") {
  const trimmed = String(content).trim().toLowerCase();
  if (!trimmed) return false;
  return /^(?:[!\/\.\$#@%&\?\+\-]{1,2})\s*[\p{L}]{2,}/u.test(trimmed);
}

function isSuspiciousLength(content = "") {
  const len = content.trim().length;
  return len < 5 || len > 600;
}

function countDuplicateTokens(tokens = []) {
  const counter = new Map();
  tokens.forEach((token) => {
    counter.set(token, (counter.get(token) || 0) + 1);
  });
  return Array.from(counter.values()).filter((value) => value >= 3).length;
}

function safeToString(payload) {
  if (payload == null) return "";
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload);
  } catch {
    return "";
  }
}

function isCardMessageData(data = {}) {
  if (!data) return false;

  const msgType = String(data.msgType || data.type || "").toLowerCase();
  if (msgType.includes("card") || msgType.includes("contact")) {
    return true;
  }

  const attachments = data?.propertyExt?.attachments;
  if (Array.isArray(attachments)) {
    const hasCardAttachment = attachments.some((att) => {
      const type = String(att?.type || "").toLowerCase();
      const desc = safeToString(att).toLowerCase();
      return type.includes("card") || desc.includes("contact") || desc.includes("qr");
    });
    if (hasCardAttachment) {
      return true;
    }
  }

  const payloads = [data.content, data.msgInfo, data.cardInfo, data?.propertyExt?.forwardInfo];
  const keywords = [
    "danh thiếp",
    "danh thiep",
    "business card",
    "contact",
    "liên hệ",
    "lien he",
    "contactuid",
    "contact_uid",
    "qr zalo",
    "zalo card",
    "zalo_contact"
  ];

  return payloads.some((payload) => {
    const text = safeToString(payload).toLowerCase();
    if (!text) return false;
    return keywords.some((keyword) => text.includes(keyword));
  });
}

function isStickerMessageData(data = {}) {
  if (!data) return false;

  const msgType = String(data.msgType || data.type || "").toLowerCase();
  if (msgType.includes("sticker")) return true;

  const attachments = data?.propertyExt?.attachments;
  if (Array.isArray(attachments)) {
    const hasStickerAttachment = attachments.some((att) => {
      const type = String(att?.type || "").toLowerCase();
      const desc = safeToString(att).toLowerCase();
      return type.includes("sticker") || desc.includes("sticker");
    });
    if (hasStickerAttachment) return true;
  }

  const contentText = safeToString(data.content).toLowerCase();
  if (contentText.includes("sticker")) return true;

  return false;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0 giay";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 100) / 10;
  if (seconds < 60) {
    return `${seconds % 1 === 0 ? seconds.toFixed(0) : seconds.toFixed(1)} giay`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = Math.round(seconds - minutes * 60);
  if (minutes < 60) {
    return remainSeconds > 0 ? `${minutes} phut ${remainSeconds} giay` : `${minutes} phut`;
  }
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return remainMinutes > 0 ? `${hours} gio ${remainMinutes} phut` : `${hours} gio`;
}

function parseDuration(input, fallback) {
  if (!input) return fallback;
  const trimmed = input.trim().toLowerCase();
  const match = trimmed.match(/^(\d+)(ms|s|m|h)?$/);
  if (!match) return fallback;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return fallback;
  const unit = match[2] || "s";
  switch (unit) {
    case "ms":
      return value;
    case "s":
      return value * 1000;
    case "m":
      return value * 60_000;
    case "h":
      return value * 3_600_000;
    default:
      return fallback;
  }
}

function extractIdsFromMentions(event) {
  const mentions = event?.data?.mentions;
  if (!Array.isArray(mentions)) return [];
  return mentions
    .map(item => item?.uid)
    .filter(uid => typeof uid === "string" || typeof uid === "number")
    .map(uid => String(uid));
}

function getBotId(api) {
  try {
    return String(
      api?.getCurrentUserID?.() ||
      api?.getCurrentUserId?.() ||
      api?.getOwnId?.() ||
      global.api?.getCurrentUserID?.() ||
      global.api?.getCurrentUserId?.() ||
      global.botID ||
      global.config?.bot_id ||
      ""
    );
  } catch {
    return "";
  }
}

function getBotPrefix() {
  const raw = global?.config?.prefix;
  if (typeof raw !== "string") return "/";
  const trimmed = raw.trim();
  return trimmed ? trimmed : "/";
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

function isValidCommandMessage(content = "") {
  const prefix = getBotPrefix();
  const text = String(content || "").trim();
  if (!text || !text.startsWith(prefix)) return false;

  const afterPrefix = text.slice(prefix.length).trim();
  if (!afterPrefix) return false;

  const cmd = afterPrefix.split(/\s+/)[0]?.toLowerCase();
  if (!cmd) return false;

  const commands = global?.client?.commands;
  const hasCommand = typeof commands?.has === "function" ? commands.has(cmd) : false;
  if (!hasCommand) return false;

  if (isLink(text)) return false;
  if (text.length > 90) return false;
  return true;
}

function analyzeMessagePattern(guard, senderId, options = {}) {
  const {
    ttlMs = null,
    messageContent = "",
    cardDetected = false,
    msgType = "",
    nsfwResult = null
  } = options;

  const now = Date.now();
  const content = typeof messageContent === "string"
    ? messageContent
    : messageContent == null
      ? ""
      : String(messageContent);

  const tokens = tokeniseMessage(content);
  const hasLink = isLink(content);
  const highRiskLink = hasLink && isHighRiskLink(content);
  const phoneSpam = looksLikePhoneSpam(content);
  const garbageRun = hasGarbageRun(content);
  const botPrefix = detectBotPrefix(content);
  const signature = normalizeForSimilarity(content);
  const state = getOrCreatePatternState(senderId);
  recordPatternState(state, guard, now, content, tokens, hasLink, ttlMs);

  const burstWindow = Number.isFinite(guard.burstWindow) ? guard.burstWindow : DEFAULT_BURST_WINDOW_MS;
  const burstLimit = Number.isFinite(guard.burstLimit) ? guard.burstLimit : DEFAULT_BURST_LIMIT;
  const repeatLimit = Number.isFinite(guard.repeatLimit) ? guard.repeatLimit : DEFAULT_REPEAT_LIMIT;
  const linkWindow = Number.isFinite(guard.linkWindow) ? guard.linkWindow : DEFAULT_LINK_WINDOW_MS;
  const linkBurstLimit = Number.isFinite(guard.linkBurstLimit) ? guard.linkBurstLimit : DEFAULT_LINK_BURST_LIMIT;
  const scoreThreshold = Number.isFinite(guard.scoreThreshold) ? guard.scoreThreshold : DEFAULT_SCORE_THRESHOLD;
  const enableAdvanced = guard.strictMode !== false;
  const threshold = Number.isFinite(guard.threshold) && guard.threshold > 0 ? guard.threshold : DEFAULT_THRESHOLD_MS;
  const quickDeleteHit = guard.detectQuickDelete && Number.isFinite(ttlMs) && ttlMs > 0 && ttlMs < threshold;

  let score = 0;
  const reasons = [];

  const heavyMode = guard.heavyMode === true;

  if (guard.detectQuickDelete && quickDeleteHit) {
    score = Math.max(score, 35);
    reasons.push(`TTL ${formatDuration(ttlMs)} < ${formatDuration(threshold)}`);
  }

  if (guard.detectCardMessage && cardDetected) {
    score = Math.max(score, CARD_SUSPICION_SCORE);
    reasons.push("Gửi danh thiếp/danh bạ khả nghi");
  }

  if (guard.detectSensitiveImage && nsfwResult) {
    score = Math.max(score, 90);
    reasons.push(`Ảnh nhạy cảm (${nsfwResult.label || "Không xác định"} ${formatNsfwProbability(nsfwResult.score)})`);
  }

  if (enableAdvanced && guard.detectBurstSpam) {
    const recent = state.messages.filter((msg) => now - msg.timestamp <= burstWindow);
    if (recent.length >= burstLimit) {
      const extra = recent.length - burstLimit;
      score += 25 + Math.min(extra * 5, 20);
      reasons.push(`Spam nhanh ${recent.length}/${burstLimit} trong ${formatDuration(burstWindow)}`);
    }
  }

  if (enableAdvanced && guard.detectRepeats) {
    const contentHash = content.trim().toLowerCase();
    const duplicateMessages = state.messages.filter((msg) => {
      return msg.contentHash === contentHash && now - msg.timestamp <= burstWindow * 2;
    }).length;
    if (duplicateMessages >= repeatLimit) {
      score += 20 + Math.min((duplicateMessages - repeatLimit) * 5, 20);
      reasons.push(`Lặp lại nội dung ${duplicateMessages}/${repeatLimit}`);
    }

    if (heavyMode && signature) {
      const signatureRepeats = state.messages.filter((msg) => {
        return msg.signature === signature && now - msg.timestamp <= Math.max(25_000, burstWindow * 3);
      }).length;
      if (signatureRepeats >= 2) {
        score += 22 + Math.min((signatureRepeats - 2) * 6, 20);
        reasons.push(`Nội dung na ná (same-same) ${signatureRepeats} lần`);
      }
    }

    const duplicateTokens = countDuplicateTokens(tokens);
    if (duplicateTokens >= 2) {
      score += 10 + Math.min((duplicateTokens - 2) * 3, 15);
      reasons.push("Lặp từ khóa quá nhiều");
    }
  }

  if (guard.detectLinkStorm && hasLink) {
    const activeLinks = state.lastLinks.filter((ts) => now - ts <= linkWindow);
    if (enableAdvanced && activeLinks.length >= linkBurstLimit) {
      const extra = activeLinks.length - linkBurstLimit;
      score += 25 + Math.min(extra * 5, 20);
      reasons.push(`Spam link ${activeLinks.length}/${linkBurstLimit}`);
    } else {
      score += heavyMode ? 18 : 5;
      reasons.push(highRiskLink ? "Chứa link rủ rê/nhóm" : "Chứa đường link");
    }
  }

  if (enableAdvanced && phoneSpam) {
    score += heavyMode ? 25 : 12;
    reasons.push("Chứa chuỗi số giống spam SĐT");
  }

  if (enableAdvanced && garbageRun) {
    score += heavyMode ? 18 : 8;
    reasons.push("Ký tự lặp bất thường");
  }

  if (heavyMode && botPrefix) {
    score += hasLink ? 35 : 22;
    reasons.push(hasLink ? "Prefix bot + link" : "Prefix bot");
    const trimmed = content.trim();
    if (trimmed.length <= 30) {
      score += 10;
      reasons.push("Prefix bot + tin nhắn ngắn");
    }

    score = Math.max(score, 45);
  }

  if (heavyMode && hasLink) {
    const trimmed = content.trim();
    const tokenCount = tokens.length;
    if (highRiskLink) {
      score = Math.max(score, 55);
    }
    if (trimmed.length <= 25 || tokenCount <= 4) {
      score = Math.max(score, 45);
      reasons.push("Link + tin nhắn ngắn");
    }
  }

  if (enableAdvanced && isSuspiciousLength(content)) {
    score += 8;
    reasons.push("Độ dài tin nhắn bất thường");
  }

  if (guard.detectQuickDelete) {
    const shortTTLCount = state.messages.filter((msg) => Number.isFinite(msg.ttl) && msg.ttl > 0 && msg.ttl < guard.threshold).length;
    if (enableAdvanced && shortTTLCount >= Math.max(3, repeatLimit)) {
      score += 8;
      reasons.push("Nhiều tin tự xóa gần đây");
    }
  }

  score = Math.min(score, 100);

  const uniqueReasons = Array.from(new Set(reasons)).slice(0, 5);
  const isSuspicious = score >= scoreThreshold
    || quickDeleteHit
    || (guard.detectCardMessage && cardDetected)
    || (guard.detectSensitiveImage && !!nsfwResult)
    || (heavyMode && (highRiskLink || (hasLink && score >= Math.min(45, scoreThreshold))));

  return {
    suspicionScore: score,
    isSuspicious,
    reasons: uniqueReasons,
    quickDeleteHit,
    cardDetected: guard.detectCardMessage && cardDetected,
    msgType: msgType ? String(msgType) : "",
    nsfwDetected: guard.detectSensitiveImage && !!nsfwResult,
    nsfwInfo: nsfwResult
      ? {
          label: nsfwResult.label,
          score: nsfwResult.score,
          host: nsfwResult.host
        }
      : null
  };
}

function recordPatternState(state, guard, timestamp, content, tokens, hasLink, ttlMs) {
  const contentHash = content.trim().toLowerCase();
  const signature = normalizeForSimilarity(content);
  state.messages.push({
    timestamp,
    contentHash,
    signature,
    length: content.length,
    ttl: Number.isFinite(ttlMs) ? ttlMs : null
  });
  if (state.messages.length > MAX_PATTERN_HISTORY) {
    state.messages = state.messages.slice(-MAX_PATTERN_HISTORY);
  }

  const linkWindow = Number.isFinite(guard.linkWindow) ? guard.linkWindow : DEFAULT_LINK_WINDOW_MS;
  if (hasLink) {
    state.lastLinks.push(timestamp);
  }
  state.lastLinks = state.lastLinks.filter((ts) => timestamp - ts <= linkWindow);

  state.tokens = tokens;
}

function recordViolation(threadId, senderId) {
  const key = `${threadId}:${senderId}`;
  const now = Date.now();

  if (!userViolations.has(key)) {
    userViolations.set(key, { count: 0, firstTime: now, lastTime: now });
  }

  const violation = userViolations.get(key);

  if (now - violation.lastTime > VIOLATION_RESET_MS) {
    violation.count = 0;
    violation.firstTime = now;
  }

  violation.count += 1;
  violation.lastTime = now;

  return violation;
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function collectMessageIdentifiers(event = {}) {
  const ids = new Set();
  const { data = {}, messageID, messageId } = event;
  [data.msgId, data.cliMsgId, data.globalMsgId, messageID, messageId].forEach(id => {
    if (id != null) {
      const str = String(id).trim();
      if (str && str !== 'undefined') ids.add(str);
    }
  });
  return Array.from(ids);
}

async function deleteSuspiciousMessage(api, event) {
  const { threadId, type } = event || {};
  if (!threadId || !type || typeof api?.deleteMessage !== 'function') return false;

  const ids = collectMessageIdentifiers(event);
  if (ids.length === 0) return false;

  let deleted = false;
  const payload = {
    threadId,
    type,
    data: {
      msgId: event?.data?.msgId,
      cliMsgId: event?.data?.cliMsgId,
      uidFrom: event?.data?.uidFrom
    }
  };

  const attempts = [
    async () => { await api.deleteMessage(payload, false); return true; },
    async () => { for (const id of ids) { await api.deleteMessage(id); return true; } return false; },
    async () => { for (const id of ids) { await api.deleteMessage(threadId, id); return true; } return false; },
    async () => {
      if (typeof api.unsendMessage === 'function') {
        for (const id of ids) {
          await api.unsendMessage(id);
          return true;
        }
      }
      return false;
    }
  ];

  for (const attempt of attempts) {
    try {
      deleted = await attempt();
      if (deleted) break;
    } catch {
      continue;
    }
  }

  return deleted;
}

async function kickUser(api, threadId, senderId) {
  const attempts = [
    {
      name: 'removeUserFromGroup(string)',
      fn: async () => {
        if (typeof api?.removeUserFromGroup === 'function') {
          await api.removeUserFromGroup(senderId, threadId);
          return true;
        }
        return false;
      }
    },
    {
      name: 'removeUserFromGroup(array)',
      fn: async () => {
        if (typeof api?.removeUserFromGroup === 'function') {
          await api.removeUserFromGroup([senderId], threadId);
          return true;
        }
        return false;
      }
    },
    {
      name: 'kickUsersInGroup',
      fn: async () => {
        if (typeof api?.kickUsersInGroup === 'function') {
          await api.kickUsersInGroup(senderId, threadId);
          return true;
        }
        return false;
      }
    },
    {
      name: 'removeParticipant(threadId, user)',
      fn: async () => {
        if (typeof api?.removeParticipant === 'function') {
          await api.removeParticipant(threadId, senderId);
          return true;
        }
        return false;
      }
    },
    {
      name: 'removeParticipant(user)',
      fn: async () => {
        if (typeof api?.removeParticipant === 'function') {
          await api.removeParticipant(senderId);
          return true;
        }
        return false;
      }
    },
    {
      name: 'removeMember',
      fn: async () => {
        if (typeof api?.removeMember === 'function') {
          await api.removeMember(threadId, senderId);
          return true;
        }
        return false;
      }
    },
    {
      name: 'removeUserFromThread',
      fn: async () => {
        if (typeof api?.removeUserFromThread === 'function') {
          await api.removeUserFromThread(threadId, senderId);
          return true;
        }
        return false;
      }
    },
    {
      name: 'kick',
      fn: async () => {
        if (typeof api?.kick === 'function') {
          await api.kick(senderId, threadId);
          return true;
        }
        return false;
      }
    }
  ];

  const errors = [];

  for (const attempt of attempts) {
    try {
      const worked = await attempt.fn();
      if (worked) {
        return { success: true, method: attempt.name, errors };
      }
    } catch (error) {
      errors.push(`${attempt.name}: ${error?.message || error}`);
    }
  }

  return { success: false, method: null, errors };
}

module.exports.run = async function ({ args, event, api, Threads }) {
  const { threadId, type } = event || {};
  if (!threadId) return;

  const threadData = await Threads.getData(threadId);
  const guard = ensureGuard(threadData);

  const subCommand = (args[0] || "").toLowerCase();

  if (!subCommand) {
    const shouldEnable = !(guard.enabled && guard.heavyMode);
    guard.heavyMode = shouldEnable;
    guard.enabled = shouldEnable;
    if (shouldEnable) {
      guard.heavySilent = false;
      guard.strictMode = true;
      guard.autoKick = true;
      guard.violationLimit = 1;
      guard.scoreThreshold = 25;
      guard.burstLimit = 3;
      guard.burstWindow = 6000;
      guard.repeatLimit = 2;
      guard.linkBurstLimit = 1;
      guard.linkWindow = 15000;
      guard.detectQuickDelete = true;
      guard.detectBurstSpam = true;
      guard.detectRepeats = true;
      guard.detectLinkStorm = true;
      guard.detectCardMessage = true;
    }

    await Threads.setData(threadId, threadData.data);
    return sendReply(api, threadId, type, `${shouldEnable ? "💥" : "🔕"} AntiBot ${shouldEnable ? "BAT (CHE DO NANG)" : "TAT"}`);
  }

  if (["help", "?"].includes(subCommand)) {
    const guide = [
      "🛡️ Anti-Bot Guard v2.0 - Advanced",
      "━━━━━━━━━━━━━━━━━━━━",
      "📌 Lenh co ban:",
      "• antibot - Bat/Tat che do NANG nhanh",
      "• antibot on - Bat che do bao ve",
      "• antibot off - Tat chuc nang",
      "• antibot status - Xem trang thai chi tiet",
      "• antibot heavy on/off - Che do NANG (bot rải la kick lien)",
      "",
      "⚙️ Cau hinh nang cao:",
      "• antibot threshold <gia tri>",
      "• antibot strict <on|off>",
      "• antibot autokick <on|off>",
      "• antibot nsfw <on|off>",
      "• antibot nsfwthreshold <0.5-0.99>",
      "• antibot limit <so> (mac dinh 3)",
      "",
      "👥 Whitelist:",
      "• antibot whitelist add @user",
      "• antibot whitelist remove @user",
      "• antibot whitelist list",
      "",
      "📊 Thong ke:",
      "• antibot stats",
      "• antibot kick @user",
      "",
      "🔥 Mac dinh: Phat hien tin nhan tu xoa < 1000 giay"
    ].join("\n");
    return sendReply(api, threadId, type, guide);
  }

  if (subCommand === "on") {
    guard.enabled = true;
    await Threads.setData(threadId, threadData.data);
    const msg = [
      "✅ Da bat Anti-Bot Guard v2.0!",
      `🎯 Nguong phat hien: ${formatDuration(guard.threshold)}`,
      `🔒 Strict Mode: ${guard.strictMode ? "BAT" : "TAT"}`,
      `⚡ Auto-kick: ${guard.autoKick ? "BAT" : "TAT"}`,
      `📈 Gioi han vi pham: ${guard.violationLimit} lan`
    ].join("\n");
    return sendReply(api, threadId, type, msg);
  }

  if (subCommand === "off") {
    guard.enabled = false;
    await Threads.setData(threadId, threadData.data);
    return sendReply(api, threadId, type, "🔕 Da tat Anti-Bot Guard");
  }

  if (subCommand === "status") {
    const { enabled, threshold, whitelist, autoKick, strictMode, violationLimit, detectionLog } = guard;
    const recentDetections = (detectionLog || []).slice(-5);

    const statusLines = [
      "📊 Trang thai Anti-Bot Guard v2.0",
      "━━━━━━━━━━━━━━━━━━━━",
      `🔘 Trang thai: ${enabled ? "🟢 DANG HOAT DONG" : "🔴 TAT"}`,
      `💥 Heavy mode: ${guard.heavyMode ? "🟢 BAT" : "🔴 TAT"}`,
      `🎯 Nguong phat hien: ${formatDuration(threshold)}`,
      `🔒 Strict Mode: ${strictMode ? "🟢 BAT" : "🔴 TAT"}`,
      `⚡ Auto-kick: ${autoKick ? "🟢 BAT" : "🔴 TAT"}`,
      `🧠 Anh nhay cam: ${guard.detectSensitiveImage ? "🟢 BAT" : "🔴 TAT"}`,
      `🎚️ Nguong NSFW: ${formatNsfwProbability(guard.nsfwThreshold || DEFAULT_NSFW_THRESHOLD)}`,
      `📈 Gioi han vi pham: ${violationLimit} lan`,
      `👥 Whitelist: ${whitelist.length} thanh vien`,
      `🚨 Tong phat hien: ${detectionLog.length} lan`
    ];

    if (recentDetections.length > 0) {
      statusLines.push("", "📋 5 phat hien gan nhat:");
      recentDetections.forEach((log, idx) => {
        statusLines.push(`${idx + 1}. ${log.name} - TTL: ${formatDuration(log.ttl)} - ${formatTimestamp(log.time)}`);
      });
    }

    return sendReply(api, threadId, type, statusLines.join("\n"));
  }

  if (subCommand === "threshold" || subCommand === "set") {
    const raw = args[1];
    if (!raw) {
      return sendReply(api, threadId, type, "⚠️ Vui long nhap gia tri. VD: antibot threshold 500s");
    }
    const parsed = parseDuration(raw, guard.threshold);
    if (!parsed || parsed < 1000) {
      return sendReply(api, threadId, type, "❌ Gia tri khong hop le. Toi thieu 1s (1000ms).");
    }
    guard.threshold = parsed;
    await Threads.setData(threadId, threadData.data);
    return sendReply(api, threadId, type, `✅ Nguong phat hien moi: ${formatDuration(parsed)}`);
  }

  if (subCommand === "strict") {
    const toggle = (args[1] || "").toLowerCase();
    if (!["on", "off"].includes(toggle)) {
      return sendReply(api, threadId, type, "⚠️ Dung: antibot strict <on|off>");
    }
    guard.strictMode = toggle === "on";
    await Threads.setData(threadId, threadData.data);
    return sendReply(api, threadId, type, `${guard.strictMode ? "🔒" : "🔓"} Strict Mode ${guard.strictMode ? "BAT" : "TAT"}`);
  }

  if (subCommand === "autokick") {
    const toggle = (args[1] || "").toLowerCase();
    if (!["on", "off"].includes(toggle)) {
      return sendReply(api, threadId, type, "⚠️ Dung: antibot autokick <on|off>");
    }
    guard.autoKick = toggle === "on";
    await Threads.setData(threadId, threadData.data);
    return sendReply(api, threadId, type, `${guard.autoKick ? "⚡" : "🔕"} Auto-kick ${guard.autoKick ? "BAT" : "TAT"}`);
  }

  if (subCommand === "heavy" || subCommand === "hard") {
    const toggle = (args[1] || "").toLowerCase();
    if (!['on', 'off', '1', '0'].includes(toggle)) {
      return sendReply(api, threadId, type, "⚠️ Dung: antibot heavy <on|off>");
    }

    const enable = toggle === 'on' || toggle === '1';
    guard.heavyMode = enable;
    if (enable) {
      guard.enabled = true;
      guard.heavySilent = false;
      guard.strictMode = true;
      guard.autoKick = true;
      guard.violationLimit = 1;
      guard.scoreThreshold = 25;
      guard.burstLimit = 3;
      guard.burstWindow = 6000;
      guard.repeatLimit = 2;
      guard.linkBurstLimit = 1;
      guard.linkWindow = 15000;
      guard.detectQuickDelete = true;
      guard.detectBurstSpam = true;
      guard.detectRepeats = true;
      guard.detectLinkStorm = true;
      guard.detectCardMessage = true;
    }

    await Threads.setData(threadId, threadData.data);
    return sendReply(api, threadId, type, `${guard.heavyMode ? "💥" : "🔕"} Heavy mode ${guard.heavyMode ? "BAT" : "TAT"}`);
  }

  if (subCommand === "heavysilent" || subCommand === "silentheavy") {
    const toggle = (args[1] || "").toLowerCase();
    if (!['on', 'off', '1', '0'].includes(toggle)) {
      return sendReply(api, threadId, type, "⚠️ Dung: antibot heavysilent <on|off>");
    }
    guard.heavySilent = toggle === 'on' || toggle === '1';
    await Threads.setData(threadId, threadData.data);
    return sendReply(api, threadId, type, `${guard.heavySilent ? "🤫" : "📣"} Heavy silent ${guard.heavySilent ? "BAT" : "TAT"}`);
  }

  if (subCommand === "nsfw") {
    if (!nsfwSupportAvailable) {
      return sendReply(api, threadId, type, "⚠️ Không thể bật - module anti18plus chưa sẵn sàng.");
    }
    const toggle = (args[1] || "").toLowerCase();
    if (!["on", "off"].includes(toggle)) {
      return sendReply(api, threadId, type, "⚠️ Dung: antibot nsfw <on|off>");
    }
    guard.detectSensitiveImage = toggle === "on";
    await Threads.setData(threadId, threadData.data);
    return sendReply(api, threadId, type, `${guard.detectSensitiveImage ? "🧠" : "🛑"} NSFW ${guard.detectSensitiveImage ? "BAT" : "TAT"}`);
  }

  if (subCommand === "nsfwthreshold") {
    if (!nsfwSupportAvailable) {
      return sendReply(api, threadId, type, "⚠️ Không thể chỉnh - module anti18plus chưa sẵn sàng.");
    }
    const raw = args[1];
    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value) || value < 0.5 || value >= 1) {
      return sendReply(api, threadId, type, "⚠️ Nhap so tu 0.5 den 0.99. VD: antibot nsfwthreshold 0.9");
    }
    guard.nsfwThreshold = value;
    await Threads.setData(threadId, threadData.data);
    return sendReply(api, threadId, type, `✅ Nguong NSFW moi: ${formatNsfwProbability(value)}`);
  }

  if (subCommand === "limit") {
    const value = parseInt(args[1], 10);
    if (!value || value < 1 || value > 10) {
      return sendReply(api, threadId, type, "⚠️ Nhap so tu 1-10. VD: antibot limit 3");
    }
    guard.violationLimit = value;
    await Threads.setData(threadId, threadData.data);
    return sendReply(api, threadId, type, `✅ Gioi han vi pham: ${value} lan`);
  }

  if (subCommand === "stats") {
    const logs = guard.detectionLog || [];
    if (logs.length === 0) {
      return sendReply(api, threadId, type, "📊 Chua co phat hien nao.");
    }

    const userStats = {};
    logs.forEach(log => {
      if (!userStats[log.uid]) {
        userStats[log.uid] = { name: log.name, count: 0, totalTTL: 0 };
      }
      userStats[log.uid].count += 1;
      userStats[log.uid].totalTTL += log.ttl;
    });

    const sorted = Object.entries(userStats)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);

    const lines = [
      "📊 Thong ke Anti-Bot (Top 10)",
      "━━━━━━━━━━━━━━━━━━━━",
      `📈 Tong phat hien: ${logs.length} lan`,
      `👤 So user vi pham: ${Object.keys(userStats).length}`,
      "",
      "🏆 Top vi pham"
    ];

    sorted.forEach(([uid, data], idx) => {
      const avgTTL = Math.round(data.totalTTL / data.count);
      lines.push(`${idx + 1}. ${data.name}`);
      lines.push(`   • Vi pham: ${data.count} | TTL TB: ${formatDuration(avgTTL)}`);
    });

    return sendReply(api, threadId, type, lines.join("\n"));
  }

  if (subCommand === "kick") {
    const ids = extractIdsFromMentions(event);
    if (!ids.length) {
      return sendReply(api, threadId, type, "⚠️ Tag nguoi can kick. VD: antibot kick @user");
    }

    try {
      for (const uid of ids) {
        await kickUser(api, threadId, uid);
      }
      return sendReply(api, threadId, type, `✅ Da kick ${ids.length} thanh vien nghi ngo!`);
    } catch (error) {
      return sendReply(api, threadId, type, `❌ Khong the kick: ${error.message}`);
    }
  }

  if (subCommand === "whitelist") {
    const action = (args[1] || "").toLowerCase();
    if (!["add", "remove", "list"].includes(action)) {
      return sendReply(api, threadId, type, "⚠️ Dung: antibot whitelist <add|remove|list>");
    }

    if (action === "list") {
      const list = guard.whitelist;
      if (!list.length) {
        return sendReply(api, threadId, type, "📭 Whitelist dang rong.");
      }
      const lines = list.map((uid, idx) => `${idx + 1}. UID: ${uid}`);
      const msg = ["📜 Danh sach Whitelist:", "━━━━━━━━━━━━━━━━━━━━", ...lines].join("\n");
      return sendReply(api, threadId, type, msg);
    }

    const ids = extractIdsFromMentions(event);
    if (!ids.length && args[2]) {
      ids.push(String(args[2]));
    }

    if (!ids.length) {
      return sendReply(api, threadId, type, "⚠️ Tag hoac nhap UID can xu ly.");
    }

    let changed = false;

    if (action === "add") {
      for (const uid of ids) {
        if (!guard.whitelist.includes(uid)) {
          guard.whitelist.push(uid);
          changed = true;
        }
      }
      if (changed) {
        await Threads.setData(threadId, threadData.data);
        return sendReply(api, threadId, type, `✅ Da them ${ids.length} nguoi vao Whitelist.`);
      }
      return sendReply(api, threadId, type, "ℹ️ Tat ca UID da co trong Whitelist.");
    }

    if (action === "remove") {
      const before = guard.whitelist.length;
      guard.whitelist = guard.whitelist.filter(uid => !ids.includes(uid));
      if (guard.whitelist.length !== before) {
        await Threads.setData(threadId, threadData.data);
        return sendReply(api, threadId, type, `✅ Da xoa ${ids.length} nguoi khoi Whitelist.`);
      }
      return sendReply(api, threadId, type, "ℹ️ Khong tim thay UID trong Whitelist.");
    }
  }

  return sendReply(api, threadId, type, "❓ Lenh khong hop le. Dung 'antibot help' de xem huong dan.");
};

module.exports.handleEvent = async function ({ event, api, Threads, eventType }) {
  if (eventType !== "message") return;

  const { threadId, type, data } = event || {};
  if (!threadId) return;

  let threadData;
  try {
    threadData = await Threads.getData(threadId);
  } catch {
    return;
  }
  const guard = threadData?.data?.antiBotGuard;
  if (!guard?.enabled) return;

  if (!data) return;

  const senderId = data.uidFrom ? String(data.uidFrom) : "";
  if (!senderId) return;

  const botId = getBotId(api);
  if (botId && senderId === botId) return;

  if (isBotStaffUid(senderId)) return;

  if (Array.isArray(guard.whitelist) && guard.whitelist.includes(senderId)) return;

  const ttlRaw = data.ttl;
  const ttlValue = typeof ttlRaw === "number" ? ttlRaw : Number(ttlRaw);
  const normalizedTtl = Number.isFinite(ttlValue) && ttlValue > 0 ? ttlValue : null;
  const threshold = Number.isFinite(guard.threshold) && guard.threshold > 0 ? guard.threshold : DEFAULT_THRESHOLD_MS;

  const cardDetected = guard.detectCardMessage && isCardMessageData(data);
  const quickDeleteHit = guard.detectQuickDelete && normalizedTtl != null && normalizedTtl < threshold;
  const msgContent = data.msg || data.body || data.content || "";
  const msgType = data.msgType || data.type || "";

  if (isValidCommandMessage(msgContent)) return;

  const stickerDetected = isStickerMessageData(data);
  if (stickerDetected) {
    const contentText = typeof msgContent === "string" ? msgContent.trim() : safeToString(msgContent).trim();
    if (!contentText || contentText.length <= 1) {
      return;
    }
  }

  let nsfwResult = null;
  const maybeHasMedia = (
    (data.content && typeof data.content === "object") ||
    Array.isArray(data.attachments) ||
    Array.isArray(data?.propertyExt?.attachments) ||
    Array.isArray(data?.propertyExt?.mediaList) ||
    typeof data.image_url === "string" ||
    (typeof msgType === "string" && /image|photo|media/i.test(msgType))
  );

  if (nsfwSupportAvailable && guard.detectSensitiveImage && maybeHasMedia) {
    try {
      const thresholdOption = Number.isFinite(guard.nsfwThreshold) && guard.nsfwThreshold > 0 && guard.nsfwThreshold < 1
        ? guard.nsfwThreshold
        : DEFAULT_NSFW_THRESHOLD;
      nsfwResult = await scanForNsfw(event, {
        threshold: thresholdOption,
        logErrors: true
      });
    } catch (error) {
      console.warn('[antibot] NSFW scan failed:', error?.message || error);
    }
  }

  let patternAnalysis;
  if (guard.strictMode) {
    patternAnalysis = analyzeMessagePattern(guard, senderId, {
      ttlMs: normalizedTtl,
      messageContent: msgContent,
      cardDetected,
      msgType,
      nsfwResult
    });
  } else {
    const reasons = [];
    let suspicionScore = 0;
    if (quickDeleteHit) {
      suspicionScore = Math.max(suspicionScore, 35);
      reasons.push(`TTL ${formatDuration(normalizedTtl)} < ${formatDuration(threshold)}`);
    }
    if (cardDetected) {
      suspicionScore = Math.max(suspicionScore, CARD_SUSPICION_SCORE);
      reasons.push("Gửi danh thiếp/danh bạ khả nghi");
    }
    if (guard.detectSensitiveImage && nsfwResult) {
      suspicionScore = Math.max(suspicionScore, 90);
      reasons.push(`Ảnh nhạy cảm (${nsfwResult.label || "Không xác định"} ${formatNsfwProbability(nsfwResult.score)})`);
    }
    patternAnalysis = {
      suspicionScore,
      isSuspicious: quickDeleteHit || cardDetected || !!nsfwResult,
      reasons,
      quickDeleteHit,
      cardDetected,
      msgType,
      nsfwDetected: guard.detectSensitiveImage && !!nsfwResult,
      nsfwInfo: nsfwResult
        ? {
            label: nsfwResult.label,
            score: nsfwResult.score,
            host: nsfwResult.host
          }
        : null
    };
  }

  const isSuspicious = patternAnalysis.isSuspicious || quickDeleteHit || cardDetected || !!nsfwResult;
  if (!isSuspicious) {
    return;
  }

  const alertKey = `${threadId}:${senderId}`;
  const now = Date.now();
  const lastAlert = recentAlerts.get(alertKey) || 0;
  if (now - lastAlert < ALERT_COOLDOWN_MS) return;
  recentAlerts.set(alertKey, now);

  const violation = recordViolation(threadId, senderId);
  const requiredViolations = guard.heavyMode ? 1 : guard.violationLimit;

  const displayName = (data.dName || data.displayName || `UID ${senderId}`).trim();
  const nameTag = `@${displayName}`;
  const ttlText = normalizedTtl != null ? formatDuration(normalizedTtl) : "N/A";

  if (!Array.isArray(guard.detectionLog)) {
    guard.detectionLog = [];
  }
  guard.detectionLog.push({
    uid: senderId,
    name: displayName,
    ttl: normalizedTtl,
    time: now,
    suspicionScore: patternAnalysis.suspicionScore,
    reasons: Array.isArray(patternAnalysis.reasons) ? patternAnalysis.reasons.slice(0, 5) : [],
    cardDetected: !!patternAnalysis.cardDetected,
    quickDelete: !!patternAnalysis.quickDeleteHit,
    msgType: patternAnalysis.msgType || msgType || "",
    nsfwDetected: !!patternAnalysis.nsfwDetected,
    nsfwInfo: patternAnalysis.nsfwInfo
  });
  if (guard.detectionLog.length > 100) {
    guard.detectionLog = guard.detectionLog.slice(-100);
  }

  try {
    await Threads.setData(threadId, threadData.data);
  } catch {}

  await deleteSuspiciousMessage(api, event);

  if (guard.heavyMode && guard.heavySilent) {
    if (violation.count >= requiredViolations && guard.autoKick) {
      try {
        await kickUser(api, threadId, senderId);
      } catch {}
    }
    return;
  }

  const lines = [
    "🚨 ═══ PHAT HIEN BOT ═══ 🚨",
    "",
    "⚠️ Nhom nay cam bot!",
    `👤 Phat hien: ${nameTag}`,
    `⏱️ TTL tin nhan: ${ttlText}`,
    `🔴 So lan vi pham: ${violation.count}/${guard.violationLimit}`
  ];

  if (patternAnalysis.nsfwDetected && patternAnalysis.nsfwInfo) {
    const info = patternAnalysis.nsfwInfo;
    const hostText = info.host || 'nguon an';
    lines.push(`📸 AI phat hien: ${info.label || 'Khong xac dinh'} ${formatNsfwProbability(info.score)} (${hostText})`);
  }

  if (patternAnalysis.suspicionScore) {
    lines.push(`🔍 Do nghi ngo: ${patternAnalysis.suspicionScore}/100`);
  }

  if (patternAnalysis.msgType) {
    lines.push(`🧩 Loai tin: ${patternAnalysis.msgType}`);
  }

  lines.push("");

  if (Array.isArray(patternAnalysis.reasons) && patternAnalysis.reasons.length) {
    lines.push("📌 Ly do nghi ngo:");
    patternAnalysis.reasons.slice(0, 3).forEach((reason, idx) => {
      lines.push(`   ${idx + 1}. ${reason}`);
    });
    lines.push("");
  }

  let kicked = false;
  if (violation.count >= requiredViolations) {
    if (guard.autoKick) {
      lines.push(`💥 Da dat ${requiredViolations} vi pham - dang kick...`);
      try {
        const kickResult = await kickUser(api, threadId, senderId);
        kicked = kickResult?.success === true;
        lines.push(kicked ? "✅ Da kick thanh cong!" : "❌ Kick that bai (bot can quyen admin)");
      } catch (error) {
        lines.push(`❌ Kick that bai: ${error.message}`);
      }
    } else {
      lines.push(`🔴 Da vi pham ${requiredViolations} lan! Admin hay kick ${nameTag}`);
    }
  } else {
    const remaining = requiredViolations - violation.count;
    lines.push(`⏳ Con ${remaining} lan nua se bi kick!`);
    lines.push(`💡 Neu la nguoi that, dung: antibot whitelist add ${nameTag}`);
  }

  const msg = lines.join("\n");
  const mentionPos = msg.indexOf(nameTag);
  const mentions = mentionPos >= 0 ? [{ uid: senderId, len: nameTag.length, pos: mentionPos }] : [];

  try {
    await api.sendMessage({ msg, mentions, ttl: NOTICE_TTL_MS }, threadId, type);
  } catch (error) {
    console.error('[antibot] Khong the gui canh bao:', error?.message || error);
  }

  if (!kicked && violation.count >= guard.violationLimit && guard.autoKick) {
    lines.push("🛠️ Admin co the dung: antibot kick @user");
  }
};
