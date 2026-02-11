const fs = require("fs");
const path = require("path");
const os = require("os");
const axios = require("axios");

module.exports.config = {
  name: "ff",
  aliases: ["freefire", "thông tin freefire", "ff info", "xem ff", "uid ff"],
  version: "1.0.0",
  role: 0,
  author: "Cascade",
  description: "Tra cứu thông tin người chơi Free Fire qua UID",
  category: "Game",
  usage: "ff <uid>",
  cooldowns: 5,
  dependencies: { axios: "" }
};

let cachedServerName = null;

function resolveServerName() {
  if (cachedServerName !== null) {
    return cachedServerName;
  }

  try {
    const dbModule = require("../database/index.js");
    if (dbModule && typeof dbModule.nameServer === "string" && dbModule.nameServer.trim()) {
      cachedServerName = dbModule.nameServer.trim();
      return cachedServerName;
    }
  } catch (error) {
    // Optional dependency - ignore if missing
  }

  const fallback = global?.config?.name_bot;
  cachedServerName = typeof fallback === "string" ? fallback.trim() : "";
  return cachedServerName;
}

function prefixWithServerName(message) {
  const name = resolveServerName();
  if (!name) return message;
  return `${name}\n${message}`;
}

async function downloadImage(url, destination) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 15000
  });
  fs.writeFileSync(destination, Buffer.from(response.data));
  return destination;
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;
  const prefix = global?.config?.prefix || "/";

  if (!Array.isArray(args) || args.length !== 1) {
    return api.sendMessage(
      prefixWithServerName(`❌ Sai cú pháp! Dùng: ${prefix}ff <uid>`),
      threadId,
      type
    );
  }

  const ffUid = String(args[0] || "").trim();
  if (!/^\d+$/.test(ffUid)) {
    return api.sendMessage(
      prefixWithServerName("❌ UID phải là số!"),
      threadId,
      type
    );
  }

  const region = "vn";
  const infoUrl = `https://zrojectx-info-free-fire.vercel.app/player-info-zprojectx?uid=${ffUid}&region=${region}`;
  const imageUrl = `https://jnl-outfit-v4.vercel.app/outfit-image?uid=${ffUid}&region=${region}&key=Dev-JNL`;

  try {
    const infoResponse = await axios.get(infoUrl, { timeout: 15000 });
    const infoData = infoResponse?.data || {};

    if (!infoData?.basicInfo) {
      return api.sendMessage(
        prefixWithServerName(`❌ Không tìm thấy thông tin cho UID ${ffUid} khu vực ${region}.`),
        threadId,
        type
      );
    }

    const basicInfo = infoData.basicInfo || {};
    const petInfo = infoData.petInfo || {};
    const socialInfo = infoData.socialInfo || {};

    const genderRaw = typeof socialInfo.gender === "string" ? socialInfo.gender : "";
    let gender = "Không rõ";
    if (genderRaw.includes("MALE")) gender = "Nam";
    else if (genderRaw.includes("FEMALE")) gender = "Nữ";

    const lines = [
      "🎮 THÔNG TIN FREE FIRE",
      "",
      "👤 Người Chơi:",
      `➤ Tên: ${basicInfo.nickname || "Không rõ"}`,
      `➤ UID: ${ffUid}`,
      `➤ Khu vực: ${basicInfo.region || region.toUpperCase()}`,
      `➤ Level: ${basicInfo.level ?? "N/A"}`,
      `➤ EXP: ${basicInfo.exp ?? 0}`,
      `➤ Lượt thích: ${basicInfo.liked ?? 0}`,
      `➤ Điểm Rank: ${basicInfo.rankingPoints ?? 0}`,
      `➤ Season: ${basicInfo.seasonId ?? "N/A"}`,
      `➤ Badge ID: ${basicInfo.badgeId ?? "N/A"}`,
      `➤ Giới tính: ${gender}`,
      `➤ Phiên bản: ${basicInfo.releaseVersion || "N/A"}`,
      "",
      "🧸 Thú Cưng:",
      `➤ Tên: ${petInfo.name || "Không có"}`,
      `➤ Level: ${petInfo.level ?? "N/A"}`,
      `➤ Skin: ${petInfo.skinId ?? "N/A"}`,
      "",
      "🛠️ Created by: HÀ HUY HOÀNG"
    ];

    const messageBody = prefixWithServerName(lines.join("\n"));

    const tmpDir = path.join(os.tmpdir(), "ff-outfit");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const imagePath = path.join(tmpDir, `ff_${ffUid}_${Date.now()}.png`);
    let attachmentPath = null;

    try {
      attachmentPath = await downloadImage(imageUrl, imagePath);
      await api.sendMessage(
        {
          msg: messageBody,
          attachments: [attachmentPath],
          ttl: 3600000
        },
        threadId,
        type
      );
    } catch (imageError) {
      console.error("[ff] Lỗi tải ảnh outfit:", imageError?.message || imageError);
      await api.sendMessage(
        {
          msg: messageBody,
          ttl: 3600000
        },
        threadId,
        type
      );
    } finally {
      if (attachmentPath && fs.existsSync(attachmentPath)) {
        fs.unlinkSync(attachmentPath);
      }
    }
  } catch (error) {
    console.error("[ff] Lỗi gọi API Free Fire:", error?.message || error);
    return api.sendMessage(
      prefixWithServerName(`❌ Lỗi khi truy vấn API: ${error?.message || "Không xác định"}`),
      threadId,
      type
    );
  }
};
