const STATE_KEY = "__cutgr_state";

module.exports.config = {
  name: "cutgr",
  aliases: ["cutgroup", "cutgrp"],
  version: "2.0.0",
  role: 2,
  author: "Cascade",
  description: "cutgr on sẽ giải tán ngay nhóm hiện tại bằng disperseGroup",
  category: "Admin",
  usage: "cutgr <on|off|status>",
  cooldowns: 5
};

function ensureStateStore() {
  if (!(global[STATE_KEY] instanceof Map)) {
    global[STATE_KEY] = new Map();
  }
  return global[STATE_KEY];
}

function setThreadState(threadId, enabled) {
  if (!threadId) return;
  ensureStateStore().set(String(threadId), { enabled: Boolean(enabled), updatedAt: Date.now() });
}

function getThreadState(threadId) {
  if (!threadId) return { enabled: false };
  return ensureStateStore().get(String(threadId)) || { enabled: false };
}

function formatStatus(threadId) {
  const state = getThreadState(threadId);
  return state.enabled ? "đang bật (sẽ giải tán khi on)" : "đang tắt";
}

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type } = event;

  if (!threadId) {
    return api.sendMessage("❌ Không lấy được groupId hiện tại.", threadId, type);
  }

  if (typeof api?.disperseGroup !== "function") {
    return api.sendMessage(
      "❌ API hiện tại không hỗ trợ disperseGroup. Vui lòng cập nhật bot.",
      threadId,
      type
    );
  }

  const action = String(args[0] || "status").toLowerCase();

  if (action === "status") {
    return api.sendMessage(`ℹ️ cutgr ${formatStatus(threadId)}.`, threadId, type);
  }

  if (action === "off") {
    setThreadState(threadId, false);
    return api.sendMessage("🛑 cutgr đã tắt (không giải tán).", threadId, type);
  }

  if (action === "on") {
    setThreadState(threadId, true);
    try {
      await api.disperseGroup(threadId);
      return api.sendMessage(
        "💣 Đã gửi yêu cầu giải tán nhóm hiện tại. Kiểm tra nhật ký để xác nhận.",
        threadId,
        type
      );
    } catch (error) {
      console.error("[cutgr] disperseGroup error:", error);
      return api.sendMessage(
        `❌ Thao tác thất bại: ${error?.message || "Không rõ lỗi"}`,
        threadId,
        type
      );
    }
  }

  return api.sendMessage(
    "❓ Sai cú pháp. Dùng: cutgr on | cutgr off | cutgr status",
    threadId,
    type
  );
};
