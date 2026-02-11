const fs = require("fs");
const path = require("path");

const CHATGR_FILE = path.join(__dirname, "..", "data", "chatgr.json");
const DEFAULT_STATE = {
  mode: "all", // all | list | off
  allowed: []
};

let stateCache = null;

function ensureFile() {
  const dir = path.dirname(CHATGR_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(CHATGR_FILE)) {
    fs.writeFileSync(CHATGR_FILE, JSON.stringify(DEFAULT_STATE, null, 2));
  }
}

function loadState() {
  ensureFile();
  try {
    const raw = fs.readFileSync(CHATGR_FILE, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return normalizeState(parsed);
  } catch (error) {
    console.warn("[chatgr] Failed to read state, falling back to default", error?.message || error);
    return { ...DEFAULT_STATE };
  }
}

function normalizeState(input) {
  const cloned = {
    mode: typeof input.mode === "string" ? input.mode : DEFAULT_STATE.mode,
    allowed: Array.isArray(input.allowed) ? input.allowed.map(String) : []
  };
  cloned.allowed = Array.from(new Set(cloned.allowed.filter(Boolean)));
  if (!["all", "list", "off"].includes(cloned.mode)) {
    cloned.mode = DEFAULT_STATE.mode;
  }
  return cloned;
}

function persist() {
  try {
    ensureFile();
    fs.writeFileSync(CHATGR_FILE, JSON.stringify(stateCache, null, 2));
  } catch (error) {
    console.warn("[chatgr] Failed to write state", error?.message || error);
  }
}

function getState() {
  if (!stateCache) {
    stateCache = loadState();
  }
  return {
    mode: stateCache.mode,
    allowed: [...stateCache.allowed]
  };
}

function setMode(mode) {
  if (!stateCache) stateCache = loadState();
  const normalized = ["all", "list", "off"].includes(mode) ? mode : "list";
  stateCache.mode = normalized;
  persist();
  return getState();
}

function allowThread(threadId) {
  if (!threadId) return getState();
  if (!stateCache) stateCache = loadState();
  const id = String(threadId);
  if (!stateCache.allowed.includes(id)) {
    stateCache.allowed.push(id);
    persist();
  }
  return getState();
}

function removeThread(threadId) {
  if (!threadId) return false;
  if (!stateCache) stateCache = loadState();
  const id = String(threadId);
  const before = stateCache.allowed.length;
  stateCache.allowed = stateCache.allowed.filter((item) => item !== id);
  const changed = stateCache.allowed.length !== before;
  if (changed) persist();
  return changed;
}

function clearAllowed() {
  if (!stateCache) stateCache = loadState();
  const had = stateCache.allowed.length;
  stateCache.allowed = [];
  persist();
  return had;
}

function shouldAllowThread(threadId, threadType = 1) {
  if (threadType !== 1) return true; // chỉ áp dụng cho group chat
  const state = getState();
  if (state.mode === "all") return true;
  if (!threadId) return false;
  if (state.mode === "off") return false;
  return state.allowed.includes(String(threadId));
}

function describeState() {
  const state = getState();
  const header = state.mode === "all"
    ? "📡 Bot đang nghe TẤT CẢ group"
    : state.mode === "off"
      ? "🔕 Bot đang tắt cho mọi group"
      : "🎯 Bot chỉ nghe các group trong whitelist";
  const list = state.allowed.length
    ? state.allowed.map((id, idx) => `${idx + 1}. ${id}`).join("\n")
    : "(Danh sách rỗng)";
  return `${header}\nDanh sách: ${state.allowed.length} nhóm\n${list}`;
}

module.exports = {
  getState,
  setMode,
  allowThread,
  removeThread,
  clearAllowed,
  shouldAllowThread,
  describeState,
  CHATGR_FILE
};
