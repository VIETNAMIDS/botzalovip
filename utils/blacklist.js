const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

const CONFIG_PATH = path.join(__dirname, "..", "config.yml");

const CACHE_TTL_MS = 5_000;
let cachedList = null;
let cachedSet = null;
let cachedAt = 0;

function invalidateCache() {
  cachedList = null;
  cachedSet = null;
  cachedAt = 0;
}

function normalizeId(id) {
  if (id == null) return null;
  const s = String(id).trim();
  return s ? s : null;
}

function getList() {
  const now = Date.now();
  if (cachedList && now - cachedAt < CACHE_TTL_MS) {
    return cachedList;
  }

  const raw = global?.config?.banned_users;
  const list = Array.isArray(raw) ? raw.map(normalizeId).filter(Boolean) : [];
  cachedList = Array.from(new Set(list));
  cachedSet = new Set(cachedList);
  cachedAt = now;
  return cachedList;
}

function isBanned(userId) {
  const id = normalizeId(userId);
  if (!id) return false;
  getList();
  return cachedSet ? cachedSet.has(id) : false;
}

function setGlobalList(next) {
  if (!global.config) global.config = {};
  global.config.banned_users = Array.isArray(next) ? next.map(String) : [];
  invalidateCache();
}

function readConfigFile() {
  const fileContent = fs.readFileSync(CONFIG_PATH, "utf8");
  const parsed = YAML.parse(fileContent);
  return parsed && typeof parsed === "object" ? parsed : {};
}

function writeConfigFile(cfg) {
  const text = YAML.stringify(cfg);
  fs.writeFileSync(CONFIG_PATH, text, "utf8");
}

function add(userId) {
  const id = normalizeId(userId);
  if (!id) return { changed: false, banned: getList() };

  const cfg = readConfigFile();
  const current = Array.isArray(cfg.banned_users) ? cfg.banned_users.map(normalizeId).filter(Boolean) : [];
  if (current.includes(id)) {
    setGlobalList(Array.from(new Set(current)));
    return { changed: false, banned: getList() };
  }

  current.push(id);
  const next = Array.from(new Set(current));
  cfg.banned_users = next;
  writeConfigFile(cfg);
  setGlobalList(next);
  return { changed: true, banned: next };
}

function remove(userId) {
  const id = normalizeId(userId);
  if (!id) return { changed: false, banned: getList() };

  const cfg = readConfigFile();
  const current = Array.isArray(cfg.banned_users) ? cfg.banned_users.map(normalizeId).filter(Boolean) : [];
  const next = current.filter((x) => x !== id);
  const changed = next.length !== current.length;

  cfg.banned_users = Array.from(new Set(next));
  writeConfigFile(cfg);
  setGlobalList(cfg.banned_users);

  return { changed, banned: cfg.banned_users };
}

function clear() {
  const cfg = readConfigFile();
  const had = Array.isArray(cfg.banned_users) ? cfg.banned_users.length : 0;
  cfg.banned_users = [];
  writeConfigFile(cfg);
  setGlobalList([]);
  return { had };
}

module.exports = {
  getList,
  isBanned,
  add,
  remove,
  clear,
  CONFIG_PATH
};
