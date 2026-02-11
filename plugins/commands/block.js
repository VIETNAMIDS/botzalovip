const { ThreadType } = require("zca-js");

module.exports.config = {
  name: "block",
  aliases: ["blockmember", "gblock", "blockuser"],
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Chặn thành viên khỏi nhóm bằng UID (thêm vào danh sách bị chặn của nhóm)",
  category: "Quản lý nhóm",
  usage: "blockmember <uid hoặc @tag> [groupId]",
  cooldowns: 5
};

function isBotAdmin(userId) {
  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const owners = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  const whitelist = Array.isArray(cfg.protected_admins) ? cfg.protected_admins.map(String) : [];
  const all = new Set([...admins, ...owners, ...whitelist].map(String));
  return all.has(String(userId));
}

function normalizeDigits(input = "") {
  if (!input) return "";
  return input.replace(/[^\d]/g, "");
}

function extractMemberId(args, data) {
  if (Array.isArray(data?.mentions) && data.mentions.length > 0) {
    const mentionUid = data.mentions[0]?.uid;
    if (mentionUid) {
      return { memberId: String(mentionUid), remainingArgs: args };
    }
  }

  if (args.length > 0) {
    const memberCandidate = normalizeDigits(args[0]);
    if (memberCandidate.length >= 12) {
      return {
        memberId: memberCandidate,
        remainingArgs: args.slice(1)
      };
    }
  }

  return { memberId: null, remainingArgs: args };
}

function extractGroupId(args, fallbackThreadId, type) {
  if (args.length > 0) {
    const groupCandidate = normalizeDigits(args[0]);
    if (groupCandidate.length >= 12) {
      return groupCandidate;
    }
  }

  if (type === ThreadType.Group && fallbackThreadId) {
    return String(fallbackThreadId);
  }

  return null;
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;
  const interactionMode = global.bonzInteractionSettings?.[threadId] || "all";
  if (interactionMode === "silent") return;

  const senderId = data?.uidFrom || event?.authorId;
  if (!isBotAdmin(senderId)) {
    return api.sendMessage("🚫 Lệnh này chỉ dành cho admin/owner bot.", threadId, type);
  }

  const { memberId, remainingArgs } = extractMemberId(args, data);
  if (!memberId) {
    return api.sendMessage(
      "❌ Vui lòng cung cấp UID hợp lệ hoặc tag người cần chặn.\nVí dụ: blockmember 0123456789012",
      threadId,
      type
    );
  }

  const groupId = extractGroupId(remainingArgs, threadId, type);
  if (!groupId) {
    return api.sendMessage(
      "❌ Bạn cần cung cấp ID nhóm (hoặc dùng trong nhóm để tự lấy).\nVí dụ: blockmember 0123456789012 0987654321098",
      threadId,
      type
    );
  }

  if (typeof api.addGroupBlockedMember !== "function") {
    return api.sendMessage(
      "⚠️ API addGroupBlockedMember không khả dụng trên phiên bản bot hiện tại.",
      threadId,
      type
    );
  }

  try {
    await api.addGroupBlockedMember(memberId, groupId);
    return api.sendMessage(
      `✅ Đã chặn UID ${memberId} trong nhóm ${groupId}.`,
      threadId,
      type
    );
  } catch (error) {
    console.error("[BLOCKMEMBER] Lỗi:", error);
    return api.sendMessage(
      `❌ Không thể chặn UID ${memberId} trong nhóm ${groupId}.\nLý do: ${error?.message || "Không xác định"}`,
      threadId,
      type
    );
  }
};
