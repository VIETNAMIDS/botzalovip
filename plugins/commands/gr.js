module.exports.config = {
  name: "gr",
  aliases: ["grov", "groupnoti"],
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Bật/tắt bot xử lý sự kiện group_event (đổi tên/đổi ảnh/join/leave...) theo từng nhóm",
  category: "Hệ thống",
  usage: "gr <on|off|status>",
  cooldowns: 2
};

const STATE_KEY = "group_event_off";

function parseAction(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "status";
  if (["on", "enable", "bat", "bật"].includes(s)) return "on";
  if (["off", "disable", "tat", "tắt"].includes(s)) return "off";
  if (["status", "st", "check"].includes(s)) return "status";
  return null;
}

module.exports.run = async function ({ api, event, args = [], Threads }) {
  const { threadId, type } = event;
  const normalizedThreadId = threadId ? String(threadId) : null;

  const action = parseAction(args[0]);
  if (!action) {
    return api.sendMessage("❌ Tham số không hợp lệ. Dùng: gr on | gr off | gr status", threadId, type);
  }

  const threadData = await Threads.getData(normalizedThreadId).catch(() => null);
  const info = threadData?.data || {};

  if (action === "status") {
    const isOff = info[STATE_KEY] === true;
    return api.sendMessage(
      isOff
        ? "🔕 Đang TẮT xử lý sự kiện nhóm (group_event). Bot vẫn nghe lệnh."
        : "📣 Đang BẬT xử lý sự kiện nhóm (group_event).",
      threadId,
      type
    );
  }

  if (action === "off") {
    info[STATE_KEY] = true;
    Threads.setData(normalizedThreadId, info);
    return api.sendMessage("🔕 Đã tắt xử lý group_event cho nhóm này. Bot vẫn nghe lệnh.", threadId, type);
  }

  info[STATE_KEY] = false;
  Threads.setData(normalizedThreadId, info);
  return api.sendMessage("📣 Đã bật xử lý group_event cho nhóm này.", threadId, type);
};
