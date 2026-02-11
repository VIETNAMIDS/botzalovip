const { ThreadType } = require("zca-js");
const path = require("path");
const { spawn } = require("child_process");

module.exports.config = {
  name: "stopchild",
  aliases: ["stopbot", "childstop"],
  version: "2.0.0",
  role: 2,
  author: "Cascade",
  description: "Tắt bot con đang chạy và giải phóng session (đa bot)",
  category: "Admin",
  usage: "stopchild [childKey|all]",
  cooldowns: 3
};

const CHILD_KEY_DEFAULT = "__default";

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

function getPm2Command() {
  return process.platform === "win32" ? "pm2.cmd" : "pm2";
}

function getPm2ProcessName(childKey) {
  const key = normalizeChildKey(childKey);
  return `childbot-${key}`;
}

async function pm2Stop(processName) {
  return new Promise((resolve) => {
    const pm2 = getPm2Command();
    const proc = spawn(pm2, ["stop", processName], {
      stdio: "pipe",
      shell: true,
      windowsHide: process.platform === "win32",
      cwd: PROJECT_ROOT
    });
    let out = "";
    let err = "";
    proc.stdout?.on("data", (d) => { out += d.toString(); });
    proc.stderr?.on("data", (d) => { err += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) return resolve({ success: true });
      const combined = (err || out || "").toLowerCase();
      if (combined.includes("not found") || combined.includes("process or namespace")) {
        return resolve({ success: false, reason: "not_found" });
      }
      return resolve({ success: false, reason: err || out || `pm2_exit_${code}` });
    });
    proc.on("error", (e) => resolve({ success: false, reason: e?.message || "pm2_error" }));
  });
}

async function pm2Delete(processName) {
  return new Promise((resolve) => {
    const pm2 = getPm2Command();
    const proc = spawn(pm2, ["delete", processName], {
      stdio: "pipe",
      shell: true,
      windowsHide: process.platform === "win32",
      cwd: PROJECT_ROOT
    });
    let out = "";
    let err = "";
    proc.stdout?.on("data", (d) => { out += d.toString(); });
    proc.stderr?.on("data", (d) => { err += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) return resolve({ success: true });
      const combined = (err || out || "").toLowerCase();
      if (combined.includes("not found") || combined.includes("process or namespace")) {
        return resolve({ success: false, reason: "not_found" });
      }
      return resolve({ success: false, reason: err || out || `pm2_exit_${code}` });
    });
    proc.on("error", (e) => resolve({ success: false, reason: e?.message || "pm2_error" }));
  });
}

async function listPm2ChildProcesses() {
  return new Promise((resolve) => {
    const pm2 = getPm2Command();
    const proc = spawn(pm2, ["jlist"], {
      stdio: "pipe",
      shell: true,
      windowsHide: process.platform === "win32",
      cwd: PROJECT_ROOT
    });
    let out = "";
    proc.stdout?.on("data", (d) => { out += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0 || !out) return resolve([]);
      try {
        const parsed = JSON.parse(out);
        const names = Array.isArray(parsed)
          ? parsed
            .map((p) => p?.name)
            .filter((name) => typeof name === "string" && name.startsWith("childbot-"))
          : [];
        resolve(names);
      } catch {
        resolve([]);
      }
    });
    proc.on("error", () => resolve([]));
  });
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

function formatChildLabel(childKey = CHILD_KEY_DEFAULT) {
  return childKey === CHILD_KEY_DEFAULT ? "bot con mặc định" : `bot con \"${childKey}\"`;
}

function getChildState(childKey = CHILD_KEY_DEFAULT) {
  if (!global.__childBots) return null;
  return global.__childBots[normalizeChildKey(childKey)] || null;
}

function clearChildState(childKey = CHILD_KEY_DEFAULT) {
  if (!global.__childBots) return;
  const key = normalizeChildKey(childKey);
  if (global.__childBots[key]) {
    delete global.__childBots[key];
  }
}

function listActiveChildKeys() {
  if (!global.__childBots || typeof global.__childBots !== "object") {
    return [];
  }

  return Object.entries(global.__childBots)
    .filter(([, state]) => state && state.api)
    .map(([key]) => key);
}

async function stopChildBot(childKey) {
  const pm2Name = getPm2ProcessName(childKey);
  const pm2Stopped = await pm2Stop(pm2Name);
  if (pm2Stopped.success) {
    await pm2Delete(pm2Name).catch(() => null);
    clearChildState(childKey);
    return { success: true };
  }
  if (pm2Stopped.reason !== "not_found") {
    // PM2 có nhưng stop lỗi
    clearChildState(childKey);
    return { success: false, reason: pm2Stopped.reason || "pm2_stop_failed" };
  }

  const state = getChildState(childKey);
  if (!state || !state.api) {
    return { success: false, reason: "inactive" };
  }

  try {
    if (state.api.listener && typeof state.api.listener.stop === "function") {
      try {
        state.api.listener.stop();
      } catch (listenerError) {
        console.warn("[stopchild] Lỗi khi stop listener bot con:", listenerError.message);
      }
    }

    if (typeof state.api.logout === "function") {
      try {
        await state.api.logout();
      } catch (logoutError) {
        console.warn("[stopchild] Lỗi khi logout bot con:", logoutError.message);
      }
    }

    if (state.instance && typeof state.instance.destroy === "function") {
      try {
        state.instance.destroy();
      } catch (destroyError) {
        console.warn("[stopchild] Lỗi destroy instance bot con:", destroyError.message);
      }
    }
  } catch (error) {
    console.warn("[stopchild] Lỗi khi dừng bot con:", error.message);
    clearChildState(childKey);
    return { success: false, reason: error?.message || "unknown" };
  }

  clearChildState(childKey);
  return { success: true };
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

  const firstArg = (args[0] || "").toLowerCase();

  if (firstArg === "all") {
    const pm2Names = await listPm2ChildProcesses();
    const activeKeys = listActiveChildKeys();
    const targetKeys = new Set([
      ...pm2Names.map((name) => name.replace(/^childbot-/, "")),
      ...activeKeys
    ]);
    const keysArr = Array.from(targetKeys);

    if (keysArr.length === 0) {
      return api.sendMessage("ℹ️ Không có bot con nào đang hoạt động.", threadId, type);
    }

    await api.sendMessage(`⏳ Đang dừng ${keysArr.length} bot con...`, threadId, type);

    const results = [];
    for (const key of keysArr) {
      // eslint-disable-next-line no-await-in-loop
      const outcome = await stopChildBot(key);
      results.push({ key, ...outcome });
    }

    const successCount = results.filter((item) => item.success).length;
    const failCount = results.length - successCount;

    if (failCount === 0) {
      await api.sendMessage(`✅ Đã dừng tất cả ${successCount} bot con.`, threadId, type);
    } else {
      const failDetails = results
        .filter((item) => !item.success)
        .map((item) => `${formatChildLabel(item.key)} (${item.reason || "unknown"})`)
        .join("; ");
      await api.sendMessage(`⚠️ Dừng ${successCount} bot. ${failCount} bot lỗi: ${failDetails}`, threadId, type);
    }

    return;
  }

  const childKey = normalizeChildKey(args[0]);
  const stopResult = await stopChildBot(childKey);
  if (!stopResult.success) {
    if (stopResult.reason === "inactive") {
      return api.sendMessage(`ℹ️ ${formatChildLabel(childKey)} hiện không chạy.`, threadId, type);
    }
    return api.sendMessage(`⚠️ Không thể dừng ${formatChildLabel(childKey)}: ${stopResult.reason}`, threadId, type);
  }

  api.sendMessage(`✅ ${formatChildLabel(childKey)} đã dừng hoạt động.`, threadId, type);
};

module.exports.stopChildByKey = async (childKey) => {
  const normalizedKey = normalizeChildKey(childKey);
  const result = await stopChildBot(normalizedKey);
  return { key: normalizedKey, ...result };
};
