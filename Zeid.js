const fs = require("fs");
const path = require("path");
const YAML = require("yaml");
const chalk = require("chalk");
const login = require("./core/login");
const logger = require("./utils/logger");
const listener = require("./core/listen");
const loaderCommand = require("./core/loader/loaderCommand");
const loaderEvent = require("./core/loader/loaderEvent");
const watchCommand = require("./core/loader/watchCommand");
const schedule = require("node-schedule");
const { cleanOldMessages, pruneConfigAdmins, getMessageCache } = require("./utils/index");
const chatgr = require("./utils/chatgr");
const { TextStyle, ThreadType } = require("zca-js");

// ===== GLOBAL ERROR HANDLING - BOT SẼ KHÔNG BAO GIỜ CRASH =====

// Xử lý uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.log(`🚨 Uncaught Exception (đã bỏ qua): ${error.message}`, "warn");
  console.error('Stack trace:', error.stack);
  // Không exit, tiếp tục chạy
});

// Xử lý unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.log(`🚨 Unhandled Rejection (đã bỏ qua): ${reason}`, "warn");
  console.error('Promise:', promise);
  // Không exit, tiếp tục chạy
});

// Xử lý warning
process.on('warning', (warning) => {
  logger.log(`⚠️ Warning: ${warning.message}`, "warn");
});

// Xử lý SIGTERM và SIGINT một cách graceful
process.on('SIGTERM', () => {
  logger.log('🔄 Nhận SIGTERM, đang tắt bot một cách an toàn...', "info");
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.log('🔄 Nhận SIGINT (Ctrl+C), đang tắt bot một cách an toàn...', "info");
  process.exit(0);
});

// Wrapper function để bọc các async function
function safeAsync(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      logger.log(`🛡️ Lỗi đã được bỏ qua trong ${fn.name}: ${error.message}`, "warn");
      return null;
    }
  };
}

function extractMessageIds(payload) {
  try {
    if (typeof payload === 'string' || typeof payload === 'number') {
      const id = String(payload);
      return { msgId: id, cliMsgId: null, globalMsgId: id };
    }
    const data = payload?.data || payload;
    const msgId = data?.msgId || data?.messageId || data?.globalMsgId || data?.msgID;
    const cliMsgId = data?.cliMsgId || data?.clientMsgId;
    const globalMsgId = data?.globalMsgId || data?.msgId || data?.messageId;
    return {
      msgId: msgId != null ? String(msgId) : null,
      cliMsgId: cliMsgId != null ? String(cliMsgId) : null,
      globalMsgId: globalMsgId != null ? String(globalMsgId) : null
    };
  } catch {
    return { msgId: null, cliMsgId: null, globalMsgId: null };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function resolveSelfMessageFromCache({ threadId, botId, nearTs, expectedText }) {
  try {
    if (!threadId || !botId || typeof getMessageCache !== 'function') return null;
    const cache = getMessageCache();
    if (!cache || typeof cache !== 'object') return null;
    const values = Object.values(cache);
    const normalizedThreadId = String(threadId);
    const normalizedBotId = String(botId);
    const baseTs = Number(nearTs || 0);

    const wantText = typeof expectedText === 'string' && expectedText.trim().length > 0
      ? expectedText.trim()
      : null;

    let best = null;
    let bestScore = Infinity;
    for (const msg of values) {
      if (!msg || typeof msg !== 'object') continue;
      if (String(msg.threadId || '') !== normalizedThreadId) continue;
      if (String(msg.uidFrom || '') !== normalizedBotId) continue;
      const ts = Number(msg.timestamp);
      if (!Number.isFinite(ts)) continue;

      // Chỉ xét tin nhắn trong khoảng gần thời điểm send để tránh thu hồi nhầm
      if (baseTs) {
        if (ts < baseTs - 15000) continue;
        if (ts > baseTs + 60000) continue;
      }

      let score = baseTs ? Math.abs(ts - baseTs) : 0;
      if (wantText) {
        const content = msg?.content;
        const contentStr = typeof content === 'string' ? content : (typeof content?.title === 'string' ? content.title : '');
        if (!contentStr || !contentStr.includes(wantText)) {
          score += 120000; // phạt nặng nếu không match text
        }
      }

      if (score < bestScore) {
        bestScore = score;
        best = msg;
      }
    }

    if (!best?.msgId) return null;
    return {
      msgId: String(best.msgId),
      cliMsgId: best?.cliMsgId != null ? String(best.cliMsgId) : null,
      globalMsgId: String(best.msgId)
    };
  } catch {
    return null;
  }
}

function resolveBotId(api) {
  try {
    const id = api?.getCurrentUserID?.() || api?.getCurrentUserId?.() || api?.getOwnId?.();
    if (id) return String(id);
  } catch {}
  try {
    const id = global?.api?.getCurrentUserID?.() || global?.api?.getCurrentUserId?.() || global?.api?.getOwnId?.();
    if (id) return String(id);
  } catch {}
  try {
    if (global?.botID) return String(global.botID);
  } catch {}
  try {
    if (global?.config?.bot_id) return String(global.config.bot_id);
  } catch {}
  return null;
}

function resolveIdsFromCache(ids) {
  try {
    if (!ids) return ids;
    const next = { ...ids };
    if (!next.cliMsgId) return next;
    if (next.msgId) return next;
    if (typeof getMessageCache !== 'function') return next;
    const cache = getMessageCache();
    if (!cache || typeof cache !== 'object') return next;
    const cached = cache[String(next.cliMsgId)];
    const msgId = cached?.msgId || cached?.data?.msgId || null;
    if (msgId) next.msgId = String(msgId);
    return next;
  } catch {
    return ids;
  }
}

function installGlobalAutoDelete(api, opts = {}) {
  if (!api || typeof api.sendMessage !== 'function') return;
  if (api.__bonzAutoDeleteInstalled) return;
  api.__bonzAutoDeleteInstalled = true;

  const delayMs = Math.max(1000, Number(opts.delayMs) || 40000);
  const botId = resolveBotId(api);
  const originalSend = api.sendMessage.bind(api);

  api.sendMessage = async (...args) => {
    const payload = args[0];
    const threadId = args[1];
    const type = args[2];
    const sentAt = Date.now();

    let safePayload = payload;
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      if ('ttl' in payload) {
        safePayload = { ...payload };
        delete safePayload.ttl;
      }
    }

    const sent = await originalSend(safePayload, threadId, type);
    const ids = resolveIdsFromCache(extractMessageIds(sent));

    const expectedText = typeof safePayload === 'string'
      ? safePayload
      : (typeof safePayload?.msg === 'string' ? safePayload.msg : null);

    // Luôn đặt lịch thu hồi, vì nhiều message sendMessage không trả msgId ngay.
    if (threadId) {
      setTimeout(async () => {
        try {
          const typeCandidates = type != null ? [type] : [ThreadType.Group, ThreadType.User];
          let resolvedIds = ids;
          if (botId) {
            // Cache thường ghi trễ, nên retry vài lần trước khi kết luận thiếu msgId
            for (let i = 0; i < 10; i++) {
              const cached = resolveSelfMessageFromCache({ threadId, botId, nearTs: sentAt, expectedText });
              if (cached?.msgId) {
                resolvedIds = { ...resolvedIds, ...cached };
                break;
              }
              await sleep(700);
            }
          }

          const resolvedMsgId = resolvedIds?.globalMsgId || resolvedIds?.msgId || null;
          const resolvedCliMsgId = resolvedIds?.cliMsgId || null;

          if (!resolvedMsgId) {
            try {
              logger.log(`[AUTO-UNDO] skip: missing msgId (threadId=${threadId})`, "warn");
            } catch {}
            return;
          }

          // Ưu tiên undo (thu hồi) nếu SDK hỗ trợ và đủ msgId+cliMsgId
          if (typeof api?.undo === 'function' && resolvedCliMsgId && resolvedMsgId) {
            const undoCandidates = [];
            for (const t of typeCandidates) {
              const threadType = Number(t) === Number(ThreadType.Group) ? ThreadType.Group : ThreadType.User;
              undoCandidates.push(() => api.undo({ msgId: String(resolvedMsgId), cliMsgId: String(resolvedCliMsgId) }, threadId, threadType));
              undoCandidates.push(() => api.undo({ msgId: String(resolvedMsgId), cliMsgId: String(resolvedCliMsgId) }, threadId));
            }
            let lastErr = null;
            for (const fn of undoCandidates) {
              try {
                await fn();
                return;
              } catch (e) {
                lastErr = e;
                // code=112 thường là lỗi phía server/SDK không thể "thử format khác" để cứu
                if (Number(e?.code) === 112) {
                  break;
                }
              }
            }

            if (lastErr) {
              try {
                const code = lastErr?.code != null ? ` code=${lastErr.code}` : "";
                logger.log(`[AUTO-UNDO] fail:${code} ${lastErr?.message || lastErr}`, "warn");
              } catch {}
            }
          } else if (typeof api?.undo === 'function' && resolvedMsgId && !resolvedCliMsgId) {
            // Không có cliMsgId thì undo không chạy được -> rơi xuống deleteMessage
            try { logger.log(`[AUTO-UNDO] skip: missing cliMsgId (threadId=${threadId})`, "warn"); } catch {}
          }

          if (typeof api?.deleteMessage === 'function') {
            for (const t of typeCandidates) {
              try {
                await api.deleteMessage({
                  threadId,
                  type: t,
                  data: {
                    cliMsgId: resolvedCliMsgId || 0,
                    msgId: String(resolvedMsgId),
                    uidFrom: botId || undefined
                  }
                }, false);
                return;
              } catch (e) {
                // try onlyMe
                try {
                  await api.deleteMessage({
                    threadId,
                    type: t,
                    data: {
                      cliMsgId: resolvedCliMsgId || 0,
                      msgId: String(resolvedMsgId),
                      uidFrom: botId || undefined
                    }
                  }, true);
                  return;
                } catch {}

                try {
                  const code = e?.code != null ? ` code=${e.code}` : "";
                  logger.log(`[AUTO-DEL] fail:${code} ${e?.message || e}`, "warn");
                } catch {}
              }
            }
          }

          if (typeof api?.unsendMessage === 'function') {
            try { await api.unsendMessage(String(resolvedMsgId)); } catch {}
          }
        } catch {
          // ignore
        }
      }, delayMs);
    }

    return sent;
  };
}

logger.log("🛡️ Global Error Handler đã được kích hoạt - Bot sẽ không bao giờ crash!", "info");

global.client = new Object({
    commands: new Map(),
    events: new Map(),
    cooldowns: new Map()
});

global.users = {
  admin: [],
  support: []
};

global.config = new Object();

global.api = null;

const RESTART_NOTICE_PATH = path.join(__dirname, 'temp', 'restart_notice.json');

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildMultiColorStyle(message) {
  const text = typeof message === 'string' ? message : String(message ?? '');
  if (!text.length) return [{ start: 0, len: 0, st: TextStyle.Yellow }];

  const palette = [TextStyle.Yellow, TextStyle.Green, TextStyle.Blue, TextStyle.Pink];
  const styles = [];
  const total = text.length;
  const maxSegments = 8;
  const baseChunk = Math.max(1, Math.floor(total / maxSegments));
  let cursor = 0;

  while (cursor < total) {
    const remaining = total - cursor;
    const chunkSize = styles.length >= maxSegments - 1
      ? remaining
      : Math.min(remaining, baseChunk + Math.floor(Math.random() * 3));
    const st = palette[Math.floor(Math.random() * palette.length)];
    styles.push({ start: cursor, len: chunkSize, st });
    cursor += chunkSize;
  }

  return styles;
}

function centerText(text, width) {
  const raw = typeof text === 'string' ? text : String(text ?? '');
  const target = Math.max(Number(width) || 0, raw.length);
  const padTotal = target - raw.length;
  const padLeft = Math.floor(padTotal / 2);
  const padRight = padTotal - padLeft;
  return `${" ".repeat(padLeft)}${raw}${" ".repeat(padRight)}`;
}

async function maybeSendRestartGreeting(api) {
  const notice = safeReadJson(RESTART_NOTICE_PATH);
  if (!notice || !notice.threadId || notice.type === undefined) return;

  try {
    const brand = Array.isArray(global.config?.command_ui_texts?.brand_variants)
      ? String(global.config.command_ui_texts.brand_variants[0] || 'BONZ VIP')
      : 'BONZ VIP';
    const msg =
      `⚡ ${brand} ⚡\n` +
      `👑 Kính chào chủ nhân! Bot đã sẵn sàng.`;
    await api.sendMessage({ msg, styles: buildMultiColorStyle(msg), ttl: 60000 }, notice.threadId, notice.type);
  } catch (error) {
    logger.log(`🛡️ Lỗi gửi lời chào sau restart (đã bỏ qua): ${error?.message || error}`, 'warn');
  } finally {
    try { fs.unlinkSync(RESTART_NOTICE_PATH); } catch {}
  }
}

(async () => {

try {
    const configPath = path.join(__dirname, "config.yml");
    const fileContent = fs.readFileSync(configPath, "utf8");
    const config = YAML.parse(fileContent);

    global.config = config;
    global.users = {
      admin: Array.isArray(config.admin_bot) ? config.admin_bot.map(String) : [],
      support: Array.isArray(config.support_bot) ? config.support_bot.map(String) : []
    };
    
    // Đảm bảo bot luôn ON khi khởi động
    if (global.config.bot_offline !== false) {
      global.config.bot_offline = false;
      logger.log("🔧 Đã tự động bật bot (bot_offline = false)", "warn");
    }
    
    logger.log("Đã tải cấu hình từ config.yml thành công", "info");
    logger.log(`🤖 Bot Status: ${global.config.bot_offline ? 'OFF' : 'ON'}`, "info");
} catch (error) {
    logger.log(`Lỗi khi đọc config.yml: ${error.message || error}`, "error");
    // Không exit nữa, sử dụng config mặc định
    global.config = {
      name_bot: "Bot",
      prefix: "/",
      admin_bot: [],
      support_bot: [],
      bot_offline: false,  // Đảm bảo bot luôn ON
      command_only_mode: true
    };
    global.users = { admin: [], support: [] };
    logger.log("🛡️ Sử dụng cấu hình mặc định để tiếp tục chạy (bot_offline = false)", "warn");
}

const tempFolderCommand = path.join(__dirname, "plugins", "commands", "temp");
const tempFolderEvent = path.join(__dirname, "plugins", "events", "temp");

try {
  if (fs.existsSync(tempFolderCommand)) {
    fs.rmSync(tempFolderCommand, { recursive: true, force: true });
    logger.log("Đã dọn dẹp folder temp của commands", "info");
  } 
  if (fs.existsSync(tempFolderEvent)) {
    fs.rmSync(tempFolderEvent, { recursive: true, force: true });
    logger.log("Đã dọn dẹp folder temp của events", "info");
  }
} catch (error) {
  logger.log(`🛡️ Lỗi khi dọn folder temp (đã bỏ qua): ${error.message || error}`, "warn");
}

// Preload chatgr state
try {
    const state = chatgr.getState();
    logger.log(`📡 ChatGR mode: ${state.mode} | allowed: ${state.allowed.length}`, "info");
} catch (error) {
    logger.log(`⚠️ Không thể tải chatgr state: ${error?.message || error}`, "warn");
}

// Hiển thị admin IDs đơn giản
for (let i = 0; i <= global.users.admin.length - 1; i++) {
    dem = i + 1;
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
    const color = colors[i % colors.length];
    console.log(chalk.hex(color).bold(`🎉 [bonz vip id ${dem}]: `) + chalk.hex('#FFD700').bold(`${!global.users.admin[i] ? "Trống" : global.users.admin[i]}`));
}

// Hiển thị support IDs đơn giản
if (global.users.support.length > 0) {
    for (let i = 0; i <= global.users.support.length - 1; i++) {
        dem = i + 1;
        console.log(chalk.hex('#74B9FF').bold(`🛠️ ID SUPPORT ${dem}: `) + chalk.hex('#00CEC9').bold(`${!global.users.support[i] ? "Trống" : global.users.support[i]}`));
    }
}

// Hiển thị thông tin bot đơn giản
console.log(chalk.hex('#FD79A8').bold(`🤖 NAME BOT: `) + chalk.hex('#FDCB6E').bold(`${global.config.name_bot}`));
console.log(chalk.hex('#E17055').bold(`⚡ PREFIX: `) + chalk.hex('#00B894').bold(`${global.config.prefix}`));

// Wrap schedule job với error handling
schedule.scheduleJob("0 * * * * *", safeAsync(async () => {
    await cleanOldMessages();
}));

// Wrap login với error handling
let api;
try {
    api = await login();
    global.api = api;
    logger.log("Đã đăng nhập thành công", "info");
    installGlobalAutoDelete(api, { delayMs: 40000 });
    await maybeSendRestartGreeting(api);
    await pruneConfigAdmins(api);
} catch (error) {
    logger.log(`🚨 Lỗi đăng nhập: ${error.message}`, "error");
    logger.log("🔄 Thử đăng nhập lại sau 10 giây...", "warn");
    setTimeout(async () => {
        try {
            api = await login();
            global.api = api;
            logger.log("✅ Đăng nhập lại thành công!", "info");
            await pruneConfigAdmins(api);
        } catch (retryError) {
            logger.log(`❌ Đăng nhập lại thất bại: ${retryError.message}`, "error");
            logger.log("🛡️ Bot sẽ tiếp tục chạy với chế độ offline", "warn");
        }
    }, 10000);
}

// Wrap loaders với error handling
try {
    await loaderCommand();
    logger.log("✅ Đã tải commands thành công", "info");
    watchCommand();
} catch (error) {
    logger.log(`🛡️ Lỗi tải commands (đã bỏ qua): ${error.message}`, "warn");
}

try {
    await loaderEvent();
    logger.log("✅ Đã tải events thành công", "info");
} catch (error) {
    logger.log(`🛡️ Lỗi tải events (đã bỏ qua): ${error.message}`, "warn");
}

// Khởi động Web Server
try {
    const BonzVipWebServer = require('./web_server');
    const webServer = new BonzVipWebServer();
    
    // Truyền API và config vào web server
    webServer.setBotAPI(api);
    webServer.setBotConfig(global.config);
    webServer.setUsers(global.users);
    
    // Start web server asynchronously
    webServer.start().then(() => {
        logger.log(`🌐 Web Control Panel đã khởi động tại http://localhost:${webServer.port}`, "info");
    }).catch((error) => {
        logger.log(`🛡️ Lỗi khởi động web server (đã bỏ qua): ${error.message}`, "warn");
    });
} catch (error) {
    logger.log(`🛡️ Lỗi khởi động web server (đã bỏ qua): ${error.message}`, "warn");
}

// Wrap listener với error handling
if (api) {
    try {
        listener(api);
        logger.log("🚀 Bot đã khởi động hoàn tất và đang lắng nghe tin nhắn!", "info");
        
        // Hiển thị trạng thái bot khi khởi động
        logger.logBotStatus();
    } catch (error) {
        logger.log(`🛡️ Lỗi khởi động listener (đã bỏ qua): ${error.message}`, "warn");
    }
} else {
    logger.log("⚠️ Bot đang chạy ở chế độ offline (không có API)", "warn");
}

})().catch((error) => {
    logger.log(`🚨 Lỗi nghiêm trọng trong main function: ${error.message}`, "error");
    logger.log("🛡️ Bot sẽ tiếp tục chạy bất chấp lỗi này", "warn");
    console.error('Stack trace:', error.stack);
});
