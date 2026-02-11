const { GroupEventType, ThreadType } = require("zca-js");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

module.exports.config = {
  event_type: ["group_event"],
  name: "antiSet",
  version: "1.0.0",
  author: "Cascade",
  description: "Kick người tự ý thay đổi thông tin/cài đặt nhóm (trừ chủ nhóm/key vàng và phó nhóm/key bạc)"
};

function buildPrivilegedUserSet() {
  const cfg = global?.config || {};
  const collections = [cfg.owner_bot, cfg.admin_bot, cfg.developer_bot, cfg.support_bot, cfg.protected_admins];
  const ids = new Set();
  collections.forEach((list) => {
    if (Array.isArray(list)) {
      list.forEach((id) => {
        const s = String(id || "").trim();
        if (s) ids.add(s);
      });
    } else if (typeof list === "string") {
      const s = list.trim();
      if (s) ids.add(s);
    }
  });
  return ids;
}

function ensureSnapshotStore() {
  if (!(global.__bonzAntiSetSnapshots instanceof Map)) {
    global.__bonzAntiSetSnapshots = new Map();
  }
  return global.__bonzAntiSetSnapshots;
}

function getPngSize(buf) {
  try {
    if (!Buffer.isBuffer(buf) || buf.length < 24) return null;
    if (buf.readUInt32BE(0) !== 0x89504e47) return null;
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    if (!width || !height) return null;
    return { width, height };
  } catch {
    return null;
  }
}

function getJpegSize(buf) {
  try {
    if (!Buffer.isBuffer(buf) || buf.length < 4) return null;
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    let offset = 2;
    while (offset + 1 < buf.length) {
      if (buf[offset] !== 0xff) { offset += 1; continue; }
      const marker = buf[offset + 1];
      offset += 2;
      if (marker === 0xd9 || marker === 0xda) break;
      if (offset + 2 > buf.length) break;
      const len = buf.readUInt16BE(offset);
      if (len < 2) break;
      if (
        marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3 ||
        marker === 0xc5 || marker === 0xc6 || marker === 0xc7 ||
        marker === 0xc9 || marker === 0xca || marker === 0xcb ||
        marker === 0xcd || marker === 0xce || marker === 0xcf
      ) {
        if (offset + 7 > buf.length) break;
        const height = buf.readUInt16BE(offset + 3);
        const width = buf.readUInt16BE(offset + 5);
        if (!width || !height) return null;
        return { width, height };
      }
      offset += len;
    }
    return null;
  } catch {
    return null;
  }
}

function getImageSize(buf) {
  return getPngSize(buf) || getJpegSize(buf) || null;
}

async function isAntiSetEnabled(threadId, Threads) {
  if (!threadId || !Threads || typeof Threads.getData !== "function") {
    return process.env.ANTI_SET_DEFAULT === "on";
  }
  try {
    const data = await Threads.getData(threadId);
    if (data?.data?.antiSet && typeof data.data.antiSet.enabled === "boolean") {
      return data.data.antiSet.enabled;
    }
    return process.env.ANTI_SET_DEFAULT === "on";
  } catch {
    return process.env.ANTI_SET_DEFAULT === "on";
  }
}

async function getAntiSetMode(threadId, Threads) {
  if (!threadId || !Threads || typeof Threads.getData !== "function") {
    return "all";
  }
  try {
    const data = await Threads.getData(threadId);
    const mode = data?.data?.antiSet?.mode;
    if (mode === "bg" || mode === "all") return mode;
  } catch {}
  return "all";
}

async function changeGroupDescription(api, threadId, description) {
  const desc = String(description ?? "");
  const methods = [
    "changeGroupDescription",
    "setGroupDescription",
    "updateGroupDescription",
    "changeGroupBio",
    "setGroupBio",
    "updateGroupBio",
    "updateGroupInfo",
    "setGroupInfo",
    "updateGroup"
  ];

  for (const method of methods) {
    if (typeof api?.[method] !== "function") continue;
    try {
      try { await api[method](desc, threadId); return true; } catch {}
      try { await api[method](threadId, desc); return true; } catch {}
      try { await api[method]({ groupId: threadId, description: desc }); return true; } catch {}
      try { await api[method]({ groupId: threadId, desc }); return true; } catch {}
      try { await api[method]({ threadId, description: desc }); return true; } catch {}
      try { await api[method]({ threadId, desc }); return true; } catch {}
    } catch {
      continue;
    }
  }

  if (typeof api?.updateGroupSettings === "function") {
    try {
      await api.updateGroupSettings({ description: desc }, threadId);
      return true;
    } catch {}
    try {
      await api.updateGroupSettings({ desc }, threadId);
      return true;
    } catch {}
    try {
      await api.updateGroupSettings(threadId, { description: desc });
      return true;
    } catch {}
    try {
      await api.updateGroupSettings(threadId, { desc });
      return true;
    } catch {}
  }

  return false;
}

function extractActorId(event) {
  const data = event?.data || {};
  return String(
    data.sourceId ||
    data.actorId ||
    data.creatorId ||
    data.fromId ||
    data.uidFrom ||
    data.fromUid ||
    data.userId ||
    data.editorId ||
    data.updatedBy ||
    data.ownerId ||
    ""
  ).trim();
}

function debugAntiSet(...args) {
  if (String(process.env.ANTISETHOOK_DEBUG || "").trim() !== "1") return;
  try {
    console.warn("[antiSet:dbg]", ...args);
  } catch {}
}

function getGroupDetailFromGetGroupInfoResult(info, threadId) {
  if (!info) return null;
  const key = String(threadId);
  return info?.gridInfoMap?.[key] || info?.groupInfo?.[key] || info?.info || info;
}

async function fetchGroupDetail(api, threadId) {
  if (!threadId || typeof api?.getGroupInfo !== "function") return null;
  try {
    const info = await api.getGroupInfo(threadId);
    return getGroupDetailFromGetGroupInfoResult(info, threadId);
  } catch {
    return null;
  }
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

  const background =
    detail?.fullBg ??
    detail?.background ??
    detail?.backgroundUrl ??
    detail?.wallpaperUrl ??
    detail?.wallpaper ??
    null;

  const backgroundId =
    detail?.backgroundId ??
    detail?.bgId ??
    detail?.themeId ??
    detail?.chatThemeId ??
    null;
  return {
    name: name ? String(name) : null,
    avatar: avatar ? String(avatar) : null,
    description: description != null ? String(description) : null,
    background: background ? String(background) : null,
    backgroundId: backgroundId != null ? String(backgroundId) : null,
    at: Date.now()
  };
}

async function changeGroupBackgroundTheme(api, threadId, snap = {}) {
  const bgUrl = snap?.background ? String(snap.background) : "";
  const bgId = snap?.backgroundId != null ? String(snap.backgroundId) : "";
  if (!bgUrl && !bgId) return false;

  // The project already uses updateGroupSettings in multiple places; background keys may differ by SDK/version.
  const bodies = [];
  if (bgUrl) {
    bodies.push(
      { background: bgUrl },
      { backgroundUrl: bgUrl },
      { wallpaperUrl: bgUrl },
      { wallpaper: bgUrl },
      { fullBg: bgUrl }
    );
  }
  if (bgId) {
    bodies.push(
      { backgroundId: bgId },
      { bgId },
      { themeId: bgId },
      { chatThemeId: bgId }
    );
  }

  const methods = ["updateGroupSettings", "updateGroupInfo", "setGroupInfo", "updateGroup"]; // best-effort
  for (const method of methods) {
    if (typeof api?.[method] !== "function") continue;
    for (const body of bodies) {
      try {
        try { await api[method](threadId, body); return true; } catch {}
        try { await api[method](String(threadId), body); return true; } catch {}
        try { await api[method]({ groupId: threadId, ...body }); return true; } catch {}
        try { await api[method]({ threadId, ...body }); return true; } catch {}
        try { await api[method](body, threadId); return true; } catch {}
      } catch {
        // continue
      }
    }
  }
  return false;
}

async function saveSnapshot(api, threadId, detail) {
  const store = ensureSnapshotStore();
  const snap = extractSnapshot(detail || (await fetchGroupDetail(api, threadId)));
  if (!snap) return null;
  store.set(String(threadId), snap);
  return snap;
}

function getSnapshot(threadId) {
  const store = ensureSnapshotStore();
  return store.get(String(threadId)) || null;
}

async function renameGroup(api, threadId, newName) {
  if (!newName) return false;
  const methods = [
    "changeGroupName",
    "updateGroupSettings",
    "setThreadName",
    "setGroupName",
    "changeThreadName",
    "setTitle",
    "renameGroup"
  ];
  for (const method of methods) {
    if (typeof api?.[method] !== "function") continue;
    try {
      if (method === "changeGroupName") {
        try { await api.changeGroupName(newName, threadId); return true; } catch {}
        try { await api.changeGroupName(String(newName), String(threadId)); return true; } catch {}
        try { await api.changeGroupName(threadId, newName); return true; } catch {}
        try { await api.changeGroupName(String(threadId), String(newName)); return true; } catch {}
        try { await api.changeGroupName({ groupId: threadId, name: newName }); return true; } catch {}
        try { await api.changeGroupName({ threadId, name: newName }); return true; } catch {}
      } else if (method === "updateGroupSettings") {
        const bodies = [{ name: newName }, { groupName: newName }, { title: newName }];
        for (const body of bodies) {
          try { await api.updateGroupSettings(threadId, body); return true; } catch {}
          try { await api.updateGroupSettings(String(threadId), body); return true; } catch {}
          try { await api.updateGroupSettings({ groupId: threadId, ...body }); return true; } catch {}
        }
      } else if (method === "setTitle" || method === "renameGroup") {
        await api[method](threadId, newName);
        return true;
      } else {
        await api[method](newName, threadId);
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

async function changeGroupAvatarByUrl(api, threadId, avatarUrl) {
  if (!avatarUrl) return false;

  // Some SDKs accept URL directly
  const urlMethods = [
    "changeGroupAvatar",
    "setGroupAvatar",
    "updateGroupAvatar",
    "changeGroupImage",
    "setGroupImage",
    "updateGroupImage",
    "changeGroupPhoto",
    "setGroupPhoto"
  ];
  for (const method of urlMethods) {
    if (typeof api?.[method] !== "function") continue;
    try {
      try { await api[method](avatarUrl, threadId); return true; } catch {}
      try { await api[method](threadId, avatarUrl); return true; } catch {}
      try { await api[method]({ groupId: threadId, avatar: avatarUrl }); return true; } catch {}
      try { await api[method]({ groupId: threadId, image: avatarUrl }); return true; } catch {}
      try { await api[method]({ threadId, avatar: avatarUrl }); return true; } catch {}
      try { await api[method]({ threadId, image: avatarUrl }); return true; } catch {}
    } catch {
      continue;
    }
  }

  const tempDir = path.join(__dirname, "temp");
  const tempPath = path.join(tempDir, `antiset_avt_${Date.now()}.jpg`);
  try {
    await fs.mkdir(tempDir, { recursive: true });
    const resp = await axios.get(avatarUrl, { responseType: "arraybuffer", timeout: 20000 });
    const buf = Buffer.from(resp.data);
    await fs.writeFile(tempPath, buf);

    // Official zca-js: api.changeGroupAvatar(avatarSource, groupId)
    // avatarSource can be file path OR AttachmentSource with metadata
    if (typeof api?.changeGroupAvatar === "function") {
      const size = getImageSize(buf) || { width: 400, height: 400 };
      try {
        await api.changeGroupAvatar(
          {
            data: buf,
            filename: "avatar.jpg",
            metadata: {
              totalSize: buf.length,
              width: size.width,
              height: size.height
            }
          },
          String(threadId)
        );
        return true;
      } catch {}

      try {
        await api.changeGroupAvatar(tempPath, String(threadId));
        return true;
      } catch {}
    }

    const fileMethods = [
      "changeGroupAvatar",
      "setGroupAvatar",
      "updateGroupAvatar",
      "changeGroupImage",
      "setGroupImage",
      "updateGroupImage",
      "changeGroupPhoto",
      "setGroupPhoto"
    ];

    for (const method of fileMethods) {
      if (typeof api?.[method] !== "function") continue;
      try {
        try { await api[method](tempPath, threadId); return true; } catch {}
        try { await api[method](threadId, tempPath); return true; } catch {}
        try { await api[method]({ threadId, image: tempPath }); return true; } catch {}
        try { await api[method]({ groupId: threadId, image: tempPath }); return true; } catch {}
        try { await api[method]({ threadId, avatar: tempPath }); return true; } catch {}
        try { await api[method]({ groupId: threadId, avatar: tempPath }); return true; } catch {}
      } catch {
        continue;
      }
    }

    return false;
  } catch {
    return false;
  } finally {
    try { await fs.unlink(tempPath); } catch {}
  }
}

function isTargetedGroupChangeEvent(eventTypeNumber) {
  const t = Number(eventTypeNumber);
  if (!Number.isFinite(t)) return false;
  // Some Zalo listeners emit raw numeric types for updates (see threadUpdateNoti.js: case 21/case 6)
  if (t === 6 || t === 21) return true;
  return [
    GroupEventType.UPDATE,
    GroupEventType.UPDATE_SETTING,
    GroupEventType.NEW_LINK,
    GroupEventType.ADD_ADMIN,
    GroupEventType.REMOVE_ADMIN
  ].map(Number).includes(t);
}

function isBackgroundChangeEvent(eventTypeNumber, data) {
  const t = Number(eventTypeNumber);
  const d = data || {};

  // If SDK provides explicit fields
  const directKeys = [
    "fullBg",
    "background",
    "backgroundUrl",
    "backgroundId",
    "bg",
    "bgId",
    "wallpaper",
    "wallpaperUrl",
    "theme",
    "themeId",
    "chatTheme",
    "chatThemeId"
  ];
  for (const k of directKeys) {
    if (Object.prototype.hasOwnProperty.call(d, k) && d[k]) return true;
  }

  // Some payloads nest inside content/info/params
  const nested = d.content || d.info || d.params || d.setting || d.settings;
  if (nested && typeof nested === "object") {
    for (const k of directKeys) {
      if (Object.prototype.hasOwnProperty.call(nested, k) && nested[k]) return true;
    }
  }

  // Heuristic: stringify small payload and search keywords
  let s = "";
  try {
    s = JSON.stringify(d).toLowerCase();
  } catch {
    s = "";
  }

  if (!s) return false;
  const needles = [
    "background",
    "wallpaper",
    "theme",
    "chat_theme",
    "chatTheme",
    "bgid",
    "backgroundid",
    "fullbg"
  ];
  if (needles.some((n) => s.includes(n))) return true;

  // UPDATE_SETTING is often used for theme/background changes
  if (t === Number(GroupEventType.UPDATE_SETTING) && (s.includes("update") || s.includes("setting"))) {
    // Keep conservative: only if it contains any theme/bg signal
    return needles.some((n) => s.includes(n));
  }

  return false;
}

function describeEvent(eventTypeNumber, data) {
  const t = Number(eventTypeNumber);
  if (t === Number(GroupEventType.NEW_LINK)) return "tạo link mời mới";
  if (t === Number(GroupEventType.UPDATE_SETTING)) return "cập nhật cài đặt nhóm";
  if (t === Number(GroupEventType.ADD_ADMIN)) return "bổ nhiệm phó nhóm (key bạc)";
  if (t === Number(GroupEventType.REMOVE_ADMIN)) return "gỡ phó nhóm (thu hồi key bạc)";
  if (t === Number(GroupEventType.UPDATE) || t === 6 || t === 21) {
    if (isBackgroundChangeEvent(eventTypeNumber, data)) return "đổi ảnh nền/theme nhóm";
    if (data?.fullAvt) return "đổi ảnh nhóm";
    if (data?.groupName) return "đổi tên nhóm";
    if (data?.description != null || data?.desc != null || data?.groupDesc != null) return "đổi mô tả nhóm/cộng đồng";
    return "cập nhật thông tin nhóm";
  }
  return "thay đổi thông tin nhóm";
}

async function resolveDisplayName(api, userId, fallback) {
  if (!userId || typeof api?.getUserInfo !== "function") return fallback;
  try {
    const info = await api.getUserInfo(userId);
    const profile = info?.changed_profiles?.[userId] || info?.unchanged_profiles?.[userId];
    return profile?.displayName || fallback;
  } catch {
    return fallback;
  }
}

module.exports.run = async ({ api, event, Threads }) => {
  try {
    if (!event || !event.threadId) return;

    const threadId = String(event.threadId);
    const eventTypeNumber = event.type;

    if (!isTargetedGroupChangeEvent(eventTypeNumber)) {
      await saveSnapshot(api, threadId);
      return;
    }

    const enabled = await isAntiSetEnabled(threadId, Threads);
    if (!enabled) {
      await saveSnapshot(api, threadId);
      return;
    }

    const mode = await getAntiSetMode(threadId, Threads);
    const bgEvent = isBackgroundChangeEvent(eventTypeNumber, event?.data || {});
    debugAntiSet("event", { threadId, type: eventTypeNumber, mode, bgEvent, dataKeys: Object.keys(event?.data || {}) });
    if (mode === "bg") {
      if (!bgEvent) {
        debugAntiSet("skip_non_bg", {
          type: eventTypeNumber,
          actorId: extractActorId(event),
          dataPreview: (() => {
            try {
              const s = JSON.stringify(event?.data || {});
              return s.length > 800 ? s.slice(0, 800) + "..." : s;
            } catch {
              return "<stringify_failed>";
            }
          })()
        });
        await saveSnapshot(api, threadId);
        return;
      }
    }

    const actorId = extractActorId(event);
    if (!actorId) {
      debugAntiSet("missing_actorId", {
        type: eventTypeNumber,
        dataPreview: (() => {
          try {
            const s = JSON.stringify(event?.data || {});
            return s.length > 800 ? s.slice(0, 800) + "..." : s;
          } catch {
            return "<stringify_failed>";
          }
        })()
      });
      return;
    }

    const botId = typeof api?.getOwnId === "function" ? String(api.getOwnId()).trim() : "";
    if (botId && actorId === botId) return;
    if (event.isSelf) return;

    const privileged = buildPrivilegedUserSet();
    if (privileged.has(actorId)) {
      await saveSnapshot(api, threadId);
      return;
    }

    const groupDetail = await fetchGroupDetail(api, threadId);

    const creatorId = groupDetail?.creatorId || groupDetail?.creator?.id || groupDetail?.creator?.uid;
    const adminIds = Array.isArray(groupDetail?.adminIds) ? groupDetail.adminIds.map(String) : [];

    // Allow: key vàng (chủ nhóm) + key bạc (phó nhóm)
    if (creatorId && String(creatorId) === actorId) {
      await saveSnapshot(api, threadId, groupDetail);
      return;
    }
    if (adminIds.includes(actorId)) {
      await saveSnapshot(api, threadId, groupDetail);
      return;
    }

    const snapshot = getSnapshot(threadId);
    const actionText = describeEvent(eventTypeNumber, event?.data || {});

    let kicked = false;
    let kickError = null;
    try {
      if (typeof api?.removeUserFromGroup === "function") {
        await api.removeUserFromGroup(actorId, threadId);
        kicked = true;
      } else {
        kickError = new Error("removeUserFromGroup not supported");
      }
    } catch (e) {
      kickError = e;
    }

    // Revert group state (best-effort)
    let revertedName = false;
    let revertedAvatar = false;
    let revertedDescription = false;
    let revertedBackground = false;
    if (snapshot?.name && snapshot.name !== (groupDetail?.name || groupDetail?.groupName || groupDetail?.title || null)) {
      revertedName = await renameGroup(api, threadId, snapshot.name);
    }
    if (snapshot?.avatar) {
      const currentAvatar =
        groupDetail?.fullAvt ??
        groupDetail?.fullAvtUrl ??
        groupDetail?.avatar ??
        groupDetail?.avatarUrl ??
        groupDetail?.avt ??
        groupDetail?.avtUrl ??
        groupDetail?.picture ??
        groupDetail?.pic ??
        groupDetail?.profilePic ??
        null;
      if (!currentAvatar || String(currentAvatar) !== String(snapshot.avatar)) {
        revertedAvatar = await changeGroupAvatarByUrl(api, threadId, snapshot.avatar);
      }
    }

    if (snapshot?.description != null) {
      const currentDesc =
        groupDetail?.description ??
        groupDetail?.desc ??
        groupDetail?.groupDesc ??
        groupDetail?.groupDescription ??
        groupDetail?.bio ??
        null;
      if (currentDesc == null || String(currentDesc) !== String(snapshot.description)) {
        revertedDescription = await changeGroupDescription(api, threadId, snapshot.description);
      }
    }

    // Only attempt to revert background/theme if the event indicates a bg/theme change.
    if (bgEvent && (snapshot?.background || snapshot?.backgroundId)) {
      revertedBackground = await changeGroupBackgroundTheme(api, threadId, snapshot);
    }

    if (revertedName || revertedAvatar || revertedDescription || revertedBackground) {
      await saveSnapshot(api, threadId);
    }

    // Notify group
    try {
      const actorName = await resolveDisplayName(api, actorId, event?.data?.dName || "Người dùng");
      const tag = `@${actorName}`;
      const revertLine = (revertedName || revertedAvatar || revertedDescription || revertedBackground)
        ? `✅ Đã khôi phục: ${[
            revertedName ? "tên nhóm" : null,
            revertedAvatar ? "ảnh nhóm" : null,
            revertedDescription ? "mô tả" : null,
            revertedBackground ? "ảnh nền/theme" : null
          ].filter(Boolean).join(", ")}.`
        : "⚠️ Không thể khôi phục đầy đủ (bot thiếu quyền hoặc API không hỗ trợ).";
      const msg = kicked
        ? `🛡️ ANTI SET\n🚫 ${tag} đã bị kick vì ${actionText} (không có key bạc/chủ nhóm).\n${revertLine}`
        : `🛡️ ANTI SET\n⚠️ Phát hiện ${tag} ${actionText} nhưng bot không kick được. Vui lòng kiểm tra quyền admin.\n${revertLine}`;
      const pos = msg.indexOf(tag);
      const mentions = pos >= 0 ? [{ pos, len: tag.length, uid: actorId }] : [];
      await api.sendMessage({ msg, mentions }, threadId, ThreadType.Group);
    } catch {}

    if (kickError) {
      try {
        console.warn("[antiSet] Không thể kick user:", kickError?.message || kickError);
      } catch {}
    }

    return;
  } catch (e) {
    try {
      console.warn("[antiSet] error:", e?.message || e);
    } catch {}
  }
};
