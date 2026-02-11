const fs = require("fs");
const path = require("path");

const CONTENT_FILE = path.join(__dirname, "noidung.txt");
const DEFAULT_DELAY = 500;
const DEFAULT_COUNT = 5;
const MAX_COUNT = 50;
const AUTO_DELETE_MS = 30_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function scheduleAutoDelete(api, msgId) {
  if (!msgId || typeof api.unsendMessage !== "function") return;
  setTimeout(async () => {
    try {
      await api.unsendMessage(msgId);
    } catch (error) {
      console.error("[spamcard] unsendMessage error:", error?.message || error);
    }
  }, AUTO_DELETE_MS);
}

function loadCardContents() {
  try {
    const raw = fs.readFileSync(CONTENT_FILE, "utf8");
    return raw
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
  } catch (err) {
    console.error("[spamcard] Không đọc được file noidung.txt:", err.message);
    return [];
  }
}

module.exports.config = {
  name: "spamcard",
  version: "1.1.0",
  role: 0,
  author: "Cascade",
  description: "Spam gửi danh thiếp lấy nội dung từ noidung.txt",
  category: "Tiện ích",
  usage: "spamcard [delay_ms] [số lần] @user",
  cooldowns: 5,
  aliases: ["scspam"]
};

module.exports.run = async ({ args, event, api }) => {
  const { threadId, type, data } = event;

  const interactionMode = global.bonzInteractionSettings?.[threadId] || "all";
  if (interactionMode === "silent") {
    return;
  }

  const mentions = data?.mentions || [];
  if (!mentions.length) {
    return api.sendMessage("❌ Bạn cần tag ít nhất 1 người để spam danh thiếp.", threadId, type);
  }

  let delayMs = DEFAULT_DELAY;
  if (args.length && !isNaN(Number(args[0]))) {
    delayMs = Math.max(100, parseInt(args.shift(), 10) || DEFAULT_DELAY);
  }

  let count = DEFAULT_COUNT;
  if (args.length && !isNaN(Number(args[0]))) {
    count = Math.max(1, Math.min(MAX_COUNT, parseInt(args.shift(), 10) || DEFAULT_COUNT));
  }

  const contents = loadCardContents();
  if (!contents.length) {
    return api.sendMessage("❌ Không đọc được nội dung từ noidung.txt.", threadId, type);
  }

  let contentIndex = 0;
  const nextContent = () => {
    const text = contents[contentIndex % contents.length];
    contentIndex += 1;
    return text;
  };

  const payloadTemplate = (uid) => {
    const payload = { userId: uid, ttl: AUTO_DELETE_MS };
    const text = nextContent();
    if (text) {
      payload.phoneNumber = text;
    }
    return payload;
  };

  try {
    for (let i = 0; i < count; i++) {
      for (const mention of mentions) {
        const response = await api.sendCard(payloadTemplate(mention.uid), threadId, type);
        scheduleAutoDelete(api, response?.msgId);
      }
      if (i < count - 1) {
        await sleep(delayMs);
      }
    }

    return api.sendMessage(
      `✅ Đã spam ${count} lần danh thiếp cho ${mentions.length} người (delay ${delayMs}ms, auto delete 30s).`,
      threadId,
      type
    );
  } catch (error) {
    console.error("[spamcard] sendCard error:", error);
    return api.sendMessage("❌ Không gửi được danh thiếp. Vui lòng thử lại!", threadId, type);
  }
};
