const { ThreadType } = require("zca-js");

const MAX_RESULTS = 20;
const FALLBACK_BATCH_SIZE = 25;

const normalizeText = (value) => {
  if (!value) return "";
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
};

const toStringId = (value) => {
  if (value == null) return null;
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    return value.uid || value.id || value.userId || value.userID || null;
  }
  return null;
};

const uniqueStrings = (items = []) => {
  const set = new Set();
  items.forEach((item) => {
    if (!item && item !== 0) return;
    const normalized = String(item).trim();
    if (normalized) set.add(normalized);
  });
  return Array.from(set);
};

async function collectThreadInfo(api, threadId) {
  const infoCandidates = [];

  if (typeof api.getThreadInfo === "function") {
    try {
      const info = await api.getThreadInfo(threadId);
      if (info) infoCandidates.push(info);
    } catch (_) {
      // ignore and try fallback
    }
  }

  if (infoCandidates.length === 0 && typeof api.getGroupInfo === "function") {
    try {
      const info = await api.getGroupInfo(threadId);
      if (info) {
        const detail = info?.gridInfoMap?.[threadId] || info?.groupInfo?.[threadId] || info;
        if (detail) infoCandidates.push(detail);
      }
    } catch (_) {
      // ignore
    }
  }

  return infoCandidates[0] || {};
}

function collectMemberIds(threadInfo = {}) {
  const ids = new Set();
  const pushList = (list) => {
    if (!Array.isArray(list)) return;
    list.forEach((item) => {
      const resolved = toStringId(item);
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
        const resolved = toStringId(entry);
        if (resolved) ids.add(String(resolved));
      }
    });
  }

  return Array.from(ids);
}

async function fetchProfiles(api, memberIds = []) {
  if (!memberIds.length) return {};

  const result = {};
  if (typeof api.getUserInfo !== "function") return result;

  const chunks = [];
  for (let i = 0; i < memberIds.length; i += FALLBACK_BATCH_SIZE) {
    chunks.push(memberIds.slice(i, i + FALLBACK_BATCH_SIZE));
  }

  for (const chunk of chunks) {
    try {
      const data = await api.getUserInfo(chunk);
      if (!data) continue;

      const changed = data.changed_profiles || {};
      const unchanged = data.unchanged_profiles || {};

      chunk.forEach((uid) => {
        result[uid] =
          changed[uid] ||
          unchanged[uid] ||
          data[uid] ||
          data?.profiles?.[uid] ||
          null;
      });
    } catch (err) {
      console.warn("[findmember] getUserInfo chunk error:", err?.message || err);
    }
  }

  return result;
}

function buildMemberRecord(uid, threadInfo = {}, profileMap = {}) {
  const profile = profileMap[uid] || {};
  const nicknameMap = threadInfo.nicknames || {};

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
    profile.customName
  ]);

  const displayName = candidates[0] || uid;

  return {
    uid,
    displayName,
    nickname: nicknameMap?.[uid] || profile.nickName || profile.alias || null,
    candidates
  };
}

function matchMember(record, normalizedQuery) {
  if (!normalizedQuery) return false;
  const haystack = record.candidates.length ? record.candidates : [record.uid];
  return haystack.some((candidate) => normalizeText(candidate).includes(normalizedQuery));
}

module.exports.config = {
  name: "findmember",
  aliases: ["timtv", "findtv"],
  version: "1.0.0",
  role: 0,
  author: "Cascade",
  description: "Tìm kiếm thành viên trong nhóm dựa theo tên hoặc nickname mà không cần tag.",
  category: "Quản lý nhóm",
  usage: "findmember <từ khóa>",
  cooldowns: 3
};

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type, data } = event;
  const senderId = String(data?.uidFrom || event?.authorId || "");

  if (type !== ThreadType.Group) {
    return api.sendMessage("❌ Lệnh này chỉ dùng trong nhóm.", threadId, type);
  }

  const interactionMode = global.bonzInteractionSettings?.[threadId] || "all";
  if (interactionMode === "silent") {
    return;
  }

  if (!args.length) {
    return api.sendMessage(
      "❗ Vui lòng nhập tên hoặc từ khóa cần tìm.\nVí dụ: findmember mai linh",
      threadId,
      type
    );
  }

  const query = args.join(" ").trim();
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return api.sendMessage(
      "⚠️ Từ khóa không hợp lệ. Vui lòng nhập tên khác.",
      threadId,
      type
    );
  }

  const threadInfo = await collectThreadInfo(api, threadId);
  let memberIds = collectMemberIds(threadInfo);

  // Nếu chưa lấy được danh sách, thử từ event data
  if (!memberIds.length) {
    const fallback = uniqueStrings([
      ...(Array.isArray(event?.data?.participantIDs) ? event.data.participantIDs : []),
      ...(Array.isArray(event?.data?.participants) ? event.data.participants : [])
    ]);
    memberIds = fallback;
  }

  if (!memberIds.length) {
    return api.sendMessage(
      "❌ Không thể lấy danh sách thành viên trong nhóm. Vui lòng thử lại sau.",
      threadId,
      type
    );
  }

  const profileMap = await fetchProfiles(api, memberIds);
  const memberRecords = memberIds.map((uid) => buildMemberRecord(uid, threadInfo, profileMap));

  const matches = memberRecords.filter((record) => matchMember(record, normalizedQuery));

  if (!matches.length) {
    return api.sendMessage(
      `🔎 Không tìm thấy thành viên nào khớp với "${query}".`,
      threadId,
      type
    );
  }

  const limited = matches.slice(0, MAX_RESULTS);
  const extraCount = matches.length - limited.length;

  let message = "";
  const mentionsPayload = [];

  const appendLine = (line) => {
    const needsPrefix = message.length > 0;
    const startIndex = message.length + (needsPrefix ? 1 : 0);
    message += (needsPrefix ? "\n" : "") + line;
    return startIndex;
  };

  appendLine(`🔍 KẾT QUẢ TÌM THÀNH VIÊN (${matches.length})`);
  appendLine(`🔎 Từ khóa: "${query}"`);
  appendLine(`👤 Người yêu cầu: ${senderId}`);

  if (limited.length) {
    appendLine("");
  }

  limited.forEach((member, index) => {
    if (index > 0) {
      appendLine("");
    }

    appendLine(`#${index + 1}. ${member.displayName}`);
    appendLine(`• UID: ${member.uid}`);

    if (member.nickname && member.nickname !== member.displayName) {
      appendLine(`• Nickname: ${member.nickname}`);
    }

    const tagText = `@${member.displayName}`;
    const tagLine = `• Tag: ${tagText}`;
    const start = appendLine(tagLine);
    const localPos = tagLine.indexOf(tagText);
    if (localPos !== -1) {
      const absolutePos = start + localPos;
      const mentionEntry = {
        uid: String(member.uid),
        pos: absolutePos,
        len: tagText.length,
        offset: absolutePos,
        length: tagText.length
      };
      mentionsPayload.push(mentionEntry);
    }
  });

  if (extraCount > 0) {
    appendLine("");
    appendLine(`… và còn ${extraCount} kết quả khác. Hãy dùng từ khóa cụ thể hơn để thu hẹp kết quả.`);
  }

  const payload = mentionsPayload.length
    ? { msg: message, mentions: mentionsPayload }
    : message;

  return api.sendMessage(payload, threadId, type);
};

module.exports.helpers = {
  normalizeText,
  uniqueStrings,
  toStringId,
  collectThreadInfo,
  collectMemberIds,
  fetchProfiles,
  buildMemberRecord,
  matchMember
};
