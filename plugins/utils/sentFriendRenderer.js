const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { createCanvas, loadImage } = require("canvas");

const TEMP_DIR = path.join(__dirname, "..", "cache", "sentfriend");
const HEADER_HEIGHT = 260;
const FOOTER_HEIGHT = 140;
const ROW_HEIGHT = 120;
const MIN_ROWS = 3;

function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

function formatTimestamp(ts) {
  if (!ts && ts !== 0) return "Không rõ";
  const date = new Date(Number(ts));
  if (Number.isNaN(date.getTime())) return "Không rõ";
  return date.toLocaleString("vi-VN", { hour12: false });
}

function formatRelativeTime(ts) {
  const time = Number(ts);
  if (!time || Number.isNaN(time)) return "Không rõ";
  const diff = Date.now() - time;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "vừa xong";
  if (diff < hour) return `${Math.floor(diff / minute)} phút trước`;
  if (diff < day) return `${Math.floor(diff / hour)} giờ trước`;
  if (diff < day * 7) return `${Math.floor(diff / day)} ngày trước`;
  return new Date(time).toLocaleDateString("vi-VN");
}

function mapSource(src) {
  const mapping = {
    0: "Không rõ",
    1: "Từ danh bạ",
    2: "Quét QR",
    3: "Tìm kiếm",
    4: "Gợi ý kết bạn",
    5: "Nhóm chung",
    6: "Link chia sẻ",
    8: "Số điện thoại",
    9: "Danh thiếp",
    10: "Khác"
  };
  return mapping[src] || `Src ${src ?? "?"}`;
}

async function downloadAvatar(url) {
  if (!url) return null;
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 8000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    if (response?.data?.length > 512) {
      return await loadImage(Buffer.from(response.data));
    }
  } catch (error) {
    console.log("[sentfriend] Lỗi tải avatar:", error?.message || error);
  }
  return null;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function truncateText(ctx, text, maxWidth) {
  if (!text) return "";
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated ? `${truncated}…` : text.slice(0, 1);
}

async function createSentFriendDashboard(requests = [], meta = {}) {
  ensureTempDir();
  const width = 1850;
  const rowHeight = ROW_HEIGHT;
  const headerHeight = HEADER_HEIGHT;
  const footerHeight = FOOTER_HEIGHT;
  const bodyHeight = Math.max(requests.length, MIN_ROWS) * rowHeight;
  const items = requests.length > 0 ? requests : Array(MIN_ROWS).fill(null);
  const cardX = 60;
  const cardY = 40;
  const cardWidth = width - cardX * 2;
  const cardHeight = headerHeight + bodyHeight + footerHeight + 80;
  const height = cardY + cardHeight + 40;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#050918");
  bg.addColorStop(0.4, "#0c1228");
  bg.addColorStop(1, "#03060f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const orb = ctx.createRadialGradient(width * 0.2, height * 0.1, 0, width * 0.2, height * 0.1, 400);
  orb.addColorStop(0, "rgba(99, 102, 241, 0.4)");
  orb.addColorStop(1, "transparent");
  ctx.fillStyle = orb;
  ctx.fillRect(0, 0, width, height);

  roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 35);
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const headerX = cardX + 50;
  const headerY = cardY + 30;

  const titleUnderline = ctx.createLinearGradient(headerX + 40, 0, headerX + 440, 0);
  titleUnderline.addColorStop(0, "#fbbf24");
  titleUnderline.addColorStop(0.4, "#f472b6");
  titleUnderline.addColorStop(1, "#60a5fa");
  ctx.fillStyle = titleUnderline;
  ctx.fillRect(headerX + 50, headerY + 80, 360, 4);

  const stats = [
    { label: "Tổng pending", value: meta.total || requests.length, color: "#3b82f6", icon: "📌" },
    { label: "Đang hiển thị", value: requests.length, color: "#f472b6", icon: "📝" },
    { label: "Tin nhắn tuỳ chỉnh", value: requests.filter(r => r?.message).length, color: "#fbbf24", icon: "💬" }
  ];

  stats.forEach((stat, i) => {
    const boxWidth = 400;
    const boxHeight = 140;
    const gap = 35;
    const boxX = headerX + 20 + i * (boxWidth + gap);
    const boxY = headerY + 40;
    roundRect(ctx, boxX, boxY, boxWidth, boxHeight, 20);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fill();
    ctx.strokeStyle = stat.color;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = "600 28px Arial";
    ctx.fillStyle = stat.color;
    ctx.fillText(`${stat.icon} ${stat.label}`, boxX + 24, boxY + 48);

    ctx.font = "bold 42px Arial";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(String(stat.value), boxX + 24, boxY + 102);
  });

  const tableX = cardX + 50;
  const tableY = cardY + HEADER_HEIGHT;
  const tableW = cardWidth - 100;

  const avatars = await Promise.all(items.map(item => downloadAvatar(item?.avatar)));

  items.forEach((item, idx) => {
    const rowY = tableY + idx * ROW_HEIGHT;
    roundRect(ctx, tableX, rowY + 15, tableW, ROW_HEIGHT - 30, 24);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.stroke();

    if (!item) return;

    const indexBadgeX = tableX + 30;
    const index = item.index || idx + 1;
    roundRect(ctx, indexBadgeX, rowY + 40, 60, 40, 14);
    const idxGrad = ctx.createLinearGradient(indexBadgeX, rowY + 40, indexBadgeX + 60, rowY + 80);
    idxGrad.addColorStop(0, "rgba(99,102,241,0.3)");
    idxGrad.addColorStop(1, "rgba(244,114,182,0.3)");
    ctx.fillStyle = idxGrad;
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "center";
    ctx.fillText(String(index), indexBadgeX + 30, rowY + 69);
    ctx.textAlign = "left";

    const avatarSize = 72;
    const avatarX = tableX + 120;
    const avatarY = rowY + (ROW_HEIGHT - avatarSize) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.clip();
    const image = avatars[idx];
    if (image) ctx.drawImage(image, avatarX, avatarY, avatarSize, avatarSize);
    else {
      const grad = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
      grad.addColorStop(0, "#6366f1");
      grad.addColorStop(1, "#ec4899");
      ctx.fillStyle = grad;
      ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 30px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("👤", avatarX + avatarSize / 2, avatarY + avatarSize / 2);
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.stroke();

    const detailX = avatarX + avatarSize + 40;
    const name = item.name || `UID ${item.userId}`;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 34px Arial";
    const truncated = truncateText(ctx, name, tableW * 0.35);
    ctx.fillText(truncated, detailX, rowY + 55);

    ctx.font = "600 22px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(`UID: ${item.userId}`, detailX, rowY + 90);

    const messageX = tableX + tableW * 0.45;
    ctx.font = "italic 24px Arial";
    ctx.fillStyle = "rgba(248,250,252,0.9)";
    const message = item.message || "Không có lời nhắn";
    ctx.fillText(truncateText(ctx, `"${message}"`, tableW * 0.32), messageX, rowY + 60);

    ctx.font = "600 22px Arial";
    ctx.fillStyle = "#93c5fd";
    ctx.fillText(mapSource(item.src), messageX, rowY + 92);

    const timeX = tableX + tableW - 320;
    ctx.font = "600 24px Arial";
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(formatRelativeTime(item.time), timeX, rowY + 60);
    ctx.font = "500 20px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(formatTimestamp(item.time), timeX, rowY + 90);
  });

  const footerY = cardY + headerHeight + bodyHeight + 30;
  roundRect(ctx, tableX, footerY, tableW, FOOTER_HEIGHT, 24);
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.stroke();

  ctx.font = "bold 28px Arial";
  const footerGrad = ctx.createLinearGradient(tableX + 30, 0, tableX + 430, 0);
  footerGrad.addColorStop(0, "#a78bfa");
  footerGrad.addColorStop(1, "#60a5fa");
  ctx.fillStyle = footerGrad;
  ctx.fillText("💡 Tip", tableX + 40, footerY + 50);

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "600 22px Arial";
  ctx.fillText("Dùng \"sentfriend <limit>\" để thay đổi số lượng hiển thị.", tableX + 40, footerY + 90);

  const fileName = `sentfriend_${Date.now()}.png`;
  const filePath = path.join(TEMP_DIR, fileName);
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(filePath, buffer);

  return {
    buffer,
    width,
    height,
    filePath,
    fileName
  };
}

function cleanupSentFriendFiles(files = []) {
  for (const file of files) {
    if (!file) continue;
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch (error) {
      console.log("[sentfriend] Không thể xoá file tạm:", error?.message || error);
    }
  }
}

module.exports = {
  createSentFriendDashboard,
  cleanupSentFriendFiles
};
