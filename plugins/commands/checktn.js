const path = require("path");
const fs = require("fs");
const { convertTimestamp } = require("../../utils/index");

module.exports.config = {
  name: "checktn",
  version: "1.0.0",
  role: 0,
  author: "Cascade",
  description: "Hiển thị lịch sử tin nhắn tag một người dùng",
  category: "Tin nhắn",
  usage: "checktn @tag | checktn <uid>",
  cooldowns: 3
};

const CACHE_PATH = path.join(__dirname, "..", "..", "data", "tagged_messages.json");
const MAX_RESULTS = 5;

function loadTaggedMessages() {
  try {
    if (!fs.existsSync(CACHE_PATH)) return {};
    const raw = fs.readFileSync(CACHE_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.error("[checktn] Lỗi đọc tagged_messages.json:", error.message);
    return {};
  }
}

function formatMessage(msg, idx) {
  const timeString = msg.timestamp ? convertTimestamp(msg.timestamp) : msg.timestampString || "(không rõ)";
  const content = msg.content || "(Nội dung không khả dụng)";
  const sender = msg.senderName || msg.uidFrom || "Ẩn danh";
  const group = msg.threadName || msg.threadId || "Không rõ nhóm";

  return `${idx}. 👥 ${group}\n   👤 Người tag: ${sender}\n   🕒 Thời gian: ${timeString}\n   💬 Nội dung: ${content}`;
}

function extractTargetId(event, args) {
  if (event?.mentions && Object.keys(event.mentions).length > 0) {
    return Object.keys(event.mentions)[0];
  }

  if (event?.data?.mentions && Array.isArray(event.data.mentions) && event.data.mentions.length > 0) {
    const mention = event.data.mentions[0];
    return mention?.uid || mention?.id || mention?.userId || null;
  }

  if (args.length > 0) {
    const candidate = args[0].trim();
    if (/^\d{6,}$/.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;

  const interactionMode = global.bonzInteractionSettings?.[threadId] || "all";
  if (interactionMode === "silent") {
    return;
  }

  const targetId = extractTargetId(event, args);

  if (!targetId) {
    const guide = "⚠️ Vui lòng tag người dùng hoặc nhập UID.\n- checktn @tag người cần xem\n- checktn <uid>";
    return api.sendMessage({ msg: guide }, threadId, type);
  }

  const taggedMessages = loadTaggedMessages();
  const userMessages = Array.isArray(taggedMessages[targetId]) ? taggedMessages[targetId] : [];

  if (userMessages.length === 0) {
    return api.sendMessage({ msg: `ℹ️ Không tìm thấy tin nhắn nào tag UID ${targetId}.` }, threadId, type);
  }

  const recentMessages = userMessages
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, MAX_RESULTS);

  const formatted = recentMessages.map((msg, idx) => formatMessage(msg, idx + 1)).join("\n\n");

  const response = `📥 Lịch sử tag của UID ${targetId}\n──────────────────\n${formatted}\n──────────────────\n📦 Tổng bản ghi: ${userMessages.length}`;

  return api.sendMessage({ msg: response }, threadId, type);
};
