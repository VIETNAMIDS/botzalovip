const { ThreadType } = require("zca-js");
const { createCanvas, loadImage } = require("canvas");

const path = require("path");
const fs = require("fs").promises;

function ensureGetBlockedApi(api) {
  if (!api) return null;

  if (typeof api.getGroupBlockedMember === "function") {
    return (payload, groupId) => api.getGroupBlockedMember(payload, groupId);
  }

  if (typeof api.getGroupBlockedMemberCompat === "function") {
    return (payload, groupId) => api.getGroupBlockedMemberCompat({ payload, groupId });
  }

  if (typeof api.custom !== "function") return null;

  if (!api.__groupBlockedCompatConfigured) {
    api.custom("getGroupBlockedMemberCompat", async ({ ctx, utils, props }) => {
      const payload = props?.payload || {};
      const groupId = props?.groupId;

      if (!groupId) {
        throw new Error("Thiếu groupId khi gọi getGroupBlockedMemberCompat");
      }

      const page = Number.isInteger(payload.page) && payload.page > 0 ? payload.page : 1;
      const count = Number.isInteger(payload.count) && payload.count > 0 ? payload.count : 50;

      const baseUrl = Array.isArray(api?.zpwServiceMap?.group) && api.zpwServiceMap.group.length
        ? api.zpwServiceMap.group[0]
        : "https://tt-group-wpa.chat.zalo.me";

      const serviceURL = utils.makeURL(`${baseUrl}/api/group/blockedmems/list`);
      const params = {
        grid: String(groupId),
        page,
        count,
        imei: ctx.imei
      };

      const encryptedParams = utils.encodeAES(JSON.stringify(params));
      if (!encryptedParams) {
        throw new Error("Không thể mã hóa tham số khi gọi blockedmems/list");
      }

      const requestUrl = utils.makeURL(serviceURL, { params: encryptedParams });
      const response = await utils.request(requestUrl, { method: "GET" });
      return utils.resolve(response);
    });

    api.__groupBlockedCompatConfigured = true;
  }

  if (typeof api.getGroupBlockedMemberCompat === "function") {
    return (payload, groupId) => api.getGroupBlockedMemberCompat({ payload, groupId });
  }

  return null;
}

module.exports.config = {
  name: "groupblocked",
  aliases: ["blockedlist", "listblocked", "blocklist"],
  version: "2.0.0",
  role: 1,
  author: "Cascade",
  description: "Liệt kê thành viên đang bị chặn khỏi nhóm bằng API getGroupBlockedMember",
  category: "Quản lý nhóm",
  usage: "groupblocked [page] [count] [groupId?]",
  cooldowns: 5
};

function parsePaginationArgs(args = []) {
  const parsed = {
    page: 1,
    count: 50,
    remaining: []
  };

  const numericArgs = args
    .filter((token) => /^-?\d+$/.test(token))
    .map((token) => parseInt(token, 10))
    .slice(0, 2);

  if (numericArgs.length > 0 && Number.isInteger(numericArgs[0]) && numericArgs[0] > 0) {
    parsed.page = numericArgs[0];
  }
  if (numericArgs.length > 1 && Number.isInteger(numericArgs[1]) && numericArgs[1] > 0) {
    parsed.count = Math.min(Math.max(numericArgs[1], 1), 200);
  }

  const numbersConsumed = numericArgs.length;
  parsed.remaining = args.slice(numbersConsumed);
  return parsed;
}

function normalizeDigits(input = "") {
  if (!input) return "";
  return input.replace(/[^\d]/g, "");
}

function resolveGroupId(args, fallbackThreadId, type) {
  if (args.length > 0) {
    const candidate = normalizeDigits(args[0]);
    if (candidate.length >= 12) {
      return candidate;
    }
  }
  if (type === ThreadType.Group && fallbackThreadId) {
    return String(fallbackThreadId);
  }
  return null;
}

function formatBlockedMembers(response, page, count, groupId) {
  const lines = [];
  const blocked = Array.isArray(response?.blocked_members) ? response.blocked_members : [];

  lines.push("🚫 **DANH SÁCH THÀNH VIÊN BỊ CHẶN**");
  lines.push(`📍 Nhóm: ${groupId}`);
  lines.push(`📄 Trang hiện tại: ${page} (mỗi trang ${count} thành viên)`);
  lines.push(`🔁 Còn trang tiếp theo: ${response?.has_more ? "Có" : "Không"}`);
  lines.push("");

  if (blocked.length === 0) {
    lines.push("_Danh sách trống - hiện không có thành viên nào bị chặn._");
    return lines.join("\n");
  }

  blocked.forEach((member, index) => {
    const displayName = member?.dName || member?.zaloName || "Không rõ";
    const statusMap = {
      0: "Bình thường",
      1: "Đã bị chặn",
      2: "Hạn chế"
    };
    const accountStatus = statusMap[member?.accountStatus] || member?.accountStatus || "Không rõ";

    lines.push(
      [
        `#${(page - 1) * count + index + 1}`,
        `UID: ${member?.id || "???"}`,
        `Tên: ${displayName}`,
        `Loại: ${member?.type ?? "?"}`,
        `Trạng thái: ${accountStatus}`
      ].join(" • ")
    );
  });

  return lines.join("\n");
}

function truncateText(ctx, text, maxWidth) {
  const safeText = typeof text === "string" ? text : String(text ?? "");
  if (ctx.measureText(safeText).width <= maxWidth) return safeText;
  let truncated = safeText;
  while (truncated.length > 0 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated ? `${truncated}…` : safeText;
}

function drawRoundedRect(ctx, x, y, w, h, r = 16) {
  const radius = Math.min(r, h / 2, w / 2);
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

const MAX_AVATAR_FETCH = 25;
const MAX_BATCH_PAGES = 5;
const MAX_BATCH_MEMBERS = 200;

function normalizeAvatarUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

async function loadAvatarImages(members = []) {
  return Promise.all(
    members.map(async (member, index) => {
      if (!member || !member.avatar) {
        return null;
      }
      if (index >= MAX_AVATAR_FETCH) {
        return null;
      }
      const avatarUrl = normalizeAvatarUrl(member.avatar);
      if (!avatarUrl) {
        return null;
      }
      try {
        return await loadImage(avatarUrl);
      } catch (error) {
        console.warn(
          "[GROUPBLOCKED] Không tải được avatar",
          member?.id || index,
          error?.message || error
        );
        return null;
      }
    })
  );
}

function getInitial(text = "?") {
  const normalized = String(text).trim();
  if (!normalized) return "?";
  const firstChar = normalized[0];
  return firstChar.toUpperCase();
}

function formatMultiPageSummary(pages, groupId, count) {
  if (!Array.isArray(pages) || pages.length === 0) {
    return "🚫 Không tìm thấy dữ liệu thành viên bị chặn.";
  }

  const totalMembers = pages.reduce((sum, page) => sum + (page.members?.length || 0), 0);
  const firstPage = pages[0]?.page ?? 1;
  const lastPage = pages[pages.length - 1]?.page ?? firstPage;
  const hasMore = Boolean(pages[pages.length - 1]?.response?.has_more);

  const lines = [];
  lines.push("🚫 **DANH SÁCH THÀNH VIÊN BỊ CHẶN (ĐA TRANG)**");
  lines.push(`📍 Nhóm: ${groupId}`);
  lines.push(`📑 Trang: ${firstPage} → ${lastPage}`);
  lines.push(`👥 Tổng thành viên: ${totalMembers}`);
  lines.push(`📄 Kích thước trang: ${count} thành viên/trang`);
  lines.push(`🔁 Còn trang tiếp theo: ${hasMore ? "Có" : "Không"}`);
  lines.push("");

  pages.forEach((page) => {
    const members = Array.isArray(page.members) ? page.members : [];
    lines.push(`Trang ${page.page} (${members.length} thành viên):`);
    if (members.length === 0) {
      lines.push("  • (Không có dữ liệu)");
    } else {
      const preview = members.slice(0, Math.min(3, members.length));
      preview.forEach((member) => {
        const name = member?.dName || member?.zaloName || "Không rõ";
        const uid = member?.id || "???";
        lines.push(`  • ${name} (UID: ${uid})`);
      });
      if (members.length > preview.length) {
        lines.push(`  • … và ${members.length - preview.length} thành viên khác`);
      }
    }
    lines.push("");
  });

  return lines.join("\n").trim();
}

function renderBlockedListCanvas(members, avatars, { groupId, page, count, hasMore }) {
  const entries = Array.isArray(members) && members.length ? members : [{ __empty: true }];
  const rows = entries.length;
  const width = 1200;
  const headerHeight = 180;
  const rowHeight = 90;
  const rowGap = 8;
  const footerHeight = 100;
  const padding = 50;
  const totalHeight = headerHeight + rows * rowHeight + Math.max(0, rows - 1) * rowGap + footerHeight;

  const canvas = createCanvas(width, totalHeight);
  const ctx = canvas.getContext("2d");

  // Modern gradient background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, totalHeight);
  bgGrad.addColorStop(0, "#0f172a");
  bgGrad.addColorStop(0.5, "#1e293b");
  bgGrad.addColorStop(1, "#0f172a");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, totalHeight);

  // Subtle overlay effects
  ctx.save();
  ctx.globalAlpha = 0.08;
  const overlayGrad = ctx.createRadialGradient(width / 2, headerHeight / 2, 0, width / 2, headerHeight / 2, 400);
  overlayGrad.addColorStop(0, "#3b82f6");
  overlayGrad.addColorStop(1, "transparent");
  ctx.fillStyle = overlayGrad;
  ctx.fillRect(0, 0, width, headerHeight);
  ctx.restore();

  // Header section
  ctx.fillStyle = "rgba(30, 41, 59, 0.6)";
  ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 4;
  drawRoundedRect(ctx, padding, 30, width - padding * 2, headerHeight - 60, 20);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Title with icon effect
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 48px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("🚫 Danh sách bị chặn", padding + 25, 85);

  // Group info
  ctx.font = "22px Arial, sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(`Nhóm: ${groupId}`, padding + 25, 120);

  // Pagination info with badge style
  ctx.font = "20px Arial, sans-serif";
  ctx.fillStyle = "#64748b";
  const pageInfo = `Trang ${page} • ${count} thành viên/trang`;
  ctx.fillText(pageInfo, padding + 25, 145);

  // Has more indicator
  if (hasMore) {
    ctx.fillStyle = "rgba(59, 130, 246, 0.2)";
    const badgeWidth = 140;
    const badgeX = width - padding - badgeWidth - 25;
    drawRoundedRect(ctx, badgeX, 125, badgeWidth, 28, 14);
    ctx.fill();
    
    ctx.fillStyle = "#3b82f6";
    ctx.font = "bold 16px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Còn trang tiếp", badgeX + badgeWidth / 2, 143);
  }

  // Table rows
  const rowsStartY = headerHeight;
  const statusMap = {
    0: "Bình thường",
    1: "Đã bị chặn",
    2: "Hạn chế"
  };
  const statusColorMap = {
    "Bình thường": "#10b981",
    "Đã bị chặn": "#ef4444",
    "Hạn chế": "#f59e0b"
  };

  entries.forEach((member, index) => {
    const y = rowsStartY + index * (rowHeight + rowGap);
    
    // Row background with hover effect simulation
    ctx.fillStyle = index % 2 === 0 
      ? "rgba(30, 41, 59, 0.5)" 
      : "rgba(51, 65, 85, 0.4)";
    ctx.shadowColor = "rgba(0, 0, 0, 0.1)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    drawRoundedRect(ctx, padding, y, width - padding * 2, rowHeight, 16);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    const centerY = y + rowHeight / 2;

    if (member.__empty) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "italic 24px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Không có thành viên nào bị chặn", width / 2, centerY);
      return;
    }

    const globalIndex = (page - 1) * count + index + 1;
    const displayName = member?.dName || member?.zaloName || "Không rõ";
    const uid = member?.id ? String(member.id) : "Không rõ";
    const typeLabel = member?.type != null ? String(member.type) : "?";
    const statusLabel = statusMap.hasOwnProperty(member?.accountStatus)
      ? statusMap[member.accountStatus]
      : member?.accountStatus != null
        ? String(member.accountStatus)
        : "Không rõ";
    const statusColor = statusColorMap[statusLabel] || "#6366f1";

    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    // Index badge
    const indexBadgeX = padding + 26;
    ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
    ctx.beginPath();
    ctx.arc(indexBadgeX, centerY, 22, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = "#3b82f6";
    ctx.font = "bold 20px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${globalIndex}`, indexBadgeX, centerY);

    const avatarRadius = 30;
    const avatarX = padding + 95;
    const avatarImage = Array.isArray(avatars) ? avatars[index] : null;

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, centerY, avatarRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (avatarImage && avatarImage.width && avatarImage.height) {
      try {
        ctx.drawImage(
          avatarImage,
          avatarX - avatarRadius,
          centerY - avatarRadius,
          avatarRadius * 2,
          avatarRadius * 2
        );
      } catch (drawErr) {
        console.warn(
          "[GROUPBLOCKED] Lỗi khi vẽ avatar",
          member?.id || index,
          drawErr?.message || drawErr
        );
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(avatarX - avatarRadius, centerY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
      }
    } else {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(avatarX - avatarRadius, centerY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 26px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(getInitial(displayName), avatarX, centerY);
    }

    ctx.restore();

    // Member name (bold, larger)
    const textStartX = avatarX + avatarRadius + 32;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "bold 24px Arial, sans-serif";
    ctx.fillStyle = "#f1f5f9";
    ctx.fillText(truncateText(ctx, displayName, 320), textStartX, centerY - 12);

    // UID (smaller, subdued)
    ctx.font = "18px Arial, sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.fillText(`UID: ${truncateText(ctx, uid, 320)}`, textStartX, centerY + 18);

    // Type label
    ctx.font = "20px Arial, sans-serif";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.fillText(typeLabel, width - 270, centerY);

    // Status badge
    const statusX = width - 150;
    const statusWidth = ctx.measureText(statusLabel).width + 24;
    
    ctx.fillStyle = `${statusColor}20`;
    drawRoundedRect(ctx, statusX - statusWidth / 2, centerY - 16, statusWidth, 32, 16);
    ctx.fill();
    
    ctx.fillStyle = statusColor;
    ctx.font = "bold 18px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(statusLabel, statusX, centerY);
  });

  // Footer section
  const footerY = totalHeight - footerHeight + 20;
  
  ctx.fillStyle = "rgba(30, 41, 59, 0.5)";
  ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
  ctx.shadowBlur = 15;
  ctx.shadowOffsetY = -2;
  drawRoundedRect(ctx, padding, footerY, width - padding * 2, footerHeight - 40, 16);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Footer text
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "20px Arial, sans-serif";
  const footerText = hasMore 
    ? `Sử dụng: groupblocked ${page + 1} để xem trang tiếp theo` 
    : "Đã hiển thị hết danh sách";
  ctx.fillText(footerText, width / 2, footerY + 25);

  // Branding
  ctx.font = "14px Arial, sans-serif";
  ctx.fillStyle = "#475569";
  ctx.fillText("Bonz Bot • Powered by Canvas", width / 2, totalHeight - 25);

  return canvas.toBuffer("image/png");
}

async function sendBlockedCanvases(api, threadId, type, caption, buffers = []) {
  if (!Array.isArray(buffers) || buffers.length === 0) {
    await api.sendMessage(caption, threadId, type);
    return;
  }

  const cacheDir = path.join(__dirname, "../../cache");
  await fs.mkdir(cacheDir, { recursive: true });

  const timestamp = Date.now();
  const files = [];

  for (let index = 0; index < buffers.length; index += 1) {
    const buffer = buffers[index];
    if (!buffer) continue;
    const filePath = path.join(
      cacheDir,
      `group_blocked_${threadId}_${timestamp}_${index + 1}.png`
    );
    await fs.writeFile(filePath, buffer);
    files.push(filePath);
  }

  if (files.length === 0) {
    await api.sendMessage(caption, threadId, type);
    return;
  }

  try {
    await api.sendMessage({ msg: caption, attachments: files }, threadId, type);
  } finally {
    setTimeout(() => {
      files.forEach((file) => {
        fs.unlink(file).catch(() => {});
      });
    }, 60 * 1000);
  }
}

module.exports.run = async function run({ api, event, args }) {
  const { threadId, type } = event;

  const getBlocked = ensureGetBlockedApi(api);
  if (typeof getBlocked !== "function") {
    return api.sendMessage(
      "⚠️ Phiên bản SDK hiện tại chưa hỗ trợ lấy danh sách block, vui lòng cập nhật SDK.",
      threadId,
      type
    );
  }

  const { page, count, remaining } = parsePaginationArgs(args || []);
  const targetGroupId = resolveGroupId(remaining, threadId, type);

  if (!targetGroupId) {
    return api.sendMessage(
      "❌ Bạn cần ở trong nhóm hoặc truyền kèm groupId hợp lệ.\nVí dụ: groupblocked 1 50 1234567890123",
      threadId,
      type
    );
  }

  try {
    const payload = {
      page,
      count
    };
    const response = await getBlocked(payload, targetGroupId);
    const pages = [];

    let currentPage = page;
    let currentResponse = response;
    let totalMembers = 0;

    while (pages.length < MAX_BATCH_PAGES && totalMembers < MAX_BATCH_MEMBERS) {
      const members = Array.isArray(currentResponse?.blocked_members)
        ? currentResponse.blocked_members
        : [];

      pages.push({
        page: currentPage,
        members,
        response: currentResponse
      });

      totalMembers += members.length;

      if (!currentResponse?.has_more) {
        break;
      }

      currentPage += 1;
      const nextPayload = {
        page: currentPage,
        count
      };

      try {
        currentResponse = await getBlocked(nextPayload, targetGroupId);
      } catch (fetchErr) {
        console.error("[GROUPBLOCKED] Lỗi tải trang tiếp theo:", fetchErr);
        break;
      }
    }

    const summaryMessage = pages.length > 1
      ? formatMultiPageSummary(pages, targetGroupId, count)
      : formatBlockedMembers(response, page, count, targetGroupId);

    try {
      const buffers = [];
      for (const pageEntry of pages) {
        const avatars = await loadAvatarImages(pageEntry.members);
        const buffer = renderBlockedListCanvas(pageEntry.members, avatars, {
          groupId: targetGroupId,
          page: pageEntry.page,
          count,
          hasMore: Boolean(pageEntry.response?.has_more)
        });
        buffers.push(buffer);
      }

      await sendBlockedCanvases(api, threadId, type, summaryMessage, buffers);
    } catch (canvasError) {
      console.error("[GROUPBLOCKED] Render Canvas error:", canvasError);
      await api.sendMessage(summaryMessage, threadId, type);
    }
  } catch (error) {
    console.error("[GROUPBLOCKED] Lỗi lấy danh sách block:", error);
    return api.sendMessage(
      `❌ Không thể lấy danh sách bị chặn.\nLý do: ${error?.message || "Không xác định"}`,
      threadId,
      type
    );
  }
};