const fs = require("fs");
const path = require("path");
const logger = require("./logger");

const DATA_DIR = path.join(__dirname, "..", "data");
const RENTAL_FILE = path.join(DATA_DIR, "child_rentals.json");
const CHILD_DATA_ROOT = path.join(DATA_DIR, "childbots");
const DEFAULT_SESSION_FILE = path.join(DATA_DIR, "child_session.json");
const DEFAULT_HISTORY_FILE = path.join(DATA_DIR, "child_login_history.json");
const CHECK_INTERVAL_MS = 15 * 1000;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function normalizeChildKey(rawKey) {
  const trimmed = String(rawKey || "").trim();
  if (!trimmed || trimmed === "__default") return "__default";
  const lowered = trimmed.toLowerCase();
  if (lowered === "default") return "__default";
  return lowered
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "") || "__default";
}

function loadFromDisk() {
  try {
    if (!fs.existsSync(RENTAL_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(RENTAL_FILE, "utf8");
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    const normalized = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      const normalizedKey = normalizeChildKey(key);
      normalized[normalizedKey] = {
        ...value,
        childKey: normalizedKey,
        expireAt: typeof value.expireAt === "number" ? value.expireAt : null,
        createdAt: typeof value.createdAt === "number" ? value.createdAt : Date.now(),
        locked: Boolean(value.locked),
        lockedAt: typeof value.lockedAt === "number" ? value.lockedAt : null
      };
    }

    return normalized;
  } catch (error) {
    logger.log(`[childRental] Không thể đọc file child_rentals: ${error?.message || error}`, "warn");
    return {};
  }
}

function saveToDisk(store) {
  try {
    ensureDataDir();
    fs.writeFileSync(RENTAL_FILE, JSON.stringify(store, null, 2), "utf8");
  } catch (error) {
    logger.log(`[childRental] Không thể ghi file child_rentals: ${error?.message || error}`, "warn");
  }
}

function getStore() {
  if (!global.__childRentalStore) {
    global.__childRentalStore = loadFromDisk();
  }
  return global.__childRentalStore;
}

function persist() {
  const store = getStore();
  saveToDisk(store);
  maintainWatcher();
}

function hasAnyRental() {
  const store = getStore();
  return Object.keys(store).some((key) => Boolean(store[key]));
}

async function checkExpirations() {
  const store = getStore();
  const now = Date.now();
  let changed = false;
  const rentalsToDelete = [];

  for (const [rawKey, record] of Object.entries(store)) {
    if (!record || typeof record !== "object") continue;
    const key = normalizeChildKey(rawKey);
    if (key !== rawKey) {
      store[key] = { ...record, childKey: key };
      delete store[rawKey];
      changed = true;
    }

    const target = store[key];
    if (!target) continue;
    if (target.locked) continue;
    if (typeof target.expireAt !== "number") continue;

    if (now >= target.expireAt) {
      target.locked = true;
      target.lockedAt = now;
      changed = true;

      try {
        const stopchild = require("../plugins/commands/stopchild");
        if (stopchild && typeof stopchild.stopChildByKey === "function") {
          const result = await stopchild.stopChildByKey(key);
          if (result?.success === false) {
            target.lastStopError = result.reason || null;
          } else {
            target.lastStopError = null;
          }
        }
      } catch (error) {
        const message = error?.message || String(error);
        target.lastStopError = message;
        logger.log(`[childRental] Không thể dừng bot con ${key} khi hết hạn: ${message}`, "warn");
      }

      try {
        if (global.api && typeof global.api.sendMessage === "function" && target.createdThreadId) {
          const threadId = target.createdThreadId;
          const threadType = target.createdThreadType || "message";
          const message = `⚠️ Thuê bot con ${key === "__default" ? "default" : key} đã hết hạn. Vui lòng gia hạn để tiếp tục sử dụng.`;
          await global.api.sendMessage(message, threadId, threadType);
        }
      } catch (notifyError) {
        logger.log(`[childRental] Không thể gửi thông báo hết hạn cho ${key}: ${notifyError?.message || notifyError}`, "warn");
      }

      rentalsToDelete.push(key);
    }
  }

  if (changed) {
    saveToDisk(store);
  }

  if (rentalsToDelete.length > 0) {
    await cleanupExpiredChildren(rentalsToDelete);
  }
}

async function cleanupExpiredChildren(keys = []) {
  if (!Array.isArray(keys) || keys.length === 0) return;

  for (const key of keys) {
    try {
      const normalized = normalizeChildKey(key);

      removeRental(normalized);

      if (global.__childBots && global.__childBots[normalized]) {
        delete global.__childBots[normalized];
      }

      if (normalized === "__default") {
        await deleteIfExists(DEFAULT_SESSION_FILE);
        await deleteIfExists(DEFAULT_HISTORY_FILE);
      } else {
        const childDir = path.join(CHILD_DATA_ROOT, normalized);
        await deleteIfExists(path.join(childDir, "session.json"));
        await deleteIfExists(path.join(childDir, "history.json"));
        await deleteDirectory(childDir);
      }
    } catch (error) {
      logger.log(`[childRental] Cleanup error for ${key}: ${error?.message || error}`, "warn");
    }
  }
}

async function deleteIfExists(targetPath) {
  if (!targetPath) return;
  try {
    if (fs.existsSync(targetPath)) {
      await fs.promises.unlink(targetPath);
    }
  } catch (error) {
    logger.log(`[childRental] Không thể xóa file ${path.basename(targetPath)}: ${error?.message || error}`, "warn");
  }
}

async function deleteDirectory(dirPath) {
  if (!dirPath) return;
  try {
    if (fs.existsSync(dirPath)) {
      await fs.promises.rm(dirPath, { recursive: true, force: true });
    }
  } catch (error) {
    logger.log(`[childRental] Không thể xóa thư mục ${path.basename(dirPath)}: ${error?.message || error}`, "warn");
  }
}

function maintainWatcher() {
  const hasRentals = hasAnyRental();
  if (!hasRentals && global.__childRentalWatcher) {
    clearInterval(global.__childRentalWatcher);
    global.__childRentalWatcher = null;
    return null;
  }

  if (hasRentals && !global.__childRentalWatcher) {
    const tick = () => {
      checkExpirations().catch((error) => {
        logger.log(`[childRental] Tick error: ${error?.message || error}`, "warn");
      });
    };
    // chạy ngay lần đầu để đảm bảo đồng bộ
    tick();
    global.__childRentalWatcher = setInterval(tick, CHECK_INTERVAL_MS);
  }

  return global.__childRentalWatcher;
}

function ensureWatcher() {
  return maintainWatcher();
}

function listRentals() {
  const store = getStore();
  return { ...store };
}

function getRental(childKey) {
  const store = getStore();
  const key = normalizeChildKey(childKey);
  return store[key] || null;
}

function setRental(childKey, payload) {
  const store = getStore();
  const key = normalizeChildKey(childKey);
  const expireAt = Number(payload?.expireAt);
  if (!Number.isFinite(expireAt) || expireAt <= Date.now()) {
    throw new Error("expireAt không hợp lệ");
  }

  const record = {
    childKey: key,
    expireAt,
    durationMs: Number(payload.durationMs) || expireAt - Date.now(),
    durationText: payload.durationText || null,
    createdAt: Number(payload.createdAt) || Date.now(),
    createdBy: payload.createdBy ? String(payload.createdBy) : null,
    createdThreadId: payload.createdThreadId ? String(payload.createdThreadId) : null,
    createdThreadType: payload.createdThreadType || null,
    note: payload.note || null,
    locked: false,
    lockedAt: null,
    lastStopError: null
  };

  store[key] = record;
  persist();
  return record;
}

function extendRental(childKey, additionalDurationMs, options = {}) {
  const store = getStore();
  const key = normalizeChildKey(childKey);
  const amount = Number(additionalDurationMs);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Thời lượng gia hạn phải lớn hơn 0");
  }

  const existing = store[key];
  if (!existing) {
    throw new Error("Chưa có thông tin thuê cho bot con này");
  }

  const now = Date.now();
  const base = typeof existing.expireAt === "number" && existing.expireAt > now ? existing.expireAt : now;
  const newExpireAt = base + amount;

  const updated = {
    ...existing,
    expireAt: newExpireAt,
    durationMs: (Number(existing.durationMs) || 0) + amount,
    durationText: options.durationText || existing.durationText,
    locked: false,
    lockedAt: null,
    lastStopError: null,
    lastRenewAt: now,
    lastRenewBy: options.extendedBy ? String(options.extendedBy) : existing.lastRenewBy || null
  };

  if (options.note !== undefined) {
    updated.note = options.note;
  }
  if (options.extendedThreadId) {
    updated.createdThreadId = String(options.extendedThreadId);
  }
  if (options.extendedThreadType) {
    updated.createdThreadType = options.extendedThreadType;
  }

  store[key] = updated;
  persist();
  return { ...updated };
}

function removeRental(childKey) {
  const store = getStore();
  const key = normalizeChildKey(childKey);
  if (store[key]) {
    delete store[key];
    persist();
    return true;
  }
  return false;
}

function isRentalActive(childKey) {
  const rental = getRental(childKey);
  if (!rental) return false;
  if (rental.locked) return false;
  if (typeof rental.expireAt !== "number") return false;
  return Date.now() < rental.expireAt;
}

function isRentalExpired(childKey) {
  const rental = getRental(childKey);
  if (!rental) return false;
  if (typeof rental.expireAt !== "number") return false;
  return Date.now() >= rental.expireAt;
}

function isRentalAllowed(childKey) {
  const rental = getRental(childKey);
  if (!rental) return true;
  if (typeof rental.expireAt !== "number") return false;
  const now = Date.now();
  if (rental.locked) {
    if (now < rental.expireAt) {
      rental.locked = false;
      rental.lockedAt = null;
      saveToDisk(getStore());
    } else {
      return false;
    }
  }
  return now < rental.expireAt;
}

function getRemainingMs(childKey) {
  const rental = getRental(childKey);
  if (!rental || typeof rental.expireAt !== "number") return 0;
  const remaining = rental.expireAt - Date.now();
  return remaining > 0 ? remaining : 0;
}

maintainWatcher();

module.exports = {
  normalizeChildKey,
  ensureWatcher,
  maintainWatcher,
  listRentals,
  getRental,
  setRental,
  extendRental,
  removeRental,
  isRentalActive,
  isRentalExpired,
  isRentalAllowed,
  getRemainingMs,
  checkExpirations
};
