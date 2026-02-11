const { ThreadType } = require("zca-js");

const STATE_KEY = "__cutlink_state";

module.exports.config = {
  name: "cutlink",
  aliases: ["enablelink", "locklink", "unlocklink"],
  version: "2.0.0",
  role: 1,
  author: "Cascade",
  description: "cutlink on bật link nhóm, cutlink off tắt link. Hiển thị link nếu bật thành công.",
  category: "Quản lý nhóm",
  usage: "cutlink <on|off|status> [groupId]",
  cooldowns: 5
};

function extractGroupId(args = []) {
  for (const token of args) {
    if (!token) continue;
    const digits = String(token).replace(/[^\d]/g, "");
    if (digits.length >= 12) {
      return digits;
    }
  }
  return null;
}

function ensureStateStore() {
  if (!(global[STATE_KEY] instanceof Map)) {
    global[STATE_KEY] = new Map();
  }
  return global[STATE_KEY];
}

function setState(groupId, payload) {
  if (!groupId) return;
  const store = ensureStateStore();
  const current = store.get(String(groupId)) || {};
  store.set(String(groupId), { ...current, ...payload, updatedAt: Date.now() });
}

function getState(groupId) {
  if (!groupId) return { enabled: false };
  return ensureStateStore().get(String(groupId)) || { enabled: false };
}

function formatStatusMessage(groupId) {
  const state = getState(groupId);
  const enabledLine = state.enabled ? "🔓 Đang bật link nhóm." : "🔒 Đang tắt link nhóm.";
  const linkLine = state.link ? `🔗 Link: ${state.link}` : "";
  const expireLine = state.expiration ? `⏳ Hết hạn: ${new Date(state.expiration * 1000).toLocaleString("vi-VN")}` : "";
  return [enabledLine, linkLine, expireLine].filter(Boolean).join("\n");
}

async function ensureGroupAdmin(api, event) {
  const { threadId, type, data } = event || {};
  if (type !== ThreadType.Group) {
    throw new Error("Lệnh này chỉ dùng trong nhóm.");
  }

  const senderId = data?.uidFrom || event?.authorId;
  const cfg = global?.config || {};
  const botAdmins = new Set([
    ...(Array.isArray(cfg.admin_bot) ? cfg.admin_bot : []),
    ...(Array.isArray(cfg.owner_bot) ? cfg.owner_bot : [])
  ].map(String));

  if (botAdmins.has(String(senderId))) {
    return;
  }

  const readers = ["getGroupInfo", "getThreadInfo", "getConversationInfo"];
  for (const method of readers) {
    if (typeof api[method] !== "function") continue;
    try {
      const info = await api[method](threadId);
      if (!info) continue;

      const creator = info.creator_id || info.creatorId || info.owner_id;
      if (creator && String(creator) === String(senderId)) {
        return;
      }

      const admins = info.adminIDs || info.adminIds || info.admins || [];
      if (admins.some((id) => String(id) === String(senderId))) {
        return;
      }
    } catch (error) {
      // tiếp tục thử hàm khác
    }
  }

  throw new Error("Bạn cần là quản trị viên nhóm hoặc admin bot.");
}

module.exports.run = async function run({ api, event, args }) {
  const { threadId, type } = event;

  try {
    await ensureGroupAdmin(api, event);
  } catch (error) {
    return api.sendMessage(`❌ ${error.message}`, threadId, type);
  }

  const providedGroupId = extractGroupId(args);
  const targetGroupId = providedGroupId || (type === ThreadType.Group ? String(threadId) : null);

  if (!targetGroupId) {
    return api.sendMessage(
      "❌ Vui lòng ở trong nhóm cần thao tác hoặc truyền kèm groupId hợp lệ.",
      threadId,
      type
    );
  }

  const action = String(args[0] || "status").toLowerCase();

  if (action === "status") {
    return api.sendMessage(formatStatusMessage(targetGroupId) || "ℹ️ Chưa có dữ liệu cutlink.", threadId, type);
  }

  if (action === "off") {
    if (typeof api.disableGroupLink !== "function") {
      return api.sendMessage(
        "⚠️ API disableGroupLink chưa khả dụng trên phiên bản bot hiện tại.",
        threadId,
        type
      );
    }
    try {
      await api.disableGroupLink(String(targetGroupId));
      setState(targetGroupId, { enabled: false, link: null, expiration: null });
      return api.sendMessage(
        `✅ Đã tắt link tham gia nhóm.\n🆔 Group ID: ${targetGroupId}`,
        threadId,
        type
      );
    } catch (error) {
      console.error("[CUTLINK][OFF]", error);
      return api.sendMessage(
        `❌ Không thể tắt link tham gia nhóm.\nLý do: ${error?.message || "Không xác định"}`,
        threadId,
        type
      );
    }
  }

  if (action === "on") {
    if (typeof api.enableGroupLink !== "function") {
      return api.sendMessage(
        "⚠️ API enableGroupLink chưa khả dụng trên phiên bản bot hiện tại.",
        threadId,
        type
      );
    }
    try {
      const response = await api.enableGroupLink(String(targetGroupId));
      const link = response?.link || response?.url || "(Không nhận được link)";
      const expiration = response?.expiration_date || response?.expirationDate || null;
      setState(targetGroupId, { enabled: true, link, expiration });
      const expireLine = expiration ? `⏳ Hết hạn: ${new Date(expiration * 1000).toLocaleString("vi-VN")}` : "";
      return api.sendMessage(
        [
          "✅ Đã bật link tham gia nhóm.",
          `🔗 Link: ${link}`,
          expireLine
        ].filter(Boolean).join("\n"),
        threadId,
        type
      );
    } catch (error) {
      console.error("[CUTLINK][ON]", error);
      return api.sendMessage(
        `❌ Không thể bật link tham gia nhóm.\nLý do: ${error?.message || "Không xác định"}`,
        threadId,
        type
      );
    }
  }

  return api.sendMessage(
    "❓ Sai cú pháp. Dùng: cutlink on | cutlink off | cutlink status",
    threadId,
    type
  );
}
