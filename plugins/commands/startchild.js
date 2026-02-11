const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const crypto = require("crypto");
const { Zalo, LoginQRCallbackEventType } = require("zca-js");
const handleCommand = require("../../core/handle/handleCommand");
const handleEvent = require("../../core/handle/handleEvent");
const Threads = require("../../core/controller/controllerThreads");
const logger = require("../../utils/logger");
const { updateMessageCache, updateConfigArray, convertTimestamp, childRental } = require("../../utils/index");

module.exports.config = {
  name: "startchild",
  aliases: ["startbot", "childbot"],
  version: "2.0.0",
  role: 2,
  author: "Cascade",
  description: "Khởi động bot con qua đăng nhập QR hoặc session có sẵn (hỗ trợ nhiều bot)",
  category: "Admin",
  usage: "startchild [childKey] [all|qr|session|list] [--mode <qr|session>] [--ua <UserAgent>] [--qr <relative/path.png>] [--count <number>] [--prefix <baseName>]",
  cooldowns: 5
};

const CHILD_KEY_DEFAULT = "__default";
const TEMP_DIR = path.join(__dirname, "..", "..", "temp");
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const HISTORY_FILE = path.join(DATA_DIR, "child_login_history.json");
const SESSION_FILE = path.join(DATA_DIR, "child_session.json");
const CHILD_DATA_ROOT = path.join(DATA_DIR, "childbots");
const MAX_HISTORY_ENTRIES = 30;
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";
const QR_LINK_TTL_MS_DEFAULT = 5 * 60 * 1000;
const QR_LINK_BASE_PATH = "/child-qr";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const consoleSuppression = {
  depth: 0,
  originalLog: console.log,
  originalInfo: console.info
};

function suppressConsole() {
  if (consoleSuppression.depth === 0) {
    consoleSuppression.originalLog = console.log;
    consoleSuppression.originalInfo = console.info;
    console.log = () => {};
    console.info = () => {};
  }
  consoleSuppression.depth += 1;
}

function restoreConsole() {
  if (consoleSuppression.depth === 0) return;
  consoleSuppression.depth -= 1;
  if (consoleSuppression.depth === 0) {
    console.log = consoleSuppression.originalLog;
    console.info = consoleSuppression.originalInfo;
  }
}

function logChildConsole(message, level = "info") {
  if (!message) return;
  const output = typeof message === "string" ? message : JSON.stringify(message);
  const formatted = `[childbot] ${output}`;

  try {
    consoleSuppression.originalLog?.(formatted);
    console.log?.(formatted);
  } catch (err) {
    // ignore
  }

  try {
    logger.log(formatted, level);
  } catch (error) {
    try {
      console.log(formatted);
    } catch (secondaryError) {
      // ignore
    }
  }
}

function getChildQrLinkConfig() {
  const cfg = global?.config?.child_qr_link || {};
  const base = {
    enabled: true,
    listenHost: "0.0.0.0",
    listenPort: 0,
    publicHost: null,
    publicPort: null,
    protocol: "http",
    ttlMs: QR_LINK_TTL_MS_DEFAULT,
    publicUrl: null,
    basePath: QR_LINK_BASE_PATH
  };

  const ttlMs = Number.isInteger(cfg.ttl_ms) && cfg.ttl_ms > 0 ? cfg.ttl_ms : base.ttlMs;
  const listenPort = Number.isInteger(cfg.listen_port) ? cfg.listen_port : base.listenPort;
  const listenHost = typeof cfg.listen_host === "string" && cfg.listen_host ? cfg.listen_host : base.listenHost;
  const publicPort = Number.isInteger(cfg.public_port) ? cfg.public_port : base.publicPort;
  const protocol = typeof cfg.protocol === "string" && cfg.protocol ? cfg.protocol : base.protocol;
  const publicUrl = typeof cfg.public_url === "string" && cfg.public_url ? cfg.public_url : base.publicUrl;
  const publicHost = typeof cfg.public_host === "string" && cfg.public_host ? cfg.public_host : base.publicHost;
  const enabled = cfg.enabled !== false;
  const basePath = typeof cfg.base_path === "string" && cfg.base_path ? cfg.base_path : base.basePath;

  return {
    ...base,
    enabled,
    listenHost,
    listenPort,
    publicHost,
    publicPort,
    protocol,
    ttlMs,
    publicUrl,
    basePath
  };
}

function detectPublicHost(fallback = "127.0.0.1") {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const detail of iface || []) {
      if (detail && detail.family === "IPv4" && !detail.internal && detail.address) {
        return detail.address;
      }
    }
  }
  return fallback;
}

function ensureQrLinkManager() {
  const config = getChildQrLinkConfig();
  if (!config.enabled) {
    return null;
  }

  if (global.__childQrLinkManager) {
    if (!global.__childQrLinkManager.error && global.__childQrLinkManager.configHash === JSON.stringify(config)) {
      return global.__childQrLinkManager;
    }

    try {
      global.__childQrLinkManager.server?.close?.();
    } catch (error) {
      console.warn("[childbot] Không thể đóng server QR cũ:", error?.message || error);
    }
  }

  const links = new Map();
  const tokensByFile = new Map();

  const manager = {
    config,
    configHash: JSON.stringify(config),
    server: null,
    ready: null,
    baseUrl: null,
    links,
    tokensByFile,
    error: null,
    stats: {
      created: 0,
      served: 0,
      expired: 0,
      errors: 0
    }
  };

  const server = http.createServer((req, res) => {
    try {
      const requestUrl = new URL(req.url, `${config.protocol}://localhost`);
      const pathname = decodeURIComponent(requestUrl.pathname || "");
      if (!pathname.startsWith(config.basePath)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
        return;
      }

      const tokenWithExt = pathname.slice(config.basePath.length + 1);
      const token = tokenWithExt.replace(/\.png$/i, "").trim();
      if (!token) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
        return;
      }

      const entry = links.get(token);
      if (!entry || Date.now() > entry.expireAt) {
        links.delete(token);
        if (entry?.filePath) {
          tokensByFile.delete(entry.filePath);
        }
        manager.stats.expired += 1;
        res.writeHead(410, { "Content-Type": "text/plain" });
        res.end("Expired");
        return;
      }

      if (!fs.existsSync(entry.filePath)) {
        links.delete(token);
        tokensByFile.delete(entry.filePath);
        manager.stats.errors += 1;
        res.writeHead(410, { "Content-Type": "text/plain" });
        res.end("Gone");
        return;
      }

      manager.stats.served += 1;
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Access-Control-Allow-Origin": "*"
      });
      const stream = fs.createReadStream(entry.filePath);
      stream.on("error", () => {
        manager.stats.errors += 1;
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Error");
      });
      stream.pipe(res);
    } catch (error) {
      manager.stats.errors += 1;
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Server Error");
    }
  });

  manager.server = server;
  manager.ready = new Promise((resolve, reject) => {
    const onError = (error) => {
      manager.error = error;
      reject(error);
    };
    server.once("error", onError);
    server.listen(config.listenPort, config.listenHost, () => {
      server.off("error", onError);
      const address = server.address();
      const actualPort = config.publicPort || address.port;
      const effectiveHost = config.publicUrl
        ? null
        : (config.publicHost || detectPublicHost(config.listenHost === "127.0.0.1" ? "127.0.0.1" : undefined));

      manager.baseUrl = config.publicUrl
        ? `${config.publicUrl.replace(/\/$/, "")}${config.basePath}`
        : `${config.protocol}://${effectiveHost || "127.0.0.1"}:${actualPort}${config.basePath}`;

      resolve(manager.baseUrl);
    });
  });

  manager.cleanupToken = (token) => {
    if (!token) return;
    const entry = links.get(token);
    if (!entry) return;
    if (entry.timeout) clearTimeout(entry.timeout);
    links.delete(token);
    tokensByFile.delete(entry.filePath);
  };

  manager.register = async (filePath) => {
    if (!filePath) return null;
    try {
      const baseUrl = await manager.ready;
      const ttlMs = manager.config.ttlMs || QR_LINK_TTL_MS_DEFAULT;
      const absolutePath = path.resolve(filePath);
      const token = crypto.randomUUID();
      const expireAt = Date.now() + ttlMs;
      const timeout = setTimeout(() => {
        manager.cleanupToken(token);
        manager.stats.expired += 1;
      }, ttlMs);

      const entry = { filePath: absolutePath, expireAt, timeout };
      links.set(token, entry);
      tokensByFile.set(absolutePath, token);
      manager.stats.created += 1;

      return {
        token,
        url: `${baseUrl}/${token}.png`,
        expireAt
      };
    } catch (error) {
      manager.error = error;
      return null;
    }
  };

  manager.unregister = (identifier) => {
    if (!identifier) return;
    let token = identifier;
    if (fs.existsSync(identifier) || path.isAbsolute(identifier)) {
      const absolutePath = path.resolve(identifier);
      token = tokensByFile.get(absolutePath);
    }
    manager.cleanupToken(token);
  };

  global.__childQrLinkManager = manager;
  return manager;
}

async function createQrLink(filePath) {
  const manager = ensureQrLinkManager();
  if (!manager) return null;
  return manager.register(filePath);
}

function releaseQrLink(identifier) {
  const manager = global.__childQrLinkManager;
  if (!manager) return;
  manager.unregister(identifier);
}

function listQrLinks() {
  const manager = global.__childQrLinkManager;
  if (!manager) return [];
  return Array.from(manager.links.entries()).map(([token, entry]) => ({
    token,
    expireAt: entry.expireAt,
    filePath: entry.filePath
  }));
}

async function fetchUserProfile(api, uid) {
  if (!uid || !api?.getUserInfo) {
    return null;
  }

  try {
    const info = await api.getUserInfo(uid);
    if (!info) return null;

    const profile = info.changed_profiles?.[uid] || info.profiles?.[uid] || info;
    if (!profile) return { displayName: null, avatar: null };

    const displayName = profile.displayName || profile.full_name || profile.name || profile.fullName || null;
    const avatar = profile.avatar || profile.avatarUrl || profile.profilePicture || null;

    return { displayName, avatar };
  } catch (error) {
    console.warn("[startchild] Không thể lấy tên người dùng:", error?.message || error);
    return null;
  }
}

function buildIdentityFromState(state) {
  if (!state) return { uid: null, displayName: null };

  const accountInfo = state.accountInfo || {};
  const loginInfo = state.loginInfo || {};
  const ctx = state.api?.ctx || {};

  const uid = accountInfo.uid || accountInfo.userId || accountInfo.user_id || loginInfo.uid || ctx.userId || null;
  const displayName = accountInfo.displayName || accountInfo.name || accountInfo.display_name || loginInfo.displayName || ctx.displayName || null;

  return { uid, displayName };
}

function syncStateAccountInfo(state, info) {
  if (!state || !info || typeof info !== "object") return;
  state.accountInfo = { ...(state.accountInfo || {}), ...info };
}

async function resolveStateIdentity(state, parentApi) {
  const baseIdentity = buildIdentityFromState(state);
  let { uid, displayName } = baseIdentity;

  const childApi = state?.api;

  const applyInfo = (info) => {
    if (!info || typeof info !== "object") return;
    syncStateAccountInfo(state, info);
    uid = uid || info.uid || info.userId || info.user_id || null;
    displayName = displayName || info.displayName || info.name || info.display_name || info.fullName || info.full_name || null;
    if (uid) uid = String(uid);
  };

  applyInfo(state?.accountInfo);

  if ((!displayName || displayName === "") && typeof childApi?.getCurrentUserInfo === "function") {
    try {
      const info = await childApi.getCurrentUserInfo();
      applyInfo(info);
    } catch (error) {
      console.warn("[startchild] getCurrentUserInfo thất bại:", error?.message || error);
    }
  }

  if ((!displayName || displayName === "") && typeof childApi?.fetchAccountInfo === "function") {
    try {
      const fetched = await childApi.fetchAccountInfo();
      applyInfo(fetched);
    } catch (error) {
      console.warn("[startchild] fetchAccountInfo thất bại:", error?.message || error);
    }
  }

  if ((!uid || uid === "?") && typeof childApi?.getCurrentUserID === "function") {
    try {
      const fetchedUid = await childApi.getCurrentUserID();
      if (fetchedUid) {
        uid = String(fetchedUid);
      }
    } catch (error) {
      console.warn("[startchild] getCurrentUserID thất bại:", error?.message || error);
    }
  }

  return {
    uid: uid || "?",
    displayName: displayName || "(chưa rõ)",
    avatar: state?.accountInfo?.avatarUrl || state?.accountInfo?.avatar || null
  };
}

async function resolveSessionIdentity(session, parentApi) {
  const uid = session?.uid || session?.userId || null;
  let displayName = session?.displayName || session?.name || null;

  if ((!displayName || displayName === "") && uid) {
    const profile = await fetchUserProfile(parentApi, uid);
    if (profile?.displayName) {
      displayName = profile.displayName;
    }
  }

  return {
    uid: uid ? String(uid) : "?",
    displayName: displayName || "(chưa rõ)"
  };
}

function formatActiveEntry(index, key, identity, since, qrUrl) {
  const lines = [];
  lines.push(`${index + 1}. ${key}`);
  lines.push(`   👤 Tên: ${identity.displayName}`);
  lines.push(`   🆔 UID: ${identity.uid}`);
  lines.push(`   🕒 Online từ: ${since}`);
  if (qrUrl) {
    lines.push(`   🔗 QR: ${qrUrl}`);
  }
  return lines;
}

function formatOfflineEntry(index, key, identity, loginTime) {
  const lines = [];
  lines.push(`${index + 1}. ${key}`);
  lines.push(`   👤 Tên: ${identity.displayName}`);
  lines.push(`   🆔 UID: ${identity.uid}`);
  lines.push(`   💾 Lưu từ: ${loginTime}`);
  return lines;
}

async function sendChildListSummary(api, threadId, type) {
  const activeKeys = listActiveChildKeys();
  const storedKeys = listStoredChildKeys();
  const manager = ensureQrLinkManager();
  const qrLinks = listQrLinks();

  const lines = [];
  lines.push("📋 DANH SÁCH BOT CON");
  lines.push("────────────────");
  lines.push(`🔌 Đang chạy: ${activeKeys.length}`);

  const activeEntries = await Promise.all(activeKeys.map(async (key, index) => {
    const state = getChildState(key);
    const identity = await resolveStateIdentity(state, api);
    const since = state?.loginTime ? convertTimestamp(state.loginTime) : "?";
    const matchingLink = state?.qrLinkToken ? qrLinks.find((item) => item.token === state.qrLinkToken) : null;
    const qrUrl = matchingLink && manager?.baseUrl ? `${manager.baseUrl}/${matchingLink.token}.png` : null;
    return formatActiveEntry(index, key, identity, since, qrUrl);
  }));

  activeEntries.forEach((entryLines) => {
    lines.push(...entryLines);
  });

  const offlineKeys = storedKeys.filter((key) => !activeKeys.includes(key));
  if (offlineKeys.length > 0) {
    lines.push("", `💾 Có session lưu: ${offlineKeys.length}`);
    const offlineEntries = await Promise.all(offlineKeys.map(async (key, index) => {
      const session = readSession(key);
      const identity = await resolveSessionIdentity(session, api);
      const loginTime = session?.loginTime ? convertTimestamp(session.loginTime) : "?";
      return formatOfflineEntry(index, key, identity, loginTime);
    }));

    offlineEntries.forEach((entryLines) => {
      lines.push(...entryLines);
    });
  }

  if (manager && manager.baseUrl) {
    lines.push("", `🌐 QR link server: ${manager.baseUrl} (${qrLinks.length} mã đang hoạt động)`);
  }

  lines.push("", "ℹ️ Dùng: startchild <childKey>, startchild qr2, childstop <key>, childinfo <key>");

  await sendMessageSafe(api, { msg: lines.join("\n") }, threadId, type);
}

async function waitForFileWrite(filePath, timeoutMs = 2000, intervalMs = 50) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const stats = fs.statSync(filePath);
      if (stats.size > 0) {
        return true;
      }
    } catch (err) {
      // file not ready yet
    }
    await sleep(intervalMs);
  }

  try {
    const stats = fs.statSync(filePath);
    return stats.size > 0;
  } catch (err) {
    return false;
  }
}

function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function ensureChildDataDir(childKey) {
  ensureDataDir();
  if (childKey === CHILD_KEY_DEFAULT) {
    return DATA_DIR;
  }
  if (!fs.existsSync(CHILD_DATA_ROOT)) {
    fs.mkdirSync(CHILD_DATA_ROOT, { recursive: true });
  }
  const childDir = path.join(CHILD_DATA_ROOT, childKey);
  if (!fs.existsSync(childDir)) {
    fs.mkdirSync(childDir, { recursive: true });
  }
  return childDir;
}

function normalizeChildKey(rawKey) {
  const trimmed = String(rawKey || "").trim();
  if (!trimmed) return CHILD_KEY_DEFAULT;
  if (trimmed === CHILD_KEY_DEFAULT || trimmed.toLowerCase() === "default") {
    return CHILD_KEY_DEFAULT;
  }

  const normalized = trimmed
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");

  return normalized || CHILD_KEY_DEFAULT;
}

function getHistoryFilePath(childKey = CHILD_KEY_DEFAULT) {
  if (childKey === CHILD_KEY_DEFAULT) {
    return HISTORY_FILE;
  }
  const childDir = ensureChildDataDir(childKey);
  return path.join(childDir, "history.json");
}

function getSessionFilePath(childKey = CHILD_KEY_DEFAULT) {
  if (childKey === CHILD_KEY_DEFAULT) {
    ensureDataDir();
    return SESSION_FILE;
  }
  const childDir = ensureChildDataDir(childKey);
  return path.join(childDir, "session.json");
}

function extractChildKeyFromArgs(args = []) {
  if (!Array.isArray(args) || args.length === 0) {
    return { childKey: CHILD_KEY_DEFAULT, restArgs: [], isAll: false };
  }

  const tokens = [...args];
  const candidate = tokens[0];
  if (candidate && !candidate.startsWith("--")) {
    const lowered = candidate.toLowerCase();
    if (lowered === "all") {
      tokens.shift();
      return { childKey: CHILD_KEY_DEFAULT, restArgs: tokens, isAll: true };
    }
    if (!["qr", "session"].includes(lowered)) {
      tokens.shift();
      return { childKey: normalizeChildKey(candidate), restArgs: tokens, isAll: false };
    }
  }

  return { childKey: CHILD_KEY_DEFAULT, restArgs: tokens, isAll: false };
}

function listActiveChildKeys() {
  if (!global.__childBots || typeof global.__childBots !== "object") {
    return [];
  }
  return Object.keys(global.__childBots).map((key) => normalizeChildKey(key));
}

function listStoredChildKeys() {
  const keys = new Set();

  if (fs.existsSync(SESSION_FILE)) {
    keys.add(CHILD_KEY_DEFAULT);
  }

  if (fs.existsSync(CHILD_DATA_ROOT)) {
    try {
      const entries = fs.readdirSync(CHILD_DATA_ROOT);
      for (const entry of entries) {
        try {
          const entryPath = path.join(CHILD_DATA_ROOT, entry);
          if (!fs.statSync(entryPath).isDirectory()) continue;
          const sessionPath = path.join(entryPath, "session.json");
          if (fs.existsSync(sessionPath)) {
            keys.add(normalizeChildKey(entry));
          }
        } catch (error) {
          logger.log(`[childbot] Không thể đọc thư mục bot con ${entry}: ${error?.message || error}`, "warn");
        }
      }
    } catch (error) {
      logger.log(`[childbot] Không thể duyệt thư mục childbots: ${error?.message || error}`, "warn");
    }
  }

  return Array.from(keys);
}

function formatChildLabel(childKey = CHILD_KEY_DEFAULT) {
  return childKey === CHILD_KEY_DEFAULT ? "bot con mặc định" : `bot con "${childKey}"`;
}

function readHistory(childKey = CHILD_KEY_DEFAULT) {
  try {
    const filePath = getHistoryFilePath(childKey);
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    logger.log(`[childbot] Không thể đọc lịch sử đăng nhập: ${error?.message || error}`, "warn");
    return [];
  }
}

function writeHistory(childKey = CHILD_KEY_DEFAULT, history = []) {
  try {
    const filePath = getHistoryFilePath(childKey);
    ensureChildDataDir(childKey);
    fs.writeFileSync(filePath, JSON.stringify(history, null, 2), "utf8");
  } catch (error) {
    logger.log(`[childbot] Không thể ghi lịch sử đăng nhập: ${error?.message || error}`, "warn");
  }
}

function recordLogin(childKey, entry) {
  const history = readHistory(childKey);
  history.push(entry);
  while (history.length > MAX_HISTORY_ENTRIES) {
    history.shift();
  }
  writeHistory(childKey, history);
}

function readSession(childKey = CHILD_KEY_DEFAULT) {
  try {
    const filePath = getSessionFilePath(childKey);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.cookie && parsed.imei) {
      return parsed;
    }
    return null;
  } catch (error) {
    logger.log(`[childbot] Không thể đọc session bot con: ${error?.message || error}`, "warn");
    return null;
  }
}

function writeSession(childKey, session) {
  try {
    const filePath = getSessionFilePath(childKey);
    ensureChildDataDir(childKey);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), "utf8");
  } catch (error) {
    logger.log(`[childbot] Không thể ghi session bot con: ${error?.message || error}`, "warn");
  }
}

function extractCookieData(state) {
  try {
    const jar = state?.api?.ctx?.cookie;
    if (jar) {
      if (typeof jar.toJSON === "function") {
        return jar.toJSON();
      }
      if (typeof jar.serializeSync === "function") {
        return jar.serializeSync();
      }
      if (typeof jar.serialize === "function") {
        let serialized = null;
        jar.serialize((err, data) => {
          if (!err) serialized = data;
        });
        if (serialized) return serialized;
      }
    }
  } catch (error) {
    logger.log(`[childbot] Không thể lấy cookie từ CookieJar: ${error?.message || error}`, "warn");
  }

  const loginInfo = state?.loginInfo || {};
  if (loginInfo.cookie) return loginInfo.cookie;
  if (loginInfo.cookies) return loginInfo.cookies;
  return null;
}

function persistSession(childKey, state, extras = {}) {
  const cookieData = extractCookieData(state);
  const apiCtx = state?.api?.ctx || {};
  const loginInfo = state?.loginInfo || {};
  const accountInfo = state?.accountInfo || {};

  const imei = apiCtx.imei || loginInfo.imei || extras.imei;
  if (!cookieData || !imei) {
    return false;
  }

  const payload = {
    uid: extras.uid || accountInfo.uid || loginInfo.uid || apiCtx.uid || apiCtx.userId || null,
    displayName: extras.displayName || accountInfo.displayName || loginInfo.displayName || null,
    cookie: cookieData,
    imei,
    userAgent: extras.userAgent || apiCtx.userAgent || loginInfo.userAgent || DEFAULT_USER_AGENT,
    loginTime: extras.loginTime || state?.loginTime || Date.now()
  };

  try {
    writeSession(childKey, payload);
    logger.log("[childbot] Đã lưu session bot con.", "info");
    return true;
  } catch (error) {
    logger.log(`[childbot] Không thể lưu session bot con: ${error?.message || error}`, "warn");
    return false;
  }
}

function resolveParentBotId(parentApi) {
  const candidates = new Set();

  const pushCandidate = (value) => {
    if (value === null || value === undefined) return;
    const normalized = String(value).trim();
    if (!normalized) return;
    candidates.add(normalized);
  };

  try {
    if (typeof parentApi?.getOwnId === "function") {
      pushCandidate(parentApi.getOwnId());
    }
  } catch (error) {
    logger.log(`[childbot] Không thể lấy ID bot mẹ từ API: ${error?.message || error}`, "warn");
  }

  pushCandidate(global?.botID);
  pushCandidate(global?.config?.bot_id);

  const cfg = global?.config || {};
  if (Array.isArray(cfg.admin_bot)) {
    cfg.admin_bot.forEach(pushCandidate);
  }
  if (Array.isArray(cfg.owner_bot)) {
    cfg.owner_bot.forEach(pushCandidate);
  }

  const runtimeAdmins = global?.users?.admin;
  if (Array.isArray(runtimeAdmins)) {
    runtimeAdmins.forEach(pushCandidate);
  }
  const runtimeOwners = global?.users?.owner;
  if (Array.isArray(runtimeOwners)) {
    runtimeOwners.forEach(pushCandidate);
  }

  logChildConsole(`Ứng viên bot mẹ: ${Array.from(candidates).join(", ") || "(trống)"}`);

  let bestNumeric = null;
  let bestNumericStr = null;
  let fallback = null;

  for (const candidate of candidates) {
    if (/^\d+$/.test(candidate)) {
      try {
        const numericValue = BigInt(candidate);
        if (bestNumeric === null || numericValue > bestNumeric) {
          bestNumeric = numericValue;
          bestNumericStr = candidate;
        }
      } catch (error) {
        fallback = fallback || candidate;
      }
    } else {
      fallback = fallback || candidate;
    }
  }

  const resolved = bestNumericStr || fallback || null;
  logChildConsole(`Bot mẹ được chọn: ${resolved ?? "(không tìm thấy)"}`);

  return bestNumericStr || fallback || null;
}

function syncChildBotList(cfg, selfId) {
  if (!selfId) return Array.isArray(cfg.child_bot) ? cfg.child_bot.map(String) : [];

  let childBots = [];
  if (Array.isArray(cfg.child_bot)) childBots = cfg.child_bot.map(String);
  else if (typeof cfg.child_bot === "string" && cfg.child_bot.trim()) childBots = [cfg.child_bot.trim()];

  if (!childBots.includes(selfId)) {
    childBots.push(selfId);
    cfg.child_bot = childBots;
    global.config.child_bot = childBots;
    try {
      updateConfigArray("child_bot", childBots);
    } catch (err) {
      logger.log(`[childbot] Không thể cập nhật config child_bot: ${err?.message || err}`, "warn");
    }
    logChildConsole(`Đã thêm UID ${selfId} vào danh sách child_bot.`);
  }

  return childBots;
}

function getChildState(childKey = CHILD_KEY_DEFAULT) {
  if (!global.__childBots) {
    global.__childBots = {};
  }

  const key = normalizeChildKey(childKey);

  if (!global.__childBots[key]) {
    global.__childBots[key] = {
      key,
      instance: null,
      api: null,
      qrFilePath: null,
      pending: false,
      accountInfo: null,
      loginInfo: null,
      loginTime: null
    };
  }

  return global.__childBots[key];
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

function parseArgs(args = []) {
  const result = { userAgent: null, qrPath: null, mode: "qr", count: 1, prefix: null, positional: [] };

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token) continue;

    if (token === "--ua" && args[i + 1]) {
      result.userAgent = args[i + 1];
      i += 1;
      continue;
    }

    if (token === "--qr" && args[i + 1]) {
      result.qrPath = args[i + 1];
      i += 1;
      continue;
    }

    if (token === "--mode" && args[i + 1]) {
      result.mode = args[i + 1].toLowerCase();
      i += 1;
      continue;
    }

    if (token === "qr" || token === "session") {
      result.mode = token;
      continue;
    }

    if ((token === "--count" || token === "-c") && args[i + 1]) {
      const value = parseInt(args[i + 1], 10);
      if (!Number.isNaN(value) && value > 0) {
        result.count = value;
      }
      i += 1;
      continue;
    }

    if (token === "--prefix" && args[i + 1]) {
      result.prefix = args[i + 1];
      i += 1;
      continue;
    }

    result.positional.push(token);
  }

  if (!Number.isInteger(result.count) || result.count < 1) {
    result.count = 1;
  }

  return result;
}

function parseModeCountToken(token) {
  if (typeof token !== "string") return null;
  const match = token.toLowerCase().match(/^(qr|session)(\d+)$/);
  if (!match) return null;
  const count = parseInt(match[2], 10);
  if (Number.isNaN(count) || count < 1) return null;
  return { mode: match[1], count };
}

function generateUniqueChildKey(baseName, usedKeys) {
  let normalizedBase = normalizeChildKey(baseName || "child");
  if (!normalizedBase || normalizedBase === CHILD_KEY_DEFAULT) {
    normalizedBase = "child";
  }

  let index = 1;
  while (true) {
    const candidate = `${normalizedBase}-${index}`;
    if (!usedKeys.has(candidate)) {
      usedKeys.add(candidate);
      return candidate;
    }
    index += 1;
  }
}

function resolveChildTargets(initialChildKey, runMode, parsedArgs, storedKeys = [], activeKeys = [], extras = {}) {
  const { positional = [], count: countFromArgs = 1, prefix, shorthandCount = null } = parsedArgs || {};
  const shorthandInfo = extras?.shorthand || {};
  const shorthandNumeric = Number.isInteger(shorthandCount) ? shorthandCount : Number.isInteger(shorthandInfo.count) ? shorthandInfo.count : null;
  const normalizedPositional = positional
    .map((token) => (typeof token === "string" ? token.trim() : ""))
    .filter((token) => token);

  const tokensAfterMode = normalizedPositional.filter((token, index) => {
    if (index === 0 && token.toLowerCase() === runMode) {
      return false;
    }
    return true;
  });

  let numericOverride = null;
  const explicitNames = [];

  for (const token of tokensAfterMode) {
    if (/^\d+$/.test(token) && numericOverride === null) {
      numericOverride = parseInt(token, 10);
      continue;
    }
    if (!token.startsWith("--")) {
      explicitNames.push(token);
    }
  }

  if (numericOverride === null && shorthandNumeric !== null) {
    numericOverride = shorthandNumeric;
  }

  const hasExplicitCountOption = Number.isInteger(parsedArgs?.count) && parsedArgs.count > 1;
  let desiredCount = Math.max(1, countFromArgs);
  if (numericOverride !== null) {
    desiredCount = Math.max(desiredCount, numericOverride);
  }

  const treatAsIndexedTarget = Boolean(
    shorthandNumeric !== null &&
    !hasExplicitCountOption &&
    explicitNames.length === 0 &&
    (positional.length === 0 || (positional.length === 1 && /^\d+$/.test(positional[0])))
  );

  if (treatAsIndexedTarget) {
    let baseName;
    if (prefix) baseName = prefix;
    else if (initialChildKey && initialChildKey !== CHILD_KEY_DEFAULT) baseName = initialChildKey;
    else baseName = "child";

    let normalizedBase = normalizeChildKey(baseName);
    if (!normalizedBase || normalizedBase === CHILD_KEY_DEFAULT) {
      normalizedBase = "child";
    }

    let candidate;
    if (normalizedBase === initialChildKey && shorthandNumeric === 1) {
      candidate = normalizedBase;
    } else if (shorthandNumeric === 1 && !prefix && initialChildKey !== CHILD_KEY_DEFAULT) {
      candidate = normalizeChildKey(initialChildKey);
    } else {
      candidate = `${normalizedBase}-${shorthandNumeric}`;
    }

    return [candidate];
  }

  const existingSet = new Set([...storedKeys, ...activeKeys]);
  const usedKeys = new Set(existingSet);
  const targets = [];

  if (initialChildKey && initialChildKey !== CHILD_KEY_DEFAULT) {
    targets.push(initialChildKey);
    usedKeys.add(initialChildKey);
  }

  for (const name of explicitNames) {
    const normalized = normalizeChildKey(name);
    if (!normalized) continue;
    if (!targets.includes(normalized)) {
      targets.push(normalized);
    }
    usedKeys.add(normalized);
  }

  if (targets.length >= desiredCount) {
    return targets;
  }

  const baseName = prefix || (initialChildKey !== CHILD_KEY_DEFAULT ? initialChildKey : explicitNames[0]) || "child";
  while (targets.length < desiredCount) {
    const candidate = generateUniqueChildKey(baseName, usedKeys);
    if (!targets.includes(candidate)) {
      targets.push(candidate);
    }
  }

  return targets;
}

async function sendMessageSafe(api, payload, threadId, type) {
  try {
    await api.sendMessage(payload, threadId, type);

    const preview = typeof payload === "string"
      ? payload
      : (payload?.msg || payload?.body || null);

    if (preview && typeof preview === "string") {
      const truncated = preview.length > 180 ? `${preview.slice(0, 177)}...` : preview;
      logChildConsole(`Đã gửi tin: ${truncated}`);
    } else if (payload?.attachments?.length) {
      logChildConsole(`Đã gửi ${payload.attachments.length} tệp đính kèm tới thread ${threadId || "unknown"}.`);
    }
  } catch (error) {
    logChildConsole(`Gửi tin nhắn thất bại: ${error?.message || error}`, "warn");
  }
}

function cleanupFile(filePath) {
  if (!filePath) return;
  try {
    releaseQrLink(filePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn("[startchild] Không thể xóa file tạm:", error.message);
  }
}

function setupChildListeners(childKey, api) {
  if (!api?.listener?.on || !api.listener.start) {
    logger.log("[childbot] API listener không hợp lệ.", "error");
    return false;
  }

  if (api.__childListenersSetup) {
    return true;
  }

  const attachChildKey = (payload) => {
    if (payload && typeof payload === "object") {
      payload.childKey = childKey;
    }
  };

  const bannedLogCooldownMs = 10_000;
  const bannedLogLastAtByUser = new Map();
  const shouldLogBannedUser = (userId) => {
    const id = userId != null ? String(userId) : "";
    if (!id) return false;
    const now = Date.now();
    const last = bannedLogLastAtByUser.get(id) || 0;
    if (now - last < bannedLogCooldownMs) return false;
    bannedLogLastAtByUser.set(id, now);
    return true;
  };

  api.listener.on("message", async (event) => {
    try {
      const userId = event?.data?.uidFrom || event?.senderID;
      if (userId && global.config?.banned_users?.includes(userId)) {
        if (shouldLogBannedUser(userId)) {
          logger.log(`[childbot] 🚫 Blocked message from banned user: ${userId}`, "warn");
        }
        return;
      }

      updateMessageCache(event);

      const data = event?.data || {};
      const rawContent = data?.content?.title ?? data?.content;
      const content = typeof rawContent === "string" ? rawContent.trim() : rawContent;

      const threadData = await Threads.getData(event.threadId).catch(() => null);
      const threadInfo = threadData?.data || {};
      const prefix = threadInfo.prefix ? threadInfo.prefix : global.config.prefix;

      let isCommand = false;

      if (typeof content === "string" && content.startsWith("!")) {
        isCommand = true;
        try {
          const sharebotCommand = require("../../plugins/commands/sharebot");
          if (sharebotCommand.handleChildBot) {
            const handled = await sharebotCommand.handleChildBot(api, event);
            if (handled) return;
          }
        } catch (error) {
          // ignore missing sharebot handler
        }
      }

      if (!isCommand && typeof content === "string") {
        const trimmed = content.trim();
        if (trimmed.length > 0) {
          const [firstToken] = trimmed.split(/\s+/);
          const lower = firstToken.toLowerCase();
          let matchedCommand = global.client.commands.get(lower);
          if (!matchedCommand) {
            for (const [, cmd] of global.client.commands) {
              if (Array.isArray(cmd.config?.aliases) && cmd.config.aliases.includes(lower)) {
                matchedCommand = cmd;
                break;
              }
            }
          }

          if (matchedCommand) {
            const forcedContent = `${prefix}${trimmed}`;
            isCommand = true;
            handleCommand(forcedContent, event, api, threadInfo, prefix);
          }
        }
      }

      attachChildKey(event);
      handleEvent("message", event, api);

      if (isCommand) {
        try {
          let groupName = "Unknown Group";
          let memberCount = 0;
          let isUserAdmin = false;
          try {
            if (event.type === 1) {
              const groupInfo = await api.getGroupInfo(event.threadId);
              groupName = groupInfo?.gridInfoMap?.[event.threadId]?.name ||
                groupInfo?.name ||
                threadInfo.name ||
                "Unknown Group";
              const groupData = groupInfo?.gridInfoMap?.[event.threadId];
              memberCount = groupData?.totalMember || 0;
              const adminIds = groupData?.adminIds || [];
              const creatorId = groupData?.creatorId;
              const uidFrom = event.data?.uidFrom;
              isUserAdmin = Boolean(uidFrom && (adminIds.includes(uidFrom) || uidFrom === creatorId));
            } else {
              groupName = "Tin nhắn riêng";
              memberCount = 2;
              isUserAdmin = false;
            }
          } catch (err) {
            groupName = threadInfo.name || "Unknown Group";
            memberCount = 0;
            isUserAdmin = false;
          }

          let userName = "Unknown User";
          try {
            const uidFrom = event.data?.uidFrom;
            const userInfo = uidFrom ? await api.getUserInfo(uidFrom) : null;
            userName = (uidFrom && userInfo?.changed_profiles?.[uidFrom]?.displayName) ||
              event.data?.dName ||
              uidFrom ||
              "Unknown User";
          } catch (err) {
            userName = event.data?.dName || event.data?.uidFrom || "Unknown User";
          }

          const messageData = {
            groupName,
            groupId: event.threadId,
            userName,
            content,
            timestamp: new Date().toLocaleTimeString('vi-VN'),
            memberCount,
            isUserAdmin
          };

          logger.logMessage(messageData);
        } catch (logErr) {
          logger.log(`[childbot] Lỗi log command: ${logErr.message}`, "error");
        }
      }
    } catch (err) {
      logger.log(`[childbot] Lỗi xử lý message: ${err?.message || err}`, "error");
    }
  });

  api.listener.on("group_event", (event) => {
    try {
      attachChildKey(event);
      handleEvent("group_event", event, api);
    } catch (err) {
      logger.log(`[childbot] Lỗi xử lý group_event: ${err?.message || err}`, "error");
    }
  });

  api.listener.on("reaction", (event) => {
    try {
      attachChildKey(event);
      handleEvent("reaction", event, api);
    } catch (err) {
      logger.log(`[childbot] Lỗi xử lý reaction: ${err?.message || err}`, "error");
    }
  });

  api.listener.on("undo", (event) => {
    try {
      attachChildKey(event);
      handleEvent("undo", event, api);
    } catch (err) {
      logger.log(`[childbot] Lỗi xử lý undo: ${err?.message || err}`, "error");
    }
  });

  api.listener.start();
  api.__childListenersSetup = true;
  logger.log("[childbot] Đã bắt đầu lắng nghe sự kiện.", "info");
  return true;
}

async function startChildViaQR(childKey, parentApi, threadId, threadType, options) {
  const state = getChildState(childKey);

  if (!childRental.isRentalAllowed(childKey)) {
    const remaining = childRental.getRemainingMs(childKey);
    const rental = childRental.getRental(childKey);
    const reason = rental?.locked ? "đã bị khoá do hết hạn" : "đã hết thời gian thuê";
    const extra = remaining > 0 ? `Còn ${Math.ceil(remaining / 1000)}s.` : "";
    await sendMessageSafe(parentApi, `🚫 ${formatChildLabel(childKey)} ${reason}. ${extra}`.trim(), threadId, threadType);
    return null;
  }

  if (state.pending) {
    await sendMessageSafe(parentApi, `⌛ ${formatChildLabel(childKey)} đang trong quá trình đăng nhập QR, vui lòng đợi...`, threadId, threadType);
    return null;
  }

  if (state.api) {
    await sendMessageSafe(parentApi, `ℹ️ ${formatChildLabel(childKey)} đã chạy sẵn rồi!`, threadId, threadType);
    return state.api;
  }

  ensureTempDir();
  const qrLinkConfig = getChildQrLinkConfig();

  // Kiểm tra xem có file QR trong plugins/commands/qr.png không
  let existingQRFile = null;
  const defaultQRPath = path.join(__dirname, "qr.png");
  if (fs.existsSync(defaultQRPath)) {
    existingQRFile = defaultQRPath;
  }

  const qrFilePath = options.qrPath
    ? (path.isAbsolute(options.qrPath) ? options.qrPath : path.join(__dirname, "..", "..", options.qrPath))
    : existingQRFile || path.join(TEMP_DIR, `child-qr-${Date.now()}.png`);

  state.pending = true;
  state.qrFilePath = qrFilePath;
  state.accountInfo = null;
  state.loginInfo = null;
  state.loginTime = null;
  state.qrLinkToken = null;
  state.qrLinkExpireAt = null;

  const baseOptions = {
    selfListen: true,
    checkUpdate: true,
    logging: false
  };
  const configOverrides = global.config?.zca_js_config || {};
  
  suppressConsole();

  const zalo = new Zalo({ ...baseOptions, ...configOverrides, selfListen: true, logging: false });

  let loginResolved = false;

  const callback = async (event) => {
    if (!event) return;
    const data = event.data || {};

    switch (event.type) {
      case LoginQRCallbackEventType.QRCodeGenerated: {
        try {
          cleanupFile(qrFilePath);
          state.qrFilePath = null;

          if (typeof event.actions?.saveToFile === "function") {
            event.actions.saveToFile(qrFilePath);
            await waitForFileWrite(qrFilePath, 3000, 100);
          } else if (data.image && data.image.startsWith("data:image")) {
            const base64 = data.image.replace(/^data:image\/png;base64,/, "");
            fs.writeFileSync(qrFilePath, base64, "base64");
          }

          const attachments = [];
          if (fs.existsSync(qrFilePath)) {
            attachments.push(qrFilePath);
          }

          let message = `📸 Quét QR để đăng nhập ${formatChildLabel(childKey)}!`;
          await sendMessageSafe(parentApi, {
            msg: message,
            attachments,
            ttl: 120000
          }, threadId, threadType);
        } catch (error) {
          console.warn("[startchild] Không thể gửi QR bot con:", error.message);
        }
        break;
      }
      case LoginQRCallbackEventType.QRCodeScanned:
        await sendMessageSafe(parentApi, `✅ Đã quét QR, hãy xác nhận đăng nhập ${formatChildLabel(childKey)} trên điện thoại!`, threadId, threadType);
        break;
      case LoginQRCallbackEventType.QRCodeDeclined:
        await sendMessageSafe(parentApi, `❌ Bạn đã từ chối đăng nhập ${formatChildLabel(childKey)}. Lệnh sẽ kết thúc.`, threadId, threadType);
        break;
      case LoginQRCallbackEventType.QRCodeExpired:
        await sendMessageSafe(parentApi, `⏳ Mã QR cho ${formatChildLabel(childKey)} đã hết hạn. Đang tạo mã mới...`, threadId, threadType);
        event.actions?.retry?.();
        break;
      case LoginQRCallbackEventType.GotLoginInfo:
        state.loginInfo = data || null;
        if (data?.loginTime) {
          state.loginTime = data.loginTime;
        }
        loginResolved = true;
        break;
      default:
        break;
    }
  };

  try {
    const api = await zalo.loginQR({
      userAgent: options.userAgent || undefined,
      qrPath: qrFilePath
    }, callback);

    setupChildListeners(childKey, api);
    state.instance = zalo;
    state.api = api;

    let selfId = null;
    let parentId = null;
    let adminArr = null;
    let ownerArr = null;
    let childList = null;

    try {
      if (typeof api.getCurrentUserInfo === "function") {
        state.accountInfo = await api.getCurrentUserInfo();
      }
      if (!state.loginTime) {
        state.loginTime = state.accountInfo?.loginTime || state.accountInfo?.lastLoginTime || api?.ctx?.loginTime || Date.now();
      }

      const selfIdRaw = typeof api.getCurrentUserID === "function" ? await api.getCurrentUserID() : api?.ctx?.userId;
      selfId = selfIdRaw ? String(selfIdRaw) : null;
      parentId = resolveParentBotId(parentApi);
      if (selfId) {
        const cfg = global.config || {};

        const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
        const owners = Array.isArray(cfg.owner_bot)
          ? cfg.owner_bot.map(String)
          : (typeof cfg.owner_bot === "string" && cfg.owner_bot.trim() ? [cfg.owner_bot.trim()] : []);

        const adminOriginal = new Set(admins);
        const ownerOriginal = new Set(owners);

        const adminSet = new Set(admins);
        adminSet.add(selfId);
        if (parentId) adminSet.add(parentId);
        const ownerSet = new Set(owners);
        ownerSet.add(selfId);
        if (parentId) ownerSet.add(parentId);

        adminArr = Array.from(adminSet);
        ownerArr = Array.from(ownerSet);
        const addedAdmins = adminArr.filter((uid) => !adminOriginal.has(uid));
        const addedOwners = ownerArr.filter((uid) => !ownerOriginal.has(uid));

        cfg.admin_bot = adminArr;
        cfg.owner_bot = ownerArr;
        global.users.admin = adminArr;
        global.users.owner = ownerArr;
        try {
          updateConfigArray("admin_bot", adminArr);
        } catch (err) {
          logger.log(`[childbot] Không thể cập nhật config admin_bot: ${err?.message || err}`, "warn");
        }
        try {
          updateConfigArray("owner_bot", ownerArr);
        } catch (err) {
          // nếu config không có owner_bot, chỉ cập nhật runtime
          logger.log(`[childbot] Không thể cập nhật config owner_bot: ${err?.message || err}`, "warn");
        }

        childList = syncChildBotList(cfg, selfId);

        if (addedAdmins.length || addedOwners.length) {
          const lines = [
            `🔐 Đã cập nhật quyền cho ${formatChildLabel(childKey)}.`,
            addedAdmins.length
              ? `• Admin thêm: ${addedAdmins.join(", ")}`
              : "• Admin: không có UID mới",
            addedOwners.length
              ? `• Owner thêm: ${addedOwners.join(", ")}`
              : "• Owner: không có UID mới",
            parentId ? `• Bot mẹ ưu tiên: ${parentId}` : null
          ].filter(Boolean);

          await sendMessageSafe(parentApi, { msg: lines.join("\n") }, threadId, threadType);
          logChildConsole(`Auto-grant quyền: Admin += [${addedAdmins.join(", ")}], Owner += [${addedOwners.join(", ")}].`);
        } else {
          const lines = [
            `🔐 Quyền ${formatChildLabel(childKey)} giữ nguyên.`,
            parentId ? `• Bot mẹ ưu tiên: ${parentId}` : null,
            `• Admin hiện tại: ${adminArr.join(", ")}`,
            `• Owner hiện tại: ${ownerArr.join(", ")}`
          ].filter(Boolean);

          await sendMessageSafe(parentApi, { msg: lines.join("\n") }, threadId, threadType);
          if (parentId) {
            logChildConsole(`Bot mẹ ưu tiên giữ nguyên UID ${parentId}.`);
          }
        }
      }

      const historyEntry = {
        timestamp: Date.now(),
        method: "QR",
        uid: selfId || state.loginInfo?.uid || null,
        displayName: state.accountInfo?.displayName || state.accountInfo?.name || state.loginInfo?.displayName || null,
        loginTime: state.loginTime || null,
        userAgent: options.userAgent || null,
        startedBy: options.requesterId ? String(options.requesterId) : null,
        threadId,
        threadType,
        success: true
      };
      recordLogin(childKey, historyEntry);
      persistSession(childKey, state, {
        uid: selfId || state.loginInfo?.uid || null,
        displayName: historyEntry.displayName,
        userAgent: options.userAgent || null,
        loginTime: state.loginTime || Date.now()
      });
    } catch (promotionError) {
      logger.log(`[childbot] Không thể thiết lập admin cao cấp: ${promotionError?.message || promotionError}`, "warn");
    }

    let successSummary = `✅ ${formatChildLabel(childKey)} đã khởi động và đang lắng nghe sự kiện!`;
    if (selfId) {
      successSummary += `\n• UID bot con: ${selfId}`;
    }
    if (parentId) {
      successSummary += `\n• Bot mẹ ưu tiên: ${parentId}`;
    }
    if (Array.isArray(adminArr)) {
      successSummary += `\n• Admin hiện có: ${adminArr.join(", ")}`;
    }
    if (Array.isArray(ownerArr)) {
      successSummary += `\n• Owner hiện có: ${ownerArr.join(", ")}`;
    }
    if (Array.isArray(childList)) {
      successSummary += `\n• Child bot ghi nhận: ${childList.join(", ")}`;
    }
    await sendMessageSafe(parentApi, successSummary, threadId, threadType);
    return api;
  } catch (error) {
    await sendMessageSafe(parentApi, `❌ Lỗi khởi động ${formatChildLabel(childKey)}: ${error.message}`, threadId, threadType);
    cleanupFile(qrFilePath);
    throw error;
  } finally {
    state.pending = false;
    if (loginResolved) {
      cleanupFile(qrFilePath);
      state.qrFilePath = null;
    }
    restoreConsole();
  }
}

async function startChildViaSession(childKey, parentApi, threadId, threadType, options) {
  const state = getChildState(childKey);

  if (!childRental.isRentalAllowed(childKey)) {
    const remaining = childRental.getRemainingMs(childKey);
    const rental = childRental.getRental(childKey);
    const reason = rental?.locked ? "đã bị khoá do hết hạn" : "đã hết thời gian thuê";
    const extra = remaining > 0 ? `Còn ${Math.ceil(remaining / 1000)}s.` : "";
    await sendMessageSafe(parentApi, `🚫 ${formatChildLabel(childKey)} ${reason}. ${extra}`.trim(), threadId, threadType);
    return null;
  }

  if (state.pending) {
    await sendMessageSafe(parentApi, `⌛ ${formatChildLabel(childKey)} đang khởi động, vui lòng đợi...`, threadId, threadType);
    return null;
  }

  if (state.api) {
    await sendMessageSafe(parentApi, `ℹ️ ${formatChildLabel(childKey)} đã chạy sẵn rồi!`, threadId, threadType);
    return state.api;
  }

  const session = readSession(childKey);
  if (!session || !session.cookie || !session.imei) {
    await sendMessageSafe(parentApi, `⚠️ Chưa có session lưu cho ${formatChildLabel(childKey)}. Vui lòng đăng nhập QR trước (startchild).`, threadId, threadType);
    return null;
  }

  state.pending = true;
  state.accountInfo = null;
  state.loginInfo = null;
  state.loginTime = session.loginTime || Date.now();

  const userAgent = options.userAgent || session.userAgent || DEFAULT_USER_AGENT;
  const zalo = new Zalo({
    selfListen: true,
    checkUpdate: true,
    logging: false
  });

  try {
    const api = await zalo.login({
      cookie: session.cookie,
      imei: session.imei,
      userAgent
    });

    setupChildListeners(childKey, api);
    state.instance = zalo;
    state.api = api;

    let selfId = null;
    let parentId = null;
    let adminArr = null;
    let ownerArr = null;

    try {
      state.accountInfo = await api.getCurrentUserInfo?.();
      const selfIdRaw = await api.getCurrentUserID?.();
      selfId = selfIdRaw ? String(selfIdRaw) : session.uid ? String(session.uid) : null;
      parentId = resolveParentBotId(parentApi);

      if (selfId) {
        state.loginInfo = { uid: selfId, displayName: state.accountInfo?.displayName || session.displayName };
        state.loginTime = session.loginTime || Date.now();

        const cfg = global.config || {};

        const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
        const owners = Array.isArray(cfg.owner_bot)
          ? cfg.owner_bot.map(String)
          : (typeof cfg.owner_bot === "string" && cfg.owner_bot.trim() ? [cfg.owner_bot.trim()] : []);

        const adminOriginal = new Set(admins);
        const ownerOriginal = new Set(owners);

        const adminSet = new Set(admins);
        adminSet.add(selfId);
        if (parentId) adminSet.add(parentId);
        const ownerSet = new Set(owners);
        ownerSet.add(selfId);
        if (parentId) ownerSet.add(parentId);

        adminArr = Array.from(adminSet);
        ownerArr = Array.from(ownerSet);
        const addedAdmins = adminArr.filter((uid) => !adminOriginal.has(uid));
        const addedOwners = ownerArr.filter((uid) => !ownerOriginal.has(uid));

        cfg.admin_bot = adminArr;
        cfg.owner_bot = ownerArr;
        global.users.admin = adminArr;
        global.users.owner = ownerArr;
        try {
          updateConfigArray("admin_bot", adminArr);
        } catch (err) {
          logger.log(`[childbot] Không thể cập nhật config admin_bot: ${err?.message || err}`, "warn");
        }
        try {
          updateConfigArray("owner_bot", ownerArr);
        } catch (err) {
          logger.log(`[childbot] Không thể cập nhật config owner_bot: ${err?.message || err}`, "warn");
        }

        childList = syncChildBotList(cfg, selfId);

        if (addedAdmins.length || addedOwners.length) {
          const lines = [
            `🔐 Đã cập nhật quyền cho ${formatChildLabel(childKey)}.`,
            addedAdmins.length
              ? `• Admin thêm: ${addedAdmins.join(", ")}`
              : "• Admin: không có UID mới",
            addedOwners.length
              ? `• Owner thêm: ${addedOwners.join(", ")}`
              : "• Owner: không có UID mới",
            parentId ? `• Bot mẹ ưu tiên: ${parentId}` : null
          ].filter(Boolean);

          await sendMessageSafe(parentApi, { msg: lines.join("\n") }, threadId, threadType);
          logChildConsole(`Auto-grant quyền (session): Admin += [${addedAdmins.join(", ")}], Owner += [${addedOwners.join(", ")}].`);
        } else {
          const lines = [
            `🔐 Quyền ${formatChildLabel(childKey)} giữ nguyên.`,
            parentId ? `• Bot mẹ ưu tiên: ${parentId}` : null,
            `• Admin hiện tại: ${adminArr.join(", ")}`,
            `• Owner hiện tại: ${ownerArr.join(", ")}`
          ].filter(Boolean);

          await sendMessageSafe(parentApi, { msg: lines.join("\n") }, threadId, threadType);
          if (parentId) {
            logChildConsole(`Bot mẹ ưu tiên giữ nguyên UID ${parentId}.`);
          }
        }

        const historyEntry = {
          timestamp: Date.now(),
          method: "SESSION",
          uid: selfId,
          displayName: state.accountInfo?.displayName || session.displayName || null,
          loginTime: state.loginTime,
          userAgent,
          startedBy: options.requesterId ? String(options.requesterId) : null,
          threadId,
          threadType,
          success: true
        };
        recordLogin(childKey, historyEntry);
        persistSession(childKey, state, {
          uid: selfId,
          displayName: historyEntry.displayName,
          userAgent,
          loginTime: state.loginTime
        });
      }
    } catch (error) {
      logger.log(`[childbot] Không thể đồng bộ thông tin sau khi đăng nhập session: ${error?.message || error}`, "warn");
    }

    let successSummary = `✅ ${formatChildLabel(childKey)} đã khởi động từ session!`;
    if (selfId) {
      successSummary += `\n• UID bot con: ${selfId}`;
    }
    if (parentId) {
      successSummary += `\n• Bot mẹ ưu tiên: ${parentId}`;
    }
    if (Array.isArray(adminArr)) {
      successSummary += `\n• Admin hiện có: ${adminArr.join(", ")}`;
    }
    if (Array.isArray(ownerArr)) {
      successSummary += `\n• Owner hiện có: ${ownerArr.join(", ")}`;
    }
    await sendMessageSafe(parentApi, successSummary, threadId, threadType);
    return api;
  } catch (error) {
    await sendMessageSafe(parentApi, `❌ Lỗi đăng nhập session cho ${formatChildLabel(childKey)}: ${error.message}`, threadId, threadType);
    return null;
  } finally {
    state.pending = false;
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

  let processedArgs = Array.isArray(args) ? [...args] : [];
  let shorthandInfo = null;
  if (processedArgs.length > 0) {
    const shorthand = parseModeCountToken(processedArgs[0]);
    if (shorthand) {
      shorthandInfo = shorthand;
      const [, ...remaining] = processedArgs;
      processedArgs = [shorthand.mode, String(shorthand.count), ...remaining];
    }
  }

  const { childKey, restArgs, isAll } = extractChildKeyFromArgs(processedArgs);
  const parsed = parseArgs(restArgs);
  if (shorthandInfo) {
    parsed.mode = shorthandInfo.mode;
    parsed.shorthandCount = shorthandInfo.count;
  }
  const modeFromArg = parsed.mode;
  const firstArg = restArgs[0]?.toLowerCase();
  const runMode = (modeFromArg === "session" || firstArg === "session") ? "session" : "qr";

  const options = {
    ...parsed,
    requesterId: senderId,
    mode: runMode,
    childKey
  };

  try {
      const loweredArgs = processedArgs.map((token) => String(token || "").toLowerCase());
    const isListCommand = loweredArgs[0] === "list" || loweredArgs[1] === "list";
    if (isListCommand) {
      await sendChildListSummary(api, threadId, type);
      return;
    }

    if (runMode === "qr" && restArgs.some((arg) => String(arg || "").toLowerCase() === "list")) {
      await sendChildListSummary(api, threadId, type);
      return;
    }

    if (isAll) {
      const storedKeys = listStoredChildKeys();
      const activeKeys = new Set(listActiveChildKeys());
      const toStart = storedKeys.filter((key) => !activeKeys.has(key));

      if (toStart.length === 0) {
        await sendMessageSafe(api, "ℹ️ Tất cả bot con đã chạy hoặc chưa có session lưu.", threadId, type);
        return;
      }

      await sendMessageSafe(api, `⏳ Đang khởi động ${toStart.length} bot con từ session...`, threadId, type);

      const results = [];
      for (const key of toStart) {
        try {
          const res = await startChildViaSession(key, api, threadId, type, { ...options, childKey: key });
          if (!res) {
            await sendMessageSafe(api, `⚠️ ${formatChildLabel(key)} chưa có session hợp lệ, chuyển sang đăng nhập QR...`, threadId, type);
            await startChildViaQR(key, api, threadId, type, { ...options, childKey: key, mode: "qr" });
          }
          results.push({ key, success: true });
        } catch (error) {
          results.push({ key, success: false, message: error?.message || "Không rõ" });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failCount = results.length - successCount;
      await sendMessageSafe(api, `✅ Hoàn tất: ${successCount} bot thành công, ${failCount} bot lỗi.`, threadId, type);
      return;
    }

    const storedKeys = listStoredChildKeys();
    const activeKeys = listActiveChildKeys();
    const targetKeys = resolveChildTargets(childKey, runMode, parsed, storedKeys, activeKeys, { shorthand: shorthandInfo });

    if (runMode === "session") {
      if (targetKeys.length === 0) {
        targetKeys.push(childKey);
      }

      const results = [];
      for (const key of targetKeys) {
        await sendMessageSafe(api, `⏳ Đang khởi động ${formatChildLabel(key)} từ session...`, threadId, type);
        const res = await startChildViaSession(key, api, threadId, type, { ...options, childKey: key });
        if (!res) {
          await sendMessageSafe(api, `ℹ️ Không tìm thấy session hợp lệ hoặc đăng nhập thất bại cho ${formatChildLabel(key)}.`, threadId, type);
          await sendMessageSafe(api, `⏳ Đang tạo QR đăng nhập mới cho ${formatChildLabel(key)}...`, threadId, type);
          try {
            await startChildViaQR(key, api, threadId, type, { ...options, childKey: key, mode: "qr" });
            results.push({ key, success: true, via: "qr" });
          } catch (error) {
            results.push({ key, success: false, message: error?.message || "Không rõ" });
          }
        } else {
          results.push({ key, success: true, via: "session" });
        }
      }

      if (targetKeys.length > 1) {
        const successCount = results.filter((item) => item.success).length;
        const failCount = results.length - successCount;
        await sendMessageSafe(api, `✅ Hoàn tất: ${successCount} bot thành công, ${failCount} bot lỗi.`, threadId, type);
      }
    } else {
      const targets = targetKeys.length > 0 ? targetKeys : [childKey];
      const uniqueTargets = targets.filter((value, index, arr) => arr.indexOf(value) === index);

      if (uniqueTargets.length === 1) {
        const key = uniqueTargets[0];
        await sendMessageSafe(api, `⏳ Đang khởi tạo đăng nhập QR cho ${formatChildLabel(key)}...`, threadId, type);
        await startChildViaQR(key, api, threadId, type, { ...options, childKey: key });
      } else {
        const labels = uniqueTargets.map((key) => formatChildLabel(key)).join(", ");
        await sendMessageSafe(api, `⏳ Đang khởi tạo đăng nhập QR cho ${uniqueTargets.length} bot con: ${labels}.`, threadId, type);

        const results = await Promise.all(uniqueTargets.map(async (key) => {
          try {
            await startChildViaQR(key, api, threadId, type, { ...options, childKey: key });
            return { key, success: true };
          } catch (error) {
            return { key, success: false, message: error?.message || "Không rõ" };
          }
        }));

        const successCount = results.filter((item) => item.success).length;
        const failCount = results.length - successCount;
        await sendMessageSafe(api, `✅ Hoàn tất: ${successCount} bot đăng nhập thành công, ${failCount} bot lỗi.`, threadId, type);
      }
    }
  } catch (error) {
    console.warn("[startchild] Lỗi tổng quát:", error.message);
  }
};
