const fs = require('fs');
const path = require('path');
const { Zalo } = require('zca-js');

module.exports.config = {
  name: 'qrlogin',
  aliases: ['qr', 'loginqr', 'qrcode'],
  version: '1.0.5',
  role: 2, // Admin only
  author: 'Trần Mạnh Quân',
  description: 'Tạo mã QR để đăng nhập Zalo, sau đó trả về thông tin session (cookie, imei).',
  category: 'Admin',
  usage: 'qrlogin',
  cooldowns: 5,
  dependencies: {}
};

const DEFAULT_TTL = 120000;
const QR_TTL = 100000;

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;

  // Kiểm tra quyền admin
  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const ownersConf = cfg.owner_bot;
  let owners = [];
  if (Array.isArray(ownersConf)) owners = ownersConf.map(String);
  else if (typeof ownersConf === 'string' && ownersConf.trim()) owners = [ownersConf.trim()];

  const isAdmin = owners.includes(String(senderId)) || admins.includes(String(senderId));
  
  if (!isAdmin) {
    return api.sendMessage('🚦 Bạn không có quyền sử dụng lệnh này.', threadId, type);
  }

  // Bắt đầu quá trình đăng nhập QR
  await loginAndGetSessionInfo(api, threadId, type);
};

async function loginAndGetSessionInfo(api, threadId, threadType) {
  const qrFileName = `qr_login_${threadId}_${Date.now()}.png`;
  const qrFilePath = path.join(__dirname, '../../temp', qrFileName);

  try {
    // Tạo thư mục temp nếu chưa có
    const tempDir = path.dirname(qrFilePath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    await api.sendMessage('⏳ Đang khởi tạo phiên đăng nhập QR, vui lòng chờ...', threadId, threadType);

    // Khởi tạo Zalo instance mới để đăng nhập QR
    const zalo = new Zalo({
      selfListen: false,
      checkUpdate: false,
      logging: false
    });

    // Sử dụng loginQR với callback
    const loginResult = await zalo.loginQR({}, async (qrData) => {
      const { image, cookie, imei, userAgent } = qrData.data;

      if (image && !cookie) {
        // Lưu QR code vào file
        const base64Data = image.replace(/^data:image\/png;base64,/, '');
        fs.writeFileSync(qrFilePath, base64Data, 'base64');

        // Gửi QR code cho người dùng
        const instructionMessage = '🪪 MÃ QR ĐĂNG NHẬP ZALO CỦA BẠN ĐÂY.\n✅️ QUÉT MÃ TRONG VÒNG 100 GIÂY ĐỂ ĐĂNG NHẬP BOT.';
        
        await api.sendMessage({
          msg: instructionMessage,
          attachments: qrFilePath
        }, threadId, threadType);
        
        return;
      }

      if (userAgent && cookie && imei) {
        // Đăng nhập thành công, gửi thông tin session
        const sessionInfo = {
          imei: imei,
          userAgent: userAgent,
          cookies: cookie,
          timestamp: Date.now()
        };

        const successMsg = formatSuccessMessage(sessionInfo);
        await api.sendMessage(successMsg, threadId, threadType);
        return;
      }
    });

  } catch (error) {
    console.error('QR Login Error:', error);
    
    let errorMsg;
    if (error.message && error.message.includes('timeout')) {
      errorMsg = '⏰ Hết thời gian chờ. Không ai quét mã QR trong vòng 100 giây, mã QR đã vô hiệu hóa.';
    } else if (error.message && error.message.includes('network')) {
      errorMsg = `❌ Lỗi mạng trong quá trình đăng nhập QR:\n\n${error.message}`;
    } else {
      errorMsg = `❌ Đã xảy ra lỗi trong quá trình đăng nhập QR:\n\n${error.message}`;
    }
    
    await api.sendMessage(errorMsg, threadId, threadType);
  } finally {
    // Cleanup
    if (fs.existsSync(qrFilePath)) {
      try {
        fs.unlinkSync(qrFilePath);
      } catch (cleanupError) {
        console.error(`Error removing QR file ${qrFilePath}:`, cleanupError);
      }
    }
  }
}

function formatSuccessMessage(sessionInfo) {
  const cookiesStr = JSON.stringify(sessionInfo.cookies, null, 2);
  
  return `✅ Đăng nhập thành công!

🔑 IMEI:
${sessionInfo.imei}

🔧 User Agent:
${sessionInfo.userAgent}

🍪 Cookie (JSON):
${cookiesStr}

⏰ Thời gian tạo: ${new Date(sessionInfo.timestamp).toLocaleString('vi-VN')}

⚠️ Lưu ý: Hãy bảo mật thông tin này cẩn thận!`;
}
