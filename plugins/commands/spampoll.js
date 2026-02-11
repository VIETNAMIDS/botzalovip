const fs = require("fs");
const path = require("path");
const { ThreadType } = require("zca-js");

const DEFAULT_COUNT = 3;
const MAX_COUNT = 20;
const DEFAULT_DELAY = 1500;
const MIN_DELAY = 300;
const CONTENT_FILE = path.join(__dirname, "noidung.txt");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports.config = {
  name: "spampoll",
  aliases: ["pollspam"],
  version: "1.1.0",
  role: 2,
  author: "Cascade",
  description: "Spam tạo poll nhiều lần (chỉ admin bot, chỉ trong nhóm)",
  category: "Quản lý nhóm",
  usage: "spampoll [delay_ms] [số_lần] (nếu không nhập câu hỏi sẽ lấy từng dòng trong noidung.txt)",
  cooldowns: 5
};

function isBotAdmin(uid) {
  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const owners = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  const whitelist = Array.isArray(cfg.protected_admins) ? cfg.protected_admins.map(String) : [];
  const all = new Set([...admins, ...owners, ...whitelist]);
  return all.has(String(uid));
}

function parsePollInput(text = "") {
  const raw = text.trim();
  if (!raw) return null;
  const separator = raw.includes("|") ? "|" : raw.includes(",") ? "," : null;
  if (!separator) return null;

  const segments = raw
    .split(separator)
    .map((seg) => seg.trim())
    .filter(Boolean);

  if (segments.length < 3) return null;
  return {
    question: segments[0],
    options: segments.slice(1)
  };
}

function loadPollTemplates() {
  try {
    const raw = fs.readFileSync(CONTENT_FILE, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parsePollInput(line))
      .filter(Boolean);
  } catch (error) {
    console.error("[spampoll] Không đọc được file noidung.txt:", error?.message || error);
    return [];
  }
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;
  const interactionMode = global.bonzInteractionSettings?.[threadId] || "all";
  if (interactionMode === "silent") return;

  if (type !== ThreadType.Group) {
    return api.sendMessage("❌ Lệnh này chỉ dùng trong nhóm.", threadId, type);
  }

  const senderId = data?.uidFrom || event?.authorId;
  if (!isBotAdmin(senderId)) {
    return api.sendMessage("🚫 Lệnh này chỉ dành cho admin/owner bot.", threadId, type);
  }

  if (typeof api.createPoll !== "function") {
    return api.sendMessage(
      "⚠️ API createPoll không khả dụng trên phiên bản bot hiện tại.",
      threadId,
      type
    );
  }

  const tokens = [...args];

  let delayMs = DEFAULT_DELAY;
  if (tokens.length && !Number.isNaN(Number(tokens[0]))) {
    delayMs = Math.max(MIN_DELAY, parseInt(tokens.shift(), 10) || DEFAULT_DELAY);
  }

  let count = DEFAULT_COUNT;
  if (tokens.length && !Number.isNaN(Number(tokens[0]))) {
    count = Math.max(1, Math.min(MAX_COUNT, parseInt(tokens.shift(), 10) || DEFAULT_COUNT));
  }

  const body = tokens.join(" ").trim();
  let manualPoll = null;
  if (body) {
    manualPoll = parsePollInput(body);
    if (!manualPoll) {
      return api.sendMessage(
        "❌ Cú pháp poll không hợp lệ. Ví dụ: spampoll 1000 5 Bạn chọn gì?, 1, 2, 3",
        threadId,
        type
      );
    }
  }

  const templates = manualPoll ? [] : loadPollTemplates();
  if (!manualPoll && !templates.length) {
    return api.sendMessage("❌ Không tìm thấy nội dung hợp lệ trong noidung.txt.", threadId, type);
  }

  const samplePoll = manualPoll || templates[0];
  if (samplePoll.options.length > 20) {
    return api.sendMessage("⚠️ Poll chỉ hỗ trợ tối đa 20 lựa chọn.", threadId, type);
  }

  await api.sendMessage(
    `⏳ Bắt đầu spam poll (${count} lần, delay ${delayMs}ms).\n❓ ${
      manualPoll ? manualPoll.question : "Đọc từ noidung.txt"
    }`,
    threadId,
    type
  );

  let success = 0;
  let failed = 0;
  let lastError = null;

  for (let i = 0; i < count; i += 1) {
    const pollData = manualPoll || templates[i % templates.length];
    if (!pollData) {
      failed += 1;
      lastError = new Error("Thiếu dữ liệu poll.");
      continue;
    }

    if (pollData.options.length > 20 || pollData.options.length < 2) {
      failed += 1;
      lastError = new Error("Số lựa chọn không hợp lệ trong noidung.txt.");
      continue;
    }

    try {
      await api.createPoll(
        {
          question: pollData.question,
          options: pollData.options
        },
        threadId
      );
      success += 1;
    } catch (error) {
      failed += 1;
      lastError = error;
    }

    if (i < count - 1) {
      await sleep(delayMs);
    }
  }

  const summary = [
    `✅ Thành công: ${success}/${count}`,
    failed ? `⚠️ Lỗi gần nhất: ${lastError?.message || "Không xác định"}` : null
  ]
    .filter(Boolean)
    .join("\n");

  return api.sendMessage(summary, threadId, type);
};
