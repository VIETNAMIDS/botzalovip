module.exports.config = {
  name: "finelenh",
  aliases: ["timlenh", "findlenh", "findcmd"],
  version: "1.0.0",
  role: 0,
  author: "Cascade",
  description: "Tìm lệnh của bot theo từ khóa (tên/alias/mô tả)",
  category: "Tiện ích",
  usage: "finelenh <từ_khóa>",
  cooldowns: 2
};

const fs = require("fs");
const path = require("path");
let createCanvas = null;
try {
  ({ createCanvas } = require("canvas"));
} catch {
  createCanvas = null;
}

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .trim();
}

function normalizeTextForSearch(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s) {
  const t = normalizeTextForSearch(s);
  if (!t) return [];
  return t.split(" ").filter(Boolean);
}

function getRoleLabel(role) {
  const r = Number(role);
  if (r === 2) return "admin bot";
  if (r === 1) return "admin box";
  return "user";
}

function getCommands() {
  const cmds = global?.client?.commands;
  if (!cmds) return [];
  if (cmds instanceof Map) return Array.from(cmds.values());
  if (Array.isArray(cmds)) return cmds;
  return [];
}

function ensureTempDir() {
  const dir = path.join(__dirname, "temp");
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
  return dir;
}

function renderResultImage({ keyword, results, prefix }) {
  if (typeof createCanvas !== "function") return null;

  const width = 1280;
  const padding = 56;
  const headerHeight = 210;
  const footerHeight = 90;
  const rowHeight = 74;
  const rows = Math.min(results.length, 25);
  const height = headerHeight + rows * rowHeight + footerHeight;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const roundRect = (x, y, w, h, r) => {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  };

  const clampText = (text, maxWidth) => {
    const t = String(text || "");
    if (!t) return "";
    if (ctx.measureText(t).width <= maxWidth) return t;
    let lo = 0;
    let hi = t.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const candidate = `${t.slice(0, mid)}...`;
      if (ctx.measureText(candidate).width <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return `${t.slice(0, Math.max(0, lo))}...`;
  };

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#0B1220");
  bg.addColorStop(0.5, "#111B2E");
  bg.addColorStop(1, "#0B1220");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#60A5FA";
  ctx.beginPath();
  ctx.arc(width - 160, 140, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#F472B6";
  ctx.beginPath();
  ctx.arc(180, height - 140, 140, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  roundRect(padding - 20, 30, width - (padding - 20) * 2, height - 60, 26);
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fill();

  const header = ctx.createLinearGradient(0, 0, width, 0);
  header.addColorStop(0, "rgba(59,130,246,0.35)");
  header.addColorStop(0.5, "rgba(147,51,234,0.28)");
  header.addColorStop(1, "rgba(236,72,153,0.28)");
  roundRect(padding - 10, 50, width - (padding - 10) * 2, headerHeight - 60, 22);
  ctx.fillStyle = header;
  ctx.fill();

  ctx.fillStyle = "#F9FAFB";
  ctx.font = "bold 54px Arial";
  ctx.fillText("FIND LỆNH", padding + 16, 120);

  ctx.font = "24px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  const keywordLabel = `Từ khóa: ${keyword}`;
  ctx.fillText(clampText(keywordLabel, width - padding * 2 - 40), padding + 16, 162);

  ctx.font = "22px Arial";
  ctx.fillStyle = "rgba(167,243,208,0.95)";
  ctx.fillText(`Kết quả: ${results.length} • Hiển thị: ${rows}`, padding + 16, 194);

  const listStartY = headerHeight + 40;
  const cardW = width - padding * 2;
  for (let i = 0; i < rows; i++) {
    const r = results[i];
    const y = listStartY + i * rowHeight;
    const cardX = padding;
    const cardY = y;
    const cardH = rowHeight - 14;

    roundRect(cardX, cardY, cardW, cardH, 18);
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.045)";
    ctx.fill();

    ctx.fillStyle = i % 2 === 0 ? "#60A5FA" : "#F472B6";
    roundRect(cardX, cardY, 10, cardH, 10);
    ctx.fill();

    ctx.font = "bold 24px Arial";
    ctx.fillStyle = "rgba(249,250,251,0.95)";
    ctx.fillText(String(i + 1).padStart(2, "0"), cardX + 22, cardY + 34);

    const als = r.aliases.length ? ` • alias: ${r.aliases.join(", ")}` : "";
    const role = getRoleLabel(r.role);
    const leftText = `${prefix}${r.name}  [${role}]`;
    const rightText = `${als}${r.description ? ` • ${r.description}` : ""}`;

    ctx.font = "bold 26px Arial";
    ctx.fillStyle = "#F9FAFB";
    const maxMainW = cardW - 160;
    ctx.fillText(clampText(leftText, maxMainW), cardX + 92, cardY + 36);

    ctx.font = "22px Arial";
    ctx.fillStyle = "rgba(226,232,240,0.9)";
    const maxSubW = cardW - 120;
    ctx.fillText(clampText(rightText.trim(), maxSubW), cardX + 92, cardY + 62);
  }

  ctx.font = "20px Arial";
  ctx.fillStyle = "rgba(203,213,225,0.9)";
  const footer = "Gợi ý: hãy gõ từ khóa cụ thể hơn để lọc nhanh • ví dụ: finelenh anti link";
  ctx.fillText(clampText(footer, width - padding * 2), padding, height - 34);

  const buffer = canvas.toBuffer("image/png");
  const dir = ensureTempDir();
  const outPath = path.join(dir, `finelenh_${Date.now()}.png`);
  fs.writeFileSync(outPath, buffer);
  return outPath;
}

module.exports.run = async function ({ api, event, args = [] }) {
  const { threadId, type } = event;

  const keywordRaw = args.join(" ");
  const keyword = normalize(keywordRaw);
  if (!keyword) {
    return api.sendMessage("❌ Nhập từ khóa cần tìm. Ví dụ: finelenh sticker", threadId, type);
  }

  const keywordTokens = tokenize(keywordRaw);

  const all = getCommands();
  const matched = all
    .map((cmd) => {
      const config = cmd?.config || cmd?.module?.config || {};
      const name = config.name || cmd?.name || "";
      const aliases = Array.isArray(config.aliases) ? config.aliases : [];
      const desc = config.description || "";
      const role = config.role;

      const hayRaw = [name, aliases.join(" "), desc].join(" | ");
      const hay = normalizeTextForSearch(hayRaw);
      const ok = keywordTokens.length
        ? keywordTokens.every((t) => hay.includes(t))
        : hay.includes(normalizeTextForSearch(keywordRaw));

      return ok
        ? {
            name: String(name),
            aliases: aliases.map(String),
            description: String(desc || ""),
            role
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!matched.length) {
    return api.sendMessage(`ℹ️ Không tìm thấy lệnh nào khớp với: ${keyword}`, threadId, type);
  }

  const prefix = typeof global?.config?.prefix === "string" ? global.config.prefix : "";
  const top = matched.slice(0, 25);
  const lines = top.map((x, i) => {
    const als = x.aliases.length ? ` (alias: ${x.aliases.join(", ")})` : "";
    const role = getRoleLabel(x.role);
    const desc = x.description ? ` - ${x.description}` : "";
    return `${i + 1}. ${prefix}${x.name}${als} [${role}]${desc}`;
  });

  if (matched.length > top.length) {
    lines.push(`... còn ${matched.length - top.length} kết quả khác (hãy thêm từ khóa cụ thể hơn).`);
  }

  const imgPath = renderResultImage({ keyword, results: matched, prefix });
  if (imgPath) {
    try {
      const sent = await api.sendMessage(
        {
          msg: `🔎 Kết quả tìm lệnh: ${matched.length}`,
          attachments: [imgPath]
        },
        threadId,
        type
      );
      setTimeout(() => {
        try { fs.unlinkSync(imgPath); } catch (_) {}
      }, 60000);
      return sent;
    } catch (_) {
      try { fs.unlinkSync(imgPath); } catch (_) {}
    }
  }

  return api.sendMessage([`🔎 Kết quả tìm lệnh: ${matched.length}`, ...lines].join("\n"), threadId, type);
};
