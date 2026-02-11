const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "logTaggedMessages",
  version: "1.0.0",
  author: "Cascade",
  description: "Lưu lại tin nhắn có nhắc tới người dùng để phục vụ lệnh checktn",
  event_type: ["message"]
};

const STORAGE_PATH = path.join(__dirname, "..", "..", "data", "tagged_messages.json");
const MAX_PER_USER = 50;

function ensureStorage() {
  fs.mkdirSync(path.dirname(STORAGE_PATH), { recursive: true });
  if (!fs.existsSync(STORAGE_PATH)) {
    fs.writeFileSync(STORAGE_PATH, "{}", "utf8");
  }
}

function readStorage() {
  try {
    ensureStorage();
    const raw = fs.readFileSync(STORAGE_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.warn("[logTaggedMessages] Không thể đọc file lưu trữ:", error.message);
    return {};
  }
}

function writeStorage(data) {
  try {
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.warn("[logTaggedMessages] Không thể ghi file lưu trữ:", error.message);
  }
}

function collectMentionIds(event) {
  const ids = new Set();
  const append = (value) => {
    if (value === undefined || value === null) return;
    const str = String(value).trim();
    if (str) ids.add(str);
  };

  const mentionData = event?.data?.mentions;
  if (Array.isArray(mentionData)) {
    mentionData.forEach((m) => {
      append(m?.uid);
      append(m?.id);
      append(m?.userId);
    });
  } else if (mentionData && typeof mentionData === "object") {
    Object.keys(mentionData).forEach((key) => {
      append(key);
      const val = mentionData[key];
      if (val && typeof val === "object") {
        append(val.uid);
        append(val.id);
        append(val.userId);
      }
    });
  }

  if (Array.isArray(event?.mentions)) {
    event.mentions.forEach((m) => {
      append(m?.uid);
      append(m?.id);
      append(m?.userId);
    });
  }

  const blocks = event?.data?.propertyExt?.avatarUrlTextBlockList;
  if (Array.isArray(blocks)) {
    blocks.forEach((block) => {
      append(block?.uid);
      append(block?.userId);
      append(block?.id);
    });
  }

  return ids;
}

function normalizeContent(rawContent) {
  if (typeof rawContent === "string") {
    return rawContent.trim();
  }
  if (rawContent && typeof rawContent === "object") {
    try {
      const title = rawContent?.title;
      if (typeof title === "string" && title.trim()) {
        return title.trim();
      }
      return JSON.stringify(rawContent);
    } catch (error) {
      return "[Nội dung không hỗ trợ]";
    }
  }
  return "[Tin nhắn không có nội dung văn bản]";
}

module.exports.run = async function logTaggedMessages({ api, event }) {
  try {
    if (!event || !event.data || !event.threadId) return;

    const mentionIds = collectMentionIds(event);
    if (mentionIds.size === 0) return;

    const storage = readStorage();

    const { data, threadId } = event;
    const timestamp = Number(data?.ts) || Date.now();
    const msgId = data?.msgId || data?.cliMsgId || `${threadId}:${timestamp}`;

    const rawContent = data?.content?.title ?? data?.content;
    const content = normalizeContent(rawContent);

    const senderId = data?.uidFrom || data?.senderId || data?.authorId;
    const senderName = data?.dName || data?.displayName || data?.senderName || senderId || "Ẩn danh";

    const threadName = data?.gridName || data?.threadName || data?.chatName || data?.name || event?.threadName || threadId;

    const record = {
      msgId,
      timestamp,
      timestampString: new Date(timestamp).toISOString(),
      threadId,
      threadName,
      content,
      senderId,
      senderName
    };

    for (const mentionId of mentionIds) {
      if (!Array.isArray(storage[mentionId])) {
        storage[mentionId] = [];
      }

      if (!storage[mentionId].some((entry) => entry.msgId === msgId)) {
        storage[mentionId].push(record);
        if (storage[mentionId].length > MAX_PER_USER) {
          storage[mentionId] = storage[mentionId]
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            .slice(0, MAX_PER_USER);
        }
      }
    }

    writeStorage(storage);
  } catch (error) {
    console.warn("[logTaggedMessages] Lỗi xử lý:", error.message);
  }
};
