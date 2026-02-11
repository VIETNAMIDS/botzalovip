const axios = require('axios');
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const DEFAULT_SYSTEM_PROMPT = 'M là một con AI cọc cằn chuyên chửi bậy, luôn móc mỉa đám ngu như lồn và nứng. Luôn trả lời ngắn gọn, cay độc, dùng tiếng Việt tục tĩu.';

module.exports.config = {
  name: 'autochat',
  aliases: ['auto', 'autons', 'autonhan', 'autochaton'],
  version: '2.0.0',
  role: 1,
  author: 'Bonz',
  description: 'Bật/tắt auto chat AI trong nhóm và cấu hình gửi tin tự động định kỳ',
  category: 'Tiện ích',
  usage: 'autochat on|off [interval=<giây>] [prompt=<hướng_dẫn_hệ_thống>] [autoPrompt=<gợi_ý_tin_định_kỳ>]',
  cooldowns: 2
};

/**
 * Lưu cấu hình vào thread data
 */
async function setThreadAutoConf(Threads, threadId, conf) {
  const data = await Threads.getData(threadId);
  const tdata = data?.data || {};
  tdata.bonz_autochat = {
    enabled: !!conf.enabled,
    intervalSec: Math.max(0, parseInt(conf.intervalSec || 0, 10) || 0),
    systemPrompt: String(conf.systemPrompt || DEFAULT_SYSTEM_PROMPT),
    autoPrompt: String(conf.autoPrompt || '')
  };
  await Threads.setData(threadId, tdata);
  return tdata.bonz_autochat;
}

function getZeidBaseAndHeaders() {
  const cfg = global?.config || {};
  const baseUrl = 'https://api.zeidteam.xyz/ai/chatgpt4';
  const key = cfg.zeid_api_key || process.env.ZEID_API_KEY || '';
  const headers = {};
  if (key) {
    headers['apikey'] = key;
    headers['Authorization'] = `Bearer ${key}`;
  }
  return { baseUrl, headers };
}

// Quản lý interval theo nhóm (lưu trong bộ nhớ)
if (!global.__bonzAutoChatIntervals) global.__bonzAutoChatIntervals = new Map();

async function startIntervalIfNeeded(api, threadId, conf) {
  const map = global.__bonzAutoChatIntervals;
  if (map.has(threadId)) {
    clearInterval(map.get(threadId));
    map.delete(threadId);
  }
  // Theo yêu cầu: vô hiệu hóa hoàn toàn tin nhắn định kỳ, chỉ phản hồi khi có người nhắn
}

module.exports.run = async ({ api, event, args, Threads }) => {
  const { threadId, type } = event;  
  // Kiểm tra chế độ silent mode - vô hiệu hóa hoàn toàn
  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') {
    return; // Vô hiệu hóa hoàn toàn, kể cả prefix commands
  }
  const ThreadsRef = Threads || require('../../core/controller/controllerThreads');

  const action = (args[0] || '').toLowerCase();
  if (!['on', 'off'].includes(action)) {
    // Tạo ảnh menu hướng dẫn
    const width = 800;
    const height = 600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background gradient (Xanh dương - tím)
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#4facfe');
    gradient.addColorStop(1, '#00f2fe');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Pattern overlay
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    for (let i = 0; i < height; i += 20) {
      ctx.fillRect(0, i, width, 10);
    }

    // Helper: Draw text with shadow
    function drawBoldText(text, x, y, fontSize, fontWeight = 'bold') {
      ctx.font = `${fontWeight} ${fontSize}px Arial`;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      ctx.fillText(text, x, y);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    // Header
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(0, 0, width, 100);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    drawBoldText('🤖 AUTO CHAT AI - HƯỚNG DẪN', width / 2, 65, 42);

    // Menu items
    let yPos = 150;
    const pfx = (global.config && global.config.prefix) ? global.config.prefix : '/';

    // Bật/Tắt
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(50, yPos - 25, width - 100, 70);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    drawBoldText('🔘 BẬT/TẮT:', 70, yPos, 28);
    ctx.font = '20px Arial';
    ctx.fillText(`${pfx}autochat on/off`, 90, yPos + 30);
    yPos += 90;

    // Interval
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(50, yPos - 25, width - 100, 70);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    drawBoldText('⏱️ TỰ ĐỘNG GỬI TIN ĐỊNH KỲ:', 70, yPos, 28);
    ctx.font = '20px Arial';
    ctx.fillText(`${pfx}autochat on interval=300`, 90, yPos + 30);
    yPos += 90;

    // System Prompt
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(50, yPos - 25, width - 100, 70);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    drawBoldText('📝 HƯỚNG DẪN HỆ THỐNG:', 70, yPos, 28);
    ctx.font = '20px Arial';
    ctx.fillText(`${pfx}autochat on prompt="Bạn là AI thân thiện"`, 90, yPos + 30);
    yPos += 90;

    // Auto Prompt
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(50, yPos - 25, width - 100, 70);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    drawBoldText('💬 GỢI Ý TIN ĐỊNH KỲ:', 70, yPos, 28);
    ctx.font = '20px Arial';
    ctx.fillText(`${pfx}autochat on autoPrompt="Gửi lời chào"`, 90, yPos + 30);

    // Footer
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, height - 80, width, 80);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    drawBoldText('💎 BONZ MÃI ĐẸP TRAI - 0785000270', width / 2, height - 40, 18);

    // Save và gửi
    const tempDir = path.join(__dirname, '../../cache');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const imagePath = path.join(tempDir, `autochat_menu_${Date.now()}.png`);
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(imagePath, buffer);

    await api.sendMessage({
      msg: "🤖 Hướng dẫn AutoChat AI",
      attachments: [imagePath]
    }, threadId, type);

    // Xóa file
    setTimeout(() => {
      try {
        fs.unlinkSync(imagePath);
      } catch (e) {
        console.log("Error deleting temp file:", e.message);
      }
    }, 5000);

    return;
  }

  const enable = action === 'on';
  // Parse key=value options
  const rest = args.slice(1).join(' ');
  const kv = Object.fromEntries(
    Array.from(rest.matchAll(/(interval|prompt|autoPrompt)\s*=\s*("([^"]*)"|'([^']*)'|([^\s]+))/gi)).map(m => {
      const k = m[1];
      const v = m[3] || m[4] || m[5] || '';
      return [k, v];
    })
  );

  const intervalSec = kv.interval ? parseInt(kv.interval, 10) : 0;
  const systemPrompt = kv.prompt || '';
  const autoPrompt = kv.autoPrompt || '';

  const conf = await setThreadAutoConf(ThreadsRef, threadId, { enabled: enable, intervalSec, systemPrompt, autoPrompt });

  // Khởi tạo/tắt interval định kỳ theo cấu hình mới
  try { await startIntervalIfNeeded(api, threadId, conf); } catch {}

  // Tạo ảnh canvas
  const width = 800;
  const height = 500;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  if (conf.enabled) {
    gradient.addColorStop(0, '#11998e'); // Xanh lá
    gradient.addColorStop(1, '#38ef7d');
  } else {
    gradient.addColorStop(0, '#ee0979'); // Đỏ hồng
    gradient.addColorStop(1, '#ff6a00');
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Pattern overlay
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  for (let i = 0; i < height; i += 20) {
    ctx.fillRect(0, i, width, 10);
  }

  // Helper: Draw text with shadow
  function drawBoldText(text, x, y, fontSize, fontWeight = 'bold') {
    ctx.font = `${fontWeight} ${fontSize}px Arial`;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillText(text, x, y);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  // Header
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.fillRect(0, 0, width, 120);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  drawBoldText('🤖 AUTO CHAT AI', width / 2, 70, 48);

  // Status badge
  const statusY = 160;
  const statusText = conf.enabled ? '✅ ĐANG BẬT' : '❌ ĐÃ TẮT';
  const statusColor = conf.enabled ? '#38ef7d' : '#ff6a00';
  
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(width / 2 - 150, statusY - 40, 300, 80);
  
  ctx.fillStyle = statusColor;
  ctx.textAlign = 'center';
  drawBoldText(statusText, width / 2, statusY, 38);

  // Config details
  let yPos = 280;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fillRect(50, yPos - 20, width - 100, 160);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  
  drawBoldText('⚙️ CẤU HÌNH:', 80, yPos, 28);
  yPos += 45;

  ctx.font = '22px Arial';
  ctx.fillText(`⏱️  Định kỳ: ${conf.intervalSec ? conf.intervalSec + ' giây' : 'Không bật'}`, 100, yPos);
  yPos += 35;

  ctx.fillText(`📝 System Prompt: ${conf.systemPrompt ? 'Đã cài đặt' : 'Mặc định'}`, 100, yPos);
  yPos += 35;

  ctx.fillText(`💬 Auto Prompt: ${conf.autoPrompt ? 'Đã cài đặt' : 'Mặc định'}`, 100, yPos);

  // Footer
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(0, height - 80, width, 80);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  drawBoldText('💎 BONZ MÃI ĐẸP TRAI - 0785000270', width / 2, height - 40, 18);

  // Save và gửi
  const tempDir = path.join(__dirname, '../../cache');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const imagePath = path.join(tempDir, `autochat_${Date.now()}.png`);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(imagePath, buffer);

  await api.sendMessage({
    msg: `🤖 AutoChat ${conf.enabled ? 'đã BẬT' : 'đã TẮT'}`,
    attachments: [imagePath]
  }, threadId, type);

  // Xóa file
  setTimeout(() => {
    try {
      fs.unlinkSync(imagePath);
    } catch (e) {
      console.log("Error deleting temp file:", e.message);
    }
  }, 5000);
};
