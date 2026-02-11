const fs = require("fs");
const path = require("path");
const axios = require("axios");

const TEMP_DIR = path.join(__dirname, "cache", "avatar");
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

module.exports.config = {
  name: "avatar",
  aliases: ["setavatar", "changeavatar"],
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Đổi avatar tài khoản bot (reply ảnh hoặc gửi link ảnh)",
  category: "Hệ thống",
  usage: "avatar <reply ảnh | link ảnh>",
  cooldowns: 10,
  dependencies: { axios: "" }
};

function guessExtFromMime(mime = "") {
  const lower = String(mime || "").toLowerCase();
  if (lower.includes("png")) return "png";
  if (lower.includes("jpeg") || lower.includes("jpg")) return "jpg";
  if (lower.includes("webp")) return "webp";
  return "jpg";
}

function guessExtFromUrl(url = "") {
  const lower = String(url || "").toLowerCase();
  if (lower.includes(".png")) return "png";
  if (lower.includes(".webp")) return "webp";
  if (lower.includes(".jpg") || lower.includes(".jpeg")) return "jpg";
  return "jpg";
}

async function downloadToFile(url, outPath) {
  const resp = await axios.get(url, { responseType: "arraybuffer", timeout: 20000 });
  fs.writeFileSync(outPath, Buffer.from(resp.data));
}

function pickReplyImageUrl(event) {
  const reply = event.messageReply || event.repliedMessage;
  const att = reply?.data?.attachments?.[0];
  if (!att) return null;
  return att.href || att.url || att.src || null;
}

module.exports.run = async function ({ api, event, args = [] }) {
  const { threadId, type } = event;

  if (typeof api?.changeAccountAvatar !== "function") {
    return api.sendMessage("⚠️ API changeAccountAvatar chưa khả dụng ở phiên bản bot hiện tại.", threadId, type);
  }

  const replyUrl = pickReplyImageUrl(event);
  const urlArg = args.find((a) => /^https?:\/\//i.test(String(a || "")));
  const url = replyUrl || urlArg;

  if (!url) {
    return api.sendMessage("❌ Vui lòng reply ảnh hoặc gửi link ảnh.\nVí dụ: avatar https://...", threadId, type);
  }

  const ext = replyUrl
    ? guessExtFromMime(event?.messageReply?.data?.attachments?.[0]?.contentType || event?.messageReply?.data?.attachments?.[0]?.mimeType)
    : guessExtFromUrl(url);

  const filePath = path.join(TEMP_DIR, `avatar_${Date.now()}.${ext}`);

  try {
    await downloadToFile(url, filePath);
  } catch (error) {
    console.error("[avatar] download error:", error);
    return api.sendMessage(`❌ Không tải được ảnh. Lý do: ${error?.message || "Không xác định"}`, threadId, type);
  }

  try {
    await api.changeAccountAvatar(filePath);
  } catch (error) {
    console.error("[avatar] changeAccountAvatar error:", error);
    try { fs.unlinkSync(filePath); } catch {}
    return api.sendMessage(`❌ Đổi avatar thất bại. Lý do: ${error?.message || "Không xác định"}`, threadId, type);
  }

  try { fs.unlinkSync(filePath); } catch {}
  return api.sendMessage("✅ Đã gửi yêu cầu đổi avatar tài khoản bot.", threadId, type);
};
