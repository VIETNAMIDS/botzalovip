const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, '..', '..', 'data', 'antiadd-settings.json');
let cache = null;

function ensureDir() {
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadSettings() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
    cache = JSON.parse(raw);
  } catch {
    cache = { globalEnabled: true, threads: {} };
  }
  if (typeof cache.globalEnabled !== 'boolean') cache.globalEnabled = true;
  if (typeof cache.threads !== 'object' || cache.threads === null) cache.threads = {};
  return cache;
}

function saveSettings(settings) {
  cache = settings;
  ensureDir();
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
}

function isAntiAddEnabled(threadId = null) {
  const settings = loadSettings();
  if (!threadId) return settings.globalEnabled !== false;
  const value = settings.threads[String(threadId)];
  if (typeof value === 'boolean') return value;
  return settings.globalEnabled !== false;
}

function setAntiAddState(threadId, enabled) {
  const settings = loadSettings();
  if (!settings.threads) settings.threads = {};
  if (threadId) {
    settings.threads[String(threadId)] = Boolean(enabled);
  } else {
    settings.globalEnabled = Boolean(enabled);
  }
  saveSettings(settings);
  return settings;
}

function getAntiAddStatus(threadId) {
  const settings = loadSettings();
  const threadState = threadId ? isAntiAddEnabled(threadId) : null;
  return {
    globalEnabled: settings.globalEnabled !== false,
    threadEnabled: threadState,
  };
}

module.exports = {
  isAntiAddEnabled,
  setAntiAddState,
  getAntiAddStatus,
  loadSettings,
};
