const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { resolveSmtpConfig, ensureTransporter } = require('./email');

const VERIFIED_EMAIL_STORE = path.join(__dirname, '..', 'data', 'thu_verified_recipients.json');

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
      `[auth] Đã lưu email xác thực của ${email} vào ${path.basename(VERIFIED_EMAIL_STORE)}`
    );
  } catch (error) {
    logger.log(`[auth] Không thể lưu danh sách email đã xác thực: ${error.message || error}`, 'warn');
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
    logger.log(`[auth] Không thể gửi email thông báo xác thực tới ${email}: ${error.message || error}`, 'warn');
  }
}

async function removeVerifiedEmailRecord({ userId, email }) {
  const userIdStr = typeof userId === 'string' ? userId : userId != null ? String(userId) : null;
  const emailLower = typeof email === 'string' ? email.trim().toLowerCase() : null;

  if (!userIdStr && !emailLower) {
    return false;
  }

  try {
    let records = [];
    try {
      const raw = await fs.promises.readFile(VERIFIED_EMAIL_STORE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        records = parsed;
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        return false;
      }
      throw err;
    }

    let changed = false;
    const filtered = records.filter((item) => {
      const matchUser = userIdStr && String(item.userId) === userIdStr;
      const matchEmail = emailLower && typeof item.email === 'string' && item.email.trim().toLowerCase() === emailLower;
      if (matchUser || matchEmail) {
        changed = true;
        return false;
      }
      return true;
    });

    if (!changed) {
      return false;
    }

    await fs.promises.writeFile(VERIFIED_EMAIL_STORE, JSON.stringify(filtered, null, 2), 'utf8');
    return true;
  } catch (error) {
    logger.log(`[auth] Không thể xóa email xác thực: ${error.message || error}`, 'warn');
    return false;
  }
}

module.exports = {
  VERIFIED_EMAIL_STORE,
  appendVerifiedEmailRecord,
  sendVerificationSuccessEmail,
  removeVerifiedEmailRecord
};
