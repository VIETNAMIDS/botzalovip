const nodemailer = require('nodemailer');
const crypto = require('crypto');
const schedule = require('node-schedule');
const { DateTime } = require('luxon');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

module.exports.config = {
  name: 'thu',
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Gửi mã xác thực qua email và kiểm tra mã',
  category: 'Tiện ích',
  usage: 'thu <email> | thu verify <email> <ma>',
  cooldowns: 6,
  allowUnauthed: true,
  dependencies: {
    nodemailer: '^6.9.8'
  }
};

const CONFIG_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
const DEFAULT_EXP_MINUTES = 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIMEZONE = 'Asia/Ho_Chi_Minh';
const VERIFIED_EMAIL_STORE = path.join(__dirname, '..', '..', 'data', 'thu_verified_recipients.json');

const DEFAULT_GREETINGS = {
  morning: {
    hour: 7,
    minute: 0,
    subject: '🌞 Chúc buổi sáng tốt lành!',
    headline: 'Chào buổi sáng!',
    message: 'Chúc bạn bắt đầu ngày mới tràn đầy năng lượng và niềm vui.'
  },
  evening: {
    hour: 22,
    minute: 0,
    subject: '🌙 Chúc ngủ ngon!',
    headline: 'Chúc bạn ngủ ngon!',
    message: 'Hy vọng bạn đã có một ngày tuyệt vời. Nghỉ ngơi thật tốt nhé!'
  }
};

const GREETING_PERIODS = ['morning', 'evening'];

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(lowered)) return true;
    if (['false', '0', 'no', 'n'].includes(lowered)) return false;
  }
  if (typeof value === 'number') return value === 1;
  return fallback;
}

function resolveSmtpConfig() {
  const envConfig = {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM
  };

  const hasEnvConfig = CONFIG_KEYS.every((key) => process.env[key]);

  if (hasEnvConfig) {
    return {
      host: envConfig.host,
      port: parseInt(envConfig.port, 10) || 587,
      secure: normalizeBoolean(envConfig.secure, parseInt(envConfig.port, 10) === 465),
      user: envConfig.user,
      pass: envConfig.pass,
      from: envConfig.from || envConfig.user
    };
  }

  const fileConfig = global.config?.smtp || {};
  const hasFileConfig = ['host', 'port', 'user', 'pass'].every((key) => fileConfig[key]);

  if (hasFileConfig) {
    return {
      host: fileConfig.host,
      port: parseInt(fileConfig.port, 10) || 587,
      secure: normalizeBoolean(fileConfig.secure, parseInt(fileConfig.port, 10) === 465),
      user: fileConfig.user,
      pass: fileConfig.pass,
      from: fileConfig.from || fileConfig.user
    };
  }

  const missing = CONFIG_KEYS.filter((key) => !process.env[key]);
  throw new Error(`Thiếu cấu hình SMTP: ${missing.join(', ')}. Bạn có thể đặt biến môi trường hoặc thêm mục smtp.{host, port, user, pass} trong config.yml`);
}

function getStore() {
  if (!global.__bonzMailCodes) {
    global.__bonzMailCodes = {
      store: new Map(),
      cleanupTimer: null
    };
  }

  if (!(global.__bonzMailCodes.store instanceof Map)) {
    global.__bonzMailCodes.store = new Map();
  }

  if (global.__bonzMailCodes.cleanupTimer) {
    clearInterval(global.__bonzMailCodes.cleanupTimer);
  }

  global.__bonzMailCodes.cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [emailKey, data] of global.__bonzMailCodes.store.entries()) {
      if (!data || data.expiresAt <= now) {
        global.__bonzMailCodes.store.delete(emailKey);
      }
    }
  }, 60 * 1000);

  return global.__bonzMailCodes.store;
}

async function ensureTransporter() {
  const smtpConfig = resolveSmtpConfig();
  return nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.pass
    }
  });
}

function generateCode(length = 6) {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return crypto.randomInt(min, max + 1).toString();
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

async function appendVerifiedEmailRecord({ userId, email, name }) {
  try {
    await fs.promises.mkdir(path.dirname(VERIFIED_EMAIL_STORE), { recursive: true });

    let records = [];
    try {
      const raw = await fs.promises.readFile(VERIFIED_EMAIL_STORE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        records = parsed;
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    const filtered = records.filter((item) => item.userId !== userId && item.email !== email);
    filtered.push({
      userId,
      email,
      name: typeof name === 'string' && name.trim() ? name.trim() : null,
      verifiedAt: Date.now()
    });

    await fs.promises.writeFile(VERIFIED_EMAIL_STORE, JSON.stringify(filtered, null, 2), 'utf8');

    console.log(
      `[thu] Đã lưu email xác thực của ${email} vào ${path.basename(VERIFIED_EMAIL_STORE)}`
    );
  } catch (error) {
    logger.log(`[thu] Không thể lưu danh sách email đã xác thực: ${error.message || error}`, 'warn');
  }
}

async function sendVerificationSuccessEmail({ email, name }) {
  try {
    const transporter = await ensureTransporter();
    const smtpConfig = resolveSmtpConfig();
    const displayName = name || 'bạn';
    const subject = '✅ Xác thực email thành công';
    const text = `Xin chào ${displayName},\n\nBạn đã xác thực email thành công và có thể sử dụng đầy đủ bot.\n\nChúc bạn có những trải nghiệm tuyệt vời!\n${global.config?.name_bot || 'Bonz Bot'}`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <h2 style="color: #16a34a;">Xác thực email thành công!</h2>
        <p>Xin chào ${displayName},</p>
        <p>Bạn đã xác thực email thành công và có thể sử dụng đầy đủ các lệnh của bot.</p>
        <p style="margin: 16px 0; padding: 12px 16px; background: #dcfce7; border-radius: 12px; color: #166534;">
          Chúc bạn có những trải nghiệm tuyệt vời cùng <strong>${global.config?.name_bot || 'Bonz Bot'}</strong>!
        </p>
        <p style="font-size: 13px; color: #64748b;">Trân trọng,<br/>${global.config?.name_bot || 'Bonz Bot'}</p>
      </div>
    `;

    await transporter.sendMail({
      from: smtpConfig.from,
      to: email,
      subject,
      text,
      html
    });
  } catch (error) {
    logger.log(`[thu] Không thể gửi email thông báo xác thực tới ${email}: ${error.message || error}`, 'warn');
  }
}

function resolveGreetingConfig(period) {
  const defaults = DEFAULT_GREETINGS[period];
  if (!defaults) return null;

  const configNode = global.config?.thu_greetings?.[period] || {};

  const hour = Number.isInteger(configNode.hour) ? configNode.hour : defaults.hour;
  const minute = Number.isInteger(configNode.minute) ? configNode.minute : defaults.minute;
  const subject = typeof configNode.subject === 'string' && configNode.subject.trim()
    ? configNode.subject.trim()
    : defaults.subject;
  const headline = typeof configNode.headline === 'string' && configNode.headline.trim()
    ? configNode.headline.trim()
    : defaults.headline;
  const message = typeof configNode.message === 'string' && configNode.message.trim()
    ? configNode.message.trim()
    : defaults.message;

  const text = typeof configNode.text === 'string' && configNode.text.trim()
    ? configNode.text.trim()
    : null;
  const html = typeof configNode.html === 'string' && configNode.html.trim()
    ? configNode.html
    : null;

  return {
    hour,
    minute,
    subject,
    headline,
    message,
    text,
    html
  };
}

function buildGreetingHtml({ headline, message, period, friendlyDate }) {
  const closing = period === 'morning'
    ? 'Chúc bạn một ngày rực rỡ và tràn đầy năng lượng!'
    : 'Chúc bạn ngủ thật ngon và có những giấc mơ đẹp!';

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.7; color: #0f172a; background: #f8fafc; padding: 24px;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; box-shadow: 0 18px 45px -15px rgba(15, 23, 42, 0.25); overflow: hidden;">
        <div style="background: linear-gradient(135deg, ${period === 'morning' ? '#38bdf8, #22d3ee' : '#8b5cf6, #ec4899'}); padding: 28px; text-align: center; color: #ffffff;">
          <h2 style="margin: 0; font-size: 26px; letter-spacing: 0.5px;">${headline}</h2>
          <p style="margin: 8px 0 0; font-size: 15px; opacity: 0.9;">${friendlyDate}</p>
        </div>
        <div style="padding: 28px 32px;">
          <p style="font-size: 16px; margin: 0 0 16px;">${message}</p>
          <p style="font-size: 15px; margin: 0 0 24px; color: #64748b;">${closing}</p>
          <div style="padding: 16px 20px; border-left: 3px solid ${period === 'morning' ? '#0ea5e9' : '#8b5cf6'}; background: ${period === 'morning' ? '#e0f2fe' : '#ede9fe'}; border-radius: 12px; color: #1e293b;">
            <p style="margin: 0; font-size: 14px;">Thân mến,<br/><strong>${global.config?.name_bot || 'Bonz Bot'}</strong></p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildGreetingText({ headline, message, period, friendlyDate }) {
  const closing = period === 'morning'
    ? 'Chúc bạn một ngày rực rỡ và tràn đầy năng lượng!'
    : 'Chúc bạn ngủ thật ngon và có những giấc mơ đẹp!';

  return `${headline}

${message}

${friendlyDate}

${closing}

${global.config?.name_bot || 'Bonz Bot'}`;
}

function getTodayKey() {
  return DateTime.now().setZone(TIMEZONE).toISODate();
}

function ensureGreetingJobs({ Users }) {
  if (!Users || typeof Users.getAll !== 'function') {
    logger.log('[thu] Không thể thiết lập gửi lời chúc vì thiếu Users controller.', 'warn');
    return;
  }

  if (!global.__thuGreetingJobs) {
    global.__thuGreetingJobs = {};
  }

  GREETING_PERIODS.forEach((period) => {
    const config = resolveGreetingConfig(period);
    if (!config) return;

    if (global.__thuGreetingJobs[period]) {
      try {
        global.__thuGreetingJobs[period].cancel();
      } catch (error) {
        logger.log(`[thu] Không thể hủy job cũ (${period}): ${error.message || error}`, 'warn');
      }
    }

    const rule = new schedule.RecurrenceRule();
    rule.tz = TIMEZONE;
    rule.hour = config.hour;
    rule.minute = config.minute;
    rule.second = 0;

    global.__thuGreetingJobs[period] = schedule.scheduleJob(rule, async () => {
      await sendGreetingBatch({ period, Users, greetingConfig: config });
    });

    logger.log(`[thu] Đã lên lịch gửi lời chúc ${period === 'morning' ? 'buổi sáng' : 'buổi tối'} lúc ${config.hour.toString().padStart(2, '0')}:${config.minute.toString().padStart(2, '0')} (${TIMEZONE}).`, 'info');
  });
}

async function sendGreetingBatch({ period, Users, greetingConfig }) {
  const todayKey = getTodayKey();
  const allUsers = Users.getAll();
  if (!Array.isArray(allUsers) || allUsers.length === 0) {
    return;
  }

  let transporter;
  try {
    transporter = await ensureTransporter();
  } catch (error) {
    logger.log(`[thu] Không thể gửi lời chúc ${period}: lỗi thiết lập SMTP - ${error.message || error}`, 'error');
    return;
  }

  const now = DateTime.now().setZone(TIMEZONE).setLocale('vi');
  const friendlyDate = now.toFormat("EEEE, dd/MM/yyyy");

  const text = greetingConfig.text || buildGreetingText({
    headline: greetingConfig.headline,
    message: greetingConfig.message,
    period,
    friendlyDate
  });

  const html = greetingConfig.html || buildGreetingHtml({
    headline: greetingConfig.headline,
    message: greetingConfig.message,
    period,
    friendlyDate
  });

  let sentCount = 0;

  for (const entry of allUsers) {
    const userId = entry.userId;
    const userData = entry.data || {};
    if (!userData.email_verified || !userData.verified_email) continue;

    const history = userData.thu_greetings || {};
    if (history[period] === todayKey) continue;

    try {
      await transporter.sendMail({
        from: greetingConfig.from || resolveSmtpConfig().from,
        to: userData.verified_email,
        subject: greetingConfig.subject,
        text,
        html
      });

      history[period] = todayKey;
      userData.thu_greetings = history;
      Users.setData(userId, userData);
      sentCount += 1;
    } catch (error) {
      logger.log(`[thu] Gửi email lời chúc cho ${userData.verified_email} thất bại: ${error.message || error}`, 'warn');
    }
  }

  if (sentCount > 0) {
    logger.log(`[thu] Đã gửi ${sentCount} email lời chúc ${period === 'morning' ? 'buổi sáng' : 'buổi tối'} (${todayKey}).`, 'info');
  }
}

async function sendVerificationMail({ email, code, expiresAt }) {
  const smtpConfig = resolveSmtpConfig();
  const transporter = await ensureTransporter();
  const fromAddress = smtpConfig.from;
  const expiredMinutes = Math.round((expiresAt - Date.now()) / 60000);

  const subject = 'Mã xác thực đăng nhập bot';
  const text = `Xin chào,\n\nBạn đang đăng nhập để sử dụng bot.\nMã xác thực (OTP) của bạn là: ${code}\n\nMã có hiệu lực trong ${expiredMinutes} phút.\nNếu bạn không yêu cầu đăng nhập, hãy bỏ qua email này.\n\nTrân trọng,\nBonz`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <h2 style="color: #2563eb;">Mã xác thực đăng nhập bot</h2>
      <p>Xin chào,</p>
      <p>Bạn đang đăng nhập để sử dụng bot.</p>
      <p>Mã xác thực (OTP) của bạn là:</p>
      <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #1d4ed8;">${code}</p>
      <p>Mã có hiệu lực trong <strong>${expiredMinutes} phút</strong>.</p>
      <p>Nếu bạn không yêu cầu đăng nhập, hãy bỏ qua email này.</p>
      <hr style="margin: 16px 0; border: none; border-top: 1px solid #e2e8f0;" />
      <p style="font-size: 13px; color: #64748b;">Trân trọng,<br/>Bonz</p>
    </div>
  `;

  await transporter.sendMail({
    from: fromAddress,
    to: email,
    subject,
    text,
    html
  });
}

module.exports.onLoad = ({ Users } = {}) => {
  getStore();
  try {
    ensureGreetingJobs({ Users });
  } catch (error) {
    logger.log(`[thu] Không thể thiết lập lời chúc tự động: ${error.message || error}`, 'warn');
  }
};

module.exports.run = async ({ api, event, args, Users }) => {
  const { threadId, type } = event;
  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') {
    return;
  }

  if (!args || args.length === 0) {
    return api.sendMessage({
      msg: '❗ Hướng dẫn:\n• thu <email>: gửi mã xác thực tới email\n• thu verify <email> <ma>: kiểm tra mã đã gửi',
      ttl: 45000
    }, threadId, type);
  }

  const action = args[0].toLowerCase();
  const store = getStore();

  if (action === 'verify') {
    if (args.length < 3) {
      return api.sendMessage({
        msg: '⚠️ Cú pháp sai. Vui lòng dùng: thu verify <email> <ma>',
        ttl: 30000
      }, threadId, type);
    }

    const email = normalizeEmail(args[1]);
    const code = args[2].trim();
    const record = store.get(email);
    const requesterId = event.data?.uidFrom;

    if (!record) {
      return api.sendMessage({
        msg: '❌ Không tìm thấy mã cho email này hoặc mã đã hết hạn.',
        ttl: 30000
      }, threadId, type);
    }

    if (record.requester && requesterId && record.requester !== requesterId) {
      return api.sendMessage({
        msg: '🚫 Mã này không thuộc về bạn. Vui lòng yêu cầu mã mới.',
        ttl: 30000
      }, threadId, type);
    }

    if (record.expiresAt <= Date.now()) {
      store.delete(email);
      return api.sendMessage({
        msg: '⌛ Mã đã hết hạn, vui lòng yêu cầu mã mới.',
        ttl: 30000
      }, threadId, type);
    }

    if (record.code !== code) {
      return api.sendMessage({
        msg: '❌ Mã không đúng. Vui lòng kiểm tra lại.',
        ttl: 30000
      }, threadId, type);
    }

    store.delete(email);

    let verifiedName = null;

    if (Users && requesterId) {
      try {
        const userRecord = await Users.getData(requesterId);
        const userData = userRecord?.data || {};
        verifiedName = event.data?.dName || userData.name || null;
        userData.email_verified = true;
        userData.verified_email = email;
        userData.verified_at = Date.now();
        Users.setData(requesterId, userData);

        await appendVerifiedEmailRecord({
          userId: requesterId,
          email,
          name: verifiedName
        });

        await sendVerificationSuccessEmail({
          email,
          name: verifiedName
        });
      } catch (error) {
        console.error('[thu] Không thể lưu trạng thái xác thực:', error.message || error);
      }
    }

    return api.sendMessage({
      msg: '✅ Xác thực thành công! Bạn đã có thể sử dụng toàn bộ lệnh của bot trong 24 giờ tới.',
      ttl: 45000
    }, threadId, type);
  }

  const emailArg = action.includes('@') ? args[0] : args[1];
  const email = emailArg ? normalizeEmail(emailArg) : null;

  if (!email || !EMAIL_REGEX.test(email)) {
    return api.sendMessage({
      msg: '⚠️ Vui lòng cung cấp email hợp lệ. Ví dụ: thu example@gmail.com',
      ttl: 30000
    }, threadId, type);
  }

  try {
    const code = generateCode(6);
    const expiresAt = Date.now() + DEFAULT_EXP_MINUTES * 60 * 1000;

    await sendVerificationMail({ email, code, expiresAt });
    store.set(email, { code, expiresAt, requestedAt: Date.now(), requester: event.data?.uidFrom });

    return api.sendMessage({
      msg: `📨 Đã gửi mã xác thực tới ${email}. Mã hết hạn sau ${DEFAULT_EXP_MINUTES} phút.\nDùng: thu verify ${email} <ma> để xác nhận.`,
      ttl: 60000
    }, threadId, type);
  } catch (error) {
    const errorMsg = error.message || error.toString();
    return api.sendMessage({
      msg: `❌ Gửi email thất bại: ${errorMsg}`,
      ttl: 45000
    }, threadId, type);
  }
};
