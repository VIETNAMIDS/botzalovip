const fs = require("fs");
const path = require("path");
const { normalizeChildKey } = require("./childRental");

const DATA_DIR = path.join(__dirname, "..", "data");
const POLICY_FILE = path.join(DATA_DIR, "child_command_policy.json");

const ALWAYS_ALLOWED_COMMANDS = new Set([
  "childchon",
  "startchild",
  "stopchild",
  "childinfo",
  "childthue",
  "childgiahan",
  "childxoa",
  "childgrant",
  "childhelp"
]);

let storeCache = null;

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(POLICY_FILE)) {
    fs.writeFileSync(POLICY_FILE, JSON.stringify({}, null, 2), "utf8");
  }
}

function loadStore() {
  if (storeCache) return storeCache;
  try {
    ensureDataFile();
    const raw = fs.readFileSync(POLICY_FILE, "utf8");
    if (!raw.trim()) {
      storeCache = {};
    } else {
      const parsed = JSON.parse(raw);
      storeCache = parsed && typeof parsed === "object" ? parsed : {};
    }
  } catch (error) {
    console.warn(`[childCommandPolicy] Không thể đọc file policy: ${error?.message || error}`);
    storeCache = {};
  }
  return storeCache;
}

function saveStore() {
  try {
    ensureDataFile();
    fs.writeFileSync(POLICY_FILE, JSON.stringify(storeCache || {}, null, 2), "utf8");
  } catch (error) {
    console.warn(`[childCommandPolicy] Không thể ghi file policy: ${error?.message || error}`);
  }
}

function getStore() {
  return loadStore();
}

function getPolicy(childKey) {
  const store = getStore();
  const key = normalizeChildKey(childKey);
  const policy = store[key];
  if (!policy) {
    return {
      mode: "all",
      commands: []
    };
  }
  if (!policy.mode) {
    policy.mode = "all";
  }
  if (!Array.isArray(policy.commands)) {
    policy.commands = [];
  }
  return { ...policy };
}

function normalizeCommandNames(names = []) {
  if (!Array.isArray(names)) return [];
  return Array.from(new Set(names.filter(Boolean).map((name) => String(name).trim().toLowerCase())));
}

function setPolicy(childKey, policy = {}) {
  const store = getStore();
  const key = normalizeChildKey(childKey);
  const normalized = {
    mode: typeof policy.mode === "string" ? policy.mode : "all",
    commands: normalizeCommandNames(policy.commands)
  };
  store[key] = normalized;
  storeCache = store;
  saveStore();
  return { ...normalized };
}

function clearPolicy(childKey) {
  const store = getStore();
  const key = normalizeChildKey(childKey);
  if (store[key]) {
    delete store[key];
    storeCache = store;
    saveStore();
    return true;
  }
  return false;
}

function isCommandAllowed(childKey, primaryName, additionalNames = []) {
  const candidates = normalizeCommandNames([primaryName, ...(Array.isArray(additionalNames) ? additionalNames : [])]);
  if (candidates.length === 0) return true;
  for (const name of candidates) {
    if (ALWAYS_ALLOWED_COMMANDS.has(name)) {
      return true;
    }
  }

  const policy = getPolicy(childKey);
  if (!policy) return true;
  if (policy.mode === "all" || !policy.mode) return true;
  if (policy.mode === "none") return false;

  const whitelist = new Set(policy.commands || []);
  for (const name of candidates) {
    if (whitelist.has(name)) return true;
  }

  return false;
}

function listPolicies() {
  const store = getStore();
  const entries = Object.entries(store);
  return entries.map(([key, policy]) => ({
    childKey: key,
    mode: policy?.mode || "all",
    commands: Array.isArray(policy?.commands) ? [...policy.commands] : []
  }));
}

module.exports = {
  getPolicy,
  setPolicy,
  clearPolicy,
  isCommandAllowed,
  listPolicies,
  ALWAYS_ALLOWED_COMMANDS,
  normalizeCommandNames
};
