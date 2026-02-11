const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const CHILD_DATA_ROOT = path.join(DATA_DIR, "childbots");
const REGISTRY_FILE = path.join(CHILD_DATA_ROOT, "registry.json");

const MYBOTS_FILE_CANDIDATES = [
  path.join(PROJECT_ROOT, "mybot", "mybots.json"),
  path.join(PROJECT_ROOT, "plugins", "mybot", "mybots.json")
];

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CHILD_DATA_ROOT)) fs.mkdirSync(CHILD_DATA_ROOT, { recursive: true });
}

function safeParseJson(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function readRegistry() {
  try {
    ensureDirs();
    if (!fs.existsSync(REGISTRY_FILE)) return {};
    const raw = fs.readFileSync(REGISTRY_FILE, "utf8");
    if (!raw.trim()) return {};
    const parsed = safeParseJson(raw, {});
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeRegistry(registry) {
  ensureDirs();
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry || {}, null, 2), "utf8");
}

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

function readMyBotInfoByUid(uid) {
  try {
    const id = String(uid || "").trim();
    if (!id) return null;
    const filePath = MYBOTS_FILE_CANDIDATES.find((p) => fs.existsSync(p));
    if (!filePath) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return null;
    const parsed = safeParseJson(raw, null);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed[id] || null;
  } catch {
    return null;
  }
}

function resolveImportedName(uid) {
  const mybot = readMyBotInfoByUid(uid);
  const importedName = mybot?.displayName || mybot?.name || null;
  return importedName ? { importedName, mybot } : { importedName: null, mybot: null };
}

function upsertChild({ childKey, uid, zaloName, avatar, lastLoginTime, startedBy }) {
  const key = normalizeChildKey(childKey);
  const registry = readRegistry();
  const prev = registry[key] || {};
  const now = new Date().toISOString();

  const { importedName } = resolveImportedName(uid);

  registry[key] = {
    key,
    uid: uid ? String(uid) : prev.uid || null,
    zaloName: zaloName || prev.zaloName || null,
    avatar: avatar || prev.avatar || null,
    customName: prev.customName || null,
    importedName: importedName || prev.importedName || null,
    lastLoginTime: lastLoginTime || prev.lastLoginTime || null,
    startedBy: startedBy || prev.startedBy || null,
    updatedAt: now,
    createdAt: prev.createdAt || now
  };

  writeRegistry(registry);
  return registry[key];
}

function setCustomName(childKey, customName) {
  const key = normalizeChildKey(childKey);
  const registry = readRegistry();
  const prev = registry[key] || { key };
  const now = new Date().toISOString();
  registry[key] = {
    ...prev,
    key,
    customName: customName ? String(customName).trim() : null,
    updatedAt: now,
    createdAt: prev.createdAt || now
  };
  writeRegistry(registry);
  return registry[key];
}

function getChild(childKey) {
  const key = normalizeChildKey(childKey);
  const registry = readRegistry();
  return registry[key] || null;
}

function resolveBestName(entry, fallback) {
  if (!entry) return fallback || null;
  return entry.customName || entry.importedName || entry.zaloName || fallback || null;
}

module.exports = {
  readRegistry,
  writeRegistry,
  normalizeChildKey,
  upsertChild,
  setCustomName,
  getChild,
  resolveBestName
};
