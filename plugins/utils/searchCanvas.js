const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const { loadImageBuffer } = require('./imageUtil');

const TEMP_DIR = path.join(process.cwd(), 'temp', 'canvas');

function formatNumber(value) {
  if (!Number.isFinite(value)) return null;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function loadThumbnail(thumbnailUrl) {
  if (!thumbnailUrl) return null;
  try {
    const buffer = await loadImageBuffer(thumbnailUrl);
    if (!buffer) return null;
    return await loadImage(buffer);
  } catch (error) {
    console.warn('[searchCanvas] Không tải được ảnh:', error?.message || error);
    return null;
  }
}

async function createSearchResultImage(songs = [], options = {}) {
  if (!Array.isArray(songs) || songs.length === 0) return null;

  const template = String(options.template || '').toLowerCase();
  if (template === 'zing' || template === 'zing_ui' || template === 'zingui') {
    const list = songs.slice(0, 10);
    await fs.promises.mkdir(TEMP_DIR, { recursive: true });

    const WIDTH = Number.isFinite(Number(options.width)) ? Number(options.width) : 1400;
    const cols = 2;
    const rows = Math.min(5, Math.max(1, Math.ceil(list.length / cols)));
    const HEIGHT = Number.isFinite(Number(options.height))
      ? Number(options.height)
      : (rows >= 5 ? 860 : (rows >= 4 ? 740 : 620));
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    bg.addColorStop(0, '#06121b');
    bg.addColorStop(0.45, '#101826');
    bg.addColorStop(1, '#2a1142');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    try {
      const blob1 = ctx.createRadialGradient(WIDTH * 0.2, HEIGHT * 0.25, 20, WIDTH * 0.2, HEIGHT * 0.25, Math.min(WIDTH, HEIGHT) * 0.65);
      blob1.addColorStop(0, 'rgba(98, 255, 228, 0.20)');
      blob1.addColorStop(1, 'rgba(98, 255, 228, 0)');
      ctx.fillStyle = blob1;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      const blob2 = ctx.createRadialGradient(WIDTH * 0.85, HEIGHT * 0.5, 20, WIDTH * 0.85, HEIGHT * 0.5, Math.min(WIDTH, HEIGHT) * 0.75);
      blob2.addColorStop(0, 'rgba(170, 90, 255, 0.25)');
      blob2.addColorStop(1, 'rgba(170, 90, 255, 0)');
      ctx.fillStyle = blob2;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    } catch {}

    const outerMargin = 36;
    const sidebarW = 260;
    const panelX = outerMargin + sidebarW + 26;
    const panelW = WIDTH - panelX - outerMargin;
    const panelY = outerMargin;
    const panelH = HEIGHT - outerMargin * 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 30;
    drawRoundedRect(ctx, outerMargin, outerMargin, sidebarW, panelH, 22);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.stroke();
    ctx.restore();

    const avatarSize = 168;
    const avatarX = outerMargin + Math.floor((sidebarW - avatarSize) / 2);
    const avatarY = outerMargin + 36;
    const avatarSrc = options.avatar || options.avatarUrl || options.avatarPath;
    const avatarImg = await loadThumbnail(avatarSrc);
    ctx.save();
    drawRoundedRect(ctx, avatarX, avatarY, avatarSize, avatarSize, 28);
    ctx.clip();
    if (avatarImg) {
      ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    }
    ctx.restore();

    const buttonText = options.buttonText || options.brandText || 'NhacCuaTui';
    ctx.save();
    ctx.font = '700 22px "Segoe UI", sans-serif';
    const btnW = Math.min(sidebarW - 52, Math.max(150, ctx.measureText(buttonText).width + 54));
    const btnH = 54;
    const btnX = outerMargin + Math.floor((sidebarW - btnW) / 2);
    const btnY = outerMargin + panelH - 90;
    drawRoundedRect(ctx, btnX, btnY, btnW, btnH, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fill();
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(buttonText, btnX + btnW / 2, btnY + btnH / 2 + 1);
    ctx.restore();

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 30;
    drawRoundedRect(ctx, panelX, panelY, panelW, panelH, 22);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.stroke();
    ctx.restore();

    const rowGap = 18;
    const colGap = 20;
    const padding = 22;
    const cellW = Math.floor((panelW - padding * 2 - colGap) / cols);
    const cellH = Math.floor((panelH - padding * 2 - rowGap * (rows - 1)) / rows);

    for (let i = 0; i < list.length; i++) {
      const item = list[i] || {};
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = panelX + padding + c * (cellW + colGap);
      const y = panelY + padding + r * (cellH + rowGap);

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.40)';
      ctx.shadowBlur = 22;
      drawRoundedRect(ctx, x, y, cellW, cellH, 18);
      const cardBg = ctx.createLinearGradient(x, y, x + cellW, y + cellH);
      cardBg.addColorStop(0, 'rgba(40, 255, 200, 0.10)');
      cardBg.addColorStop(1, 'rgba(255, 92, 197, 0.08)');
      ctx.fillStyle = cardBg;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.stroke();
      ctx.restore();

      const artSize = Math.min(58, cellH - 26);
      const artX = x + 18;
      const artY = y + Math.floor((cellH - artSize) / 2);
      const thumb = await loadThumbnail(item.thumbnailM || item.thumbnail);
      ctx.save();
      drawRoundedRect(ctx, artX, artY, artSize, artSize, 12);
      ctx.clip();
      if (thumb) ctx.drawImage(thumb, artX, artY, artSize, artSize);
      else {
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(artX, artY, artSize, artSize);
      }
      ctx.restore();

      const textX = artX + artSize + 14;
      const maxW = x + cellW - 64 - textX;
      const title = String(item.title || 'Không rõ');
      const artist = String(item.artistsNames || item.artist || 'Không rõ');
      const duration = Number(item.duration);
      const timeText = (Number.isFinite(duration) && duration > 0)
        ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}`
        : '';

      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = '700 22px "Segoe UI", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      let t = title;
      while (ctx.measureText(t).width > maxW && t.length > 0) t = t.slice(0, -1);
      ctx.fillText(t, textX, y + 18);

      ctx.fillStyle = 'rgba(255,255,255,0.70)';
      ctx.font = '16px "Segoe UI", sans-serif';
      let a = artist;
      while (ctx.measureText(a).width > maxW && a.length > 0) a = a.slice(0, -1);
      ctx.fillText(`${a}${timeText ? ` | ${timeText}` : ''}`, textX, y + 48);
      ctx.restore();

      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.font = '600 20px "Segoe UI", sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), x + cellW - 18, y + Math.floor(cellH / 2));
      ctx.restore();
    }

    const filePath = path.join(TEMP_DIR, `search_${Date.now()}.png`);
    await fs.promises.writeFile(filePath, canvas.toBuffer('image/png'));
    return filePath;
  }

  await fs.promises.mkdir(TEMP_DIR, { recursive: true });

  const WIDTH = Number.isFinite(Number(options.width)) ? Number(options.width) : 1500;
  const margin = 56;
  const gap = 22;
  const layout = String(options.layout || '').toLowerCase();
  const isListLayout = layout === 'list' || layout === 'glass_list' || layout === 'glasslist';

  const desiredCardWidth = Number.isFinite(Number(options.cardWidth)) ? Number(options.cardWidth) : (isListLayout ? 640 : 360);
  const rowHeight = Number.isFinite(Number(options.rowHeight)) ? Number(options.rowHeight) : (isListLayout ? 140 : 190);

  const defaultColumns = isListLayout ? 2 : null;
  const perRow = Number.isFinite(Number(options.columns))
    ? Math.max(1, Math.min(songs.length, Number(options.columns)))
    : (Number.isFinite(defaultColumns) ? defaultColumns : Math.max(1, Math.min(songs.length, Math.floor((WIDTH - margin * 2 + gap) / (desiredCardWidth + gap)))));

  const cardWidth = Math.floor((WIDTH - margin * 2 - (perRow - 1) * gap) / perRow);
  const rows = Math.ceil(songs.length / perRow);
  const headerHeight = 74;
  const HEIGHT = margin + headerHeight + rows * rowHeight + (rows - 1) * gap + margin;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // pastel background
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, '#06121b');
  bg.addColorStop(0.45, '#101826');
  bg.addColorStop(1, '#2a1142');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  try {
    const blob1 = ctx.createRadialGradient(WIDTH * 0.18, HEIGHT * 0.2, 20, WIDTH * 0.18, HEIGHT * 0.2, Math.min(WIDTH, HEIGHT) * 0.55);
    blob1.addColorStop(0, 'rgba(98, 255, 228, 0.18)');
    blob1.addColorStop(1, 'rgba(98, 255, 228, 0)');
    ctx.fillStyle = blob1;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const blob2 = ctx.createRadialGradient(WIDTH * 0.85, HEIGHT * 0.35, 20, WIDTH * 0.85, HEIGHT * 0.35, Math.min(WIDTH, HEIGHT) * 0.65);
    blob2.addColorStop(0, 'rgba(170, 90, 255, 0.22)');
    blob2.addColorStop(1, 'rgba(170, 90, 255, 0)');
    ctx.fillStyle = blob2;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  } catch {}

  // header
  const headerText = options.title || 'Danh sách kết quả';
  ctx.font = '700 36px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(headerText, margin, margin - 10);

  // optional small heart
  function drawHeart(x, y, size = 12, color = '#ff6fae') {
    const s = size / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, s);
    ctx.bezierCurveTo(0, s - s * 0.9, -s, s - s * 0.9, -s, 0);
    ctx.bezierCurveTo(-s, -s, 0, -s, 0, -s / 2);
    ctx.bezierCurveTo(0, -s, s, -s, s, 0);
    ctx.bezierCurveTo(s, s - s * 0.9, 0, s - s * 0.9, 0, s);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }
  try { drawHeart(margin + ctx.measureText(headerText).width + 68, margin + 8, 18, 'rgba(255, 94, 182, 0.9)'); } catch {}

  const thumbDefault = isListLayout ? 96 : 140;

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i] || {};
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const x = margin + col * (cardWidth + gap);
    const y = margin + headerHeight + row * (rowHeight + gap);

    // card
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 24;
    drawRoundedRect(ctx, x, y, cardWidth, rowHeight, 18);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // index badge
    const badgeX = x + 18;
    const badgeY = y + 22;
    const badgeRadius = 20;
    const badgeGradient = ctx.createLinearGradient(badgeX - badgeRadius, badgeY - badgeRadius, badgeX + badgeRadius, badgeY + badgeRadius);
    badgeGradient.addColorStop(0, 'rgba(132, 255, 234, 0.95)');
    badgeGradient.addColorStop(1, 'rgba(255, 92, 197, 0.92)');
    ctx.fillStyle = badgeGradient;
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#06121b';
    ctx.font = 'bold 18px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), badgeX, badgeY);

    // thumbnail
    const thumbSize = isListLayout ? Math.min(thumbDefault, Math.max(88, rowHeight - 44)) : Math.min(thumbDefault, Math.max(100, cardWidth - 120));
    const thumbX = x + 20;
    const thumbY = isListLayout ? (y + Math.floor((rowHeight - thumbSize) / 2)) : (y + 52);
    ctx.save();
    drawRoundedRect(ctx, thumbX, thumbY, thumbSize, thumbSize, 12);
    ctx.clip();
    const image = await loadThumbnail(song.thumbnailM || song.thumbnail);
    if (image) ctx.drawImage(image, thumbX, thumbY, thumbSize, thumbSize);
    else {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(thumbX, thumbY, thumbSize, thumbSize);
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.font = 'bold 14px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No Art', thumbX + thumbSize / 2, thumbY + thumbSize / 2);
    }
    ctx.restore();

    // title & artists
    const textX = thumbX + thumbSize + 16;
    const maxTextWidth = x + cardWidth - 24 - textX;
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.font = '700 18px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let title = song.title || 'Không rõ';
    while (ctx.measureText(title).width > maxTextWidth) title = `${title.slice(0, -1)}`;
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 10;
    const titleY = isListLayout ? (y + 22) : (thumbY - 4);
    ctx.fillText(title, textX, titleY);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(255,255,255,0.70)';
    ctx.font = '14px "Segoe UI", sans-serif';
    const artists = song.artistsNames || song.artist || 'Không rõ';
    const artistY = isListLayout ? (titleY + 26) : (thumbY + 26);
    ctx.fillText(artists, textX, artistY);

    const sourceText = song.source || song.platform || song.provider;
    if (sourceText) {
      const pillText = String(sourceText).toUpperCase();
      ctx.font = '700 12px "Segoe UI", sans-serif';
      const pillW = Math.min(160, Math.max(52, ctx.measureText(pillText).width + 18));
      const pillH = 22;
      const pillX = x + cardWidth - 18 - pillW;
      const pillY = y + 16;
      ctx.save();
      drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 999);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.86)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pillText, pillX + pillW / 2, pillY + pillH / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
    }

    const stats = [];
    const duration = Number(song.duration);
    if (Number.isFinite(duration) && duration > 0) {
      const minutes = Math.floor(duration / 60);
      const seconds = String(Math.floor(duration % 60)).padStart(2, '0');
      stats.push(`${minutes}:${seconds}`);
    }
    const listen = formatNumber(song.listen);
    if (listen) stats.push(`${listen} lượt nghe`);
    const like = formatNumber(song.like);
    if (like) stats.push(`${like} lượt thích`);
    if (stats.length) {
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.font = '13px "Segoe UI", sans-serif';
      const statsY = isListLayout ? (artistY + 24) : (thumbY + 56);
      ctx.fillText(stats.join(' • '), textX, statsY);
    }

    // decorative hearts
    try {
      const decoColors = ['rgba(132,255,234,0.20)', 'rgba(255,255,255,0.08)', 'rgba(255,92,197,0.16)', 'rgba(120,160,255,0.14)'];
      for (let d = 0; d < 3; d++) {
        const hx = x + cardWidth - 24 - d * 22;
        const hy = y + 28 + (d % 2) * 12;
        ctx.beginPath();
        ctx.fillStyle = decoColors[d % decoColors.length];
        ctx.arc(hx, hy, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    } catch (e) {}
  }

  const filePath = path.join(TEMP_DIR, `search_${Date.now()}.png`);
  await fs.promises.writeFile(filePath, canvas.toBuffer('image/png'));
  return filePath;
}

async function createNowPlayingImage(data = {}, options = {}) {
  await fs.promises.mkdir(TEMP_DIR, { recursive: true });

  const WIDTH = Number.isFinite(Number(options.width)) ? Number(options.width) : 1200;
  const HEIGHT = Number.isFinite(Number(options.height)) ? Number(options.height) : 360;
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const title = String(data.title || '').trim() || 'Không rõ';
  const artist = String(data.artist || data.artistsNames || '').trim() || 'Không rõ';
  const platform = String(data.platform || data.source || '').trim() || '';
  const duration = Number(data.duration);
  const durationText = (Number.isFinite(duration) && duration > 0)
    ? `${String(Math.floor(duration / 60)).padStart(2, '0')}:${String(Math.floor(duration % 60)).padStart(2, '0')}`
    : '';

  const artwork = await loadThumbnail(data.thumbnailM || data.thumbnail || data.artwork);

  if (artwork) {
    ctx.save();
    ctx.filter = 'blur(24px)';
    const scale = Math.max(WIDTH / artwork.width, HEIGHT / artwork.height);
    const w = artwork.width * scale;
    const h = artwork.height * scale;
    const x = (WIDTH - w) / 2;
    const y = (HEIGHT - h) / 2;
    ctx.drawImage(artwork, x, y, w, h);
    ctx.restore();
  } else {
    const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    bg.addColorStop(0, '#06121b');
    bg.addColorStop(0.5, '#101826');
    bg.addColorStop(1, '#2a1142');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  const overlay = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  overlay.addColorStop(0, 'rgba(0,0,0,0.60)');
  overlay.addColorStop(0.5, 'rgba(0,0,0,0.35)');
  overlay.addColorStop(1, 'rgba(0,0,0,0.62)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  try {
    const glow = ctx.createRadialGradient(WIDTH * 0.78, HEIGHT * 0.35, 20, WIDTH * 0.78, HEIGHT * 0.35, Math.min(WIDTH, HEIGHT) * 0.75);
    glow.addColorStop(0, 'rgba(170, 90, 255, 0.22)');
    glow.addColorStop(1, 'rgba(170, 90, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  } catch {}

  const margin = 36;
  const coverSize = Math.min(260, HEIGHT - margin * 2);
  const coverX = margin;
  const coverY = Math.floor((HEIGHT - coverSize) / 2);

  ctx.save();
  drawRoundedRect(ctx, coverX, coverY, coverSize, coverSize, 28);
  ctx.clip();
  if (artwork) {
    ctx.drawImage(artwork, coverX, coverY, coverSize, coverSize);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(coverX, coverY, coverSize, coverSize);
  }
  ctx.restore();

  const contentX = coverX + coverSize + 34;
  const contentW = WIDTH - contentX - margin;

  if (platform) {
    ctx.save();
    const pillText = platform;
    ctx.font = '700 22px "Segoe UI", sans-serif';
    const pillW = Math.min(320, Math.max(160, ctx.measureText(pillText).width + 56));
    const pillH = 48;
    const pillX = contentX + Math.max(0, (contentW - pillW) / 2);
    const pillY = margin - 6;
    drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 999);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pillText, pillX + pillW / 2, pillY + pillH / 2 + 1);
    ctx.restore();
  }

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const titleY = margin + 70;
  ctx.font = '800 56px "Segoe UI", sans-serif';
  const grad = ctx.createLinearGradient(contentX, titleY, contentX + Math.min(520, contentW), titleY + 10);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.5, 'rgba(180, 255, 240, 0.92)');
  grad.addColorStop(1, 'rgba(255, 160, 230, 0.92)');
  ctx.fillStyle = grad;
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 16;

  let t = title;
  while (ctx.measureText(t).width > contentW && t.length > 0) t = t.slice(0, -1);
  ctx.fillText(t, contentX, titleY);
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(255,255,255,0.70)';
  ctx.font = '32px "Segoe UI", sans-serif';
  let a = artist;
  while (ctx.measureText(a).width > contentW && a.length > 0) a = a.slice(0, -1);
  ctx.fillText(a, contentX, titleY + 74);

  if (durationText) {
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = '28px "Segoe UI", sans-serif';
    ctx.fillText(durationText, contentX, titleY + 118);
  }

  ctx.restore();

  const filePath = path.join(TEMP_DIR, `nowplaying_${Date.now()}.png`);
  await fs.promises.writeFile(filePath, canvas.toBuffer('image/png'));
  return filePath;
}

module.exports = {
  createSearchResultImage,
  createNowPlayingImage,
};
