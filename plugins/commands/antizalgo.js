const { ThreadType } = require("zca-js");

module.exports.config = {
  name: "antizalgo",
  aliases: ["anti-zalgo"],
  version: "1.0.0",
  role: 1,
  author: "Cascade",
  description: "Bật/tắt chống ký tự biến dạng (zalgo) trong nhóm",
  category: "Nhóm",
  usage: "antizalgo on/off/status [limit] [autokick on/off]",
  cooldowns: 3
};

function ensure(data = {}) {
  if (!data.antiZalgo || typeof data.antiZalgo !== "object") {
    data.antiZalgo = { enabled: false, limit: 10, autoKick: true, whitelist: [] };
  }
  const c = data.antiZalgo;
  if (typeof c.enabled !== "boolean") c.enabled = false;
  if (!Number.isFinite(Number(c.limit)) || Number(c.limit) < 3) c.limit = 10;
  if (typeof c.autoKick !== "boolean") c.autoKick = true;
  if (!Array.isArray(c.whitelist)) c.whitelist = [];
  return data;
}

module.exports.run = async ({ api, event, args = [], Threads }) => {
  const { threadId, type, data } = event || {};
  if (!threadId || Number(type) !== Number(ThreadType.Group)) {
    return api.sendMessage("❌ Lệnh này chỉ dùng trong nhóm.", threadId, type);
  }
  if (!Threads?.getData || !Threads?.setData) {
    return api.sendMessage("❌ Thiếu Threads storage.", threadId, type);
  }

  const action = args.length ? String(args[0] || "status").toLowerCase() : "toggle";
  const row = await Threads.getData(threadId);
  const tData = ensure(row?.data || {});
  const c = tData.antiZalgo;

  if (action === "toggle") {
    c.enabled = !c.enabled;
    c.autoKick = true;
    c.updatedBy = String(data?.uidFrom || event?.authorId || "");
    c.updatedAt = Date.now();
    await Threads.setData(threadId, tData);
    return api.sendMessage(`✅ AntiZalgo ${c.enabled ? "BẬT" : "TẮT"}. (autokick: ON)`, threadId, type);
  }

  if (action === "status") {
    return api.sendMessage(
      `🛡️ AntiZalgo: ${c.enabled ? "🟢 BẬT" : "🔴 TẮT"}\n• limit: ${c.limit}\n• autokick: ${c.autoKick ? "ON" : "OFF"}`,
      threadId,
      type
    );
  }

  const enable = ["on", "bat", "bật", "1", "enable"].includes(action)
    ? true
    : ["off", "tat", "tắt", "0", "disable"].includes(action)
      ? false
      : !c.enabled;

  const limit = Number.isFinite(Number(args[1])) ? Math.floor(Number(args[1])) : null;
  const autoKickArg = String(args[2] || "").toLowerCase();
  const autoKick = ["on", "1", "enable"].includes(autoKickArg)
    ? true
    : ["off", "0", "disable"].includes(autoKickArg)
      ? false
      : null;

  c.enabled = enable;
  if (limit != null && limit >= 3 && limit <= 100) c.limit = limit;
  if (autoKick != null) c.autoKick = autoKick;
  c.updatedBy = String(data?.uidFrom || event?.authorId || "");
  c.updatedAt = Date.now();

  await Threads.setData(threadId, tData);
  return api.sendMessage(`✅ AntiZalgo ${c.enabled ? "BẬT" : "TẮT"}.`, threadId, type);
};
