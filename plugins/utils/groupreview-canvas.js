const { createCanvas, loadImage } = require("canvas");

const WIDTH = 1200;
const BASE_HEIGHT = 400;
const CARD_HEIGHT = 110;
const MAX_VISIBLE_MEMBERS = 12;

function titleCase(text = "") {
  const normalized = text.trim().toLowerCase();
  return normalized.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

function formatGenderLabel(gender) {
  if (gender === null || gender === undefined) return "Chưa cập nhật";

  if (typeof gender === "number") {
    if (gender === 1) return "Nam";
    if (gender === 2) return "Nữ";
    return "Không xác định";
  }

  if (typeof gender === "string") {
    const normalized = gender.trim().toLowerCase();
    if (!normalized.length) return "Chưa cập nhật";
    if (["male", "nam", "m", "boy"].includes(normalized)) return "Nam";
    if (["female", "nu", "nữ", "f", "girl"].includes(normalized)) return "Nữ";
    return titleCase(normalized);
  }

  return "Chưa cập nhật";
}

function formatFriendStatusLabel(status) {
  if (status === null || status === undefined) return "Không rõ";

  if (typeof status === "number") {
    if (status === 1) return "Đã kết bạn";
    if (status === 2) return "Đang chờ kết bạn";
    if (status === 0) return "Chưa kết bạn";
  }

  if (typeof status === "boolean") {
    return status ? "Đã kết bạn" : "Chưa kết bạn";
  }

  if (typeof status === "string") {
    const normalized = status.trim().toLowerCase();
    if (!normalized.length) return "Không rõ";
    if (["friend", "accepted", "connected"].includes(normalized)) return "Đã kết bạn";
    if (["pending", "wait", "waiting"].includes(normalized)) return "Đang chờ kết bạn";
    if (["not_friend", "blocked", "none"].includes(normalized)) return "Chưa kết bạn";
    return titleCase(normalized);
  }

  return "Không rõ";
}

async function loadAvatarImage(url) {
  if (!url || typeof url !== "string" || !url.startsWith("http")) {
    return null;
  }
  try {
    return await loadImage(url);
  } catch {
    return null;
  }
}

function drawGradientBackground(ctx, width, height) {
  // Modern gradient with rich colors
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#0f172a");
  gradient.addColorStop(0.25, "#1e1b4b");
  gradient.addColorStop(0.5, "#4c1d95");
  gradient.addColorStop(0.75, "#7e22ce");
  gradient.addColorStop(1, "#c026d3");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Add subtle noise texture effect
  ctx.globalAlpha = 0.03;
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? "#ffffff" : "#000000";
    ctx.fillRect(
      Math.random() * width,
      Math.random() * height,
      1,
      1
    );
  }
  ctx.globalAlpha = 1;

  // Add decorative circles
  drawDecorativeElements(ctx, width, height);
}

function drawDecorativeElements(ctx, width, height) {
  ctx.save();
  ctx.globalAlpha = 0.08;
  
  // Large circle top right
  const circleGradient1 = ctx.createRadialGradient(width - 150, 100, 0, width - 150, 100, 300);
  circleGradient1.addColorStop(0, "#ec4899");
  circleGradient1.addColorStop(1, "transparent");
  ctx.fillStyle = circleGradient1;
  ctx.beginPath();
  ctx.arc(width - 150, 100, 300, 0, Math.PI * 2);
  ctx.fill();

  // Medium circle bottom left
  const circleGradient2 = ctx.createRadialGradient(150, height - 100, 0, 150, height - 100, 200);
  circleGradient2.addColorStop(0, "#8b5cf6");
  circleGradient2.addColorStop(1, "transparent");
  ctx.fillStyle = circleGradient2;
  ctx.beginPath();
  ctx.arc(150, height - 100, 200, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawHeader(ctx, groupName, groupId, total, extraCount) {
  ctx.save();

  // Modern glassmorphism card
  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 10;
  ctx.beginPath();
  ctx.roundRect(50, 40, WIDTH - 100, 180, 32);
  ctx.fill();
  
  // Border with gradient
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  const borderGradient = ctx.createLinearGradient(50, 40, WIDTH - 50, 220);
  borderGradient.addColorStop(0, "rgba(236, 72, 153, 0.5)");
  borderGradient.addColorStop(0.5, "rgba(168, 85, 247, 0.5)");
  borderGradient.addColorStop(1, "rgba(59, 130, 246, 0.5)");
  ctx.strokeStyle = borderGradient;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Title with glow effect
  ctx.shadowColor = "rgba(236, 72, 153, 0.8)";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 60px 'Segoe UI', 'Montserrat', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("GROUP REVIEW", WIDTH / 2, 110);
  
  // Subtitle
  ctx.shadowBlur = 0;
  ctx.font = "600 28px 'Segoe UI', sans-serif";
  ctx.fillStyle = "#e0e7ff";
  const subtitle = `${groupName || "Không rõ tên nhóm"} • ID: ${groupId}`;
  ctx.fillText(subtitle, WIDTH / 2, 155);

  // Badge-style info
  const badgeY = 185;
  const detailLine =
    extraCount > 0
      ? `Hiển thị ${MAX_VISIBLE_MEMBERS}/${total} thành viên • Còn ${extraCount} thành viên nữa`
      : `${total} thành viên đang chờ duyệt`;
  
  ctx.font = "bold 22px 'Inter', sans-serif";
  const textWidth = ctx.measureText(detailLine).width;
  const badgeX = (WIDTH - textWidth) / 2 - 20;
  const badgeWidth = textWidth + 40;
  
  ctx.fillStyle = "rgba(251, 191, 36, 0.15)";
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY - 25, badgeWidth, 38, 19);
  ctx.fill();
  
  ctx.fillStyle = "#fbbf24";
  ctx.fillText(detailLine, WIDTH / 2, badgeY);

  ctx.restore();
}

function drawMemberCard(ctx, member, index, avatars, x, y, width, height) {
  const displayName =
    (member.name && member.name.trim().length ? member.name.trim() : null) ||
    `UID ${member.uid.slice(-6)}`;

  ctx.save();

  // Card with glassmorphism
  ctx.fillStyle = "rgba(15, 23, 42, 0.6)";
  ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 28);
  ctx.fill();
  
  // Gradient border
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  const borderGradient = ctx.createLinearGradient(x, y, x + width, y);
  borderGradient.addColorStop(0, "rgba(139, 92, 246, 0.4)");
  borderGradient.addColorStop(1, "rgba(236, 72, 153, 0.4)");
  ctx.strokeStyle = borderGradient;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Avatar
  const avatarSize = 80;
  const avatarX = x + 30;
  const avatarY = y + (height - avatarSize) / 2;

  // Avatar glow
  ctx.save();
  ctx.shadowColor = "rgba(236, 72, 153, 0.5)";
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 5, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(236, 72, 153, 0.6)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  // Avatar content
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  const avatarImg = avatars[index];
  if (avatarImg) {
    ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
  } else {
    // Gradient fallback
    const fallbackGradient = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
    fallbackGradient.addColorStop(0, "#8b5cf6");
    fallbackGradient.addColorStop(1, "#ec4899");
    ctx.fillStyle = fallbackGradient;
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    
    ctx.fillStyle = "#fff";
    ctx.font = "bold 36px 'Roboto', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fallbackLetter = (member.name || "?").trim().charAt(0).toUpperCase() || "?";
    ctx.fillText(fallbackLetter, avatarX + avatarSize / 2, avatarY + avatarSize / 2);
  }
  ctx.restore();

  // Member info
  const textX = avatarX + avatarSize + 24;
  
  // Index badge
  ctx.fillStyle = "rgba(168, 85, 247, 0.3)";
  ctx.beginPath();
  ctx.roundRect(textX, y + 20, 42, 32, 16);
  ctx.fill();
  ctx.fillStyle = "#c084fc";
  ctx.font = "bold 20px 'Inter', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${index + 1}`, textX + 21, y + 38);

  // Name
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px 'Poppins', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${index + 1}. ${displayName}`, avatarX + avatarSize + 30, y + 24);

  // UID
  ctx.font = "19px 'Inter', sans-serif";
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText(`UID: ${member.uid}`, textX, y + 70);

  // Info pills
  const pillY = y + height - 45;
  const pillHeight = 34;
  const pillPadding = 18;

  ctx.font = "bold 17px 'Inter', sans-serif";
  const genderLabel = `${formatGenderLabel(member.gender)}`;
  const statusLabel = `${formatFriendStatusLabel(member.friendStatus)}`;
  const genderWidth = ctx.measureText(genderLabel).width + pillPadding * 2;
  const statusWidth = ctx.measureText(statusLabel).width + pillPadding * 2;

  // Gender pill
  ctx.fillStyle = "rgba(16, 185, 129, 0.25)";
  ctx.beginPath();
  ctx.roundRect(textX, pillY, genderWidth, pillHeight, 17);
  ctx.fill();
  ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#34d399";
  ctx.textAlign = "left";
  ctx.fillText(genderLabel, textX + pillPadding, pillY + 21);

  // Status pill
  ctx.fillStyle = "rgba(59, 130, 246, 0.25)";
  ctx.beginPath();
  ctx.roundRect(textX + genderWidth + 12, pillY, statusWidth, pillHeight, 17);
  ctx.fill();
  ctx.strokeStyle = "rgba(59, 130, 246, 0.4)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#60a5fa";
  ctx.fillText(statusLabel, textX + genderWidth + 12 + pillPadding, pillY + 21);

  ctx.restore();
}

function drawFooter(ctx, width, height) {
  ctx.save();
  
  // Footer gradient bar
  const footerGradient = ctx.createLinearGradient(0, height - 60, width, height - 60);
  footerGradient.addColorStop(0, "rgba(139, 92, 246, 0.2)");
  footerGradient.addColorStop(0.5, "rgba(236, 72, 153, 0.2)");
  footerGradient.addColorStop(1, "rgba(59, 130, 246, 0.2)");
  ctx.fillStyle = footerGradient;
  ctx.fillRect(0, height - 60, width, 60);
  
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.font = "600 19px 'Inter', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Tạo bởi BONZ Bot • groupreview", width / 2, height - 28);
  
  ctx.restore();
}

async function createGroupReviewImage({ groupId, groupName, members = [] }) {
  const totalMembers = members.length;
  const visibleMembers = members.slice(0, MAX_VISIBLE_MEMBERS);
  const extraCount = Math.max(0, totalMembers - visibleMembers.length);
  const dynamicHeight = BASE_HEIGHT + CARD_HEIGHT * Math.max(visibleMembers.length, 1);
  const height = Math.min(dynamicHeight, 1600);

  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext("2d");

  drawGradientBackground(ctx, WIDTH, height);
  drawHeader(ctx, groupName, groupId, totalMembers, extraCount);

  if (visibleMembers.length === 0) {
    // Empty state with icon-like element
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.beginPath();
    ctx.arc(WIDTH / 2, height / 2 - 60, 80, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.font = "bold 48px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Hiện không có thành viên nào đang chờ duyệt", WIDTH / 2, height / 2 + 30);
    
    ctx.font = "26px 'Inter', sans-serif";
    ctx.fillStyle = "#fbbf24";
    ctx.fillText("Hãy quay lại sau khi có yêu cầu mới!", WIDTH / 2, height / 2 + 80);
    ctx.restore();
    
    drawFooter(ctx, WIDTH, height);
    return canvas.toBuffer("image/png");
  }

  const avatarPromises = visibleMembers.map((member) => loadAvatarImage(member.avatar));
  const avatars = await Promise.all(avatarPromises);

  const cardWidth = WIDTH - 140;
  let currentY = 260;
  visibleMembers.forEach((member, index) => {
    drawMemberCard(ctx, member, index, avatars, 70, currentY, cardWidth, CARD_HEIGHT);
    currentY += CARD_HEIGHT + 18;
  });

  drawFooter(ctx, WIDTH, height);

  return canvas.toBuffer("image/png");
}

module.exports = {
  createGroupReviewImage
};