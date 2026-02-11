const fs = require("fs");
const path = require("path");

const { ThreadType, GroupEventType } = require("zca-js");

const TIME_DATA_PATH = path.join(__dirname, "../../data/lockchat_time.json");
const CHECK_INTERVAL_MS = 30 * 1000;
const APPLY_COOLDOWN_MS = 2 * 60 * 1000;
const TIMEZONE = process.env.LOCKCHAT_TIMEZONE || "Asia/Ho_Chi_Minh";

function ensureDataDir() {
  try {
    const dir = path.dirname(TIME_DATA_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
}

function loadState() {
  ensureDataDir();
  try {
    if (!fs.existsSync(TIME_DATA_PATH)) return { threads: {} };
    const raw = fs.readFileSync(TIME_DATA_PATH, "utf8");
    const parsed = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object") return { threads: {} };
    if (!parsed.threads || typeof parsed.threads !== "object") parsed.threads = {};
    return parsed;
  } catch {
    return { threads: {} };
  }
}

function getTimePartsInTz(tz) {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    const parts = dtf.formatToParts(new Date());
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    const minute = Number(parts.find((p) => p.type === "minute")?.value);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return { hour, minute, minutes: hour * 60 + minute };
  } catch {
    return null;
  }
}

function isInLockWindow(nowMin, offMin, onMin) {
  if (!Number.isFinite(nowMin) || !Number.isFinite(offMin) || !Number.isFinite(onMin)) return false;
  if (offMin === onMin) return true;
  if (offMin < onMin) return nowMin >= offMin && nowMin < onMin;
  return nowMin >= offMin || nowMin < onMin;
}

function extractGroupDetailFromGetGroupInfoResult(info, threadId) {
  if (!info) return null;
  const tid = String(threadId);
  return info?.gridInfoMap?.[tid] || info?.groupInfo?.[tid] || info?.data?.[tid] || info?.data || info;
}

function isLockEnabled(detail) {
  if (!detail) return false;
  const settings = detail?.setting || detail?.settings || detail?.config || {};
  const flags = [
    detail?.lockSendMsg,
    detail?.lock_send_msg,
    detail?.lock_send,
    settings?.lockSendMsg,
    settings?.lock_send_msg,
    settings?.lockSend,
    settings?.lock_send
  ];
  return flags.some((v) => v === true || Number(v) === 1);
}

async function fetchLockState(api, threadId) {
  if (typeof api?.getGroupInfo !== "function") return null;
  try {
    const info = await api.getGroupInfo(String(threadId));
    const detail = extractGroupDetailFromGetGroupInfoResult(info, threadId);
    return isLockEnabled(detail);
  } catch {
    return null;
  }
}

async function applyLockState(api, threadId, desiredLocked) {
  if (typeof api?.updateGroupSettings !== "function") return false;
  try {
    await api.updateGroupSettings({ lockSendMsg: !!desiredLocked }, String(threadId));
    return true;
  } catch {
    return false;
  }
}

function ensureRuntimeCache() {
  if (!(global.__bonzLockChatTimeRuntime instanceof Map)) {
    global.__bonzLockChatTimeRuntime = new Map();
  }
  return global.__bonzLockChatTimeRuntime;
}

async function tick(api) {
  const now = getTimePartsInTz(TIMEZONE) || (() => {
    const d = new Date();
    return { hour: d.getHours(), minute: d.getMinutes(), minutes: d.getHours() * 60 + d.getMinutes() };
  })();

  const state = loadState();
  const threads = state.threads || {};
  const runtime = ensureRuntimeCache();

  const keys = Object.keys(threads);
  for (const threadId of keys) {
    const rec = threads[threadId];
    if (!rec || typeof rec !== "object") continue;
    if (!rec.enabled) continue;

    const offMin = Number(rec?.off?.minutes);
    const onMin = Number(rec?.on?.minutes);
    if (!Number.isFinite(offMin) || !Number.isFinite(onMin)) continue;

    const desiredLocked = isInLockWindow(now.minutes, offMin, onMin);

    const last = runtime.get(threadId) || { desiredLocked: null, appliedAt: 0, lastCheckAt: 0 };
    const nowTs = Date.now();

    // avoid too frequent applying
    if (Number(last.appliedAt) && nowTs - Number(last.appliedAt) < APPLY_COOLDOWN_MS) {
      runtime.set(threadId, { ...last, desiredLocked, lastCheckAt: nowTs });
      continue;
    }

    // If desired hasn't changed since last tick and we applied before -> skip
    if (last.desiredLocked === desiredLocked && Number(last.appliedAt) > 0) {
      runtime.set(threadId, { ...last, lastCheckAt: nowTs });
      continue;
    }

    const currentLocked = await fetchLockState(api, threadId);
    if (currentLocked === desiredLocked) {
      runtime.set(threadId, { desiredLocked, appliedAt: nowTs, lastCheckAt: nowTs });
      continue;
    }

    const ok = await applyLockState(api, threadId, desiredLocked);
    if (ok) {
      runtime.set(threadId, { desiredLocked, appliedAt: nowTs, lastCheckAt: nowTs });
      try {
        const msg = desiredLocked
          ? `🔒 LockChat Time\n⏰ Đã tự động khoá chat theo giờ (${String(rec?.off?.hh).padStart(2, "0")}:${String(rec?.off?.mm).padStart(2, "0")} -> ${String(rec?.on?.hh).padStart(2, "0")}:${String(rec?.on?.mm).padStart(2, "0")})`
          : `🔓 LockChat Time\n⏰ Đã tự động mở chat theo giờ (${String(rec?.off?.hh).padStart(2, "0")}:${String(rec?.off?.mm).padStart(2, "0")} -> ${String(rec?.on?.hh).padStart(2, "0")}:${String(rec?.on?.mm).padStart(2, "0")})`;
        await api.sendMessage({ msg }, threadId, ThreadType.Group);
      } catch {}
    } else {
      runtime.set(threadId, { desiredLocked, appliedAt: 0, lastCheckAt: nowTs });
    }
  }
}

module.exports.config = {
  event_type: ["group_event"],
  name: "lockChatTime",
  version: "1.0.0",
  author: "Cascade",
  description: "Tự động khoá/mở chat theo giờ (lockSendMsg)"
};

module.exports.onLoad = ({ api }) => {
  if (!api) return;
  if (global.__bonzLockChatTimeInterval) return;

  const runner = () => {
    tick(api).catch(() => {});
  };

  runner();
  global.__bonzLockChatTimeInterval = setInterval(runner, CHECK_INTERVAL_MS);
  if (typeof global.__bonzLockChatTimeInterval.unref === "function") {
    global.__bonzLockChatTimeInterval.unref();
  }
};

module.exports.run = async () => {
  return;
};
