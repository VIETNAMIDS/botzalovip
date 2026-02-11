const { GroupEventType, ThreadType, TextStyle } = require("zca-js");
const { isAntiAddEnabled } = require("../utils/antiAddSettings");

const RAINBOW_COLORS = [
  TextStyle.Red,
  TextStyle.Orange,
  TextStyle.Yellow,
  TextStyle.Green,
  "c_0b8fdc",
  "c_673ab7",
  "c_ec407a"
];

module.exports.config = {
  event_type: ["group_event"],
  name: "antiAdd",
  version: "1.0.0",
  author: "Cascade",
  description: "Tự động phát hiện bot bị add vào nhóm lạ và rời nhóm"
};

function resolveThreadId(event) {
  if (!event) return "";
  return safeString(
    event.threadId ??
      event?.data?.threadId ??
      event?.data?.grid ??
      event?.data?.gridId
  );
}

function resolveMemberId(member) {
  return safeString(member?.id || member?.uid || member?.userId);
}

function resolveActorId(data) {
  return safeString(
    data?.sourceId ||
      data?.actorId ||
      data?.uidFrom ||
      data?.userId
  );
}

module.exports.run = async ({ api, event }) => {
  if (!event || event.type !== GroupEventType.JOIN) {
    return;
  }

  const { data } = event || {};
  const threadId = resolveThreadId(event);
  const updateMembers = Array.isArray(data?.updateMembers) ? data.updateMembers : [];
  if (!threadId || updateMembers.length === 0) {
    return;
  }

  let botId = "";
  try {
    if (typeof api?.getOwnId === 'function') {
      botId = safeString(api.getOwnId());
    } else {
      botId = safeString(api?.getOwnId);
    }
  } catch {
    botId = "";
  }
  if (!botId) {
    botId = safeString(global?.config?.bot_id || global?.botID);
  }
  if (!botId) {
    return;
  }

  const joinedIds = updateMembers.map((member) => resolveMemberId(member)).filter(Boolean);
  if (!joinedIds.includes(botId)) {
    return; // Bot không nằm trong danh sách thành viên mới
  }

  if (!isAntiAddEnabled(threadId)) {
    return;
  }

  const antiCfg = normalizeAntiAddConfig(global?.config?.anti_add);
  if (antiCfg.enabled === false) {
    return;
  }

  if (antiCfg.allowedGroups.size > 0 && antiCfg.allowedGroups.has(safeString(threadId))) {
    return; // Cho phép nhóm này add bot
  }

  const actorId = resolveActorId(data);

  if (!actorId) {
    // Tham gia qua link mời – không tự rời
    return;
  }

  if (actorId === botId) {
    // Bot tự join (ví dụ: join bằng link) – bỏ qua anti-add
    return;
  }

  const privilegedUsers = buildPrivilegedUserSet();

  if (actorId && (antiCfg.allowedUsers.has(actorId) || privilegedUsers.has(actorId))) {
    return; // Người add nằm trong whitelist
  }

  try {
    const groupName = await resolveGroupName(api, threadId, "nhóm này");
    const actorName = await resolveDisplayName(api, actorId, "Không rõ");
    const actorTag = actorId ? `@${actorName}` : "Không rõ";
    const header = "🌈 ANTI-ADD KÍCH HOẠT 🌈";
    const body = `Tên nhóm: ${groupName}\nNg add: ${actorId ? `${actorTag} (${actorId})` : "Không rõ"}\nADD CON ME MAY , ADD NX CON ME MAY CHET Á`;
    const content = `${header}\n${body}`;
    let mentions = [];
    if (actorId) {
      const mentionPos = content.indexOf(actorTag);
      if (mentionPos >= 0) {
        mentions = [{ pos: mentionPos, len: actorTag.length, uid: actorId }];
      }
    }

    const warningPayload = {
      msg: content,
      styles: buildMultiColorStyle(content),
      mentions
    };

    await safeSendMessage(api, warningPayload, threadId, ThreadType.Group);
  } catch (error) {
    try {
      console.warn("[antiAdd] Không thể gửi cảnh báo trước khi rời nhóm:", error?.message || error);
    } catch {}
  }

  try {
    await leaveGroupWithFallback(api, threadId);
    console.log(`[antiAdd] Bot đã rời nhóm ${threadId}`);
  } catch (error) {
    console.error(`[antiAdd] Lỗi khi rời nhóm ${threadId}:`, error?.message || error);
  }
};

function normalizeAntiAddConfig(rawCfg) {
  if (!rawCfg || typeof rawCfg !== "object") {
    return {
      enabled: true,
      allowedGroups: new Set(),
      allowedUsers: new Set()
    };
  }

  const enabled = rawCfg.enabled !== false;
  const allowedGroups = new Set(
    Array.isArray(rawCfg.allowed_groups)
      ? rawCfg.allowed_groups.map((id) => safeString(id)).filter(Boolean)
      : []
  );

  const allowedUsers = new Set(
    Array.isArray(rawCfg.allowed_users)
      ? rawCfg.allowed_users.map((id) => safeString(id)).filter(Boolean)
      : []
  );

  return { enabled, allowedGroups, allowedUsers };
}

function buildPrivilegedUserSet() {
  const cfg = global?.config || {};
  const collections = [cfg.owner_bot, cfg.admin_bot, cfg.developer_bot, cfg.support_bot];
  const ids = new Set();

  collections.forEach((list) => {
    if (Array.isArray(list)) {
      list.forEach((id) => {
        const normalized = safeString(id);
        if (normalized) {
          ids.add(normalized);
        }
      });
    }
  });

  return ids;
}

async function safeSendMessage(api, message, threadId, type) {
  if (!message) return;
  try {
    await api.sendMessage(message, threadId, type);
  } catch (error) {
    try {
      console.warn(`[antiAdd] Gửi cảnh báo thất bại ở ${threadId}:`, error?.message || error);
    } catch {}
  }
}

async function leaveGroupWithFallback(api, threadId) {
  const candidates = [
    () => (typeof api.leaveGroup === "function" ? api.leaveGroup(threadId) : null),
    () => (typeof api.leaveConversation === "function" ? api.leaveConversation(threadId) : null),
    () => (typeof api.leaveThread === "function" ? api.leaveThread(threadId) : null),
    () => (typeof api.leaveChat === "function" ? api.leaveChat(threadId) : null)
  ];

  let lastError;
  for (const attempt of candidates) {
    try {
      const result = attempt();
      if (result && typeof result.then === "function") {
        await result;
      }
      return;
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  if (lastError) {
    throw lastError;
  }
}

async function resolveDisplayName(api, userId, fallback = "") {
  if (!userId || typeof api?.getUserInfo !== "function") {
    return fallback;
  }

  try {
    const info = await api.getUserInfo(userId);
    const profile = info?.changed_profiles?.[userId] || info?.unchanged_profiles?.[userId];
    return profile?.displayName || fallback;
  } catch (error) {
    try {
      console.warn(`[antiAdd] Không lấy được tên người dùng ${userId}:`, error?.message || error);
    } catch {}
    return fallback;
  }
}

async function resolveGroupName(api, threadId, fallback = "") {
  if (!threadId || typeof api?.getGroupInfo !== "function") {
    return fallback;
  }

  try {
    const groupInfo = await api.getGroupInfo(threadId);
    const details = groupInfo?.gridInfoMap?.[threadId];
    return details?.name || fallback;
  } catch (error) {
    try {
      console.warn(`[antiAdd] Không lấy được tên nhóm ${threadId}:`, error?.message || error);
    } catch {}
    return fallback;
  }
}

function safeString(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function buildMultiColorStyle(text) {
  const cleanText = typeof text === "string" ? text : String(text ?? "");
  if (!cleanText.length) return [{ start: 0, len: 0, st: TextStyle.Yellow }];

  const totalLength = cleanText.length;
  const baseChunk = Math.max(1, Math.floor(totalLength / 10));
  const styles = [];
  let cursor = 0;
  let colorIndex = 0;

  while (cursor < totalLength) {
    const remaining = totalLength - cursor;
    const chunkSize = styles.length >= 9
      ? remaining
      : Math.min(remaining, Math.max(3, baseChunk + Math.floor(Math.random() * 4)));

    const color = RAINBOW_COLORS[colorIndex % RAINBOW_COLORS.length] || TextStyle.Yellow;
    styles.push({ start: cursor, len: chunkSize, st: color });
    cursor += chunkSize;
    colorIndex += 1;
  }

  return styles;
}
