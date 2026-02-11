const os = require('os');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const { createCanvas } = require('canvas');

module.exports.config = {
  name: 'upt',
  version: '3.0.0',
  role: 0,
  author: 'ShinTHL09, GwenDev - Enhanced by Cascade',
  description: 'Hiển thị thời gian hoạt động của bot bằng Canvas đẹp',
  category: 'Hệ thống',
  usage: 'upt',
  cooldowns: 2,
  dependencies: {
    "canvas": ""
  }
};

const CACHE_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function getIpAddress() {
  return '127.0.0.1';
}

function getSystemRAMUsage() {
  const total = os.totalmem();
  const free = os.freemem();
  return {
    totalMem: Math.round(total / 1024 / 1024),
    usedMem: Math.round((total - free) / 1024 / 1024),
    freeMem: Math.round(free / 1024 / 1024),
    percentage: ((total - free) / total * 100).toFixed(1)
  };
}

function getHeapMemoryUsage() {
  const heap = process.memoryUsage();
  return {
    heapTotal: Math.round(heap.heapTotal / 1024 / 1024),
    heapUsed: Math.round(heap.heapUsed / 1024 / 1024),
    external: Math.round(heap.external / 1024 / 1024),
    rss: Math.round(heap.rss / 1024 / 1024),
    arrayBuffers: Math.round(heap.arrayBuffers / 1024 / 1024)
  };
}

function getFilteredUptime() {
  const uptime = process.uptime();
  const days = Math.floor(uptime / (24 * 60 * 60));
  const hours = Math.floor((uptime % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((uptime % (60 * 60)) / 60);
  const seconds = Math.floor(uptime % 60);
  return {
    formatted: `${days}d ${hours}h ${minutes}m ${seconds}s`,
    days, hours, minutes, seconds
  };
}

function getSystemUptime() {
  const uptime = os.uptime();
  const days = Math.floor(uptime / (24 * 60 * 60));
  const hours = Math.floor((uptime % (24 * 60 * 60)) / (60 * 60));
  return `${days}d ${hours}h`;
}

async function getDependencyCount() {
  try {
    const json = await fs.promises.readFile(path.join(__dirname, '..','..', 'package.json'), 'utf8');
    const pkg = JSON.parse(json);
    return Object.keys(pkg.dependencies || {}).length;
  } catch {
    return -1;
  }
}

async function getCPUUsage() {
  const start = process.cpuUsage();
  await new Promise(res => setTimeout(res, 100));
  const end = process.cpuUsage(start);
  return ((end.user + end.system) / 1000000).toFixed(1);
}

function getCPUInfo() {
  const cpus = os.cpus();
  return {
    model: cpus[0].model,
    speed: (cpus[0].speed / 1000).toFixed(2),
    cores: cpus.length
  };
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawProgressBar(ctx, x, y, width, height, percentage, color1, color2, showPercentage = true) {
  // Save context
  ctx.save();
  
  // Background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  roundedRect(ctx, x, y, width, height, height / 2);
  ctx.fill();
  
  // Progress gradient
  const gradient = ctx.createLinearGradient(x, y, x + width, y);
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);
  ctx.fillStyle = gradient;
  
  const progressWidth = Math.max((width * percentage) / 100, height);
  roundedRect(ctx, x, y, progressWidth, height, height / 2);
  ctx.fill();
  
  // Border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1.5;
  roundedRect(ctx, x, y, width, height, height / 2);
  ctx.stroke();
  
  // Percentage text - clipped inside bar
  if (showPercentage) {
    // Create clipping region
    ctx.beginPath();
    roundedRect(ctx, x, y, width, height, height / 2);
    ctx.clip();
    
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText(`${percentage.toFixed(1)}%`, x + width / 2, y + height / 2);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }
  
  // Restore context
  ctx.restore();
}

function drawInfoCard(ctx, x, y, width, height, title, items, icon, color) {
  // Card background với gradient
  const cardGradient = ctx.createLinearGradient(x, y, x, y + height);
  cardGradient.addColorStop(0, `${color}25`);
  cardGradient.addColorStop(1, `${color}08`);
  ctx.fillStyle = cardGradient;
  roundedRect(ctx, x, y, width, height, 15);
  ctx.fill();
  
  // Card border
  ctx.strokeStyle = `${color}80`;
  ctx.lineWidth = 2;
  roundedRect(ctx, x, y, width, height, 15);
  ctx.stroke();
  
  // Inner glow effect
  ctx.strokeStyle = `${color}40`;
  ctx.lineWidth = 1;
  roundedRect(ctx, x + 2, y + 2, width - 4, height - 4, 13);
  ctx.stroke();
  
  // Title bar
  ctx.fillStyle = `${color}15`;
  roundedRect(ctx, x + 10, y + 10, width - 20, 40, 10);
  ctx.fill();
  
  // Icon
  ctx.font = '28px Arial';
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.fillText(icon, x + 20, y + 40);
  
  // Title
  ctx.font = 'bold 20px Arial';
  ctx.fillStyle = color;
  ctx.fillText(title, x + 60, y + 40);
  
  // Items
  ctx.font = '16px Arial';
  let itemY = y + 75;
  items.forEach(item => {
    ctx.fillStyle = '#B0B0B0';
    ctx.fillText(item.label, x + 20, itemY);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(item.value, x + width - 20, itemY);
    ctx.textAlign = 'left';
    ctx.font = '16px Arial';
    
    itemY += 28;
  });
}

async function drawSystemCanvas(data) {
  const width = 1400, height = 1000;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background gradient đẹp hơn
  const bgGradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
  bgGradient.addColorStop(0, '#1a1e35');
  bgGradient.addColorStop(0.5, '#0a0e27');
  bgGradient.addColorStop(1, '#050812');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);
  
  // Add animated stars background
  ctx.fillStyle = '#FFFFFF';
  for (let i = 0; i < 150; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const size = Math.random() * 2.5;
    ctx.globalAlpha = Math.random() * 0.7;
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 1;
  
  // Add nebula effects
  const nebula1 = ctx.createRadialGradient(width * 0.2, height * 0.3, 0, width * 0.2, height * 0.3, 400);
  nebula1.addColorStop(0, 'rgba(100, 150, 255, 0.08)');
  nebula1.addColorStop(1, 'rgba(100, 150, 255, 0)');
  ctx.fillStyle = nebula1;
  ctx.fillRect(0, 0, width, height);
  
  const nebula2 = ctx.createRadialGradient(width * 0.8, height * 0.7, 0, width * 0.8, height * 0.7, 400);
  nebula2.addColorStop(0, 'rgba(158, 255, 0, 0.08)');
  nebula2.addColorStop(1, 'rgba(158, 255, 0, 0)');
  ctx.fillStyle = nebula2;
  ctx.fillRect(0, 0, width, height);

  // Header section với border đẹp hơn
  const headerHeight = 110;
  const headerGradient = ctx.createLinearGradient(0, 0, width, headerHeight);
  headerGradient.addColorStop(0, 'rgba(100, 150, 255, 0.15)');
  headerGradient.addColorStop(0.3, 'rgba(158, 255, 0, 0.15)');
  headerGradient.addColorStop(0.7, 'rgba(158, 255, 0, 0.15)');
  headerGradient.addColorStop(1, 'rgba(100, 150, 255, 0.15)');
  ctx.fillStyle = headerGradient;
  ctx.fillRect(0, 0, width, headerHeight);
  
  // Multiple border lines
  const borderGradient1 = ctx.createLinearGradient(0, headerHeight, width, headerHeight);
  borderGradient1.addColorStop(0, 'rgba(100, 150, 255, 0)');
  borderGradient1.addColorStop(0.5, 'rgba(158, 255, 0, 1)');
  borderGradient1.addColorStop(1, 'rgba(100, 150, 255, 0)');
  ctx.strokeStyle = borderGradient1;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, headerHeight);
  ctx.lineTo(width, headerHeight);
  ctx.stroke();
  
  ctx.strokeStyle = 'rgba(158, 255, 0, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, headerHeight + 5);
  ctx.lineTo(width, headerHeight + 5);
  ctx.stroke();

  // Title với effect đẹp hơn
  ctx.font = "bold 48px Arial";
  ctx.fillStyle = "#9EFF00";
  ctx.textAlign = "center";
  ctx.shadowColor = 'rgba(158, 255, 0, 0.6)';
  ctx.shadowBlur = 20;
  ctx.fillText("⚡ SYSTEM DASHBOARD", width / 2, 50);
  
  ctx.font = "18px Arial";
  ctx.fillStyle = "#6BB6FF";
  ctx.shadowBlur = 10;
  ctx.fillText("Real-time System Monitoring", width / 2, 85);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  const padding = 50;
  const contentY = headerHeight + 30;
  
  // Status cards - Row 1 (5 cards)
  const cardWidth = 240;
  const cardHeight = 100;
  const cardGap = 25;
  const totalCardsWidth = cardWidth * 5 + cardGap * 4;
  const cardsStartX = (width - totalCardsWidth) / 2;
  
  // Card function for top status cards
  function drawStatusCard(x, y, title, value, subtitle, icon, color) {
    const gradient = ctx.createLinearGradient(x, y, x, y + cardHeight);
    gradient.addColorStop(0, `${color}20`);
    gradient.addColorStop(1, `${color}08`);
    ctx.fillStyle = gradient;
    roundedRect(ctx, x, y, cardWidth, cardHeight, 12);
    ctx.fill();
    
    ctx.strokeStyle = `${color}60`;
    ctx.lineWidth = 2;
    roundedRect(ctx, x, y, cardWidth, cardHeight, 12);
    ctx.stroke();
    
    ctx.font = '32px Arial';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(icon, x + cardWidth / 2, y + 40);
    
    ctx.font = 'bold 11px Arial';
    ctx.fillStyle = '#B0B0B0';
    ctx.fillText(title, x + cardWidth / 2, y + 60);
    
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(value, x + cardWidth / 2, y + 82);
    
    if (subtitle) {
      ctx.font = '10px Arial';
      ctx.fillStyle = '#808080';
      ctx.fillText(subtitle, x + cardWidth / 2, y + 95);
    }
  }
  
  // Card 1 - Time
  drawStatusCard(cardsStartX, contentY, 'CURRENT TIME', 
    data.nowTime.split(' | ')[0], data.nowTime.split(' | ')[1], '🕐', '#6BB6FF');
  
  // Card 2 - Bot Uptime
  drawStatusCard(cardsStartX + (cardWidth + cardGap), contentY, 'BOT UPTIME',
    `${data.uptime.days}d ${data.uptime.hours}h`, `${data.uptime.minutes}m ${data.uptime.seconds}s`, '⏱️', '#9EFF00');
  
  // Card 3 - System Uptime
  drawStatusCard(cardsStartX + (cardWidth + cardGap) * 2, contentY, 'SYSTEM UPTIME',
    data.systemUptime, 'Host machine', '🖥️', '#FFB86C');
  
  // Card 4 - Status
  const statusColor = data.ping < 200 ? '#00FF88' : data.ping < 800 ? '#FFB86C' : '#FF6B6B';
  drawStatusCard(cardsStartX + (cardWidth + cardGap) * 3, contentY, 'STATUS',
    data.status, `${data.ping}ms`, '📊', statusColor);
  
  // Card 5 - Packages
  drawStatusCard(cardsStartX + (cardWidth + cardGap) * 4, contentY, 'PACKAGES',
    `${data.packages}`, 'Dependencies', '📦', '#B19CD9');

  // Main content area
  const mainY = contentY + cardHeight + 30;
  const col1Width = 450;
  const col2Width = 450;
  const col3Width = 350;
  const colGap = 25;
  
  // Column 1 - CPU Information
  const cpuItems = [
    { label: 'Model:', value: data.cpuInfo.model.substring(0, 25) + '...' },
    { label: 'Cores:', value: `${data.cpuInfo.cores} cores` },
    { label: 'Speed:', value: `${data.cpuInfo.speed} GHz` },
    { label: 'Usage:', value: `${data.cpuUsage}%` },
    { label: 'Architecture:', value: os.arch() }
  ];
  
  drawInfoCard(ctx, padding, mainY, col1Width, 240, 'CPU INFO', cpuItems, '🖥️', '#6BB6FF');
  
  // CPU Progress bar
  const cpuPercentage = parseFloat(data.cpuUsage);
  drawProgressBar(ctx, padding + 20, mainY + 215, col1Width - 40, 35, cpuPercentage, '#6BB6FF', '#9EFF00');
  
  // Column 2 - RAM Information
  const ramItems = [
    { label: 'Total:', value: `${(data.ram.totalMem / 1024).toFixed(2)} GB` },
    { label: 'Used:', value: `${(data.ram.usedMem / 1024).toFixed(2)} GB` },
    { label: 'Free:', value: `${(data.ram.freeMem / 1024).toFixed(2)} GB` },
    { label: 'Usage:', value: `${data.ram.percentage}%` },
    { label: 'Type:', value: 'Physical RAM' }
  ];
  
  drawInfoCard(ctx, padding + col1Width + colGap, mainY, col2Width, 240, 'RAM INFO', ramItems, '💾', '#9EFF00');
  
  // RAM Progress bar
  const ramPercentage = parseFloat(data.ram.percentage);
  drawProgressBar(ctx, padding + col1Width + colGap + 20, mainY + 215, col2Width - 40, 35, ramPercentage, '#9EFF00', '#FFB86C');
  
  // Column 3 - Network & System
  const sysItems = [
    { label: 'Hostname:', value: os.hostname().substring(0, 15) },
    { label: 'Platform:', value: os.platform() },
    { label: 'IP Address:', value: data.ip },
    { label: 'Prefix:', value: data.prefix },
    { label: 'Node.js:', value: process.version }
  ];
  
  drawInfoCard(ctx, padding + col1Width + col2Width + colGap * 2, mainY, col3Width, 240, 'SYSTEM', sysItems, '🌐', '#FFB86C');

  // Row 2 - Memory Details
  const row2Y = mainY + 270;
  
  // Heap Memory Card
  const heapItems = [
    { label: 'Heap Total:', value: `${data.heap.heapTotal} MB` },
    { label: 'Heap Used:', value: `${data.heap.heapUsed} MB` },
    { label: 'External:', value: `${data.heap.external} MB` },
    { label: 'Array Buffers:', value: `${data.heap.arrayBuffers} MB` }
  ];
  
  drawInfoCard(ctx, padding, row2Y, col1Width, 200, 'HEAP MEMORY', heapItems, '📊', '#B19CD9');
  
  // Heap usage bar
  const heapPercentage = (data.heap.heapUsed / data.heap.heapTotal) * 100;
  drawProgressBar(ctx, padding + 20, row2Y + 175, col1Width - 40, 35, heapPercentage, '#B19CD9', '#6BB6FF');
  
  // Process Memory Card
  const processItems = [
    { label: 'RSS:', value: `${data.heap.rss} MB` },
    { label: 'V8 Engine:', value: `${data.heap.heapTotal + data.heap.external} MB` },
    { label: 'Native:', value: `${data.heap.rss - data.heap.heapTotal} MB` },
    { label: 'GC Status:', value: 'Active' }
  ];
  
  drawInfoCard(ctx, padding + col1Width + colGap, row2Y, col2Width, 200, 'PROCESS MEM', processItems, '⚙️', '#FF6B6B');
  
  // Process memory bar
  drawProgressBar(ctx, padding + col1Width + colGap + 20, row2Y + 175, col2Width - 40, 35, 
    (data.heap.rss / (data.ram.totalMem)) * 100, '#FF6B6B', '#FFB86C');
  
  // OS Information Card
  const osItems = [
    { label: 'Type:', value: os.type() },
    { label: 'Release:', value: os.release().substring(0, 15) },
    { label: 'Endianness:', value: os.endianness() },
    { label: 'Temp Dir:', value: '✓ Available' }
  ];
  
  drawInfoCard(ctx, padding + col1Width + col2Width + colGap * 2, row2Y, col3Width, 200, 'OS DETAILS', osItems, '💻', '#00D9FF');

  // Footer bar
  const footerY = row2Y + 230;
  const footerHeight = 60;
  
  const footerGradient = ctx.createLinearGradient(0, footerY, width, footerY);
  footerGradient.addColorStop(0, 'rgba(100, 150, 255, 0.1)');
  footerGradient.addColorStop(0.5, 'rgba(158, 255, 0, 0.1)');
  footerGradient.addColorStop(1, 'rgba(100, 150, 255, 0.1)');
  ctx.fillStyle = footerGradient;
  roundedRect(ctx, padding, footerY, width - padding * 2, footerHeight, 12);
  ctx.fill();
  
  ctx.strokeStyle = 'rgba(158, 255, 0, 0.3)';
  ctx.lineWidth = 2;
  roundedRect(ctx, padding, footerY, width - padding * 2, footerHeight, 12);
  ctx.stroke();
  
  ctx.font = 'bold 16px Arial';
  ctx.fillStyle = '#9EFF00';
  ctx.textAlign = 'left';
  ctx.fillText('⚡ System Status: Online', padding + 30, footerY + 25);
  
  ctx.fillStyle = '#6BB6FF';
  ctx.fillText(`📈 Performance: ${data.status}`, padding + 30, footerY + 48);
  
  ctx.textAlign = 'right';
  ctx.fillStyle = '#FFB86C';
  ctx.fillText(`🔄 Last Update: ${moment().format('HH:mm:ss')}`, width - padding - 30, footerY + 25);
  
  ctx.fillStyle = '#B19CD9';
  ctx.fillText(`⏰ Uptime: ${data.uptime.formatted}`, width - padding - 30, footerY + 48);

  const filePath = path.join(CACHE_DIR, `upt_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  await new Promise(resolve => out.on("finish", resolve));
  return filePath;
}

module.exports.run = async ({ event, api, args }) => {
  const start = Date.now();
  const ram = getSystemRAMUsage();
  const heap = getHeapMemoryUsage();
  const uptime = getFilteredUptime();
  const systemUptime = getSystemUptime();
  const packages = await getDependencyCount();
  const cpuUsage = await getCPUUsage();
  const cpuInfo = getCPUInfo();
  const ping = Date.now() - start;
  const status = ping < 200 ? "Mượt mà" : ping < 800 ? "Bình thường" : "Lag";
  const nowTime = moment().tz("Asia/Ho_Chi_Minh").format("HH:mm:ss | DD/MM/YYYY");
  const ip = getIpAddress();
  const prefix = global.config?.prefix || ".";

  const imagePath = await drawSystemCanvas({
    ram, heap, uptime, systemUptime, packages, cpuUsage, cpuInfo, ping,
    status, nowTime, ip, prefix
  });

  await api.sendMessage({
    msg: '⚡ System Dashboard Generated Successfully',
    attachments: [imagePath]
  }, event.threadId, event.type);

  fs.unlinkSync(imagePath);
}