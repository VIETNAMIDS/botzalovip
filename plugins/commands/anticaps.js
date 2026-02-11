const { ThreadType } = require("zca-js");

module.exports.config = {
  name: "anticaps",
  aliases: ["anti-caps"],
  version: "1.0.0",
  role: 1,
  author: "Cascade",
  description: "Bật/tắt chống viết HOA quá nhiều trong nhóm",
  category: "Nhóm",
  usage: "anticaps on/off/status [minLength] [ratio 0.5-0.95] [autokick on/off]",
  cooldowns: 3
};

function ensure(data = {}) {
  if (!data.antiCaps || typeof data.antiCaps !== "object") {
    data.antiCaps = { enabled: false, minLength: 12, ratio: 0.75, autoKick: true, whitelist: [] };
  }
  const c = data.antiCaps;
  if (typeof c.enabled !== "boolean") c.enabled = false;
  if (!Number.isFinite(Number(c.minLength)) || Number(c.minLength) < 5) c.minLength = 12;
  if (!Number.isFinite(Number(c.ratio)) || Number(c.ratio) <= 0 || Number(c.ratio) >= 1) c.ratio = 0.75;
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
  const c = tData.antiCaps;

  if (action === "toggle") {
    c.enabled = !c.enabled;
    c.autoKick = true;
    c.updatedBy = String(data?.uidFrom || event?.authorId || "");
    c.updatedAt = Date.now();
    await Threads.setData(threadId, tData);
    return api.sendMessage(`✅ AntiCaps ${c.enabled ? "BẬT" : "TẮT"}. (autokick: ON)`, threadId, type);
  }

  if (action === "status") {
    return api.sendMessage(
      `🛡️ AntiCaps: ${c.enabled ? "🟢 BẬT" : "🔴 TẮT"}\n• minLength: ${c.minLength}\n• ratio: ${c.ratio}\n• autokick: ${c.autoKick ? "ON" : "OFF"}`,
      threadId,
      type
    );
  }

  const enable = ["on", "bat", "bật", "1", "enable"].includes(action)
    ? true
    : ["off", "tat", "tắt", "0", "disable"].includes(action)
      ? false
      : !c.enabled;

  const minLength = Number.isFinite(Number(args[1])) ? Math.floor(Number(args[1])) : null;
  const ratio = Number.isFinite(Number(args[2])) ? Number(args[2]) : null;
  const autoKickArg = String(args[3] || "").toLowerCase();
  const autoKick = ["on", "1", "enable"].includes(autoKickArg)
    ? true
    : ["off", "0", "disable"].includes(autoKickArg)
      ? false
      : null;

  c.enabled = enable;
  if (minLength != null && minLength >= 5 && minLength <= 200) c.minLength = minLength;
  if (ratio != null && ratio >= 0.5 && ratio <= 0.95) c.ratio = ratio;
  if (autoKick != null) c.autoKick = autoKick;
  c.updatedBy = String(data?.uidFrom || event?.authorId || "");
  c.updatedAt = Date.now();

  await Threads.setData(threadId, tData);
  return api.sendMessage(`✅ AntiCaps ${c.enabled ? "BẬT" : "TẮT"}.`, threadId, type);
};
