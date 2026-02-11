const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');

module.exports.config = {
  name: "info-ff",
  aliases: ["freefire", "ff", "thông tin freefire", "ff info", "xem ff", "uid ff"],
  version: "1.0.0",
  role: 0,
  author: "Bonz - Inspired by Tuann",
  description: "Xem thông tin tài khoản Free Fire",
  usage: "info-ff <uid>",
  cooldowns: 5
};

async function downloadImage(url, filePath) {
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  fs.writeFileSync(filePath, Buffer.from(res.data));
}

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type } = event;

  if (args.length !== 1) {
    return api.sendMessage("❌ Sai cú pháp! Dùng: info-ff <uid>", threadId, type);
  }

  const ffUid = args[0];

  if (!/^\d+$/.test(ffUid)) {
    return api.sendMessage("❌ UID phải là số!", threadId, type);
  }

  const region = 'vn';
  const infoUrl = `https://zrojectx-info-free-fire.vercel.app/player-info-zprojectx?uid=${ffUid}&region=${region}`;
  const imageUrl = `https://jnl-outfit-v4.vercel.app/outfit-image?uid=${ffUid}&region=${region}&key=Dev-JNL`;

  try {
    const infoRes = await axios.get(infoUrl);
    const infoJson = infoRes.data;

    if (!infoJson.basicInfo) {
      return api.sendMessage(`❌ Không tìm thấy thông tin cho UID ${ffUid} khu vực ${region}.`, threadId, type);
    }

    const basicInfo = infoJson.basicInfo || {};
    const petInfo = infoJson.petInfo || {};
    const socialInfo = infoJson.socialInfo || {};

    const name = basicInfo.nickname || 'Không rõ';
    const level = basicInfo.level || 'N/A';
    const exp = basicInfo.exp || 0;
    const likes = basicInfo.liked || 0;
    const rankPoints = basicInfo.rankingPoints || 0;
    const season = basicInfo.seasonId || 'N/A';
    const badge = basicInfo.badgeId || 'N/A';

    let gender = 'Không rõ';
    if (typeof socialInfo.gender === 'string') {
      if (socialInfo.gender.includes('MALE')) gender = 'Nam';
      if (socialInfo.gender.includes('FEMALE')) gender = 'Nữ';
    }

    const petName = petInfo.name || 'Không có';
    const petLevel = petInfo.level || 'N/A';
    const petSkin = petInfo.skinId || 'N/A';

    const msg =
`🎮 THÔNG TIN FREE FIRE

👤 Người Chơi:
➤ Tên: ${name}
➤ UID: ${ffUid}
➤ Khu vực: ${basicInfo.region || 'VN'}
➤ Level: ${level}
➤ EXP: ${exp}
➤ Lượt thích: ${likes}
➤ Điểm Rank: ${rankPoints}
➤ Season: ${season}
➤ Badge ID: ${badge}
➤ Giới tính: ${gender}
➤ Phiên bản: ${basicInfo.releaseVersion || 'N/A'}

🧸 Thú Cưng:
➤ Tên: ${petName}
➤ Level: ${petLevel}
➤ Skin: ${petSkin}

🛠️ Created by: Bonz Bot`;

    const tmpDir = path.join(os.tmpdir(), 'ff-outfit');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const filePath = path.join(tmpDir, `ff_${ffUid}_${Date.now()}.png`);

    try {
      await downloadImage(imageUrl, filePath);

      return api.sendMessage({
        msg: msg,
        attachments: [filePath]
      }, threadId, type);

    } catch (e) {
      console.error('Lỗi tải ảnh:', e);
      return api.sendMessage(msg, threadId, type);
    } finally {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

  } catch (e) {
    console.error('Lỗi API FF:', e);
    return api.sendMessage(`❌ Lỗi khi truy vấn API: ${e.message}`, threadId, type);
  }
};
