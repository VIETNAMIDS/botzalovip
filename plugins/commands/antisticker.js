const { ThreadType } = require("zca-js");

module.exports.config = {
  name: "antisticker",
  aliases: ["anti-sticker", "as"],
  version: "1.0.0",
  role: 1,
  author: "Cascade",
  description: "Bật/tắt cảnh cáo người gửi sticker trong nhóm",
  category: "Quản lý",
  usage: "antisticker [on|off|status]",
  cooldowns: 3
};

const ENABLE_KEYWORDS = ["on", "bat", "bật", "enable", "1"];
const DISABLE_KEYWORDS = ["off", "tat", "tắt", "disable", "0"];

function ensureThreadConfig(data = {}) {
  if (!data.antiSticker || typeof data.antiSticker !== "object") {
    data.antiSticker = { enabled: false };
  }
  if (typeof data.antiSticker.enabled !== "boolean") {
    data.antiSticker.enabled = false;
  }
  return data;
}

module.exports.run = async function ({ api, event, args, Threads }) {
  const { threadId, type } = event;
  if (!threadId) return;

  const isGroup = Number(type) === ThreadType.Group || event.isGroup === true;
  if (!isGroup) {
    return api.sendMessage("❌ Lệnh này chỉ dùng trong nhóm.", threadId, type);
  }

  if (!Threads || typeof Threads.getData !== "function" || typeof Threads.setData !== "function") {
    return api.sendMessage("❌ Không thể truy cập dữ liệu nhóm để cấu hình.", threadId, type);
  }

  const action = String(args?.[0] || "").trim().toLowerCase();

  const threadData = await Threads.getData(threadId);
  const data = ensureThreadConfig(threadData?.data || {});
  const current = !!data.antiSticker.enabled;

  if (action === "status") {
    const status = current ? "đang BẬT" : "đang TẮT";
    const emoji = current ? "🛡️" : "⚪";
    return api.sendMessage(`${emoji} Anti sticker ${status} trong nhóm này.`, threadId, type);
  }

  let next;
  if (ENABLE_KEYWORDS.includes(action)) {
    next = true;
  } else if (DISABLE_KEYWORDS.includes(action)) {
    next = false;
  } else {
    next = !current;
  }

  data.antiSticker.enabled = next;
  data.antiSticker.updatedBy = String(event?.data?.uidFrom || event?.authorId || "");
  data.antiSticker.updatedAt = Date.now();

  await Threads.setData(threadId, data);

  const statusText = next ? "đã BẬT" : "đã TẮT";
  const emoji = next ? "🚫" : "✅";
  const hint = next
    ? "Tất cả sticker sẽ bị cảnh cáo bằng event antiSticker."
    : "Anti sticker sẽ không hoạt động cho đến khi bật lại.";

  return api.sendMessage(`${emoji} Anti sticker ${statusText}.
ℹ️ ${hint}
📌 Dùng 'antisticker status' để xem trạng thái.`, threadId, type);
};
