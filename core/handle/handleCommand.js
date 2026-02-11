const logger = require("../../utils/logger");

const Users = require("../controller/controllerUsers");
const Threads = require("../controller/controllerThreads");
const loaderCommand = require("../loader/loaderCommand");
const { honorificFor } = require("../../utils/index");

const { ThreadType, TextStyle } = require("zca-js");

const MAX_STYLE_SEGMENTS = 12;

function shouldStripStyles(error) {
  const code = error?.code || error?.statusCode;
  return code === 112 || code === 400;
}

async function sendMessageWithOptionalStyles(api, threadId, type, payload) {
  try {
    return await api.sendMessage(payload, threadId, type);
  } catch (error) {
    if (shouldStripStyles(error) && payload && typeof payload === "object" && payload.styles) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.styles;
      return await api.sendMessage(fallbackPayload, threadId, type);
    }
    throw error;
  }
}

function buildQuoteFromEvent(event) {
  try {
    const data = event?.data;
    if (!data || !data.msgId) return null;
    return {
      content: data.content,
      msgType: data.msgType,
      propertyExt: data.propertyExt,
      uidFrom: data.uidFrom,
      msgId: data.msgId,
      cliMsgId: data.cliMsgId,
      ts: data.ts,
      ttl: data.ttl
    };
  } catch {
    return null;
  }
}

function pickVariantIndex(bucketHours = 6, variantsCount = 1, seed = "") {
  const hours = Math.max(1, Number(bucketHours) || 6);
  const bucketMs = hours * 60 * 60 * 1000;
  const t = Math.floor(Date.now() / bucketMs);
  let hash = 0;
  const s = String(seed || "");
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  const idx = (t + hash) % Math.max(1, Number(variantsCount) || 1);
  return idx;
}

function getCommandUiTexts(config) {
  const root = config && typeof config === "object" ? config : {};
  const custom = root.command_ui_texts && typeof root.command_ui_texts === "object" ? root.command_ui_texts : {};
  return {
    brandVariants: Array.isArray(custom.brand_variants) && custom.brand_variants.filter(Boolean).length
      ? custom.brand_variants.map(String)
      : ["BONZ VIP", "BONZ VIP BOT", "⚡ BONZ VIP COMMAND ⚡"],
    prefixOnlyTitle: typeof custom.prefix_only_title === "string" && custom.prefix_only_title.trim()
      ? custom.prefix_only_title.trim()
      : "BAN CHI GO PREFIX",
    unknownCommandHeadings: Array.isArray(custom.unknown_command_headings) && custom.unknown_command_headings.filter(Boolean).length
      ? custom.unknown_command_headings.map(String)
      : ["LENH KHONG TON TAI", "KHONG TIM THAY LENH", "INVALID COMMAND"]
  };
}

function buildUnknownCommandHeader(frameWidth = 30, { variantIndex = 0 } = {}) {
  const separator = "-".repeat(Math.max(10, frameWidth));

  const uiTexts = getCommandUiTexts(global.config);
  const brands = uiTexts.brandVariants;
  const headings = uiTexts.unknownCommandHeadings;

  const brand = brands[variantIndex % brands.length];
  const heading = headings[variantIndex % headings.length];

  return {
    separator,
    brandLine: centerText(brand, frameWidth),
    heading
  };
}

function buildUnknownCommandFooter({ prefixHint, variantIndex }) {
  const help = `${prefixHint}help`;
  const menu = `${prefixHint}menu`;
  const cmd = `${prefixHint}cmd`;
  const tips = [
    `Gợi ý: ${help}`,
    `Gợi ý nhanh: ${help}`,
    `Xem menu: ${menu}`
  ];
  const examples = [
    `Ví dụ: ${help}`,
    `Ví dụ: ${help} (xem tất cả lệnh)`,
    `Ví dụ: ${menu} (xem menu)`
  ];

  const extras = [
    `Lệnh nhanh: ${menu} | ${cmd}`,
    `Lệnh hay dùng: ${menu} | ${help} | ${cmd}`,
    `Thử thêm: ${menu} hoặc ${cmd}`
  ];

  return {
    tipLine: tips[variantIndex % tips.length],
    exampleLine: examples[variantIndex % examples.length],
    extraLine: extras[variantIndex % extras.length]
  };
}

function getAllCommandNames() {
  try {
    const cmds = global?.client?.commands;
    if (!cmds) return [];
    const names = [];
    for (const [name, cmdObj] of cmds.entries()) {
      const n = String(name || "").trim();
      if (!n) continue;
      if (cmdObj?.config?.name && String(cmdObj.config.name).trim()) {
        names.push(String(cmdObj.config.name).trim());
      } else {
        names.push(n);
      }
    }
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function hashStringToInt(str) {
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h = (h * 33 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function pickCommandShowcase({ prefixHint, seed, maxItems = 12 }) {
  const all = getAllCommandNames();
  const cap = Math.max(3, Math.min(Number(maxItems) || 12, 20));
  if (!all.length) return [];

  const start = hashStringToInt(seed) % all.length;
  const picked = [];
  for (let i = 0; i < all.length && picked.length < cap; i++) {
    picked.push(all[(start + i) % all.length]);
  }

  const formatted = picked.map((n) => `${prefixHint}${n}`);
  const lines = [];
  lines.push(`Lệnh gợi ý (${formatted.length}/${all.length}):`);
  lines.push(formatted.join(" | "));
  return lines;
}

function pickQuickCommandHints({ prefixHint, seed, maxItems = 2 } = {}) {
  const all = getAllCommandNames();
  if (!all.length) return [];
  const cap = Math.max(0, Math.min(Number(maxItems) || 2, 5));
  if (cap === 0) return [];

  const banned = new Set(["help", "menu", "cmd"]);
  const filtered = all.filter((n) => !banned.has(String(n).toLowerCase()));
  const source = filtered.length ? filtered : all;
  const start = hashStringToInt(seed) % source.length;
  const picked = [];
  for (let i = 0; i < source.length && picked.length < cap; i++) {
    const name = source[(start + i) % source.length];
    if (!name) continue;
    if (picked.includes(name)) continue;
    picked.push(name);
  }
  return picked.map((n) => `${prefixHint}${n}`);
}

function normalizeCommandToken(value) {
  if (!value) return "";
  return String(value).trim().toLowerCase();
}

function normalizeCmdForLock(value) {
  return String(value || '').trim().toLowerCase().replace(/^[/!#.]+/g, '');
}

function levenshtein(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  if (s === t) return 0;
  if (!s) return t.length;
  if (!t) return s.length;

  const v0 = new Array(t.length + 1);
  const v1 = new Array(t.length + 1);
  for (let i = 0; i <= t.length; i++) v0[i] = i;

  for (let i = 0; i < s.length; i++) {
    v1[0] = i + 1;
    let rowMin = v1[0];
    for (let j = 0; j < t.length; j++) {
      const cost = s[i] === t[j] ? 0 : 1;
      const del = v0[j + 1] + 1;
      const ins = v1[j] + 1;
      const sub = v0[j] + cost;
      const val = Math.min(del, ins, sub);
      v1[j + 1] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > 6) return 7;
    for (let j = 0; j <= t.length; j++) v0[j] = v1[j];
  }
  return v0[t.length];
}

 function pickSimilarCommands({ prefixHint, typed, maxItems = 4 } = {}) {
   const token = normalizeCommandToken(typed);
   if (!token) return [];
   const all = getAllCommandNames();
   if (!all.length) return [];

   const cap = Math.max(0, Math.min(Number(maxItems) || 4, 10));
   if (cap === 0) return [];

   const scored = [];
   for (const name of all) {
     const n = normalizeCommandToken(name);
     if (!n || n === token) continue;
     const dist = levenshtein(token, n);
     if (dist >= 7) continue;
     scored.push({ name: String(name), dist });
   }

   scored.sort((a, b) => (a.dist - b.dist) || a.name.localeCompare(b.name));
   return scored.slice(0, cap).map((x) => `${prefixHint}${x.name}`);
 }

function buildMultiColorStyle(text) {
  const cleanText = typeof text === "string" ? text : String(text ?? "");
  if (!cleanText.length) return [{ start: 0, len: 0, st: TextStyle.Yellow }];

  const palette = [TextStyle.Yellow, TextStyle.Orange, TextStyle.Red, TextStyle.Green];
  const styles = [];
  let cursor = 0;
  const totalLength = cleanText.length;
  const baseChunk = Math.max(1, Math.floor(totalLength / MAX_STYLE_SEGMENTS));

  while (cursor < totalLength) {
    const remaining = totalLength - cursor;
    let chunkSize;
    if (styles.length >= MAX_STYLE_SEGMENTS - 1) {
      chunkSize = remaining;
    } else {
      const randomBoost = Math.floor(Math.random() * 4);
      chunkSize = Math.min(remaining, Math.max(3, baseChunk + randomBoost));
    }

    const style = palette[Math.floor(Math.random() * palette.length)];
    styles.push({ start: cursor, len: chunkSize, st: style });
    cursor += chunkSize;
  }

  return styles;
}

function centerText(text, width) {
  const raw = typeof text === "string" ? text : String(text ?? "");
  const target = Math.max(Number(width) || 0, raw.length);
  const padTotal = target - raw.length;
  const padLeft = Math.floor(padTotal / 2);
  const padRight = padTotal - padLeft;
  return `${" ".repeat(padLeft)}${raw}${" ".repeat(padRight)}`;
}

async function handleCommand(messageText, event = null, api = null, threadInfo = null, prefix = null) {
  const config = global.config;

  if (!messageText || typeof messageText !== "string") return;

  const threadId = event?.threadId;
  const type = event?.type;
  const UIDUsage = event?.data?.uidFrom;
  // attach honorific for downstream usage
  try { event.honorific = honorificFor(UIDUsage); } catch {}

  const rawAfterPrefix = messageText.slice(prefix.length).trim();
  if (!rawAfterPrefix) {
    if (api && threadId && type) {
      const displayName = event?.data?.dName || event?.data?.senderName || "bạn";
      const mentionText = `@${displayName}`;
      const mentionEntry = UIDUsage ? [{ pos: 0, uid: String(UIDUsage), len: mentionText.length }] : [];
      const prefixHint = prefix || global.config?.prefix || "";
      const uiTexts = getCommandUiTexts(global.config);
      const quote = buildQuoteFromEvent(event);
      const frameWidth = 30;
      const variantIndex = pickVariantIndex(6, 3, `${threadId || ""}-${UIDUsage || ""}-prefixonly`);
      const header = buildUnknownCommandHeader(frameWidth, { variantIndex });
      const separator = header.separator;
      const msgText =
        `${mentionText}\n` +
        `${header.brandLine}\n` +
        `${separator}\n` +
        `${uiTexts.prefixOnlyTitle}\n` +
        `${separator}\n` +
        `Nhap them ten lenh o sau prefix.\n` +
        `Goi y: ${prefixHint}help\n` +
        `Vi du: ${prefixHint}help`;

      await sendMessageWithOptionalStyles(api, threadId, type, {
        msg: msgText,
        mentions: mentionEntry,
        ...(quote ? { quote } : {}),
        styles: buildMultiColorStyle(msgText),
        ttl: 20000
      });
    }
    return;
  }

  const args = rawAfterPrefix.split(/\s+/);
  const commandName = args.shift().toLowerCase();

  // ===== BOT OFFLINE CHECK =====
  // Kiểm tra bot có đang offline không, nhưng vẫn cho phép lệnh "bot" để bật lại
  if (config.bot_offline === true && commandName !== "bot") {
    return; // Bỏ qua tất cả lệnh trừ lệnh "bot"
  }
  // ===== END BOT OFFLINE CHECK =====

  if (type == ThreadType.User && config.allow_private_command === false) {
    return;
  }

  let command = global.client.commands.get(commandName);
  if (!command) {
    for (const [, cmd] of global.client.commands) {
      if (Array.isArray(cmd.config.aliases) && cmd.config.aliases.includes(commandName)) {
        command = cmd;
        break;
      }
    }
  }

  if (!command && typeof loaderCommand === "function") {
    try {
      const loadResult = await loaderCommand(commandName);
      if (loadResult?.restart) {
        return;
      }
      if (loadResult?.status) {
        command = global.client.commands.get(commandName);
      }
    } catch (autoLoadError) {
      logger.log(`⚠️ Không thể tự load command ${commandName}: ${autoLoadError?.message || autoLoadError}`, "warn");
    }
  }

  if (!command) {
    if (api && threadId && type) {
      const displayName = event?.data?.dName || event?.data?.senderName || "bạn";
      const mentionText = `@${displayName}`;
      const mentionEntry = UIDUsage ? [{ pos: 0, uid: String(UIDUsage), len: mentionText.length }] : [];
      const prefixHint = prefix || global.config?.prefix || "";
      const quote = buildQuoteFromEvent(event);

      const frameWidth = 30;
      const variantIndex = pickVariantIndex(6, 3, `${threadId || ""}-${UIDUsage || ""}`);
      const header = buildUnknownCommandHeader(frameWidth, { variantIndex });
      const similar = pickSimilarCommands({
        prefixHint,
        typed: commandName,
        maxItems: 4
      });
      const hintBlock = similar.length
        ? `Goi y gan dung:\n${similar.join("\n")}`
        : `Goi y: ${prefixHint}help`;
      const msgText =
        `${mentionText}\n` +
        `${header.brandLine}\n` +
        `${header.separator}\n` +
        `${header.heading}\n` +
        `${header.separator}\n` +
        `Sai lệnh: ${prefixHint}${commandName}\n` +
        `${hintBlock}`;

      await sendMessageWithOptionalStyles(api, threadId, type, {
        msg: msgText,
        mentions: mentionEntry,
        ...(quote ? { quote } : {}),
        styles: buildMultiColorStyle(msgText),
        ttl: 20000  // Tự xóa sau 20 giây
      });
    }
    return;
  }

  const role = command.config.role || 0;
  const isBotAdmin = global.users?.admin?.includes(UIDUsage);
  const isSupport = global.users?.support?.includes(UIDUsage);
  
  let isGroupAdmin = false;

  if (type == 1) {
    if (threadInfo.box_only) {
      try {
        const info = await api.getGroupInfo(threadId);
        const groupInfo = info.gridInfoMap[threadId];

        const isCreator = groupInfo.creatorId == UIDUsage;
        const isDeputy = Array.isArray(groupInfo.adminIds) && groupInfo.adminIds.includes(UIDUsage);

        isGroupAdmin = isCreator || isDeputy;
      } catch (err) {
        logger.log("⚠️ Không thể lấy thông tin nhóm từ API: " + err.message, "warn");
      }
    }

    if (threadInfo.admin_only && !isBotAdmin) {
      const xh = honorificFor(UIDUsage);
      return api.sendMessage({
        msg: `❌ Nhóm đã bật chế độ chỉ admin bot dùng được lệnh, ${xh}.`,
        ttl: 30000  // Tự xóa sau 30 giây
      }, threadId, type);
    }

    if (threadInfo.support_only && !isSupport && !isBotAdmin) {
      const xh = honorificFor(UIDUsage);
      return api.sendMessage({
        msg: `❌ Nhóm đã bật chế độ chỉ support bot hoặc admin bot dùng được lệnh, ${xh}.`,
        ttl: 30000  // Tự xóa sau 30 giây
      }, threadId, type);
    }

    if (threadInfo.box_only && !isGroupAdmin && !isBotAdmin) {
      const xh = honorificFor(UIDUsage);
      return api.sendMessage({
        msg: `❌ Nhóm đã bật chế độ chỉ trưởng/phó nhóm dùng được lệnh, ${xh}.`,
        ttl: 30000  // Tự xóa sau 30 giây
      }, threadId, type);
    }
  }

  // ===== SUPER ADMIN (ADMIN CAO CAP) LOCK =====
  try {
    const lockRoot = threadInfo?.super_admin && typeof threadInfo.super_admin === 'object'
      ? threadInfo.super_admin
      : null;
    const superUid = lockRoot?.uid != null ? String(lockRoot.uid).trim() : '';
    const locked = Array.isArray(lockRoot?.lockedCommands) ? lockRoot.lockedCommands : [];
    const lockedSet = new Set(locked.map(normalizeCmdForLock).filter(Boolean));
    const cmdToken = normalizeCmdForLock(commandName);
    if (superUid && lockedSet.size > 0 && lockedSet.has(cmdToken)) {
      const senderUid = String(UIDUsage || '').trim();
      if (!senderUid) return;
      if (senderUid !== superUid) {
        const xh = honorificFor(UIDUsage);
        return api.sendMessage({
          msg: `🚫 ${xh.charAt(0).toUpperCase() + xh.slice(1)} không có quyền dùng lệnh này (chỉ admin cao cấp).`,
          ttl: 30000
        }, threadId, type);
      }
    }
  } catch {}
  // ===== END SUPER ADMIN LOCK =====

  if ((role === 2 && !isBotAdmin) || (role === 1 && !isBotAdmin && !isSupport)) {
    const xh = honorificFor(UIDUsage);
    return api.sendMessage({
      msg: `🚫 ${xh.charAt(0).toUpperCase()+xh.slice(1)} không có quyền sử dụng lệnh này.`,
      ttl: 30000  // Tự xóa sau 30 giây
    }, threadId, type);
  }

  const cdTime = (command.config.cooldowns || 0) * 1000;

  if (!global.client.cooldowns.has(commandName)) {
    global.client.cooldowns.set(commandName, new Map());
  }

  const cdMap = global.client.cooldowns.get(commandName);
  const lastUsed = cdMap.get(UIDUsage);

  if (lastUsed && Date.now() - lastUsed < cdTime) {
    const timeLeft = ((cdTime - (Date.now() - lastUsed)) / 1000).toFixed(1);
    const xh = honorificFor(UIDUsage);
    return api.sendMessage({
      msg: `⏳ ${xh.charAt(0).toUpperCase()+xh.slice(1)} vui lòng chờ ${timeLeft}s để dùng lại lệnh '${commandName}'`,
      ttl: 15000  // Tự xóa sau 15 giây (cooldown message)
    }, threadId, type);
  }

  cdMap.set(UIDUsage, Date.now());

  try {
    const RequireEmailVerification = global.config?.require_email_verification === true;
    const verificationValidityHours = Number(global.config?.verification_valid_hours || 24);
    const verificationValidityMs = verificationValidityHours * 60 * 60 * 1000;
    const requireEmailCheck = RequireEmailVerification && command.config.requireEmail === true;
    const requireLogin = command.config.requireLogin === true;

    let userRecord = null;
    let userData = {};

    if ((requireEmailCheck || requireLogin) && UIDUsage && Users) {
      try {
        userRecord = await Users.getData(UIDUsage);
        userData = userRecord?.data || {};
      } catch (error) {
        logger.log(`⚠️ Không thể đọc trạng thái người dùng ${UIDUsage}: ${error.message || error}`, "warn");
        userData = {};
      }
    }

    const isPrivileged = isBotAdmin || isSupport;

    if (requireEmailCheck) {
      let isVerified = false;
      let verificationExpired = false;

      if (userData.email_verified) {
        const verifiedAt = Number(userData.verified_at) || 0;
        if (verifiedAt === 0) {
          verificationExpired = true;
        } else {
          verificationExpired = Date.now() - verifiedAt > verificationValidityMs;
        }
        isVerified = !verificationExpired;
      }

      if (!isVerified && !isPrivileged) {
        const expiredNotice = verificationExpired
          ? `🔁 Xác thực email của bạn đã hết hạn sau ${verificationValidityHours} giờ.`
          : '🔐 Bạn chưa xác nhận email.';
        return api.sendMessage({
          msg: `${expiredNotice}\nVui lòng dùng "thu <email>" để nhận mã mới và "thu verify <email> <ma>" để tiếp tục sử dụng bot.`,
          ttl: 45000
        }, threadId, type);
      }
    }

    if (requireLogin && !isPrivileged) {
      const loginValidityHours = Number(global.config?.login_valid_hours || 168);
      const loginValidityMs = loginValidityHours * 60 * 60 * 1000;

      let auth = userData.auth;
      if (!auth || typeof auth !== 'object') {
        auth = {};
      }

      let session = auth.session;
      if (!session || typeof session !== 'object') {
        session = {
          loggedIn: false,
          startedAt: null
        };
      }

      const startedAt = Number(session.startedAt) || 0;
      let isLoggedIn = session.loggedIn === true;
      let sessionExpired = false;

      if (isLoggedIn) {
        if (!startedAt || Date.now() - startedAt > loginValidityMs) {
          sessionExpired = true;
          isLoggedIn = false;
        }
      }

      if (sessionExpired && Users && UIDUsage) {
        session.loggedIn = false;
        session.startedAt = null;
        auth.session = session;
        userData.auth = auth;
        try {
          Users.setData(UIDUsage, userData);
        } catch (error) {
          logger.log(`⚠️ Không thể cập nhật trạng thái đăng nhập của ${UIDUsage}: ${error.message || error}`, "warn");
        }
      }

      if (!isLoggedIn) {
        const expiredNotice = sessionExpired
          ? '\nℹ️ Phiên đăng nhập của bạn đã hết hạn sau 7 ngày. Vui lòng đăng nhập lại.'
          : '';
        if (!auth.username) {
          return api.sendMessage({
            msg: '🚀 Bạn chưa đăng ký tài khoản. Thực hiện 5 bước sau để bắt đầu:\n1. account register <tên đăng nhập> <gmail> <mật khẩu>\n2. Mở Gmail để lấy mã OTP mà bot vừa gửi\n3. account verify <gmail> <otp> để kích hoạt tài khoản\n4. account login <tên đăng nhập> <mật khẩu> để đăng nhập\n5. Thực hiện lại lệnh bạn muốn dùng sau khi đã đăng nhập',
            ttl: 45000
          }, threadId, type);
        }

        const usernameHint = auth.username ? `account login ${auth.username}` : 'account login <tên đăng nhập>';
        return api.sendMessage({
          msg: `🔒 Bạn cần đăng nhập để sử dụng lệnh này.\nDùng: ${usernameHint}.\nNếu quên mật khẩu, dùng: account recover ${auth.username}${expiredNotice}`,
          ttl: 45000
        }, threadId, type);
      }
    }

    const replyData = { content: event.data.content, msgType: event.data.msgType, propertyExt: event.data.propertyExt, uidFrom: event.data.uidFrom, msgId: event.data.msgId, cliMsgId: event.data.cliMsgId, ts: event.data.ts, ttl: event.data.ttl, honorific: event.honorific }
    command.run({ args, event, api, Users, Threads, replyData, commandName });
  } catch (err) {
    logger.log("❌ Lỗi khi xử lý lệnh: " + err.message, "error");
    return api.sendMessage({
      msg: "❌ Đã xảy ra lỗi khi xử lý lệnh!",
      ttl: 30000  // Tự xóa sau 30 giây
    }, threadId, type);
  }
}


module.exports = handleCommand;
