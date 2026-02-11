const { ThreadType } = require("zca-js");

module.exports.config = {
  name: "antiset",
  aliases: ["anti-set", "aset"],
  version: "1.0.0",
  role: 1,
  author: "Cascade",
  description: "Bật/tắt kick người tự ý thay đổi thông tin/cài đặt nhóm (trừ chủ nhóm/key vàng và phó nhóm/key bạc)",
  category: "Quản lý",
  usage: "antiset [on|off|status|mode bg|mode all]",
  cooldowns: 3
};

const ENABLE_KEYWORDS = ["on", "bat", "bật", "enable", "1"];
const DISABLE_KEYWORDS = ["off", "tat", "tắt", "disable", "0"];

function ensureSnapshotStore() {
  if (!(global.__bonzAntiSetSnapshots instanceof Map)) {
    global.__bonzAntiSetSnapshots = new Map();
  }
  return global.__bonzAntiSetSnapshots;
}

function extractSnapshot(detail) {
  if (!detail) return null;
  const name = detail?.name || detail?.groupName || detail?.title || null;
  const avatar =
    detail?.fullAvt ??
    detail?.fullAvtUrl ??
    detail?.avatar ??
    detail?.avatarUrl ??
    detail?.avt ??
    detail?.avtUrl ??
    detail?.picture ??
    detail?.pic ??
    detail?.profilePic ??
    null;
  const description =
    detail?.description ??
    detail?.desc ??
    detail?.groupDesc ??
    detail?.groupDescription ??
    detail?.bio ??
    null;
  return {
    name: name ? String(name) : null,
    avatar: avatar ? String(avatar) : null,
    description: description != null ? String(description) : null,
    at: Date.now()
  };
}

async function captureGroupSnapshot(api, threadId) {
  try {
    if (!threadId || typeof api?.getGroupInfo !== "function") return;
    const info = await api.getGroupInfo(threadId);
    const detail = info?.gridInfoMap?.[String(threadId)] || info?.groupInfo?.[String(threadId)] || info?.info || info;
    const snap = extractSnapshot(detail);
    if (!snap) return;
    const store = ensureSnapshotStore();
    store.set(String(threadId), snap);
  } catch (_) {}
}

function ensureThreadConfig(data = {}) {
  if (!data.antiSet || typeof data.antiSet !== "object") {
    data.antiSet = { enabled: false, mode: "all" };
  }
  if (typeof data.antiSet.enabled !== "boolean") {
    data.antiSet.enabled = false;
  }
  if (typeof data.antiSet.mode !== "string" || !["all", "bg"].includes(data.antiSet.mode)) {
    data.antiSet.mode = "all";
  }
  return data;
}

module.exports.run = async ({ api, event, args = [], Threads }) => {
  const { threadId, type } = event || {};
  if (!threadId || Number(type) !== Number(ThreadType.Group)) {
    return api.sendMessage("❌ Lệnh này chỉ dùng trong nhóm.", threadId, type);
  }

  if (!Threads || typeof Threads.getData !== "function" || typeof Threads.setData !== "function") {
    return api.sendMessage("❌ Thiếu Threads storage, không thể lưu cấu hình antiset.", threadId, type);
  }

  const actionRaw = String(args?.[0] || "").toLowerCase();
  const action = ENABLE_KEYWORDS.includes(actionRaw)
    ? "on"
    : DISABLE_KEYWORDS.includes(actionRaw)
      ? "off"
      : (actionRaw === "status" || actionRaw === "st" ? "status" : "toggle");

  const threadData = await Threads.getData(threadId);
  const data = ensureThreadConfig(threadData?.data || {});
  const current = !!data.antiSet.enabled;

  if (actionRaw === "mode") {
    const modeRaw = String(args?.[1] || "").toLowerCase();
    const mode = modeRaw === "bg" || modeRaw === "background" || modeRaw === "nen" || modeRaw === "nền" ? "bg" : (modeRaw === "all" ? "all" : null);
    if (!mode) {
      return api.sendMessage("⚠️ Dùng: antiset mode bg | antiset mode all", threadId, type);
    }
    data.antiSet.mode = mode;
    data.antiSet.updatedBy = String(event?.data?.uidFrom || event?.authorId || "");
    data.antiSet.updatedAt = Date.now();
    await Threads.setData(threadId, data);
    return api.sendMessage(`✅ AntiSet mode: ${mode === "bg" ? "CHỈ ĐỔI ẢNH NỀN/THEME" : "TẤT CẢ THAY ĐỔI"}.`, threadId, type);
  }

  if (action === "status") {
    const status = current ? "đang BẬT" : "đang TẮT";
    const mode = data.antiSet.mode === "bg" ? "bg" : "all";
    const modeText = mode === "bg" ? "chỉ kick khi đổi ảnh nền/theme" : "kick mọi thay đổi";
    return api.sendMessage(`🛡️ AntiSet hiện ${status}.\n⚙️ Mode: ${mode} (${modeText}).\n📌 Dùng: antiset on|off | antiset mode bg|all`, threadId, type);
  }

  const next = action === "toggle" ? !current : (action === "on");

  data.antiSet.enabled = next;
  data.antiSet.updatedBy = String(event?.data?.uidFrom || event?.authorId || "");
  data.antiSet.updatedAt = Date.now();

  await Threads.setData(threadId, data);

  if (next) {
    await captureGroupSnapshot(api, threadId);
  }

  const statusText = next ? "đã BẬT" : "đã TẮT";
  const emoji = next ? "🚫" : "✅";
  const hint = next
    ? (data.antiSet.mode === "bg"
        ? "Ai đổi ảnh nền/theme nhóm mà không phải chủ nhóm (key vàng) hoặc phó nhóm (key bạc) sẽ bị kick."
        : "Ai đổi thông tin/cài đặt nhóm mà không phải chủ nhóm (key vàng) hoặc phó nhóm (key bạc) sẽ bị kick.")
    : "AntiSet sẽ không hoạt động cho đến khi bật lại.";

  return api.sendMessage(`${emoji} AntiSet ${statusText}.\nℹ️ ${hint}\n📌 Dùng 'antiset status' để xem trạng thái.`, threadId, type);
};
