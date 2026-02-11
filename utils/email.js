const nodemailer = require('nodemailer');

const CONFIG_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];

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

module.exports = {
  normalizeBoolean,
  resolveSmtpConfig,
  ensureTransporter
};
