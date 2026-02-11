const { ThreadType } = require("zca-js");

const MuteDuration = {
  ONE_HOUR: 3600,
  FOUR_HOURS: 14400,
  FOREVER: -1,
  UNTIL_8AM: "until8AM",
};

const MuteAction = {
  MUTE: 1,
  UNMUTE: 3,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDuration(input) {
  if (input == null) return MuteDuration.ONE_HOUR;
  const txt = String(input).trim().toLowerCase();

  if (!txt) return MuteDuration.ONE_HOUR;
  if (["1h", "onehour", "one_hour"].includes(txt)) return MuteDuration.ONE_HOUR;
  if (["4h", "fourhours", "four_hours"].includes(txt)) return MuteDuration.FOUR_HOURS;
  if (["forever", "perma", "perm", "-1", "vinh", "vĩnh", "voithoihan"].includes(txt)) return MuteDuration.FOREVER;
  if (["until8am", "until_8am", "8am", "den8h", "den8am"].includes(txt)) return MuteDuration.UNTIL_8AM;

  const m = txt.match(/^(\d+)(s|m|h)?$/);
  if (!m) return MuteDuration.ONE_HOUR;

  const value = Number(m[1]);
  const unit = m[2] || "s";
  if (!Number.isFinite(value) || value < 0) return MuteDuration.ONE_HOUR;

  switch (unit) {
    case "s":
      return value;
    case "m":
      return value * 60;
    case "h":
      return value * 3600;
    default:
      return value;
  }
}

module.exports.config = {
  name: "tb",
  aliases: ["setmute", "mutechat", "mutecv", "unmutechat"],
  version: "1.0.0",
  role: 1,
  author: "Cascade",
  description: "Tắt/bật âm cuộc trò chuyện (gọi api.setMute nếu SDK hỗ trợ)",
  category: "Nhóm",
  usage:
    "tb on [1h|4h|forever|until8am|<giây>] | tb off | tb all on [..] | tb all off",
  cooldowns: 3,
};

module.exports.run = async ({ api, event, args = [], Threads }) => {
  const { threadId, type } = event;

  if (type !== ThreadType.Group && type !== ThreadType.User) {
    return api.sendMessage("⚠️ Không xác định loại cuộc trò chuyện.", threadId, type);
  }

  if (typeof api?.setMute !== "function") {
    return api.sendMessage(
      "❌ SDK hiện tại không có hàm api.setMute().\nBạn kiểm tra lại phiên bản zca-js/zlapi bạn đang dùng.",
      threadId,
      type
    );
  }

  const sub = String(args[0] || "").trim().toLowerCase();

  const threadsController = Threads || require("../../core/controller/controllerThreads");

  async function getAllGroupIds() {
    if (typeof api.getAllGroups === "function") {
      try {
        const snapshot = await api.getAllGroups();
        const ids = Object.keys(snapshot?.gridVerMap || {});
        if (ids.length) return ids.map(String);
      } catch (_) {}
    }

    try {
      const rows = typeof threadsController.getAll === "function" ? threadsController.getAll() : [];
      return (rows || [])
        .map((r) => String(r.threadId))
        .filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  if (!sub || sub === "help" || sub === "h") {
    return api.sendMessage(
      "🔇 TB (tắt/bật âm chat)\n\n" +
        "- tb on 1h\n" +
        "- tb on 4h\n" +
        "- tb on forever\n" +
        "- tb on until8am\n" +
        "- tb on 600   (600 giây)\n" +
        "- tb off\n" +
        "\n🌐 Tất cả group:\n" +
        "- tb all on 1h\n" +
        "- tb all off\n",
      threadId,
      type
    );
  }

  // on/off tất cả group
  if (sub === "all") {
    const actionTxt = String(args[1] || "").trim().toLowerCase();
    let action;
    if (actionTxt === "on" || actionTxt === "mute") action = MuteAction.MUTE;
    else if (actionTxt === "off" || actionTxt === "unmute") action = MuteAction.UNMUTE;
    else {
      return api.sendMessage("⚠️ Dùng: tb all on <thời_gian> | tb all off", threadId, type);
    }

    const duration = action === MuteAction.MUTE ? parseDuration(args[2]) : undefined;

    const groupIds = await getAllGroupIds();
    if (!groupIds.length) {
      return api.sendMessage("❌ Không lấy được danh sách group để áp dụng.", threadId, type);
    }

    let ok = 0;
    let fail = 0;
    const failedIds = [];

    for (const gid of groupIds) {
      try {
        await api.setMute({ duration, action }, gid, ThreadType.Group);
        ok++;
      } catch (e) {
        fail++;
        failedIds.push(String(gid));
      }
      await sleep(250);
    }

    const durationText =
      action === MuteAction.UNMUTE
        ? ""
        : duration === MuteDuration.FOREVER
        ? "vô thời hạn"
        : duration === MuteDuration.UNTIL_8AM
        ? "đến 8AM"
        : typeof duration === "number"
        ? `${duration}s`
        : String(duration);

    const header =
      action === MuteAction.UNMUTE
        ? "✅ Đã bật âm toàn bộ group"
        : `✅ Đã tắt âm toàn bộ group (${durationText})`;

    const failNote = failedIds.length
      ? `\n⚠️ Fail: ${fail}\nIDs: ${failedIds.slice(0, 30).join(", ")}${failedIds.length > 30 ? " ..." : ""}`
      : "";

    return api.sendMessage(`${header}\n📌 OK: ${ok}${failNote}`, threadId, type);
  }

  // on/off cuộc trò chuyện hiện tại
  let action;
  if (sub === "on" || sub === "mute") action = MuteAction.MUTE;
  else if (sub === "off" || sub === "unmute") action = MuteAction.UNMUTE;
  else {
    return api.sendMessage("⚠️ Dùng: tb on <thời_gian> | tb off | tb all on <thời_gian> | tb all off", threadId, type);
  }

  const duration = action === MuteAction.MUTE ? parseDuration(args[1]) : undefined;

  try {
    await api.setMute(
      {
        duration,
        action,
      },
      threadId,
      type
    );

    if (action === MuteAction.UNMUTE) {
      return api.sendMessage("✅ Đã bật âm cuộc trò chuyện.", threadId, type);
    }

    const durationText =
      duration === MuteDuration.FOREVER
        ? "vô thời hạn"
        : duration === MuteDuration.UNTIL_8AM
        ? "đến 8AM"
        : typeof duration === "number"
        ? `${duration}s`
        : String(duration);

    return api.sendMessage(`✅ Đã tắt âm cuộc trò chuyện: ${durationText}.`, threadId, type);
  } catch (e) {
    const code = e?.code != null ? ` code=${e.code}` : "";
    return api.sendMessage(`❌ setMute fail:${code} ${e?.message || e}`, threadId, type);
  }
};
