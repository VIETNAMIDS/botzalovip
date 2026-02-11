const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, '..', '..', 'assets', 'data', 'music_cache.json');
const AUTO_SAVE_INTERVAL = 60 * 1000;
const DEFAULT_TTL = 6 * 60 * 60 * 1000; // 6 giờ

const defaultState = {
  youtube: {},
  soundcloud: {},
  zingmp3: {},
  nhaccuatui: {},
  tiktok: {},
};

let cacheState = { ...defaultState };
let dirty = false;

function ensureCacheFile() {
  try {
    const dir = path.dirname(CACHE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(CACHE_PATH)) {
      fs.writeFileSync(CACHE_PATH, JSON.stringify(defaultState, null, 2), 'utf8');
    }
  } catch (error) {
    console.warn('[musicCache] Không thể đảm bảo file cache:', error?.message || error);
  }
}

function loadCache() {
  ensureCacheFile();
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    cacheState = { ...defaultState, ...parsed };
  } catch (error) {
    console.warn('[musicCache] Không thể đọc cache, sử dụng mặc định:', error?.message || error);
    cacheState = { ...defaultState };
  }
}

function saveCache() {
  if (!dirty) return;
  try {
    ensureCacheFile();
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cacheState, null, 2), 'utf8');
    dirty = false;
  } catch (error) {
    console.warn('[musicCache] Không thể ghi cache:', error?.message || error);
  }
}

function scheduleAutoSave() {
  const timer = setInterval(() => {
    try {
      saveCache();
    } catch (err) {
      console.warn('[musicCache] Lỗi autosave:', err?.message || err);
    }
  }, AUTO_SAVE_INTERVAL);
  if (typeof timer.unref === 'function') timer.unref();
}

loadCache();
scheduleAutoSave();

function getPlatformBucket(platform) {
  const key = (platform || '').toLowerCase();
  if (!cacheState[key]) {
    cacheState[key] = {};
  }
  return cacheState[key];
}

function makeCacheKey(id, quality) {
  return quality ? `${id}::${quality}` : String(id);
}

function getCachedMedia(platform, id, quality = null) {
  if (!platform || !id) return null;
  const bucket = getPlatformBucket(platform);
  const key = makeCacheKey(id, quality);
  const entry = bucket[key];
  if (!entry) return null;

  const ttl = entry.ttl ?? DEFAULT_TTL;
  if (ttl > 0 && Date.now() - entry.timestamp > ttl) {
    delete bucket[key];
    dirty = true;
    return null;
  }

  return { ...entry };
}

function setCachedMedia(platform, id, data = {}, quality = null, ttl = DEFAULT_TTL) {
  if (!platform || !id || !data?.fileUrl) return;
  const bucket = getPlatformBucket(platform);
  const key = makeCacheKey(id, quality);
  bucket[key] = {
    fileUrl: data.fileUrl,
    duration: data.duration ?? null,
    title: data.title ?? null,
    artist: data.artist ?? null,
    width: data.width ?? null,
    height: data.height ?? null,
    extra: data.extra ?? null,
    timestamp: Date.now(),
    ttl,
  };
  dirty = true;
}

function clearCachedMedia(platform, id, quality = null) {
  if (!platform || !id) return false;
  const bucket = getPlatformBucket(platform);
  const key = makeCacheKey(id, quality);
  if (bucket[key]) {
    delete bucket[key];
    dirty = true;
    return true;
  }
  return false;
}

module.exports = {
  getCachedMedia,
  setCachedMedia,
  clearCachedMedia,
  DEFAULT_TTL,
};
