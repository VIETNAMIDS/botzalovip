const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, '..', '..', 'assets', 'data', 'video_cache.json');
const AUTO_SAVE_INTERVAL = 60 * 1000;
const DEFAULT_TTL = 6 * 60 * 60 * 1000;

let cache = {};
let dirty = false;

function ensureFile() {
  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(CACHE_PATH)) {
    fs.writeFileSync(CACHE_PATH, JSON.stringify({}, null, 2), 'utf8');
  }
}

function load() {
  ensureFile();
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf8');
    cache = JSON.parse(raw) || {};
  } catch {
    cache = {};
  }
}

function save() {
  if (!dirty) return;
  ensureFile();
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  dirty = false;
}

setInterval(save, AUTO_SAVE_INTERVAL).unref?.();
load();

function makeKey(id, quality) {
  return quality ? `${id}::${quality}` : String(id);
}

function getCachedVideo(id, quality) {
  const key = makeKey(id, quality);
  const entry = cache[key];
  if (!entry) return null;
  const ttl = entry.ttl ?? DEFAULT_TTL;
  if (ttl > 0 && Date.now() - entry.timestamp > ttl) {
    delete cache[key];
    dirty = true;
    return null;
  }
  return { ...entry };
}

function setCachedVideo(id, quality, data, ttl = DEFAULT_TTL) {
  if (!id || !data?.videoUrl) return;
  const key = makeKey(id, quality);
  cache[key] = {
    ...data,
    timestamp: Date.now(),
    ttl,
  };
  dirty = true;
}

module.exports = {
  getCachedVideo,
  setCachedVideo,
  DEFAULT_TTL,
};
