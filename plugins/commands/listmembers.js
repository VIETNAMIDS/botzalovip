const { ThreadType } = require("zca-js");
const path = require("path");
const fs = require("fs").promises;

const findMemberModule = require("./findmember");
const helpers = (findMemberModule && findMemberModule.helpers) || {};
const { createMemberListImage } = require("../utils/groupmember-canvas");

const FALLBACK_BATCH_SIZE = 25;
const LINES_PER_MESSAGE = 25;

const fallbackToStringId = (value) => {
  if (value == null) return null;
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    return value.uid || value.id || value.userId || value.userID || null;
  }
  return null;
};

const fallbackUniqueStrings = (items = []) => {
  const set = new Set();
  items.forEach((item) => {
    if (!item && item !== 0) return;
    const normalized = String(item).trim();
    if (normalized) set.add(normalized);
  });
  return Array.from(set);
};

const fallbackCollectThreadInfo = async (api, threadId) => {
  const infoCandidates = [];

  if (typeof api.getThreadInfo === "function") {
    try {
      const info = await api.getThreadInfo(threadId);
      if (info) infoCandidates.push(info);
    } catch (_) {}
  }

  if (!infoCandidates.length && typeof api.getGroupInfo === "function") {
    try {
      const info = await api.getGroupInfo(threadId);
      if (info) {
        const detail = info?.gridInfoMap?.[threadId] || info?.groupInfo?.[threadId] || info;
        if (detail) infoCandidates.push(detail);
      }
    } catch (_) {}
  }

  return infoCandidates[0] || {};
};

const fallbackCollectMemberIds = (threadInfo = {}, toId = fallbackToStringId) => {
  const ids = new Set();
  const pushList = (list) => {
    if (!Array.isArray(list)) return;
    list.forEach((item) => {
      const resolved = toId(item);
      if (resolved) ids.add(String(resolved));
    });
  };

  pushList(threadInfo.participantIDs);
  pushList(threadInfo.participantIds);
  pushList(threadInfo.participants);
  pushList(threadInfo.members);

  if (Array.isArray(threadInfo.memVerList)) {
    threadInfo.memVerList.forEach((entry) => {
      if (typeof entry === "string") {
        const uid = entry.split("_")[0];
        if (uid) ids.add(uid);
      } else {
        const resolved = toId(entry);
        if (resolved) ids.add(String(resolved));
      }
    });
  }

  return Array.from(ids);
};

const fallbackFetchProfiles = async (api, memberIds = []) => {
  if (!Array.isArray(memberIds) || !memberIds.length) return {};
  const map = {};
  if (typeof api.getUserInfo !== "function") return map;

  for (let i = 0; i < memberIds.length; i += FALLBACK_BATCH_SIZE) {
    const chunk = memberIds.slice(i, i + FALLBACK_BATCH_SIZE);
    try {
      const data = await api.getUserInfo(chunk);
      if (!data) continue;

      const changed = data.changed_profiles || {};
      const unchanged = data.unchanged_profiles || {};

      chunk.forEach((uid) => {
        map[uid] =
          changed[uid] ||
          unchanged[uid] ||
          data[uid] ||
          data?.profiles?.[uid] ||
          null;
      });
    } catch (error) {
      console.warn("[listmembers] getUserInfo chunk error:", error?.message || error);
    }
  }

  return map;
};

const fallbackBuildMemberRecord = (uid, threadInfo = {}, profileMap = {}) => {
  const profile = profileMap[uid] || {};
  const nicknameMap = threadInfo?.nicknames || {};
  const uniqueStrings = fallbackUniqueStrings;

  const candidates = uniqueStrings([
    profile.displayName,
    profile.zaloName,
    profile.name,
    profile.fullName,
    profile.alias,
    profile.nickName,
    nicknameMap?.[uid],
    profile.username,
    profile.custom_name,
    profile.customName,
    uid
  ]);

  const displayName = candidates[0] || uid;

  return {
    uid,
    displayName,
    nickname: nicknameMap?.[uid] || profile.nickName || profile.alias || null,
    avatar:
      profile.avatar ||
      profile.avatarUrl ||
      profile.profilePicture ||
      profile.profile_picture ||
      profile.profilePic ||
      profile.profile_pic ||
      null
  };
};

const resolveProfileEntry = (profileMap, uid) => {
  if (!profileMap) return {};
  if (profileMap instanceof Map) {
    return profileMap.get(uid) || profileMap.get(String(uid)) || {};
  }
  if (typeof profileMap === "object") {
    return (
      profileMap[uid] ||
      profileMap[String(uid)] ||
      {}
    );
  }
  return {};
};

const resolveAvatarUrl = (profile = {}) => {
  const candidates = [
    profile.avatar,
    profile.avatarUrl,
    profile.avatarURL,
    profile.avatar_url,
    profile.avatarSmall,
    profile.avatar_small,
    profile.profilePicture,
    profile.profile_picture,
    profile.profilePictureUrl,
    profile.profile_picture_url,
    profile.profile_pic,
    profile.profilePic,
    profile.picture,
    profile.pictureUrl,
    profile.picture_url,
    profile.profileImage,
    profile.profile_image,
    profile.photo,
    profile.photoUrl,
    profile.photo_url
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.startsWith("http")) {
      return candidate;
    }
    if (candidate && typeof candidate === "object") {
      const nested = candidate.url || candidate.href || candidate.link;
      if (typeof nested === "string" && nested.startsWith("http")) {
        return nested;
      }
    }
  }

  return null;
};

const toStringId = typeof helpers.toStringId === "function" ? helpers.toStringId : fallbackToStringId;
const uniqueStrings = typeof helpers.uniqueStrings === "function" ? helpers.uniqueStrings : fallbackUniqueStrings;
const collectThreadInfo = typeof helpers.collectThreadInfo === "function"
  ? helpers.collectThreadInfo
  : fallbackCollectThreadInfo;
const collectMemberIds = typeof helpers.collectMemberIds === "function"
  ? helpers.collectMemberIds
  : (threadInfo) => fallbackCollectMemberIds(threadInfo, toStringId);
const fetchProfiles = typeof helpers.fetchProfiles === "function"
  ? helpers.fetchProfiles
  : fallbackFetchProfiles;
const buildMemberRecord = typeof helpers.buildMemberRecord === "function"
  ? helpers.buildMemberRecord
  : fallbackBuildMemberRecord;

module.exports.config = {
  name: "listmembers",
  aliases: ["dsthanhvien", "listtv", "members"],
  version: "1.0.0",
  role: 0,
  author: "Cascade",
  description: "Liệt kê danh sách thành viên hiện có trong nhóm với UID.",
  category: "Quản lý nhóm",
  usage: "listmembers",
  cooldowns: 5
};

module.exports.run = async function ({ api, event }) {
  const { threadId, type } = event;

  if (type !== ThreadType.Group) {
    return api.sendMessage("❌ Lệnh này chỉ dùng trong nhóm.", threadId, type);
  }

  const interactionMode = global.bonzInteractionSettings?.[threadId] || "all";
  if (interactionMode === "silent") {
    return;
  }

  let threadInfo = {};
  try {
    threadInfo = await collectThreadInfo(api, threadId);
  } catch (error) {
    console.warn("[listmembers] collectThreadInfo error:", error?.message || error);
  }

  let memberIds = [];
  try {
    memberIds = collectMemberIds(threadInfo) || [];
  } catch (error) {
    console.warn("[listmembers] collectMemberIds error:", error?.message || error);
  }

  if (!memberIds.length) {
    const fallbackParticipants = uniqueStrings([
      ...(Array.isArray(event?.data?.participantIDs) ? event.data.participantIDs : []),
      ...(Array.isArray(event?.data?.participantIds) ? event.data.participantIds : []),
      ...(Array.isArray(event?.data?.participants) ? event.data.participants : [])
    ]);
    memberIds = fallbackParticipants;
  }

  if (!memberIds.length) {
    return api.sendMessage(
      "❌ Không thể lấy danh sách thành viên trong nhóm lúc này.",
      threadId,
      type
    );
  }

  const uniqueIds = Array.from(new Set(memberIds.map(String))).filter(Boolean);

  let profileMap = {};
  try {
    profileMap = await fetchProfiles(api, uniqueIds);
  } catch (error) {
    console.warn("[listmembers] fetchProfiles error:", error?.message || error);
  }

  const records = uniqueIds
    .map((uid) => {
      const rawRecord = buildMemberRecord(uid, threadInfo, profileMap) || {};
      const profile = resolveProfileEntry(profileMap, uid);

      const displayName =
        rawRecord.displayName ||
        profile.displayName ||
        profile.zaloName ||
        profile.name ||
        profile.fullName ||
        profile.alias ||
        uid;

      const nickname = rawRecord.nickname || profile.nickName || profile.alias || null;

      return {
        uid: rawRecord.uid || String(uid),
        displayName,
        nickname: nickname && nickname !== displayName ? nickname : null,
        avatar: resolveAvatarUrl({ ...profile, avatar: rawRecord.avatar || profile.avatar })
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "vi", { sensitivity: "base" }));

  if (!records.length) {
    return api.sendMessage("❌ Không tìm thấy thành viên hợp lệ để liệt kê.", threadId, type);
  }

  const totalCount = records.length;
  const textualFallback = () => {
    const lines = records.map((record, index) => {
      const parts = [`${index + 1}. ${record.displayName}`];
      if (record.nickname) {
        parts.push(`   • Nickname: ${record.nickname}`);
      }
      parts.push(`   • UID: ${record.uid}`);
      return parts.join("\n");
    });

    return (async () => {
      for (let i = 0; i < lines.length; i += LINES_PER_MESSAGE) {
        const chunk = lines.slice(i, i + LINES_PER_MESSAGE);
        const header = i === 0
          ? `📋 DANH SÁCH THÀNH VIÊN (${totalCount})\n`
          : `📋 (tiếp) DANH SÁCH THÀNH VIÊN (${totalCount})\n`;
        const body = `${header}${chunk.join("\n")}`;

        try {
          // eslint-disable-next-line no-await-in-loop
          await api.sendMessage(body, threadId, type);
        } catch (error) {
          console.warn("[listmembers] sendMessage error:", error?.message || error);
          // eslint-disable-next-line no-await-in-loop
          await api.sendMessage(chunk.join("\n"), threadId, type);
        }
      }
    })();
  };

  const membersForCanvas = records.map((record, index) => ({
    ...record,
    index,
    avatar: record.avatar
  }));

  const groupName = threadInfo?.threadName || threadInfo?.name || threadInfo?.groupName || threadInfo?.title || "Không rõ";
  const cacheDir = path.join(__dirname, "../../cache");

  try {
    await fs.mkdir(cacheDir, { recursive: true });
    const pages = await createMemberListImage({
      groupId: String(threadId),
      groupName,
      members: membersForCanvas
    });

    if (!pages || !pages.length) {
      throw new Error("Canvas returned empty pages");
    }

    const attachments = [];

    const timestamp = Date.now();
    for (const page of pages) {
      const filename = `listmembers_${threadId}_${timestamp}_${page.page}.png`;
      const filepath = path.join(cacheDir, filename);
      // eslint-disable-next-line no-await-in-loop
      await fs.writeFile(filepath, page.buffer);
      attachments.push({ filepath, pageNumber: page.page });
    }

    for (const attachment of attachments) {
      const message = {
        msg: `📋 Danh sách thành viên (${totalCount}) - Trang ${attachment.pageNumber}/${attachments.length}`,
        attachments: [attachment.filepath]
      };

      try {
        // eslint-disable-next-line no-await-in-loop
        await api.sendMessage(message, threadId, type);
      } finally {
        // Cleanup file after short delay
        setTimeout(() => {
          fs.unlink(attachment.filepath).catch(() => {});
        }, 60 * 1000);
      }
    }
  } catch (canvasError) {
    console.error("[listmembers] canvas error:", canvasError);
    await textualFallback();
  }
};
