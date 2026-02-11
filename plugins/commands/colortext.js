const fs = require('fs')
const path = require('path')
const { createCanvas } = require('canvas')

const AUTO_DELETE_TIME = 60000

module.exports.config = {
  name: 'colortext',
  aliases: ['color', 'textcolor', 'mau'],
  version: '1.0.0',
  role: 0,
  author: 'Trae-IDE',
  description: 'Tạo ảnh chữ màu từ nội dung nhập',
  category: 'Tiện ích',
  usage: 'colortext <text> | dòng2 [-c #ff00ff,#00ffff] [-bg #000] [-size 96] [-font Arial] [-align center] [-outline 2] [-shadow on] [-w 1200] [-h 600]',
  cooldowns: 3,
  dependencies: { 'canvas': '' }
}

function parseOptions(args) {
  const opts = { w: 1200, h: 600, size: 96, font: 'Arial', align: 'center', colors: ['#8b5cf6', '#ec4899'], bg: null, outline: 2, shadow: true }
  const textParts = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-w' && i + 1 < args.length) { opts.w = Math.max(200, parseInt(args[++i], 10) || opts.w) ; continue }
    if (a === '-h' && i + 1 < args.length) { opts.h = Math.max(200, parseInt(args[++i], 10) || opts.h) ; continue }
    if (a === '-size' && i + 1 < args.length) { opts.size = Math.max(12, parseInt(args[++i], 10) || opts.size) ; continue }
    if (a === '-font' && i + 1 < args.length) { opts.font = String(args[++i]) || opts.font ; continue }
    if (a === '-align' && i + 1 < args.length) { const v = String(args[++i]).toLowerCase(); if (['left','center','right'].includes(v)) opts.align = v ; continue }
    if (a === '-c' && i + 1 < args.length) { const v = String(args[++i]); const arr = v.split(',').map(s=>s.trim()).filter(Boolean); if (arr.length>0) opts.colors = arr ; continue }
    if (a === '-bg' && i + 1 < args.length) { opts.bg = String(args[++i]) ; continue }
    if (a === '-outline' && i + 1 < args.length) { opts.outline = Math.max(0, parseInt(args[++i], 10) || 0) ; continue }
    if (a === '-shadow' && i + 1 < args.length) { const v = String(args[++i]).toLowerCase(); opts.shadow = v !== 'off' ; continue }
    textParts.push(a)
  }
  const textRaw = textParts.join(' ').trim()
  const lines = textRaw.length ? textRaw.split('|').map(s=>s.trim()).filter(Boolean) : []
  return { opts, lines }
}

function createGradient(ctx, x0, y0, x1, y1, colors) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  const n = Math.max(2, colors.length)
  for (let i = 0; i < n; i++) g.addColorStop(i/(n-1), colors[i % colors.length])
  return g
}

function drawTextImage({ W, H, lines, opts }) {
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  if (opts.bg) { ctx.fillStyle = opts.bg; ctx.fillRect(0,0,W,H) } else { const g = ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#0b1020'); g.addColorStop(1,'#03040a'); ctx.fillStyle = g; ctx.fillRect(0,0,W,H) }
  const paddingX = 60
  const paddingY = 60
  ctx.textAlign = opts.align
  ctx.textBaseline = 'middle'
  ctx.font = 'bold ' + opts.size + 'px ' + opts.font
  const metrics = lines.map(t => ctx.measureText(t))
  const widths = metrics.map(m => m.width)
  const maxWidth = widths.reduce((a,b)=>Math.max(a,b), 0)
  const lineGap = Math.round(opts.size * 0.35)
  const totalHeight = lines.length * opts.size + (lines.length - 1) * lineGap
  const startY = Math.round(H/2 - totalHeight/2)
  const centerX = opts.align === 'left' ? paddingX : (opts.align === 'right' ? W - paddingX : Math.round(W/2))
  const grad = createGradient(ctx, centerX - maxWidth/2, startY, centerX + maxWidth/2, startY, opts.colors)
  if (opts.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 12; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3 }
  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * (opts.size + lineGap) + Math.round(opts.size/2)
    ctx.fillStyle = grad
    if (opts.outline > 0) { ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = opts.outline; ctx.strokeText(lines[i], centerX, y) }
    ctx.fillText(lines[i], centerX, y)
  }
  ctx.shadowBlur = 0
  return canvas.toBuffer('image/png')
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event
  const { opts, lines } = parseOptions(args || [])
  if (!lines.length) return api.sendMessage('⚠️ Nhập nội dung. Ví dụ: colortext Xin chào | BONZ BOT -c #f472b6,#60a5fa -size 96', threadId, type)
  const W = opts.w
  const H = opts.h
  const imgBuf = drawTextImage({ W, H, lines, opts })
  const tempDir = path.join(__dirname, '../../temp')
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
  const imgPath = path.join(tempDir, `colortext_${Date.now()}.png`)
  fs.writeFileSync(imgPath, imgBuf)
  await api.sendMessage({ msg: `🎨 Chữ màu đã tạo • tự xóa sau ${Math.floor(AUTO_DELETE_TIME/1000)}s`, attachments: [imgPath], ttl: AUTO_DELETE_TIME }, threadId, type)
  setTimeout(() => { try { fs.existsSync(imgPath) && fs.unlinkSync(imgPath) } catch {} }, AUTO_DELETE_TIME)
}

