const { ThreadType } = require("zca-js");

module.exports.config = {
  name: "antiphoto",
  aliases: ["anti-photo", "ap"],
  version: "1.0.0",
  role: 1,
  author: "Cascade",
  description: "Bật/tắt cảnh cáo ảnh trong nhóm",
  category: "Quản lý",
  usage: "antiphoto [on|off|status]",
  cooldowns: 3
};

const ENABLE_KEYWORDS = ["on", "bat", "bật", "enable", "1"];
const DISABLE_KEYWORDS = ["off", "tat", "tắt", "disable", "0"];

function ensureThreadConfig(data = {}) {
  if (!data.antiPhoto || typeof data.antiPhoto !== "object") {
    data.antiPhoto = { enabled: false };
  }
  if (typeof data.antiPhoto.enabled !== "boolean") {
    data.antiPhoto.enabled = false;
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
    return api.sendMessage("❌ Không truy cập được dữ liệu nhóm để cấu hình.", threadId, type);
  }

  const action = String(args?.[0] || "").trim().toLowerCase();

  const threadData = await Threads.getData(threadId);
  const data = ensureThreadConfig(threadData?.data || {});
  const current = !!data.antiPhoto.enabled;

  if (action === "status") {
    const status = current ? "đang BẬT" : "đang TẮT";
    const emoji = current ? "🛡️" : "⚪";
    return api.sendMessage(`${emoji} Anti photo ${status} trong nhóm này.`, threadId, type);
  }

  let next;
  if (ENABLE_KEYWORDS.includes(action)) {
    next = true;
  } else if (DISABLE_KEYWORDS.includes(action)) {
    next = false;
  } else {
    next = !current;
  }

  data.antiPhoto.enabled = next;
  data.antiPhoto.updatedBy = String(event?.data?.uidFrom || event?.authorId || "");
  data.antiPhoto.updatedAt = Date.now();

  await Threads.setData(threadId, data);

  const statusText = next ? "đã BẬT" : "đã TẮT";
  const emoji = next ? "🚫" : "✅";
  const hint = next
    ? "Tất cả ảnh sẽ bị cảnh cáo/kick qua event antiPhoto."
    : "Anti photo sẽ không hoạt động cho đến khi bật lại.";

  return api.sendMessage(`${emoji} Anti photo ${statusText}.
ℹ️ ${hint}
📌 Dùng 'antiphoto status' để xem trạng thái.`, threadId, type);
};
