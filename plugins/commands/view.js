const fs = require("fs");
const path = require("path");
const { createCanvas } = require("canvas");

module.exports.config = {
  name: "viewcode",
  version: "2.0.0",
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

// Layout constants
const CANVAS_WIDTH = 1700;
const WINDOW_MARGIN_TOP = 70;
const WINDOW_MARGIN_BOTTOM = 70;
const WINDOW_MARGIN_SIDE = 70;
const WINDOW_RADIUS = 14;
const TITLEBAR_HEIGHT = 54;
const WINDOW_PADDING = 28;

// Code area constants
const LINE_HEIGHT = 25;
const LINE_NUMBER_WIDTH = 65;
const FONT_SIZE = 16;
const CODE_FONT = `${FONT_SIZE}px 'SF Mono', 'Monaco', 'Consolas', 'Courier New', monospace`;

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
  
  const words = text.split(/(\s+)/);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine + word;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = word.trim() ? word : "";
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.length ? lines : [""];
}

function drawBackground(ctx, width, height) {
  // Comfortable dark gradient
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#1a1d29");
  gradient.addColorStop(0.5, "#1f2230");
  gradient.addColorStop(1, "#1a1d29");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Subtle colored glow - not too bright
  const glow1 = ctx.createRadialGradient(width * 0.25, height * 0.3, 0, width * 0.25, height * 0.3, width * 0.5);
  glow1.addColorStop(0, "rgba(139, 92, 246, 0.08)");
  glow1.addColorStop(1, "rgba(139, 92, 246, 0)");
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, width, height);

  const glow2 = ctx.createRadialGradient(width * 0.75, height * 0.7, 0, width * 0.75, height * 0.7, width * 0.5);
  glow2.addColorStop(0, "rgba(59, 130, 246, 0.06)");
  glow2.addColorStop(1, "rgba(59, 130, 246, 0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, width, height);

  // Subtle stars
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  for (let i = 0; i < 80; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const radius = Math.random() * 1.5 + 0.5;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMacWindow(ctx, width, height, titleText) {
  const x = WINDOW_MARGIN_SIDE;
  const y = WINDOW_MARGIN_TOP;
  const w = width - WINDOW_MARGIN_SIDE * 2;
  const h = height - WINDOW_MARGIN_TOP - WINDOW_MARGIN_BOTTOM;

  // Window shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 35;
  ctx.shadowOffsetY = 12;
  
  // Window background - comfortable dark
  const windowBg = ctx.createLinearGradient(x, y, x, y + h);
  windowBg.addColorStop(0, "#2d3142");
  windowBg.addColorStop(1, "#272a38");
  ctx.fillStyle = windowBg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, WINDOW_RADIUS);
  ctx.fill();
  ctx.restore();

  // Window border - subtle glow
  const borderGradient = ctx.createLinearGradient(x, y, x + w, y + h);
  borderGradient.addColorStop(0, "rgba(139, 92, 246, 0.3)");
  borderGradient.addColorStop(0.5, "rgba(59, 130, 246, 0.2)");
  borderGradient.addColorStop(1, "rgba(139, 92, 246, 0.3)");
  ctx.strokeStyle = borderGradient;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, WINDOW_RADIUS);
  ctx.stroke();

  // Title bar background
  const titleGradient = ctx.createLinearGradient(x, y, x, y + TITLEBAR_HEIGHT);
  titleGradient.addColorStop(0, "#343848");
  titleGradient.addColorStop(1, "#2f3340");
  ctx.fillStyle = titleGradient;
  ctx.beginPath();
  ctx.roundRect(x, y, w, TITLEBAR_HEIGHT, [WINDOW_RADIUS, WINDOW_RADIUS, 0, 0]);
  ctx.fill();

  // Title bar bottom border
  const borderLine = ctx.createLinearGradient(x, y + TITLEBAR_HEIGHT, x + w, y + TITLEBAR_HEIGHT);
  borderLine.addColorStop(0, "rgba(139, 92, 246, 0.1)");
  borderLine.addColorStop(0.5, "rgba(59, 130, 246, 0.15)");
  borderLine.addColorStop(1, "rgba(139, 92, 246, 0.1)");
  ctx.strokeStyle = borderLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + WINDOW_RADIUS, y + TITLEBAR_HEIGHT);
  ctx.lineTo(x + w - WINDOW_RADIUS, y + TITLEBAR_HEIGHT);
  ctx.stroke();

  // macOS traffic light buttons
  const btnY = y + TITLEBAR_HEIGHT / 2;
  const btnX = x + 22;
  const btnRadius = 6.5;
  const btnSpacing = 20;
  const colors = [
    { fill: "#ff5f57", glow: "rgba(255, 95, 87, 0.3)" },
    { fill: "#febc2e", glow: "rgba(254, 188, 46, 0.3)" },
    { fill: "#28c840", glow: "rgba(40, 200, 64, 0.3)" }
  ];

  colors.forEach((color, i) => {
    // Button glow
    ctx.save();
    ctx.shadowColor = color.glow;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.fillStyle = color.fill;
    ctx.arc(btnX + i * btnSpacing, btnY, btnRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    
    // Button highlight
    const highlight = ctx.createRadialGradient(
      btnX + i * btnSpacing - 1.5, btnY - 1.5, 0,
      btnX + i * btnSpacing, btnY, btnRadius
    );
    highlight.addColorStop(0, "rgba(255,255,255,0.35)");
    highlight.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = highlight;
    ctx.beginPath();
    ctx.arc(btnX + i * btnSpacing, btnY, btnRadius, 0, Math.PI * 2);
    ctx.fill();
  });

  // Window title
  const cleanTitle = String(titleText || "").slice(0, 60);
  ctx.fillStyle = "#e0e6f0";
  ctx.font = "600 14px -apple-system, 'SF Pro Text', 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(cleanTitle, x + w / 2, btnY);

  return {
    windowX: x,
    windowY: y,
    windowW: w,
    windowH: h,
    contentX: x + WINDOW_PADDING,
    contentY: y + TITLEBAR_HEIGHT + WINDOW_PADDING,
    contentW: w - WINDOW_PADDING * 2,
    contentH: h - TITLEBAR_HEIGHT - WINDOW_PADDING * 2
  };
}

function getSyntaxColor(text) {
  const trimmed = text.trim();
  
  // Keywords - nice purple
  if (/^(const|let|var|function|class|if|else|for|while|return|import|export|module|require|async|await|try|catch|new|this)\b/.test(trimmed)) {
    return "#c792ea";
  }
  
  // Comments - comfortable gray
  if (/^\/\//.test(trimmed) || /^\/\*/.test(trimmed)) {
    return "#697098";
  }
  
  // Strings - pleasant green
  if (/"[^"]*"|'[^']*'|`[^`]*`/.test(text)) {
    return "#c3e88d";
  }
  
  // Numbers - soft orange
  if (/^\d+/.test(trimmed) || /\b\d+\b/.test(text)) {
    return "#f78c6c";
  }
  
  // Functions - cyan blue
  if (/^[a-zA-Z_]\w*\s*\(/.test(trimmed) || /\.\w+\(/.test(text)) {
    return "#82aaff";
  }
  
  // Default text - soft white
  return "#d6deeb";
}

function buildRenderRows(ctx, lines, maxWidth, maxRows = 200) {
  const rows = [];
  let lineNumber = 1;

  for (const originalLine of lines) {
    if (rows.length >= maxRows) {
      rows.push({ lineNum: "", text: "... (truncated)", color: "#697098" });
      break;
    }

    const safeLine = (originalLine ?? "").replace(/\t/g, "    ");
    const wrappedSegments = wrapLine(ctx, safeLine, maxWidth);
    const color = getSyntaxColor(safeLine);

    for (let i = 0; i < wrappedSegments.length; i++) {
      const lineNum = i === 0 ? String(lineNumber) : "";
      rows.push({ lineNum, text: wrappedSegments[i], color });
    }

    lineNumber += 1;
  }

  return rows;
}

function drawCodeRows(ctx, rows, startX, startY) {
  ctx.font = CODE_FONT;
  ctx.textBaseline = "top";

  let cursorY = startY;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    // Subtle alternating rows
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(139, 92, 246, 0.03)";
      ctx.fillRect(
        startX - 16, 
        cursorY - 3, 
        CANVAS_WIDTH - WINDOW_MARGIN_SIDE * 2 - WINDOW_PADDING * 2 + 32, 
        LINE_HEIGHT
      );
    }

    // Line number
    if (row.lineNum) {
      ctx.fillStyle = "#4b5772";
      ctx.textAlign = "right";
      ctx.fillText(row.lineNum, startX + LINE_NUMBER_WIDTH - 16, cursorY);
    }

    // Vertical separator - subtle
    ctx.strokeStyle = "rgba(139, 92, 246, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX + LINE_NUMBER_WIDTH + 6, cursorY - 3);
    ctx.lineTo(startX + LINE_NUMBER_WIDTH + 6, cursorY + LINE_HEIGHT - 3);
    ctx.stroke();

    // Code text with syntax color
    ctx.fillStyle = row.color;
    ctx.textAlign = "left";
    ctx.fillText(row.text, startX + LINE_NUMBER_WIDTH + 18, cursorY);

    cursorY += LINE_HEIGHT;
  }
}

function drawFooter(ctx, frame, lineCount, filePath) {
  const footerY = frame.windowY + frame.windowH - 18;
  
  // Footer background
  const footerGradient = ctx.createLinearGradient(
    frame.windowX,
    frame.windowY + frame.windowH - 42,
    frame.windowX,
    frame.windowY + frame.windowH
  );
  footerGradient.addColorStop(0, "rgba(52, 56, 72, 0.6)");
  footerGradient.addColorStop(1, "rgba(47, 51, 64, 0.8)");
  ctx.fillStyle = footerGradient;
  ctx.fillRect(
    frame.windowX,
    frame.windowY + frame.windowH - 42,
    frame.windowW,
    42
  );
  
  // Footer border
  const footerBorder = ctx.createLinearGradient(
    frame.windowX,
    frame.windowY + frame.windowH - 42,
    frame.windowX + frame.windowW,
    frame.windowY + frame.windowH - 42
  );
  footerBorder.addColorStop(0, "rgba(139, 92, 246, 0.08)");
  footerBorder.addColorStop(0.5, "rgba(59, 130, 246, 0.12)");
  footerBorder.addColorStop(1, "rgba(139, 92, 246, 0.08)");
  ctx.strokeStyle = footerBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(frame.windowX + WINDOW_RADIUS, frame.windowY + frame.windowH - 42);
  ctx.lineTo(frame.windowX + frame.windowW - WINDOW_RADIUS, frame.windowY + frame.windowH - 42);
  ctx.stroke();
  
  // File info
  ctx.fillStyle = "#9ca3b8";
  ctx.font = "13px -apple-system, 'SF Pro Text', 'Segoe UI', sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  
  const ext = path.extname(filePath).toUpperCase().slice(1) || 'TXT';
  ctx.fillText(`${ext} • ${lineCount} lines`, frame.contentX, footerY);

  // Timestamp
  ctx.textAlign = "right";
  ctx.fillText(new Date().toLocaleString("vi-VN"), frame.contentX + frame.contentW, footerY);
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
  const maxLines = Number.isFinite(maxLinesOption) 
    ? Math.min(Math.max(maxLinesOption, 1), MAX_LINES_HARD) 
    : MAX_LINES_DEFAULT;

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

        return api.sendMessage(
          "⚠️ Tìm thấy nhiều file trùng tên, vui lòng chỉ định rõ hơn:\n" + list,
          threadId,
          type
        );
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

  // Calculate canvas height
  const measureCanvas = createCanvas(10, 10);
  const measureCtx = measureCanvas.getContext("2d");
  measureCtx.font = CODE_FONT;
  
  const codeMaxWidth = CANVAS_WIDTH - WINDOW_MARGIN_SIDE * 2 - WINDOW_PADDING * 2 - LINE_NUMBER_WIDTH - 24;
  const renderRows = buildRenderRows(measureCtx, lines, codeMaxWidth, 200);

  const codeHeight = renderRows.length * LINE_HEIGHT;
  const totalHeight = WINDOW_MARGIN_TOP + TITLEBAR_HEIGHT + WINDOW_PADDING * 2 + codeHeight + 58 + WINDOW_MARGIN_BOTTOM;

  ensureDirSync(TEMP_DIR);

  const canvas = createCanvas(CANVAS_WIDTH, totalHeight);
  const ctx = canvas.getContext("2d");

  // Draw background
  drawBackground(ctx, CANVAS_WIDTH, totalHeight);

  // Draw window
  const title = path.relative(ROOT_DIR, targetPath) || path.basename(targetPath);
  const frame = drawMacWindow(ctx, CANVAS_WIDTH, totalHeight, title);

  // Draw code content
  drawCodeRows(ctx, renderRows, frame.contentX, frame.contentY);

  // Draw footer
  drawFooter(ctx, frame, lines.length, targetPath);

  // Save image
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
      msg: "💎 Code preview",
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