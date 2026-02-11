module.exports.config = {
  name: 'flood',
  aliases: [],
  version: '2.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Spam 1 nội dung với số lượng lớn, hỗ trợ delay và TTL tự xóa',
  category: 'Tiện ích',
  usage: 'flood <số_lượng> <delay_ms> <ttl_ms> [tin_nhắn] hoặc flood help',
  cooldowns: 3
}

const DEFAULT_MESSAGE = '💥 FLOOD MESSAGE'
const MAX_TTL_MS = 900000 // 15 phút
const MAX_DELAY_MS = 10000 // 10 giây
const MAX_COUNT_USER = 1000
const MAX_COUNT_ADMIN = 50000
const MAX_ERROR_BEFORE_STOP = 50

if (!global.__bonzFloodPrefixLock) {
  global.__bonzFloodPrefixLock = {}
}
const prefixLockMap = global.__bonzFloodPrefixLock

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const parseIntStrict = (value) => {
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : NaN
}

async function safeSend(api, payload, threadId, type) {
  try {
    return await api.sendMessage(payload, threadId, type)
  } catch (error) {
    if (typeof payload === 'object' && payload?.msg) {
      try { return await api.sendMessage(payload.msg, threadId, type) } catch {}
    }

    if (typeof payload !== 'string') {
      try { return await api.sendMessage(String(payload), threadId, type) } catch {}
    }

    console.log('[FLOOD] Lỗi gửi tin nhắn:', error?.message || error)
    throw error
  }
}

function buildHelp() {
  return [
    '📘 HƯỚNG DẪN LỆNH FLOOD',
    '',
    '📝 CÚ PHÁP:',
    '• flood <số_lượng> <delay_ms> <ttl_ms> [tin_nhắn]',
    '',
    '🔢 Tham số:',
    '• số_lượng: 1-1.000 (user), 1-50.000 (admin)',
    '• delay_ms: 0-10.000 (ms giữa mỗi tin)',
    '• ttl_ms: 0-900.000 (0 = không tự xóa)',
    '• tin_nhắn: tùy chọn, mặc định 💥 FLOOD MESSAGE',
    '',
    '💡 Ví dụ: flood 100 0 3000 Hello mọi người'
  ].join('\n')
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event

  if (!args.length || args[0]?.toLowerCase() === 'help') {
    return api.sendMessage(buildHelp(), threadId, type)
  }

  const count = parseIntStrict(args[0])
  const delay = parseIntStrict(args[1])
  const ttl = args[2] !== undefined ? parseIntStrict(args[2]) : 0
  const message = args.slice(3).join(' ').trim() || DEFAULT_MESSAGE

  if (!Number.isFinite(count) || !Number.isFinite(delay) || !Number.isFinite(ttl)) {
    return api.sendMessage(buildHelp(), threadId, type)
  }

  const cfg = global?.config || {}
  const senderId = String(event?.data?.uidFrom || event?.authorId || '')
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : []
  const owners = Array.isArray(cfg.owner_bot)
    ? cfg.owner_bot.map(String)
    : (typeof cfg.owner_bot === 'string' && cfg.owner_bot.trim() ? [cfg.owner_bot.trim()] : [])
  const isPrivileged = admins.includes(senderId) || owners.includes(senderId)

  const maxCount = isPrivileged ? MAX_COUNT_ADMIN : MAX_COUNT_USER
  if (count <= 0 || count > maxCount) {
    return api.sendMessage(`❌ Số lượng không hợp lệ (1-${maxCount.toLocaleString('vi-VN')}).`, threadId, type)
  }

  if (delay < 0 || delay > MAX_DELAY_MS) {
    return api.sendMessage(`❌ Delay phải từ 0-${MAX_DELAY_MS}ms.`, threadId, type)
  }

  if (ttl < 0 || ttl > MAX_TTL_MS) {
    return api.sendMessage(`❌ TTL phải từ 0-${MAX_TTL_MS}ms.`, threadId, type)
  }

  const payload = ttl > 0 ? { ttl, msg: message } : message
  const startMsg = [
    '🚨 BẮT ĐẦU FLOOD RIÊNG',
    '',
    `📊 Số lượng: ${count.toLocaleString('vi-VN')} tin nhắn`,
    `⏱️ Delay: ${delay}ms`,
    `🧹 TTL: ${ttl}ms`,
    `👤 Người thực hiện: ${senderId || 'Ẩn'}`,
    `💬 Nội dung: "${message.slice(0, 80)}${message.length > 80 ? '…' : ''}"`
  ].join('\n')

  const lockKey = String(threadId)
  const releasePrefixLock = () => { delete prefixLockMap[lockKey] }
  prefixLockMap[lockKey] = {
    activatedAt: Date.now(),
    by: senderId,
    count,
    delay,
    ttl
  }

  await safeSend(api, startMsg, threadId, type)

  let successCount = 0
  let errorCount = 0
  const start = Date.now()

  try {
    for (let i = 1; i <= count; i++) {
      try {
        await safeSend(api, payload, threadId, type)
        successCount++
      } catch (error) {
        errorCount++
        if (errorCount >= MAX_ERROR_BEFORE_STOP) {
          await safeSend(api,
            `❌ DỪNG FLOOD DO QUÁ NHIỀU LỖI (${errorCount}).\n✅ Đã gửi: ${successCount}/${count}`,
            threadId,
            type
          )
          return
        }
      }

      if (delay > 0 && i !== count) {
        await sleep(delay)
      }
    }
  } finally {
    releasePrefixLock()
  }

  const totalTime = ((Date.now() - start) / 1000).toFixed(1)
  const summary = [
    '🎉 ĐÃ HOÀN THÀNH FLOOD',
    '',
    `✅ Thành công: ${successCount.toLocaleString('vi-VN')}/${count.toLocaleString('vi-VN')}`,
    `❌ Lỗi: ${errorCount}`,
    `⏱️ Thời gian: ${totalTime}s`,
    `📈 Tốc độ TB: ${(successCount / Math.max(totalTime, 0.1)).toFixed(1)} msg/s`
  ].join('\n')

  return safeSend(api, summary, threadId, type)
}
