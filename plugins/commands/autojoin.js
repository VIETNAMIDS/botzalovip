const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");
const { ThreadType, TextStyle } = require("zca-js");
const { createCanvas, loadImage } = require("canvas");
const sharp = require("sharp");

const alreadyMemberPatterns = [
  /already (?:a )?member/i,
  /đã là thành viên/i,
  /tất cả đã là thành viên/i,
  /đã là thành viên/i,
  /bot đã ở trong nhóm/i
];

const AUTO_JOIN_PATTERNS = {
  ZALO_GROUP: /(?:https?:\/\/)?(?:www\.)?zalo\.me\/g\/([a-zA-Z0-9]+)/gi,
  ZALO_INVITE: /(?:https?:\/\/)?(?:www\.)?zalo\.me\/s\/([a-zA-Z0-9]+)/gi,
  MESSENGER_GROUP: /(?:https?:\/\/)?(?:www\.)?(?:m\.)?facebook\.com\/messages\/t\/([0-9]+)/gi,
  TELEGRAM_GROUP: /(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(?:joinchat\/)?([a-zA-Z0-9_-]+)/gi,
  DISCORD_INVITE: /(?:https?:\/\/)?(?:www\.)?discord\.(?:gg|com\/invite)\/([a-zA-Z0-9]+)/gi,
  WHATSAPP_GROUP: /(?:https?:\/\/)?(?:www\.)?(?:chat\.whatsapp\.com|wa\.me)\/(?:invite\/)?([a-zA-Z0-9]+)/gi
};

const AUTO_JOIN_COOLDOWN = 0;
const AUTO_JOIN_LINK_COOLDOWN = 5 * 60 * 1000; // 5 phút giữa các lần thử cùng 1 link
const LINK_COOLDOWN_CLEANUP_INTERVAL = 60 * 1000;
const recentLinkAttempts = new Map();
let linkCooldownCleanupTimer = null;
const pendingAutoJoinConfirmations = new Map();
const AUTOJOIN_CONFIRM_RTYPE = 5;
const AUTOJOIN_CONFIRM_TTL = 30 * 1000;
const AUTOJOIN_CONFIRM_CLEANUP_INTERVAL = 5 * 1000;
let autoJoinConfirmCleanupTimer = null;

const AUTO_JOIN_DATA_PATH = path.join(__dirname, "../../temp/autojoin_data.json");
const AUTO_JOIN_STATS_PATH = path.join(__dirname, "../../temp/autojoin_stats.json");
const COLOR_MESSAGE_TTL = 60000;
const COLOR_MAX_STYLE_SEGMENTS = 12;
const COLOR_PALETTE = TextStyle
  ? [TextStyle.Yellow, TextStyle.Orange, TextStyle.Red, TextStyle.Green]
  : null;
const GROUP_CACHE_TTL = 3 * 60 * 1000; // 3 phút
const RESOLVED_GROUP_CACHE = new Map(); // groupId -> { name, expires }

async function applyAutoJoinFlagToAllThreads(Threads, enabled) {
  if (!Threads || typeof Threads.getAll !== 'function' || typeof Threads.setData !== 'function') {
    return 0;
  }

  let records;
  try {
    const maybePromise = Threads.getAll();
    records = Array.isArray(maybePromise) ? maybePromise : await maybePromise;
  } catch (error) {
    console.warn('[AUTOJOIN] Threads.getAll apply error:', error?.message || error);
    return 0;
  }

  if (!Array.isArray(records) || records.length === 0) {
    return 0;
  }

  let updated = 0;

  for (const entry of records) {
    const threadId = entry?.threadId || entry?.id;
    if (!threadId) continue;

    const currentData = entry?.data && typeof entry.data === 'object'
      ? { ...entry.data }
      : {};

    if (currentData.auto_join === enabled) continue;

    currentData.auto_join = enabled;

    try {
      await Promise.resolve(Threads.setData(threadId, currentData));
      updated++;
    } catch (error) {
      console.warn('[AUTOJOIN] Threads.setData apply error:', error?.message || error);
    }
  }

  return updated;
}

function createDefaultAutoJoinSettings() {
  return {
    cooldownTime: AUTO_JOIN_COOLDOWN,
    enabledPlatforms: ['ZALO_GROUP', 'ZALO_INVITE'],
    autoJoinAll: false
  };
}

async function sendColorMessage(api, threadId, type, messageOrOptions = {}, maybeOptions = {}) {
  let options;

  if (typeof messageOrOptions === 'string' || typeof messageOrOptions === 'number') {
    options = { text: String(messageOrOptions), ...maybeOptions };
  } else if (messageOrOptions && typeof messageOrOptions === 'object') {
    options = { ...messageOrOptions };
  } else {
    options = { text: '' };
  }

  const text = typeof options.text === 'string' ? options.text : String(options.text ?? '');
  const mentions = Array.isArray(options.mentions) ? options.mentions : undefined;
  const ttl = options.ttl ?? COLOR_MESSAGE_TTL;
  const hasValidTTL = Number.isFinite(ttl) && ttl > 0;

  if (!TextStyle) {
    const payload = {
      msg: text,
      ...(hasValidTTL ? { ttl } : {}),
      ...(mentions ? { mentions } : {})
    };
    return safeSendMessage(api, payload, threadId, type);
  }

  const payload = {
    msg: text,
    styles: buildMultiColorStyle(text),
    ...(hasValidTTL ? { ttl } : {}),
    ...(mentions ? { mentions } : {})
  };

  try {
    return await api.sendMessage(payload, threadId, type);
  } catch (error) {
    if (shouldStripStyles(error)) {
      const fallback = { ...payload };
      delete fallback.styles;
      try {
        return await api.sendMessage(fallback, threadId, type);
      } catch (fallbackError) {
        console.warn('[AUTOJOIN] Fallback styled send failed:', fallbackError?.message || fallbackError);
        const plainPayload = {
          msg: text,
          ...(hasValidTTL ? { ttl } : {}),
          ...(mentions ? { mentions } : {})
        };
        return safeSendMessage(api, plainPayload, threadId, type);
      }
    }

    console.warn('[AUTOJOIN] sendColorMessage error, fallback to plain text:', error?.message || error);
    const plainPayload = {
      msg: text,
      ...(hasValidTTL ? { ttl } : {}),
      ...(mentions ? { mentions } : {})
    };
    return safeSendMessage(api, plainPayload, threadId, type);
  }
}

function ensureAutoJoinSettings(rawSettings = null) {
  const defaults = createDefaultAutoJoinSettings();
  const settings = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  return {
    cooldownTime: typeof settings.cooldownTime === 'number' ? settings.cooldownTime : defaults.cooldownTime,
    enabledPlatforms: Array.isArray(settings.enabledPlatforms) ? [...settings.enabledPlatforms] : [...defaults.enabledPlatforms],
    autoJoinAll: typeof settings.autoJoinAll === 'boolean' ? settings.autoJoinAll : defaults.autoJoinAll
  };
}

function extractGroupId(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw.data || raw.threadInfo || raw.info || raw;
  const info = data.threadInfo || data.info || {};
  const id = raw.threadId || data.threadId || info.threadId || raw.id || data.id || info.id;
  if (!id) return null;
  return String(id);
}

async function resolveDisplayName(api, Users, userId) {
  if (!userId) return null;
  const uid = String(userId);

  try {
    if (Users && typeof Users.getData === 'function') {
      const record = await Users.getData(uid);
      if (record?.name) {
        const trimmed = String(record.name).trim();
        if (trimmed.length) return trimmed;
      }
    }
  } catch (error) {
    console.warn('[AUTOJOIN] resolveDisplayName via Users failed:', error?.message || error);
  }

  if (api && typeof api.getUserInfo === 'function') {
    try {
      const info = await api.getUserInfo(uid);
      const profile = info?.changed_profiles?.[uid] || info?.[uid] || info;
      const nameCandidates = [
        profile?.displayName,
        profile?.name,
        profile?.fullName,
        profile?.nickname
      ];
      for (const candidate of nameCandidates) {
        if (typeof candidate === 'string' && candidate.trim().length) {
          return candidate.trim();
        }
      }
    } catch (error) {
      console.warn('[AUTOJOIN] resolveDisplayName via api.getUserInfo failed:', error?.message || error);
    }
  }

  return null;
}

async function countBotGroups(api, Threads) {
  const seenIds = new Set();

  if (typeof api.getAllGroups === 'function') {
    try {
      const snapshot = await api.getAllGroups();
      const map = snapshot?.gridVerMap || {};
      for (const [rawId, detail] of Object.entries(map)) {
        if (!rawId) continue;
        const normalizedId = String(rawId);
        const isGroupFlag = detail?.isGroup;
        if (typeof isGroupFlag === 'boolean' && isGroupFlag === false) continue;
        seenIds.add(normalizedId);
      }
      if (seenIds.size > 0) {
        return seenIds.size;
      }
    } catch (error) {
      console.warn('[AUTOJOIN] getAllGroups count error:', error?.message || error);
    }
  }

  if (typeof api.getThreadList === 'function') {
    try {
      const list = await api.getThreadList(300, null, ['GROUP']);
      const threads = list?.threads || list?.data || list || [];
      if (Array.isArray(threads)) {
        threads.forEach(thread => {
          const isGroup = thread?.isGroup === true || thread?.threadKey?.type === 'GROUP' || thread?.type === 'GROUP' || Array.isArray(thread?.participantIDs);
          if (!isGroup) return;
          const id = extractGroupId(thread);
          if (id) seenIds.add(id);
        });
      }
    } catch (error) {
      console.warn('[AUTOJOIN] getThreadList count error:', error?.message || error);
    }
  }

  if (seenIds.size === 0) {
    try {
      if (Threads && typeof Threads.getAll === 'function') {
        const cached = Threads.getAll();
        if (Array.isArray(cached)) {
          cached.forEach(item => {
            const isGroup = item?.data?.isGroup === true || item?.isGroup === true || item?.data?.threadType === 'GROUP';
            const id = extractGroupId(item);
            if (!isGroup || !id) return;
            seenIds.add(id);
          });
        }
      }
    } catch (error) {
      console.warn('[AUTOJOIN] Threads.getAll count error:', error?.message || error);
    }
  }

  return seenIds.size;
}

function buildMultiColorStyle(text) {
  if (!COLOR_PALETTE || !Array.isArray(COLOR_PALETTE) || !COLOR_PALETTE.length) {
    return [];
  }

  const cleanText = typeof text === 'string' ? text : String(text ?? '');
  if (!cleanText.length) {
    return [{ start: 0, len: 0, st: TextStyle.Yellow }];
  }

  const styles = [];
  let cursor = 0;
  const totalLength = cleanText.length;
  const baseChunk = Math.max(1, Math.floor(totalLength / COLOR_MAX_STYLE_SEGMENTS));

  while (cursor < totalLength) {
    const remaining = totalLength - cursor;
    let chunkSize;
    if (styles.length >= COLOR_MAX_STYLE_SEGMENTS - 1) {
      chunkSize = remaining;
    } else {
      const randomBoost = Math.floor(Math.random() * 4);
      chunkSize = Math.min(remaining, Math.max(3, baseChunk + randomBoost));
    }

    const paletteIndex = Math.floor(Math.random() * COLOR_PALETTE.length);
    const style = COLOR_PALETTE[Math.max(0, Math.min(paletteIndex, COLOR_PALETTE.length - 1))];
    styles.push({ start: cursor, len: chunkSize, st: style });
    cursor += chunkSize;
  }

  return styles;
}

function shouldStripStyles(error) {
  const code = error?.code || error?.statusCode;
  return code === 112 || code === 400;
}

function describeJoinReason(result = {}) {
  if (result.success) {
    if (result.alreadyMember) {
      return 'Bot đã có sẵn trong nhóm.';
    }
    return 'Bot đã được admin nhóm duyệt vào.';
  }

  if (result.waitingApproval) {
    return 'Nhóm yêu cầu admin/chủ nhóm duyệt lời mời. Vui lòng chờ được chấp thuận.';
  }

  const errorMsg = result.error || '';
  if (/chặn|block|banned|forbid|denied/i.test(errorMsg)) {
    return 'Admin nhóm đã chặn bot hoặc giới hạn lời mời.';
  }
  if (/hết hạn|expired|invalid|không hợp lệ/i.test(errorMsg)) {
    return 'Link mời không hợp lệ hoặc đã hết hạn.';
  }
  if (/đã là thành viên|already/i.test(errorMsg)) {
    return 'Bot đã có trong nhóm từ trước.';
  }
  if (errorMsg.trim().length) {
    return errorMsg.trim();
  }

  return 'Không rõ. Vui lòng kiểm tra link hoặc quyền hạn nhóm.';
}

function buildJoinOutcomeMessage({
  userName,
  result,
  groupName,
  groupId,
  stats
} = {}) {
  const lines = [];
  lines.push('🌐 AUTOJOIN BONZ');
  lines.push(`👤 Người gửi: ${userName || 'Không xác định'}`);
  lines.push(`📌 Trạng thái: ${result?.success ? '✅ Thành công' : '❌ Thất bại'}`);

  if (groupName || groupId) {
    const namePart = groupName || 'Không rõ tên';
    const idPart = groupId ? ` (${groupId})` : '';
    lines.push(`🏷️ Nhóm: ${namePart}${idPart}`);
  }

  const reason = describeJoinReason(result || {});
  lines.push(`ℹ️ Lý do: ${reason}`);

  const totalJoined = typeof stats?.successfulJoins === 'number' ? stats.successfulJoins : 0;
  lines.push(`📈 Tổng nhóm bot đã tham gia: ${totalJoined}`);

  return lines.join('\n');
}

module.exports.config = {
  name: "autojoin",
  version: "1.0.0",
  role: 1,
  author: "ShinTHL09",
  description: "Quản lý tính năng auto join nhóm Zalo và các platform khác",
  category: "Nhóm",
  usage: "autojoin <on|off|status|history|stats|all>",
  cooldowns: 3,
  dependencies: {
    "canvas": "",
    "sharp": ""
  }
};

// === IMAGE CREATION FUNCTIONS ===

async function createAutoJoinStatusImage(stats, settings, enabled) {
  const canvas = createCanvas(1200, 800);
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, 800);
  gradient.addColorStop(0, '#667eea');
  gradient.addColorStop(0.5, '#764ba2');
  gradient.addColorStop(1, '#f093fb');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1200, 800);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.roundRect(50, 50, 1100, 700, 30);
  ctx.fill();

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 56px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('🤖 AUTO JOIN STATUS', 600, 130);

  let currentY = 200;
  ctx.font = 'bold 40px Arial';
  ctx.fillStyle = enabled ? '#10b981' : '#ef4444';
  ctx.fillText(enabled ? '✅ ĐANG BẬT' : '❌ ĐANG TẮT', 600, currentY);

  currentY = 280;
  const boxWidth = 320;
  const boxHeight = 140;
  const spacing = 50;
  const startX = (1200 - (boxWidth * 3 + spacing * 2)) / 2;

  const statsData = [
    { label: 'Tổng Joins', value: stats.totalJoins || 0, emoji: '🔢', color: '#3b82f6' },
    { label: 'Thành Công', value: stats.successfulJoins || 0, emoji: '✅', color: '#10b981' },
    { label: 'Thất Bại', value: stats.failedJoins || 0, emoji: '❌', color: '#ef4444' }
  ];

  statsData.forEach((stat, index) => {
    const x = startX + (boxWidth + spacing) * index;
    ctx.fillStyle = stat.color;
    ctx.globalAlpha = 0.15;
    ctx.roundRect(x, currentY, boxWidth, boxHeight, 20);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(stat.emoji, x + boxWidth / 2, currentY + 55);

    ctx.font = 'bold 40px Arial';
    ctx.fillStyle = '#000000';
    ctx.fillText(String(stat.value), x + boxWidth / 2, currentY + 100);

    ctx.font = '22px Arial';
    ctx.fillStyle = '#666666';
    ctx.fillText(stat.label, x + boxWidth / 2, currentY + 128);
  });

  currentY = 480;
  ctx.textAlign = 'left';
  const infoX = 120;

  ctx.font = '28px Arial';
  ctx.fillStyle = '#666666';
  ctx.fillText('⏱️ Cooldown:', infoX, currentY);
  ctx.fillStyle = '#000000';
  ctx.fillText(`${Math.floor(settings.cooldownTime / 60000)} phút`, infoX + 200, currentY);

  currentY += 50;
  ctx.font = 'bold 24px Arial';
  ctx.fillStyle = '#999999';
  ctx.textAlign = 'center';
  ctx.fillText('💫 Bonz Mãi VIP', 600, 720);

  return canvas.toBuffer('image/png');
}

async function createAutoJoinStatsImage(stats) {
  const canvas = createCanvas(1200, 1000);
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, 1000);
  gradient.addColorStop(0, '#4facfe');
  gradient.addColorStop(1, '#00f2fe');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1200, 1000);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.roundRect(50, 50, 1100, 900, 30);
  ctx.fill();

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 56px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('📊 THỐNG KÊ AUTO JOIN', 600, 130);

  let currentY = 220;
  const successRate = stats.totalJoins > 0 ? Math.round(stats.successfulJoins / stats.totalJoins * 100) : 0;
  
  ctx.font = 'bold 48px Arial';
  ctx.fillStyle = '#10b981';
  ctx.fillText(`${successRate}%`, 600, currentY);
  
  ctx.font = '28px Arial';
  ctx.fillStyle = '#666666';
  ctx.fillText('Tỷ lệ thành công', 600, currentY + 40);

  currentY = 340;
  ctx.font = 'bold 36px Arial';
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'left';
  ctx.fillText('🌐 Thống kê theo Platform:', 100, currentY);

  currentY += 60;
  const platforms = Object.entries(stats.platformStats || {});
  
  if (platforms.length === 0) {
    ctx.font = '28px Arial';
    ctx.fillStyle = '#999999';
    ctx.textAlign = 'center';
    ctx.fillText('Chưa có dữ liệu', 600, currentY + 50);
  } else {
    platforms.forEach(([platform, data]) => {
      const platformRate = data.total > 0 ? Math.round(data.success / data.total * 100) : 0;
      
      ctx.font = 'bold 28px Arial';
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'left';
      ctx.fillText(platform, 120, currentY);
      
      const barX = 120;
      const barY = currentY + 10;
      const barWidth = 800;
      const barHeight = 30;
      
      ctx.fillStyle = '#e5e7eb';
      ctx.roundRect(barX, barY, barWidth, barHeight, 15);
      ctx.fill();
      
      const fillWidth = (barWidth * platformRate) / 100;
      const barGradient = ctx.createLinearGradient(barX, 0, barX + fillWidth, 0);
      barGradient.addColorStop(0, '#667eea');
      barGradient.addColorStop(1, '#764ba2');
      ctx.fillStyle = barGradient;
      ctx.roundRect(barX, barY, fillWidth, barHeight, 15);
      ctx.fill();
      
      ctx.font = '24px Arial';
      ctx.fillStyle = '#666666';
      ctx.textAlign = 'right';
      ctx.fillText(`${data.success}/${data.total} (${platformRate}%)`, 1050, currentY);
      
      currentY += 80;
    });
  }

  ctx.font = 'bold 24px Arial';
  ctx.fillStyle = '#999999';
  ctx.textAlign = 'center';
  ctx.fillText('💫 Bonz Mãi VIP', 600, 920);

  return canvas.toBuffer('image/png');
}

// === UTILITY FUNCTIONS ===

async function safeSendMessage(api, messageData, threadId, type) {
  try {
    const payload = typeof messageData === 'string'
      ? { msg: messageData }
      : (messageData || {});

    if (!payload.msg && !payload.attachments) {
      return null;
    }

    return await api.sendMessage(payload, threadId, type);
  } catch (error) {
    console.error(`Lỗi gửi tin nhắn tới ${threadId}:`, error.message);
    return null;
  }
}

function cleanupExpiredConfirmations() {
  const now = Date.now();
  for (const [key, info] of pendingAutoJoinConfirmations.entries()) {
    if (!info || (now - info.timestamp) > AUTOJOIN_CONFIRM_TTL) {
      releaseConfirmation(key, info);
    }
  }
}

function scheduleConfirmationCleanup() {
  if (!autoJoinConfirmCleanupTimer) {
    autoJoinConfirmCleanupTimer = setInterval(cleanupExpiredConfirmations, AUTOJOIN_CONFIRM_CLEANUP_INTERVAL);
  }
}

function rememberConfirmation(record = {}) {
  const identifiers = [record.msgId, record.messageId, record.globalMsgId, record.cliMsgId]
    .map((value) => {
      try {
        return value != null ? String(value) : '';
      } catch {
        return '';
      }
    })
    .filter((value) => typeof value === 'string' && value.length);

  if (!identifiers.length) return;

  const entry = {
    ...record,
    timestamp: Date.now()
  };

  identifiers.forEach((key) => {
    pendingAutoJoinConfirmations.set(key, entry);
  });

  scheduleConfirmationCleanup();
}

function findConfirmation(keys = []) {
  for (const rawKey of keys) {
    let key;
    try {
      key = String(rawKey);
    } catch {
      key = '';
    }
    if (!key) continue;
    const record = pendingAutoJoinConfirmations.get(key);
    if (record) {
      return { key, record };
    }
  }
  return null;
}

function releaseConfirmation(key = '', record = null) {
  let targetRecord = record;
  if (!targetRecord && key) {
    const normalizedKey = String(key);
    targetRecord = pendingAutoJoinConfirmations.get(normalizedKey) || null;
  }

  if (targetRecord) {
    for (const [storedKey, storedRecord] of pendingAutoJoinConfirmations.entries()) {
      if (storedRecord === targetRecord) {
        pendingAutoJoinConfirmations.delete(storedKey);
      }
    }
  } else if (key) {
    pendingAutoJoinConfirmations.delete(String(key));
  }

  if (pendingAutoJoinConfirmations.size === 0 && autoJoinConfirmCleanupTimer) {
    clearInterval(autoJoinConfirmCleanupTimer);
    autoJoinConfirmCleanupTimer = null;
  }
}

function collectReactionKeys(data = {}) {
  const keys = new Set();
  const candidates = [
    data?.msgId,
    data?.messageId,
    data?.cliMsgId,
    data?.content?.msgId,
    data?.content?.messageId,
    data?.content?.cliMsgId,
    data?.content?.rMsg?.[0]?.gMsgID,
    data?.content?.rMsg?.[0]?.msgId,
    data?.content?.rMsg?.[0]?.cliMsgId
  ];

  candidates.forEach((value) => {
    if (!value) return;
    try {
      const key = String(value);
      if (key.length) keys.add(key);
    } catch {}
  });

  return [...keys];
}

function extractReactionInfo(data = {}) {
  const rTypeCandidates = [
    data?.rType,
    data?.reactionType,
    data?.reactType,
    data?.content?.rType,
    data?.content?.reactionType,
    data?.content?.reactType
  ];

  let resolvedRType = null;
  for (const candidate of rTypeCandidates) {
    if (candidate === undefined || candidate === null) continue;
    const numeric = Number(candidate);
    if (!Number.isNaN(numeric)) {
      resolvedRType = numeric;
      break;
    }
  }

  const emojiCandidates = [
    data?.emoji,
    data?.content?.emoji,
    data?.content?.reactionEmoji
  ];

  const resolvedEmoji = emojiCandidates.find((value) => typeof value === 'string' && value.length) || null;

  const userCandidates = [
    data?.uidFrom,
    data?.userId,
    data?.user_id,
    data?.uid,
    data?.fromUid,
    data?.content?.uidFrom,
    data?.content?.userId,
    data?.content?.uid,
    data?.content?.rMsg?.[0]?.uidFrom,
    data?.content?.rMsg?.[0]?.userId
  ];

  const resolvedUserId = userCandidates.find((value) => value !== undefined && value !== null) || null;

  const displayNameCandidates = [
    data?.dName,
    data?.displayName,
    data?.content?.dName,
    data?.content?.displayName,
    data?.content?.rMsg?.[0]?.dName
  ];

  const resolvedDisplayName = displayNameCandidates.find((value) => typeof value === 'string' && value.trim().length) || null;

  return {
    rType: resolvedRType,
    emoji: resolvedEmoji,
    userId: resolvedUserId,
    displayName: resolvedDisplayName
  };
}

function isHeartReaction(info = {}) {
  if (!info) return false;
  if (info.rType !== undefined && info.rType !== null) {
    if (Number(info.rType) === AUTOJOIN_CONFIRM_RTYPE) {
      return true;
    }
  }

  if (info.emoji) {
    const normalized = String(info.emoji).toLowerCase();
    if (normalized.includes('❤️') || normalized.includes('heart') || normalized.includes('love') || normalized.includes('tim')) {
      return true;
    }
  }

  return false;
}

function extractMessageIdentifiers(response = {}) {
  const identifiers = {};
  const queue = [response];

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;

    if (current.msgId && !identifiers.msgId) identifiers.msgId = String(current.msgId);
    if (current.messageId && !identifiers.messageId) identifiers.messageId = String(current.messageId);
    if (current.globalMsgId && !identifiers.globalMsgId) identifiers.globalMsgId = String(current.globalMsgId);
    if (current.cliMsgId && !identifiers.cliMsgId) identifiers.cliMsgId = String(current.cliMsgId);

    const nestedCandidates = [
      current.data,
      current.message,
      current.payload,
      current.result
    ];

    nestedCandidates.forEach((nested) => {
      if (nested && typeof nested === 'object') {
        queue.push(nested);
      }
    });
  }

  return identifiers;
}

function purgeThreadPendingConfirmations(threadId) {
  if (!threadId) return;
  const normalized = String(threadId);
  for (const [key, record] of [...pendingAutoJoinConfirmations.entries()]) {
    if (record && String(record.threadId || '') === normalized) {
      pendingAutoJoinConfirmations.delete(key);
    }
  }

  if (pendingAutoJoinConfirmations.size === 0 && autoJoinConfirmCleanupTimer) {
    clearInterval(autoJoinConfirmCleanupTimer);
    autoJoinConfirmCleanupTimer = null;
  }
}

function hasPendingEnableRequest(threadId, requesterId) {
  if (!threadId) return false;
  const normalizedThread = String(threadId);
  const normalizedRequester = requesterId != null ? String(requesterId) : null;

  for (const record of pendingAutoJoinConfirmations.values()) {
    if (!record || record.action !== 'enable-thread') continue;
    if (String(record.threadId || '') !== normalizedThread) continue;
    if (normalizedRequester && String(record.requesterId || '') !== normalizedRequester) continue;
    return true;
  }

  return false;
}

async function loadAutoJoinData() {
  try {
    const fileContent = await fs.readFile(AUTO_JOIN_DATA_PATH, 'utf8');
    const parsed = JSON.parse(fileContent) || {};
    const ensuredSettings = ensureAutoJoinSettings(parsed.settings);

    const result = {
      ...parsed,
      joinHistory: Array.isArray(parsed.joinHistory) ? parsed.joinHistory : [],
      whitelist: Array.isArray(parsed.whitelist) ? parsed.whitelist : [],
      blacklist: Array.isArray(parsed.blacklist) ? parsed.blacklist : [],
      settings: ensuredSettings
    };

    return result;
  } catch (error) {
    return {
      joinHistory: [],
      whitelist: [],
      blacklist: [],
      settings: createDefaultAutoJoinSettings()
    };
  }
}

async function saveAutoJoinData(data) {
  try {
    await fs.mkdir(path.dirname(AUTO_JOIN_DATA_PATH), { recursive: true });
    await fs.writeFile(AUTO_JOIN_DATA_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Lỗi lưu dữ liệu auto join:", error.message);
  }
}

async function loadAutoJoinStats() {
  try {
    const data = await fs.readFile(AUTO_JOIN_STATS_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {
      totalJoins: 0,
      successfulJoins: 0,
      failedJoins: 0,
      platformStats: {},
      dailyStats: {},
      lastReset: new Date().toDateString()
    };
  }
}

async function saveAutoJoinStats(stats) {
  try {
    await fs.mkdir(path.dirname(AUTO_JOIN_STATS_PATH), { recursive: true });
    await fs.writeFile(AUTO_JOIN_STATS_PATH, JSON.stringify(stats, null, 2));
  } catch (error) {
    console.error("Lỗi lưu thống kê auto join:", error.message);
  }
}

function detectAutoJoinLinks(content) {
  if (!content || typeof content !== 'string') return [];
  
  const detectedLinks = [];
  
  for (const [type, pattern] of Object.entries(AUTO_JOIN_PATTERNS)) {
    const matches = [...content.matchAll(pattern)];
    matches.forEach(match => {
      detectedLinks.push({
        type,
        link: match[0].trim(),
        id: match[1] || null,
        fullMatch: match[0]
      });
    });
  }
  
  return detectedLinks;
}

function normalizeLink(linkInfo) {
  if (!linkInfo) return null;
  const rawLink = linkInfo.link || linkInfo.fullMatch || '';
  if (typeof rawLink === 'string' && rawLink.trim().startsWith('http')) {
    return rawLink.trim();
  }

  const candidate = rawLink || linkInfo.id || linkInfo.code;
  if (!candidate) return null;

  if (candidate.startsWith('http')) return candidate;
  return `https://${candidate.replace(/^\/+/, '')}`;
}

function getLinkCooldownKey(linkInfo) {
  if (!linkInfo) return null;
  const normalizedLink = normalizeLink(linkInfo);
  if (normalizedLink) return normalizedLink.toLowerCase();

  const candidates = [
    linkInfo.id,
    linkInfo.code,
    linkInfo.link,
    linkInfo.fullMatch
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const stringified = String(candidate).trim();
      if (stringified.length) {
        return stringified.toLowerCase();
      }
    } catch (error) {
      console.warn('[AUTOJOIN] getLinkCooldownKey stringify error:', error?.message || error);
    }
  }

  return null;
}

function getLinkCooldownRemaining(key) {
  if (!key) return 0;
  const normalized = String(key).toLowerCase();
  const lastAttempt = recentLinkAttempts.get(normalized);
  if (!lastAttempt) return 0;

  const elapsed = Date.now() - lastAttempt;
  if (elapsed >= AUTO_JOIN_LINK_COOLDOWN) {
    recentLinkAttempts.delete(normalized);
    return 0;
  }

  return AUTO_JOIN_LINK_COOLDOWN - elapsed;
}

function rememberLinkAttempt(key) {
  if (!key) return;
  const normalized = String(key).toLowerCase();
  recentLinkAttempts.set(normalized, Date.now());
  scheduleLinkCooldownCleanup();
}

function cleanupLinkCooldowns() {
  const now = Date.now();
  for (const [key, timestamp] of recentLinkAttempts.entries()) {
    if (now - timestamp >= AUTO_JOIN_LINK_COOLDOWN) {
      recentLinkAttempts.delete(key);
    }
  }

  if (recentLinkAttempts.size === 0 && linkCooldownCleanupTimer) {
    clearInterval(linkCooldownCleanupTimer);
    linkCooldownCleanupTimer = null;
  }
}

function scheduleLinkCooldownCleanup() {
  if (!linkCooldownCleanupTimer) {
    linkCooldownCleanupTimer = setInterval(
      cleanupLinkCooldowns,
      LINK_COOLDOWN_CLEANUP_INTERVAL
    );
  }
}

function formatCooldownDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 'vài giây';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (minutes > 0) {
    parts.push(`${minutes} phút`);
  }
  if (seconds > 0) {
    parts.push(`${seconds} giây`);
  }
  return parts.join(' ') || 'vài giây';
}

async function resolveGroupIdFromLink(api, linkInfo, fallbackId) {
  const normalizedLink = normalizeLink(linkInfo);
  const inviteCode = linkInfo?.id || (() => {
    if (!normalizedLink) return null;
    try {
      const url = new URL(normalizedLink);
      const parts = url.pathname.split('/').filter(Boolean);
      return parts[parts.length - 1] || null;
    } catch {
      return null;
    }
  })();

  const resolvers = [
    async () => fallbackId,
    async () => {
      if (!normalizedLink || typeof api.getIDsGroup !== 'function') return null;
      const result = await api.getIDsGroup(normalizedLink);
      return result?.groupId || result?.chatId || result?.id || null;
    },
    async () => {
      if (!normalizedLink || typeof api.resolveInviteLink !== 'function') return null;
      const result = await api.resolveInviteLink(normalizedLink);
      return result?.groupId || result?.chatId || result?.id || null;
    },
    async () => {
      if (!normalizedLink || typeof api.getGroupInfoFromLink !== 'function') return null;
      const result = await api.getGroupInfoFromLink(normalizedLink);
      return result?.groupId || result?.chatId || result?.id || null;
    },
    async () => {
      if (!inviteCode) return null;
      return inviteCode;
    }
  ];

  for (const resolver of resolvers) {
    try {
      const value = await resolver();
      if (value) return String(value);
    } catch (error) {
      console.warn('[AUTOJOIN] Resolver failed:', error?.message || error);
    }
  }

  return null;
}

async function fetchGroupName(api, groupId) {
  if (!groupId) return null;
  const id = String(groupId);
  const now = Date.now();
  const cached = RESOLVED_GROUP_CACHE.get(id);
  if (cached && cached.expires > now) {
    return cached.name;
  }

  const candidates = [];

  if (api && typeof api.getGroupInfo === 'function') {
    try {
      const info = await api.getGroupInfo(id);
      const detail = info?.gridInfoMap?.[id] || info?.groupInfo?.[id] || info?.info || info;
      const label = detail?.name || detail?.groupName || detail?.threadName;
      if (typeof label === 'string' && label.trim().length) {
        candidates.push(label.trim());
      }
      const cacheEntry = {
        name: candidates[0] || null,
        expires: now + GROUP_CACHE_TTL
      };
      RESOLVED_GROUP_CACHE.set(id, cacheEntry);
      return cacheEntry.name;
    } catch (error) {
      console.warn('[AUTOJOIN] fetchGroupName getGroupInfo failed:', error?.message || error);
    }
  }

  return null;
}

// === AUTO JOIN LOGIC ===

async function tryJoinZaloGroup(api, linkInfo) {
  let groupId;
  let normalizedLink;
  let linkType;

  try {
    const { id, link, type } = linkInfo || {};
    groupId = id || null;
    linkType = type || 'ZALO_GROUP';
    normalizedLink = normalizeLink(linkInfo);

    console.log(`Đang thử join group: ${groupId || 'unknown'} (${linkType})`);
    
    // Thử các method join group theo thứ tự ưu tiên
    const joinMethods = [];

    if (normalizedLink && typeof api.joinGroupByLink === 'function') {
      joinMethods.push({ name: 'joinGroupByLink', exec: () => api.joinGroupByLink(normalizedLink) });
    }

    if (normalizedLink && typeof api.joinGroup === 'function') {
      joinMethods.push({ name: 'joinGroup', exec: () => api.joinGroup(normalizedLink) });
    }

    if (normalizedLink && typeof api.joinChatByLink === 'function') {
      joinMethods.push({ name: 'joinChatByLink', exec: () => api.joinChatByLink(normalizedLink) });
    }

    if (normalizedLink && typeof api.acceptInviteLink === 'function') {
      joinMethods.push({ name: 'acceptInviteLink', exec: () => api.acceptInviteLink(normalizedLink) });
    }

    if (groupId && typeof api.joinGroupByCode === 'function') {
      joinMethods.push({ name: 'joinGroupByCode', exec: () => api.joinGroupByCode(groupId) });
    }

    if (groupId && ThreadType && typeof api.sendMessage === 'function') {
      joinMethods.push({
        name: 'sendMessageProbe',
        exec: async () => {
          const payload = { msg: '[AUTOJOIN] Thử tham gia nhóm' };
          await api.sendMessage(payload, groupId, ThreadType.Group);
          return { success: true, groupId };
        }
      });
    }

    let lastError = null;
    for (const method of joinMethods) {
      try {
        const result = await method.exec();
        if (result !== null && result !== undefined) {
          console.log(`✅ Join thành công bằng ${method.name}`);
          return { success: true, groupId: groupId || result.groupId, method: method.name };
        }
      } catch (error) {
        const message = error?.message || '';
        if (/Waiting for approve/i.test(message)) {
          console.log('⏳ Nhóm yêu cầu duyệt. Dừng thử thêm.');
          return {
            success: false,
            error: 'Nhóm yêu cầu admin duyệt lời mời. Vui lòng chờ được chấp nhận.',
            groupId,
            waitingApproval: true
          };
        }
        if (alreadyMemberPatterns.some((regex) => regex.test(message))) {
          console.log('ℹ️ Bot đã ở trong nhóm. Dừng thử thêm.');
          return {
            success: true,
            groupId,
            method: method.name,
            alreadyMember: true
          };
        }
        console.log(`❌ ${method.name} failed:`, message);
        lastError = error;
      }
    }

    throw lastError || new Error('Không có method join nào khả dụng');
  } catch (error) {
    console.error(`Lỗi join group ${groupId || 'unknown'}:`, error.message);
    return { success: false, error: error.message, groupId };
  }
}

async function updateAutoJoinStats(stats, linkType, success) {
  stats.totalJoins++;
  if (success) {
    stats.successfulJoins++;
  } else {
    stats.failedJoins++;
  }
  
  // Đảm bảo platformStats được khởi tạo
  if (!stats.platformStats) {
    stats.platformStats = {};
  }
  
  if (!stats.platformStats[linkType]) {
    stats.platformStats[linkType] = { total: 0, success: 0 };
  }
  stats.platformStats[linkType].total++;
  if (success) {
    stats.platformStats[linkType].success++;
  }
  
  const today = new Date().toDateString();
  if (stats.lastReset !== today) {
    stats.dailyStats = {};
    stats.lastReset = today;
  }
  
  // Đảm bảo dailyStats được khởi tạo
  if (!stats.dailyStats) {
    stats.dailyStats = {};
  }
  
  if (!stats.dailyStats[today]) {
    stats.dailyStats[today] = { total: 0, success: 0 };
  }
  stats.dailyStats[today].total++;
  if (success) {
    stats.dailyStats[today].success++;
  }
  
  await saveAutoJoinStats(stats);
}

// === MAIN AUTO JOIN HANDLER ===

module.exports.handleEvent = async function({ api, event, Threads, Users, eventType }) {
  try {
    const currentEventType = eventType || event?.eventType || 'message';

    if (currentEventType === 'reaction') {
      const data = event?.data || {};
      const keys = collectReactionKeys(data);
      if (!keys.length) return;

      const found = findConfirmation(keys);
      if (!found) return;

      const reactionInfo = extractReactionInfo(data);
      if (!isHeartReaction(reactionInfo)) return;

      const record = found.record;
      const keyUsed = found.key;
      const requesterId = record?.requesterId ? String(record.requesterId) : null;
      const reactorId = reactionInfo?.userId ? String(reactionInfo.userId) : null;

      if (requesterId && reactorId && requesterId !== reactorId) {
        return;
      }

      const targetThreadId = record?.threadId || event?.threadId;
      const targetThreadType = record?.threadType || event?.type || ThreadType?.Group || 1;
      if (!targetThreadId) {
        releaseConfirmation(keyUsed, record);
        return;
      }

      const threadData = await Threads.getData(targetThreadId);
      const threadSettings = threadData?.data || {};
      if (!threadSettings.auto_join) {
        threadSettings.auto_join = true;
        await Threads.setData(targetThreadId, threadSettings);
      }

      releaseConfirmation(keyUsed, record);

      const displayName = reactionInfo?.displayName || 'bạn';
      const confirmationMsg = [
        '✅ Auto Join đã được bật!',
        `👤 Người yêu cầu: ${displayName}`
      ].join('\n');

      const mentions = requesterId
        ? [{ uid: requesterId, len: displayName.length, pos: confirmationMsg.indexOf(displayName) }]
        : undefined;

      await sendColorMessage(api, targetThreadId, targetThreadType, {
        text: confirmationMsg,
        mentions,
        ttl: 60000
      });

      return;
    }

    if (currentEventType !== 'message') {
      return;
    }

    const { threadId, type, data, body: eventBody } = event;
    const senderID = data?.uidFrom || event.senderID || event.authorId;
    
    // Lấy message content
    const rawCandidates = [
      eventBody,
      data?.content?.title,
      data?.content,
      data?.body,
      data?.text
    ];

    const rawContent = rawCandidates.find((value) => typeof value === 'string' && value.trim().length) || '';
    const body = rawContent.trim();

    // Chỉ xử lý trong group (type === 1)
    if (type !== 1) return;

    // Phát hiện links
    const detectedLinks = detectAutoJoinLinks(body);
    if (detectedLinks.length === 0) return;

    const autoJoinData = await loadAutoJoinData();
    autoJoinData.settings = ensureAutoJoinSettings(autoJoinData.settings);

    const threadData = await Threads.getData(threadId);
    const threadSettings = threadData?.data || {};
    const isAutoJoinEnabled = autoJoinData.settings.autoJoinAll || !!threadSettings.auto_join;
    if (!isAutoJoinEnabled) return;
    
    console.log(`Phát hiện ${detectedLinks.length} link(s) trong group ${threadId}`);

    const usableLinks = [];
    for (const linkInfo of detectedLinks) {
      const cooldownKey = getLinkCooldownKey(linkInfo);
      const remaining = getLinkCooldownRemaining(cooldownKey);
      if (remaining > 0) {
        console.log(`[AUTOJOIN] Bỏ qua link ${cooldownKey} do còn cooldown ${remaining}ms`);
        await safeSendMessage(
          api,
          `♻️ Link này vừa được thử join gần đây. Vui lòng đợi ${formatCooldownDuration(remaining)} trước khi thử lại.`,
          threadId,
          type
        );
        continue;
      }
      usableLinks.push({ linkInfo, cooldownKey });
    }

    if (!usableLinks.length) {
      return;
    }

    const stats = await loadAutoJoinStats();
    
    // Xử lý từng link
    for (const { linkInfo, cooldownKey } of usableLinks) {
      if (linkInfo.type === 'ZALO_GROUP' || linkInfo.type === 'ZALO_INVITE') {
        const resolvedName = await resolveDisplayName(api, Users, senderID);
        const userName = resolvedName || 'Không rõ';

        const result = await tryJoinZaloGroup(api, linkInfo);
        rememberLinkAttempt(cooldownKey);

        // Cập nhật stats
        await updateAutoJoinStats(stats, linkInfo.type, result.success);
        
        // Cập nhật history
        const resolvedGroupId = await resolveGroupIdFromLink(api, linkInfo, result.groupId);
        const groupName = result.success ? await fetchGroupName(api, resolvedGroupId) : null;
        const outcomeMessage = buildJoinOutcomeMessage({
          userName,
          result,
          groupName,
          groupId: resolvedGroupId || result.groupId || linkInfo.id,
          linkInfo,
          stats
        });
        autoJoinData.joinHistory.unshift({
          groupId: resolvedGroupId || result.groupId || linkInfo.id,
          linkType: linkInfo.type,
          link: linkInfo.link,
          success: result.success,
          timestamp: Date.now(),
          userName,
          fromThreadId: threadId
        });
        
        // Giới hạn history 100 entries
        if (autoJoinData.joinHistory.length > 100) {
          autoJoinData.joinHistory = autoJoinData.joinHistory.slice(0, 100);
        }
        
        await saveAutoJoinData(autoJoinData);
        
        // Gửi kết quả
        if (result.success) {
          const mentions = [];
          if (resolvedName) {
            const mentionPos = outcomeMessage.indexOf(resolvedName);
            if (mentionPos !== -1) {
              mentions.push({ uid: String(senderID), len: resolvedName.length, pos: mentionPos });
            }
          }

          await sendColorMessage(api, threadId, type, { text: outcomeMessage, mentions });
        }

        break; // Chỉ xử lý 1 link mỗi lần
      }
    }
  } catch (error) {
    console.error('Lỗi trong handleAutoJoin:', error);
  }
};

// === SHOW FUNCTIONS ===

async function showAutoJoinStatus(api, threadId, type, Threads) {
  try {
    const threadData = await Threads.getData(threadId);
    const autoJoinData = await loadAutoJoinData();
    autoJoinData.settings = ensureAutoJoinSettings(autoJoinData.settings);
    const autoJoinAllEnabled = autoJoinData.settings.autoJoinAll;
    const autoJoinEnabled = autoJoinAllEnabled || threadData.data.auto_join || false;
    
    const stats = await loadAutoJoinStats();
    
    // Đảm bảo stats có cấu trúc đúng
    if (!stats.platformStats) stats.platformStats = {};
    if (typeof stats.totalJoins !== 'number') stats.totalJoins = 0;
    if (typeof stats.successfulJoins !== 'number') stats.successfulJoins = 0;
    if (typeof stats.failedJoins !== 'number') stats.failedJoins = 0;
    
    try {
      const imageBuffer = await createAutoJoinStatusImage(stats, autoJoinData.settings, autoJoinEnabled);
      const imageFileName = `autojoin_status_${Date.now()}.png`;
      await fs.writeFile(imageFileName, imageBuffer);
      
      await safeSendMessage(api, {
        msg: `✨ Trạng thái Auto Join`,
        attachments: [imageFileName]
      }, threadId, type);
      
      setTimeout(async () => {
        try { await fs.unlink(imageFileName); } catch (_) {}
      }, 30000);
    } catch (imgError) {
      console.error('Error creating status image:', imgError);
      // Fallback to text
      let statusMessage = `🤖 **Trạng thái Auto Join**\n\n`;
      statusMessage += `📊 Trạng thái: ${autoJoinEnabled ? '✅ Đang bật' : '❌ Đang tắt'}\n`;
      statusMessage += `🌍 Auto Join All: ${autoJoinAllEnabled ? '✅ Bật' : '❌ Tắt'}\n`;
      statusMessage += `🔢 Tổng lần join: ${stats.totalJoins}\n`;
      statusMessage += `✅ Thành công: ${stats.successfulJoins}\n`;
      statusMessage += `❌ Thất bại: ${stats.failedJoins}`;
      await safeSendMessage(api, statusMessage, threadId, type);
    }
  } catch (error) {
    console.error('Error in showAutoJoinStatus:', error);
    await safeSendMessage(api, "❌ Đã xảy ra lỗi khi hiển thị trạng thái.", threadId, type);
  }
}

async function showAutoJoinStats(api, threadId, type) {
  const stats = await loadAutoJoinStats();
  
  try {
    const imageBuffer = await createAutoJoinStatsImage(stats);
    const imageFileName = `autojoin_stats_${Date.now()}.png`;
    await fs.writeFile(imageFileName, imageBuffer);
    
    await safeSendMessage(api, {
      msg: `📊 Thống kê Auto Join chi tiết`,
      attachments: [imageFileName]
    }, threadId, type);
    
    setTimeout(async () => {
      try { await fs.unlink(imageFileName); } catch (_) {}
    }, 30000);
  } catch (error) {
    console.error('Error creating stats image:', error);
    let statsMessage = `📊 **Thống kê Auto Join**\n\n`;
    statsMessage += `🔢 Tổng số lần join: ${stats.totalJoins}\n`;
    statsMessage += `✅ Thành công: ${stats.successfulJoins}\n`;
    statsMessage += `❌ Thất bại: ${stats.failedJoins}`;
    await safeSendMessage(api, statsMessage, threadId, type);
  }
}

// === EXPORTS ===

module.exports.detectAutoJoinLinks = detectAutoJoinLinks;

module.exports.run = async function ({ api, event, args, Threads }) {
  const { threadId, type } = event;
  const action = (args[0] || "").toLowerCase();
  
  // Check if in group (type === 1)
  if (type !== 1) {
    return api.sendMessage("Lệnh này chỉ có thể được sử dụng trong nhóm chat.", threadId, type);
  }
  
  switch (action) {
    case "on":
    case "enable":
      {
        const threadData = await Threads.getData(threadId);
        const threadSettings = threadData?.data || {};
        const senderId = event?.data?.uidFrom || event?.senderID || event?.authorId;

        if (threadSettings.auto_join) {
          await sendColorMessage(api, threadId, type, "✅ Auto Join đang bật sẵn rồi!");
          break;
        }

        if (hasPendingEnableRequest(threadId, senderId)) {
          await sendColorMessage(api, threadId, type, "⏳ Bạn đã gửi yêu cầu bật Auto Join và đang chờ thả ❤️.");
          break;
        }

        const displayName = event?.data?.dName || event?.data?.displayName || "Bạn";
        const confirmationText = [
          "❤️ XÁC NHẬN BẬT AUTO JOIN",
          `👤 ${displayName}`,
          "• Thả reaction ❤️ vào tin nhắn này trong 30 giây để bật auto join.",
          "• Nếu không phản hồi kịp, yêu cầu sẽ tự hủy."
        ].join("\n");

        const mentionPos = confirmationText.indexOf(displayName);
        const mentions = senderId && mentionPos !== -1
          ? [{ uid: String(senderId), len: displayName.length, pos: mentionPos }]
          : undefined;

        const response = await sendColorMessage(api, threadId, type, {
          text: confirmationText,
          mentions,
          ttl: 60000
        });

        const identifiers = extractMessageIdentifiers(response);
        if (!identifiers.msgId && !identifiers.cliMsgId && !identifiers.globalMsgId && !identifiers.messageId) {
          console.warn('[AUTOJOIN] Không thể lấy msgId cho yêu cầu xác nhận auto join. Bật trực tiếp fallback.');
          threadSettings.auto_join = true;
          await Threads.setData(threadId, threadSettings);
          await sendColorMessage(api, threadId, type, "✅ Đã bật Auto Join (fallback do không lấy được mã tin nhắn).");
          break;
        }

        rememberConfirmation({
          ...identifiers,
          threadId,
          threadType: type,
          requesterId: senderId,
          action: 'enable-thread'
        });

        await safeSendMessage(api, {
          msg: "💡 Thả ❤️ vào tin nhắn vừa rồi để xác nhận nhé!",
          ttl: AUTOJOIN_CONFIRM_TTL
        }, threadId, type);
      }
      break;

    case "off":
    case "disable":
      {
        const threadData = await Threads.getData(threadId);
        const threadSettings = threadData?.data || {};
        threadSettings.auto_join = false;
        await Threads.setData(threadId, threadSettings);

        purgeThreadPendingConfirmations(threadId);

        await safeSendMessage(api, "❌ Đã tắt tính năng Auto Join.", threadId, type);
      }
      break;
      
    case "status":
    case "info":
      await showAutoJoinStatus(api, threadId, type, Threads);
      break;
      
    case "stats":
    case "statistics":
      await showAutoJoinStats(api, threadId, type);
      break;

    case "all":
    case "global":
      {
        const rawAction = args.length <= 1 ? 'on' : (args[1] || '').toLowerCase();
        const subAction = rawAction || 'on';

        const autoJoinData = await loadAutoJoinData();
        const settings = ensureAutoJoinSettings(autoJoinData.settings);
        autoJoinData.settings = settings;

        let updated = false;
        let message = '';
        let groupCount = null;

        if (["on", "enable", "true"].includes(subAction)) {
          settings.autoJoinAll = true;
          updated = true;
          groupCount = await countBotGroups(api, Threads);
          message = "🚀 Đã bật Auto Join All. Bot sẽ tự động tham gia bất kỳ link nhóm hợp lệ được phát hiện trong mọi nhóm có mặt.";
          const appliedCount = await applyAutoJoinFlagToAllThreads(Threads, true);
          message += `\n🤖 Bot đang ở ${groupCount} nhóm.`;
          if (appliedCount > 0) {
            message += `\n🛠️ Đã cập nhật auto join cho ${appliedCount} nhóm từ cấu hình hiện tại.`;
          }
        } else if (["off", "disable", "false"].includes(subAction)) {
          settings.autoJoinAll = false;
          updated = true;
          const appliedCount = await applyAutoJoinFlagToAllThreads(Threads, false);
          message = "🔕 Đã tắt Auto Join All. Bot chỉ auto join tại những nhóm đã bật riêng lẻ.";
          if (appliedCount > 0) {
            message += `\n🛠️ Đã tắt auto join cho ${appliedCount} nhóm đã cấu hình trước đó.`;
          }
        } else if (["toggle"].includes(subAction)) {
          settings.autoJoinAll = !settings.autoJoinAll;
          updated = true;
          if (settings.autoJoinAll) {
            groupCount = await countBotGroups(api, Threads);
            const appliedCount = await applyAutoJoinFlagToAllThreads(Threads, true);
            message = "🚀 Đã bật Auto Join All.";
            message += `\n🤖 Bot đang ở ${groupCount} nhóm.`;
            if (appliedCount > 0) {
              message += `\n🛠️ Đã cập nhật auto join cho ${appliedCount} nhóm từ cấu hình hiện tại.`;
            }
          } else {
            const appliedCount = await applyAutoJoinFlagToAllThreads(Threads, false);
            message = "🔕 Đã tắt Auto Join All.";
            if (appliedCount > 0) {
              message += `\n🛠️ Đã tắt auto join cho ${appliedCount} nhóm đã cấu hình trước đó.`;
            }
          }
        } else if (["status", "info"].includes(subAction)) {
          message = `🌍 Auto Join All hiện đang ${settings.autoJoinAll ? '✅ BẬT' : '❌ TẮT'}.`;
          if (settings.autoJoinAll) {
            groupCount = await countBotGroups(api, Threads);
            message += `\n🤖 Đang áp dụng cho ${groupCount} nhóm.`;
          }
        } else {
          message = "🤖 **Auto Join All**\n\n" +
            "• autojoin all on  - Bật chế độ auto join toàn bộ nhóm\n" +
            "• autojoin all off - Tắt chế độ auto join toàn bộ nhóm\n" +
            "• autojoin all status - Xem trạng thái";
        }

        if (updated) {
          await saveAutoJoinData(autoJoinData);
        }

        await sendColorMessage(api, threadId, type, message);
      }
      break;
      
    default:
      await safeSendMessage(api, 
        "🤖 **Auto Join Zalo Group**\n\n" +
        "📋 **Lệnh có sẵn:**\n" +
        "• autojoin on/off - Bật/tắt\n" +
        "• autojoin status - Xem trạng thái (có ảnh)\n" +
        "• autojoin stats - Xem thống kê (có ảnh)\n" +
        "• autojoin all on/off/status - Quản lý chế độ Auto Join All\n\n" +
        "💫 Bonz Mãi VIP",
        threadId, type
      );
  }
};