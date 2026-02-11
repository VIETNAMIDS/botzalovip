const { ThreadType } = require("zca-js");

const AUTO_REVIEW_COOLDOWN = 60 * 1000; // 60s tránh spam
const MIN_UID_LENGTH = 9;
const autoReviewHistory = new Map();

module.exports.config = {
  name: "duyetdm",
  aliases: ["reviewpending", "rpending", "duyetyeucau"],
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Duyệt hoặc từ chối thành viên đang chờ vào nhóm bằng UID cụ thể.",
  category: "Quản trị",
  usage: "duyetdm <approve|reject|auto> <uid1,uid2,...> [groupId|gid=xxx]",
  cooldowns: 3
};

module.exports.handleEvent = async ({ api, event, Threads, eventType }) => {
  try {
    const threadId = event?.threadId;
    if (!threadId) return;
    // event.type khác nhau tuỳ eventType:
    // - message: event.type = ThreadType
    // - group_event: event.type = GroupEventType
    // Vì vậy nếu là group_event thì coi như đang ở Group thread.
    const resolvedType = eventType === 'group_event' ? ThreadType.Group : getThreadTypeValue(event?.type);
    if (resolvedType !== ThreadType.Group) return;
    if (!Threads || typeof Threads.getData !== "function") return;

    const settings = await getThreadSettings(threadId, Threads);
    if (!settings.auto_review_pending) return;

    const now = Date.now();
    const last = autoReviewHistory.get(threadId) || 0;
    if (now - last < AUTO_REVIEW_COOLDOWN) return;

    const pendingMembers = await getPendingMemberIds(api, threadId);
    if (pendingMembers.length === 0) return;

    autoReviewHistory.set(threadId, now);

    if (typeof api.reviewPendingMemberRequest !== "function") return;

    const response = await api.reviewPendingMemberRequest(
      { members: pendingMembers, isApprove: true },
      String(threadId)
    );
    const successCount = pendingMembers.filter(uid => {
      const code = response?.[uid];
      return code === 0 || code === 1 || code === "0" || code === "1";
    }).length;
    settings.auto_review_pending_last = now;
    await setThreadSettings(threadId, Threads, settings);
  } catch (error) {
    console.warn("[REVIEWPENDING][AUTO] Lỗi auto duyệt:", error?.message || error);
  }
};

function isBotAdmin(uid) {
  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const owners = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  const whitelist = Array.isArray(cfg.protected_admins) ? cfg.protected_admins.map(String) : [];
  const all = new Set([...admins, ...owners, ...whitelist].map(String));
  return all.has(String(uid));
}

function normalizeDigits(value = "") {
  return String(value || "").replace(/[^\d]/g, "");
}

function extractUid(value) {
  if (!value) return "";

  if (typeof value === "string" || typeof value === "number") {
    return normalizeDigits(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const uid = extractUid(item);
      if (uid.length >= MIN_UID_LENGTH) return uid;
    }
    return "";
  }

  if (typeof value === "object") {
    const candidate =
      value.uid ||
      value.userId ||
      value.id ||
      value.memberId ||
      value.user_id ||
      value.zuid;
    if (candidate) return normalizeDigits(candidate);

    for (const key of Object.keys(value)) {
      const uid = extractUid(value[key]);
      if (uid.length >= MIN_UID_LENGTH) return uid;
    }
  }

  return "";
}

function getThreadTypeValue(type) {
  if (type === ThreadType.Group) return ThreadType.Group;
  if (type === ThreadType.User) return ThreadType.User;
  if (type === ThreadType.Room) return ThreadType.Room;
  return typeof type === "number" ? type : ThreadType.Group;
}

async function getThreadSettings(threadId, Threads) {
  if (!Threads || typeof Threads.getData !== "function") return {};
  try {
    const thread = await Threads.getData(threadId);
    return thread?.data || {};
  } catch (error) {
    console.warn("[REVIEWPENDING] Không đọc được Threads data:", error?.message || error);
    return {};
  }
}

async function setThreadSettings(threadId, Threads, data) {
  if (!Threads || typeof Threads.setData !== "function") return false;
  try {
    await Threads.setData(threadId, data);
    return true;
  } catch (error) {
    console.warn("[REVIEWPENDING] Không lưu được Threads data:", error?.message || error);
    return false;
  }
}

function parseGroupId(args = [], fallbackThreadId, threadType) {
  let groupId = null;
  const remaining = [];

  for (const token of args) {
    const lower = token.toLowerCase();
    const flagMatch = lower.match(/^(?:group|groupid|gid|grid)[:=](\d{6,})$/i);
    if (flagMatch) {
      groupId = flagMatch[1];
      continue;
    }
    const digits = normalizeDigits(token);
    if (!groupId && digits.length >= 12 && token === args[args.length - 1]) {
      groupId = digits;
      continue;
    }
    remaining.push(token);
  }

  if (!groupId && threadType === ThreadType.Group && fallbackThreadId) {
    groupId = String(fallbackThreadId);
  }

  return { groupId, remainingArgs: remaining };
}

function parseMembers(tokens = []) {
  const flattened = tokens.join(" ")
    .split(/[,\s]+/)
    .map(extractUid)
    .filter(id => id.length >= 12);
  const unique = [...new Set(flattened)];
  return unique;
}

async function fetchGroupInfoCompatible(api, groupId) {
  const attempts = [
    async () => { if (typeof api.getThreadInfo === "function") return api.getThreadInfo(groupId); },
    async () => { if (typeof api.getGroupInfo === "function") return api.getGroupInfo(groupId); }
  ];
  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result) return result;
    } catch (error) {
      // thử method khác
    }
  }
  return null;
}

async function getPendingMemberIds(api, groupId) {
  const uids = new Set();
  try {
    const info = await fetchGroupInfoCompatible(api, groupId);
    if (!info) return [];

    const pushCandidates = (value) => {
      const candidates = [
        value?.pendingApprove?.uids,
        value?.pendingApprove,
        value?.pendingMembers,
        value?.pendingRequests,
        value?.approvalQueue,
        value?.pending,
        value?.pending_list
      ];

      for (const list of candidates) {
        if (!list) continue;

        const entries = Array.isArray(list)
          ? list
          : typeof list === "object"
            ? Object.values(list)
            : [list];

        entries.forEach((item) => {
          const uid = extractUid(item);
          if (uid.length >= MIN_UID_LENGTH) {
            uids.add(uid);
          }
        });
      }
    };

    pushCandidates(info);

    if (info?.gridInfoMap && info.gridInfoMap[groupId]) {
      pushCandidates(info.gridInfoMap[groupId]);
    }
    if (info?.groupInfo && info.groupInfo[groupId]) {
      pushCandidates(info.groupInfo[groupId]);
    }
  } catch (error) {
    console.warn("[REVIEWPENDING] Không thể lấy pending members:", error?.message || error);
  }

  if (uids.size === 0 && typeof api.getPendingGroupMembers === "function") {
    try {
      const response = await api.getPendingGroupMembers(groupId);
      const data = response?.data || response?.pendingMembers || response;
      const membersList = Array.isArray(data) ? data : data?.pendingMembers;
      if (Array.isArray(membersList)) {
        membersList.forEach((item) => {
          const uid = extractUid(item);
          if (uid.length >= MIN_UID_LENGTH) {
            uids.add(uid);
          }
        });
      }
    } catch (error) {
      console.warn("[REVIEWPENDING] Không thể lấy pending members bằng getPendingGroupMembers:", error?.message || error);
    }
  }

  return [...uids];
}

module.exports.run = async ({ api, event, args, Threads }) => {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event?.authorId;
  const resolvedType = getThreadTypeValue(type);

  if (!isBotAdmin(senderId)) {
    return api.sendMessage("🚫 Lệnh này chỉ dành cho admin/owner bot.", threadId, type);
  }

  if ((args[0] || "").toLowerCase() === "help") {
    const helpMsg =
      "📘 Hướng dẫn duyetdm:\n" +
      "• duyetdm auto on/off/status - Bật/tắt/trạng thái auto duyệt trong nhóm hiện tại.\n" +
      "• duyetdm approve all|full - Duyệt toàn bộ thành viên đang chờ của nhóm hiện tại.\n" +
      "• duyetdm approve <uid1,uid2,...> [gid=xxxxx] - Duyệt danh sách UID chỉ định.\n" +
      "• duyetdm reject <uid1,uid2,...> [gid=xxxxx] - Từ chối danh sách UID.\n" +
      "Mẹo: Có thể truyền groupId khác bằng cú pháp gid=1234567890123.";
    return api.sendMessage(helpMsg, threadId, type);
  }

  if (args.length < 2) {
    return api.sendMessage(
      "⚠️ Cú pháp: duyetdm <approve|reject|auto> <uid1,uid2,...> [groupId|gid=xxx]",
      threadId,
      type
    );
  }

  const action = String(args[0]).toLowerCase();
  const approveKeywords = ["approve", "accept", "ok", "yes", "duyet", "chophep"];
  const rejectKeywords = ["reject", "deny", "no", "tu", "tuchoi"];

  if (action === "auto") {
    if (resolvedType !== ThreadType.Group) {
      return api.sendMessage("⚠️ Vui lòng dùng lệnh này trong nhóm để bật auto duyệt.", threadId, type);
    }
    if (!Threads || typeof Threads.getData !== "function" || typeof Threads.setData !== "function") {
      return api.sendMessage("⚠️ Không truy cập được dữ liệu Threads để bật auto duyệt.", threadId, type);
    }

    const subAction = String(args[1] || "").toLowerCase();
    if (!["on", "off", "status"].includes(subAction)) {
      return api.sendMessage(
        "⚙️ Dùng: reviewpending auto on/off/status",
        threadId,
        type
      );
    }

    const settings = await getThreadSettings(threadId, Threads);
    if (subAction === "status") {
      const enabled = settings.auto_review_pending ? "ĐANG BẬT" : "ĐANG TẮT";
      const last = settings.auto_review_pending_last
        ? `Lần cuối auto duyệt: ${new Date(settings.auto_review_pending_last).toLocaleString()}`
        : "Chưa auto duyệt lần nào.";
      return api.sendMessage(`🤖 Auto duyệt đang ${enabled}.\n${last}`, threadId, type);
    }

    settings.auto_review_pending = subAction === "on";
    if (!settings.auto_review_pending) {
      delete settings.auto_review_pending_last;
    }
    await setThreadSettings(threadId, Threads, settings);
    return api.sendMessage(
      settings.auto_review_pending
        ? "✅ Đã BẬT auto duyệt thành viên đang chờ."
        : "❌ Đã TẮT auto duyệt thành viên.",
      threadId,
      type
    );
  }

  let isApprove = null;
  if (approveKeywords.includes(action)) isApprove = true;
  if (rejectKeywords.includes(action)) isApprove = false;

  if (isApprove === null) {
    return api.sendMessage(
      "⚠️ Tham số đầu tiên phải là approve/accept hoặc reject/deny.",
      threadId,
      type
    );
  }

  const { groupId, remainingArgs } = parseGroupId(args.slice(1), threadId, resolvedType);
  if (!groupId) {
    return api.sendMessage(
      "⚠️ Không xác định được groupId. Vui lòng dùng trong nhóm hoặc truyền groupId (vd: gid=1234567890123).",
      threadId,
      type
    );
  }

  const wantsAll = remainingArgs.length === 0 ||
    remainingArgs.some(token => ["all", "auto", "full"].includes(token.toLowerCase()));

  let members = [];
  if (wantsAll) {
    members = await getPendingMemberIds(api, groupId);
    if (members.length === 0) {
      return api.sendMessage(
        "⚠️ Không tìm thấy thành viên nào đang chờ duyệt trong nhóm này.",
        threadId,
        type
      );
    }
  } else {
    members = parseMembers(remainingArgs);
  }

  if (members.length === 0) {
    return api.sendMessage(
      "⚠️ Bạn cần cung cấp ít nhất một UID hợp lệ, cách nhau bằng dấu phẩy hoặc khoảng trắng.",
      threadId,
      type
    );
  }

  if (typeof api.reviewPendingMemberRequest !== "function") {
    return api.sendMessage(
      "⚠️ API reviewPendingMemberRequest không khả dụng trên phiên bản hiện tại.",
      threadId,
      type
    );
  }

  try {
    const response = await api.reviewPendingMemberRequest(
      { members, isApprove },
      String(groupId)
    );
    const actionText = isApprove ? "duyệt" : "từ chối";
    const successCount = members.filter(uid => {
      const code = response?.[uid];
      return code === 0 || code === 1 || code === "0" || code === "1";
    }).length;
    const failCount = members.length - successCount;
    return api.sendMessage(
      `✅ Đã gửi yêu cầu ${actionText} ${members.length} thành viên cho nhóm ${groupId}.\n` +
      `• Thành công: ${successCount}\n` +
      `• Thất bại: ${failCount}`,
      threadId,
      type
    );
  } catch (error) {
    console.error("[REVIEWPENDING] Lỗi:", error);
    return api.sendMessage(
      `❌ Không thể xử lý yêu cầu: ${error?.message || error}`,
      threadId,
      type
    );
  }
};
