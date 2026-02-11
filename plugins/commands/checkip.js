const axios = require('axios');

module.exports.config = {
  name: "checkip",
  aliases: ["ip", "check-ip", "ipinfo"],
  version: "1.0.0",
  role: 0,
  author: "Bonz - Inspired by Tuann",
  description: "Check thông tin IP địa chỉ",
  usage: "checkip <ip>",
  cooldowns: 5
};

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type } = event;

  if (args.length !== 1) {
    return api.sendMessage("❌ Sai cú pháp! Dùng: checkip <ip>", threadId, type);
  }

  const ip = args[0];
  const apiUrl = `https://ipinfo.io/${ip}/json`;

  try {
    const res = await axios.get(apiUrl);
    const json = res.data;

    if (!json.ip) {
      return api.sendMessage(`❌ Không tìm thấy thông tin cho IP: ${ip}`, threadId, type);
    }

    const [lat, lon] = (json.loc || '').split(',') || ['N/A', 'N/A'];

    const msg =
`📍 THÔNG TIN IP

🔢 IP: ${json.ip}
🌍 Quốc gia: ${json.country}
📌 Khu vực: ${json.region}
🏙️ Thành phố: ${json.city}
🏢 Nhà mạng: ${json.org}
📮 Mã bưu điện: ${json.postal || 'N/A'}
🕒 Múi giờ: ${json.timezone || 'N/A'}

🧭 Tọa độ:
➤ Vĩ độ: ${lat}
➤ Kinh độ: ${lon}

🛠️ Created by: Bonz Bot`;

    return api.sendMessage(msg, threadId, type);

  } catch (e) {
    console.error('Lỗi API checkip:', e);
    return api.sendMessage(`❌ Lỗi khi truy vấn API: ${e.message}`, threadId, type);
  }
};
