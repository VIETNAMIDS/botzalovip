const fs = require("fs");
const path = require("path");
const YAML = require("yaml");
const { Zalo } = require("zca-js");
const logger = require("../utils/logger");
const listener = require("../core/listen");
const loaderCommand = require("../core/loader/loaderCommand");
const loaderEvent = require("../core/loader/loaderEvent");

function normalizeChildKey(rawKey) {
  const trimmed = String(rawKey || "").trim();
  if (!trimmed) return "__default";
  if (trimmed === "__default" || trimmed.toLowerCase() === "default") return "__default";
  const normalized = trimmed
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
  return normalized || "__default";
}

function getSessionFilePath(projectRoot, childKey) {
  const key = normalizeChildKey(childKey);
  const dataDir = path.join(projectRoot, "data");
  if (key === "__default") {
    return path.join(dataDir, "child_session.json");
  }
  return path.join(dataDir, "childbots", key, "session.json");
}

function readSession(projectRoot, childKey) {
  const fp = getSessionFilePath(projectRoot, childKey);
  if (!fs.existsSync(fp)) return null;
  const raw = fs.readFileSync(fp, "utf8");
  if (!raw.trim()) return null;
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === "object" && parsed.cookie && parsed.imei) return parsed;
  return null;
}

function normalizeCookieForLogin(cookie) {
  if (!cookie) return cookie;
  if (Array.isArray(cookie)) return cookie;
  if (typeof cookie === "object" && Array.isArray(cookie.cookies)) return cookie.cookies;
  return cookie;
}

function attachFetchAccountInfo(api, session) {
  if (!api || typeof api !== "object") return;
  if (typeof api.fetchAccountInfo === "function") return;

  api.fetchAccountInfo = async () => {
    const ctx = api.ctx || {};

    const resolveUid = async () => {
      const candidates = [session?.uid, ctx.userId, ctx.uid, ctx.user_id];
      for (const c of candidates) {
        if (c !== null && c !== undefined && String(c).trim()) return String(c);
      }

      try {
        if (typeof api.getCurrentUserId === "function") {
          const uid = await api.getCurrentUserId();
          if (uid) return String(uid);
        }
      } catch {}

      try {
        if (typeof api.getCurrentUserID === "function") {
          const uid = await api.getCurrentUserID();
          if (uid) return String(uid);
        }
      } catch {}

      return null;
    };

    const uid = await resolveUid();
    let displayName = session?.displayName || ctx.displayName || ctx.name || null;
    let avatar = session?.avatar || ctx.avatar || null;

    try {
      if (typeof api.getCurrentUserInfo === "function") {
        const info = await api.getCurrentUserInfo();
        if (info && typeof info === "object") {
          displayName = displayName || info.displayName || info.name || info.fullName || info.full_name || null;
          avatar = avatar || info.avatar || info.avatarUrl || info.profilePicture || null;
        }
      }
    } catch {}

    if (uid && typeof api.getUserInfo === "function") {
      try {
        const info = await api.getUserInfo(uid);
        const profile = info?.changed_profiles?.[uid] || info?.profiles?.[uid] || info;
        if (profile && typeof profile === "object") {
          displayName = displayName || profile.displayName || profile.full_name || profile.name || profile.fullName || null;
          avatar = avatar || profile.avatar || profile.avatarUrl || profile.profilePicture || null;
        }
      } catch {}
    }

    return {
      uid: uid || null,
      displayName: displayName || null,
      avatar: avatar || null
    };
  };
}

async function bootstrapGlobals(projectRoot) {
  global.client = {
    commands: new Map(),
    events: new Map(),
    cooldowns: new Map()
  };

  global.users = { admin: [], support: [] };
  global.config = {};
  global.api = null;

  try {
    const configPath = path.join(projectRoot, "config.yml");
    const fileContent = fs.readFileSync(configPath, "utf8");
    const config = YAML.parse(fileContent);
    global.config = config || {};
    global.users = {
      admin: Array.isArray(global.config.admin_bot) ? global.config.admin_bot.map(String) : [],
      support: Array.isArray(global.config.support_bot) ? global.config.support_bot.map(String) : []
    };
  } catch (e) {
    logger.log(`[childbot-runner] Không thể đọc config.yml: ${e?.message || e}`, "warn");
    global.config = { prefix: "/", admin_bot: [], support_bot: [] };
    global.users = { admin: [], support: [] };
  }

  await loaderCommand();
  await loaderEvent();
}

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const childKey = normalizeChildKey(process.argv[2] || process.env.CHILD_KEY);

  await logger.printBanner?.().catch(() => null);
  logger.log(`[childbot-runner] Starting childKey=${childKey}`, "info");

  await bootstrapGlobals(projectRoot);

  const session = readSession(projectRoot, childKey);
  if (!session) {
    logger.log(`[childbot-runner] Không có session cho ${childKey}. Hãy dùng startchild để đăng nhập QR.`, "error");
    process.exit(2);
  }

  const zalo = new Zalo({ selfListen: true, checkUpdate: true, logging: false });

  try {
    const api = await zalo.login({
      cookie: normalizeCookieForLogin(session.cookie),
      imei: session.imei,
      userAgent: session.userAgent || undefined
    });

    attachFetchAccountInfo(api, session);

    global.api = api;

    try {
      global.__childBotKey = childKey;
      global.__childBotUid = session.uid ? String(session.uid) : null;
    } catch {
      // ignore
    }

    listener(api);
    logger.log(`[childbot-runner] ${childKey} is now listening`, "info");
  } catch (e) {
    logger.log(`[childbot-runner] Login thất bại: ${e?.message || e}`, "error");
    process.exit(1);
  }
}

main();
