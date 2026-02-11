const fs = require("fs");
const path = require("path");
const { createCanvas } = require("canvas");

module.exports.config = {
  name: "viewcode",
  version: "1.0.0",
  role: 0,
  author: "Cascade",
  description: "Render nội dung file code thành ảnh sử dụng canvas",
  category: "Tiện ích",
  usage: "viewcode <đường_dẫn_tương_đối> [--lines=<số_dòng>]",
  cooldowns: 5,
  dependencies: { canvas: "" }
};

function findFilesByName(fileName, maxResults = 5) {
  const matches = [];
  const queue = [ROOT_DIR];
  const targetLower = fileName.toLowerCase();

  while (queue.length > 0 && matches.length < maxResults) {
    const currentDir = queue.shift();
    let dirEntries;

    try {
      dirEntries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of dirEntries) {
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) {
          queue.push(entryPath);
        }
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase() === targetLower) {
        matches.push(entryPath);
        if (matches.length >= maxResults) {
          break;
        }
      }
    }
  }

  return matches;
}

const ROOT_DIR = path.join(__dirname, "..", "..");
const TEMP_DIR = path.join(__dirname, "..", "..", "cache", "viewcode");
const MAX_LINES_DEFAULT = 250;
const MAX_LINES_HARD = 400;
const MAX_CHARACTERS = 40000;
const CANVAS_WIDTH = 1800;
const PADDING = 80;
const LINE_HEIGHT = 28;
const HEADER_HEIGHT = 160;
const FOOTER_HEIGHT = 60;
const LINE_NUMBER_WIDTH = 120;
const WINDOW_RADIUS = 26;
const TITLEBAR_HEIGHT = 64;
const WINDOW_INNER_PADDING = 34;
const WINDOW_TOP_PADDING = 26;
const WINDOW_SIDE_MARGIN = 90;
const WINDOW_BOTTOM_MARGIN = 90;
const IGNORE_DIRS = new Set([
  "node_modules",
  "cache",
  "temp",
  ".git",
  ".vscode",
  "logs",
  "dist",
  "build"
]);

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function parseArgs(args) {
  const options = {};
  const positional = [];

  for (const arg of args) {
    const match = arg.match(/^--(\w+)=([\s\S]+)$/);
    if (match) {
      options[match[1]] = match[2];
    } else {
      positional.push(arg);
    }
  }

  return { options, positional };
}

function wrapLine(ctx, text, maxWidth) {
  if (!text) return [""];
  const result = [];
  let current = "";

  for (const char of text) {
    const tentative = current + char;
    if (ctx.measureText(tentative).width > maxWidth && current.length > 0) {
      result.push(current);
      current = char === " " ? "" : char;
    } else {
      current = tentative;
    }
  }

  if (current.length > 0) {
    result.push(current);
  }

  return result.length ? result : [""];
}

function drawBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#05070f");
  gradient.addColorStop(0.55, "#0b1020");
  gradient.addColorStop(1, "#0a0f1c");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width * 0.35, height * 0.25, 0, width * 0.35, height * 0.25, Math.max(width, height));
  glow.addColorStop(0, "rgba(56, 189, 248, 0.10)");
  glow.addColorStop(0.45, "rgba(167, 139, 250, 0.07)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255,255,255,0.03)";
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const radius = Math.random() * 2.5 + 0.8;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMacWindow(ctx, width, height, titleText) {
  const x = WINDOW_SIDE_MARGIN;
  const y = WINDOW_TOP_PADDING;
  const w = width - WINDOW_SIDE_MARGIN * 2;
  const h = height - WINDOW_TOP_PADDING - WINDOW_BOTTOM_MARGIN;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.65)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = "rgba(17, 24, 39, 0.85)";
  ctx.roundRect(x, y, w, h, WINDOW_RADIUS);
  ctx.fill();
  ctx.restore();

  const borderGradient = ctx.createLinearGradient(x, y, x + w, y + h);
  borderGradient.addColorStop(0, "rgba(148, 163, 184, 0.25)");
  borderGradient.addColorStop(0.5, "rgba(56, 189, 248, 0.10)");
  borderGradient.addColorStop(1, "rgba(148, 163, 184, 0.20)");
  ctx.strokeStyle = borderGradient;
  ctx.lineWidth = 2;
  ctx.roundRect(x, y, w, h, WINDOW_RADIUS);
  ctx.stroke();

  const titleGradient = ctx.createLinearGradient(x, y, x, y + TITLEBAR_HEIGHT);
  titleGradient.addColorStop(0, "rgba(15, 23, 42, 0.95)");
  titleGradient.addColorStop(1, "rgba(17, 24, 39, 0.70)");
  ctx.fillStyle = titleGradient;
  ctx.roundRect(x, y, w, TITLEBAR_HEIGHT, WINDOW_RADIUS);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(x + 1, y + TITLEBAR_HEIGHT - 1, w - 2, 1);

  const btnY = y + Math.floor(TITLEBAR_HEIGHT / 2);
  const btnX = x + 26;
  const radius = 8;
  const spacing = 22;
  const colors = ["#ff5f57", "#febc2e", "#28c840"];
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.fillStyle = colors[i];
    ctx.arc(btnX + i * spacing, btnY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const cleanTitle = String(titleText || "").slice(0, 80);
  ctx.fillStyle = "rgba(226, 232, 240, 0.92)";
  ctx.font = "600 22px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(cleanTitle, x + w / 2, btnY);

  return {
    windowX: x,
    windowY: y,
    windowW: w,
    windowH: h,
    contentX: x + WINDOW_INNER_PADDING,
    contentY: y + TITLEBAR_HEIGHT + 22,
    contentW: w - WINDOW_INNER_PADDING * 2,
    contentH: h - TITLEBAR_HEIGHT - 22 - WINDOW_INNER_PADDING
  };
}

function drawHeader(ctx, filePath, lineCount) {
  ctx.save();
  ctx.fillStyle = "rgba(148, 163, 184, 0.75)";
  ctx.font = "16px 'Segoe UI', sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`Lines: ${lineCount}`, WINDOW_SIDE_MARGIN + 20, TITLEBAR_HEIGHT + 42);
  ctx.restore();
}

function drawFooter(ctx, width, height) {
  ctx.save();
  ctx.fillStyle = "rgba(148, 163, 184, 0.55)";
  ctx.font = "15px 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(new Date().toLocaleString("vi-VN"), width - WINDOW_SIDE_MARGIN, height - 34);
  ctx.restore();
}

function buildRenderRows(ctx, lines, maxWidth, maxRows = 180) {
  const rows = [];
  let lineNumber = 1;

  for (const originalLine of lines) {
    const safeLine = (originalLine ?? "").replace(/\t/g, "  ");
    const wrappedSegments = wrapLine(ctx, safeLine, maxWidth);

    for (let i = 0; i < wrappedSegments.length; i++) {
      if (rows.length >= maxRows) {
        rows.push({ label: "", text: "... (truncated)" });
        return rows;
      }
      const label = i === 0 ? String(lineNumber).padStart(4, " ") : "".padStart(4, " ");
      rows.push({ label, text: wrappedSegments[i] });
    }

    lineNumber += 1;
  }

  return rows;
}

function drawCodeRows(ctx, rows, startX, startY) {
  ctx.font = "19px 'Consolas', 'Courier New', monospace";
  ctx.fillStyle = "#e2e8f0";

  let cursorY = startY;
  for (const row of rows) {
    ctx.fillStyle = "#64748b";
    ctx.fillText(row.label, startX, cursorY);

    ctx.fillStyle = row.text === "... (truncated)" ? "#94a3b8" : "#e2e8f0";
    ctx.fillText(row.text, startX + LINE_NUMBER_WIDTH, cursorY);

    cursorY += LINE_HEIGHT;
  }
}

module.exports.run = async ({ args, event, api }) => {
  const { threadId, type } = event;

  const { options, positional } = parseArgs(args);

  if (positional.length === 0) {
    return api.sendMessage(
      "❗ Vui lòng cung cấp đường dẫn file.\nVí dụ: viewcode plugins/events/autoDMHello.js",
      threadId,
      type
    );
  }

  const maxLinesOption = parseInt(options.lines, 10);
  const maxLines = Number.isFinite(maxLinesOption) ? Math.min(Math.max(maxLinesOption, 1), MAX_LINES_HARD) : MAX_LINES_DEFAULT;

  const relativePath = positional.join(" ").trim();
  const sanitizedPath = relativePath.replace(/^["']|["']$/g, "");
  let targetPath = path.resolve(ROOT_DIR, sanitizedPath);

  if (!targetPath.startsWith(ROOT_DIR)) {
    return api.sendMessage("🚫 Đường dẫn không hợp lệ.", threadId, type);
  }

  const isDirectFile = fs.existsSync(targetPath) && fs.lstatSync(targetPath).isFile();

  if (!isDirectFile) {
    const simpleName = !sanitizedPath.includes("/") && !sanitizedPath.includes("\\");
    if (simpleName) {
      const matches = findFilesByName(sanitizedPath);
      if (matches.length === 0) {
        return api.sendMessage("❌ Không tìm thấy file trùng tên trong dự án.", threadId, type);
      }

      if (matches.length > 1) {
        const list = matches
          .map((absPath, index) => `#${index + 1}: ${path.relative(ROOT_DIR, absPath)}`)
          .join("\n");

        await api.sendMessage(
          "⚠️ Tìm thấy nhiều file trùng tên, vui lòng chỉ định rõ hơn:\n" + list,
          threadId,
          type
        );
        return;
      }

      targetPath = matches[0];
    }
  }

  if (!fs.existsSync(targetPath) || !fs.lstatSync(targetPath).isFile()) {
    return api.sendMessage("❌ Không tìm thấy file cần xem hoặc đây không phải là file.", threadId, type);
  }

  let content;
  try {
    content = fs.readFileSync(targetPath, "utf8");
  } catch (error) {
    console.error("[viewcode] Lỗi đọc file:", error);
    return api.sendMessage("⚠️ Không đọc được file. Kiểm tra quyền truy cập.", threadId, type);
  }

  if (!content || content.trim().length === 0) {
    return api.sendMessage("📭 File rỗng, không có nội dung để hiển thị.", threadId, type);
  }

  let lines = content.split(/\r?\n/);

  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
  }

  const charCount = lines.reduce((sum, line) => sum + line.length, 0);
  if (charCount > MAX_CHARACTERS) {
    const ratio = MAX_CHARACTERS / charCount;
    const newLength = Math.max(10, Math.floor(lines.length * ratio));
    lines = lines.slice(0, newLength);
  }

  // Tính trước số dòng render sau khi wrap để set height chính xác
  const measureCanvas = createCanvas(10, 10);
  const measureCtx = measureCanvas.getContext("2d");
  measureCtx.font = "19px 'Consolas', 'Courier New', monospace";
  const codeMaxWidth =
    (CANVAS_WIDTH - WINDOW_SIDE_MARGIN * 2 - WINDOW_INNER_PADDING * 2) -
    LINE_NUMBER_WIDTH;
  const renderRows = buildRenderRows(measureCtx, lines, codeMaxWidth, 180);

  const codeHeightEstimate = renderRows.length * LINE_HEIGHT;
  const totalHeight = Math.max(720, TITLEBAR_HEIGHT + codeHeightEstimate + 260);

  ensureDirSync(TEMP_DIR);

  const canvas = createCanvas(CANVAS_WIDTH, totalHeight);
  const ctx = canvas.getContext("2d");
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  drawBackground(ctx, CANVAS_WIDTH, totalHeight);
  const title = path.relative(ROOT_DIR, targetPath) || path.basename(targetPath);
  const frame = drawMacWindow(ctx, CANVAS_WIDTH, totalHeight, title);

  ctx.save();
  ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
  ctx.roundRect(frame.windowX + 2, frame.windowY + TITLEBAR_HEIGHT, frame.windowW - 4, frame.windowH - TITLEBAR_HEIGHT - 2, WINDOW_RADIUS - 6);
  ctx.fill();
  ctx.restore();

  drawHeader(ctx, title, lines.length);
  const codeStartY = frame.contentY;
  drawCodeRows(ctx, renderRows, frame.contentX, codeStartY);
  drawFooter(ctx, CANVAS_WIDTH, totalHeight);

  const buffer = canvas.toBuffer("image/png");
  const fileName = `viewcode_${Date.now()}.png`;
  const tempPath = path.join(TEMP_DIR, fileName);

  try {
    fs.writeFileSync(tempPath, buffer);
  } catch (error) {
    console.error("[viewcode] Lỗi ghi ảnh:", error);
    return api.sendMessage("❌ Không thể tạo ảnh xem code.", threadId, type);
  }

  try {
    await api.sendMessage({
      msg: "🖼️ Code preview (Canvas)",
      attachments: [tempPath]
    }, threadId, type);
  } catch (error) {
    console.error("[viewcode] Lỗi gửi ảnh:", error);
    return api.sendMessage("⚠️ Không gửi được ảnh code.", threadId, type);
  } finally {
    setTimeout(() => {
      fs.unlink(tempPath, () => {});
    }, 60 * 1000);
  }
};
