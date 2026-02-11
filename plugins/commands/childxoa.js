const fs = require("fs");
const path = require("path");
const stopchild = require("./stopchild");
const { childRental } = require("../../utils/index");

module.exports.config = {
  name: "childxoa",
  aliases: ["deletechild", "childdelete", "xoabotcon"],
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Xóa hoàn toàn dữ liệu bot con (admin/owner)",
  category: "Admin",
  usage: "childxoa <childKey>",
  cooldowns: 5
};

const CHILD_KEY_DEFAULT = "__default";
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const CHILD_DATA_ROOT = path.join(DATA_DIR, "childbots");
const DEFAULT_SESSION_PATH = path.join(DATA_DIR, "child_session.json");
const DEFAULT_HISTORY_PATH = path.join(DATA_DIR, "child_login_history.json");

function normalizeChildKey(rawKey) {
  const trimmed = String(rawKey || "").trim();
  if (!trimmed || trimmed === CHILD_KEY_DEFAULT) return CHILD_KEY_DEFAULT;
  const lowered = trimmed.toLowerCase();
  if (lowered === "default") return CHILD_KEY_DEFAULT;
  return lowered
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "") || CHILD_KEY_DEFAULT;
}

function formatChildLabel(childKey = CHILD_KEY_DEFAULT) {
  return childKey === CHILD_KEY_DEFAULT ? "bot con mặc định" : `bot con "${childKey}"`;
}

function isAdmin(senderId) {
  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  let owners = [];
  const ownersConf = cfg.owner_bot;
  if (Array.isArray(ownersConf)) owners = ownersConf.map(String);
  else if (typeof ownersConf === "string" && ownersConf.trim()) owners = [ownersConf.trim()];

  const id = String(senderId || "");
  return id && (admins.includes(id) || owners.includes(id));
}

function getChildDirectories(childKey) {
  if (childKey === CHILD_KEY_DEFAULT) {
    return {
      sessionPath: DEFAULT_SESSION_PATH,
      historyPath: DEFAULT_HISTORY_PATH,
      dataDir: null
    };
  }

  const childDir = path.join(CHILD_DATA_ROOT, childKey);
  return {
    sessionPath: path.join(childDir, "session.json"),
    historyPath: path.join(childDir, "history.json"),
    dataDir: childDir
  };
}

async function deleteFileIfExists(filePath) {
  try {
    if (!filePath) return false;
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`[childxoa] Không thể xóa file ${path.basename(filePath)}: ${error?.message || error}`);
    return false;
  }
}

async function deleteDirectoryIfExists(dirPath) {
  try {
    if (!dirPath) return false;
    if (fs.existsSync(dirPath)) {
      await fs.promises.rm(dirPath, { recursive: true, force: true });
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`[childxoa] Không thể xóa thư mục ${path.basename(dirPath)}: ${error?.message || error}`);
    return false;
  }
}

module.exports.run = async ({ api, event, args = [] }) => {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;

  const interactionMode = global.bonzInteractionSettings?.[threadId] || "all";
  if (interactionMode === "silent") {
    return;
  }

  if (!isAdmin(senderId)) {
    return api.sendMessage("🚫 Bạn không có quyền sử dụng lệnh này.", threadId, type);
  }

  if (!args[0]) {
    return api.sendMessage("❌ Thiếu childKey. Ví dụ: childxoa child1", threadId, type);
  }

  const childKey = normalizeChildKey(args[0]);
  const label = formatChildLabel(childKey);

  const actions = [];

  if (stopchild && typeof stopchild.stopChildByKey === "function") {
    try {
      const stopResult = await stopchild.stopChildByKey(childKey);
      if (stopResult.success) {
        actions.push(`⏹️ Đã dừng ${label}.`);
      } else if (stopResult.reason !== "inactive") {
        actions.push(`⚠️ Không thể dừng ${label}: ${stopResult.reason}`);
      }
    } catch (error) {
      actions.push(`⚠️ Lỗi khi dừng ${label}: ${error?.message || error}`);
    }
  }

  if (global.__childBots && global.__childBots[childKey]) {
    delete global.__childBots[childKey];
    actions.push("🧹 Đã xóa trạng thái lưu trong bộ nhớ.");
  }

  const dirs = getChildDirectories(childKey);
  const sessionDeleted = await deleteFileIfExists(dirs.sessionPath);
  const historyDeleted = await deleteFileIfExists(dirs.historyPath);
  const dirDeleted = await deleteDirectoryIfExists(dirs.dataDir);

  if (sessionDeleted) actions.push("🗑️ Đã xóa session đăng nhập.");
  if (historyDeleted) actions.push("📜 Đã xóa lịch sử đăng nhập.");
  if (dirDeleted) actions.push("📁 Đã xóa thư mục dữ liệu bot con.");

  if (childRental && typeof childRental.removeRental === "function") {
    try {
      const removed = childRental.removeRental(childKey);
      if (removed) actions.push("📦 Đã xóa thông tin thuê bot con.");
    } catch (error) {
      actions.push(`⚠️ Không thể xóa thuê bot con: ${error?.message || error}`);
    }
  }

  if (childKey === CHILD_KEY_DEFAULT) {
    actions.push("ℹ️ Đây là bot con mặc định. Hãy đăng nhập lại nếu muốn sử dụng tiếp.");
  }

  if (actions.length === 0) {
    actions.push("ℹ️ Không tìm thấy dữ liệu nào cần xóa.");
  }

  return api.sendMessage(`✅ Hoàn tất xóa ${label}:
${actions.join("\n")}`, threadId, type);
};
