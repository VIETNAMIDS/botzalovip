module.exports.config = {
  name: "speedtest",
  version: "1.0.0",
  role: 0,
  author: "Cascade",
  description: "Kiểm tra tốc độ mạng của bot",
  category: "Tiện ích",
  usage: "speedtest",
  cooldowns: 30,
  aliases: ["speed", "test"]
};

const { ThreadType } = require("zca-js");
const axios = require("axios");

const TIME_TO_LIVE_MESSAGE = 60000;

let isTestingSpeed = false;
let currentTester = {
  id: null,
  threadId: null,
  name: null
};
let otherThreadRequester = {};

/**
 * Đánh giá tốc độ mạng (MB/s)
 */
function evaluateSpeed(speed) {
  if (speed < 0.625) return "Rất chậm 🐌"; // 5 Mbps = 0.625 MB/s
  if (speed < 1.25) return "Chậm 😢";      // 10 Mbps = 1.25 MB/s
  if (speed < 3.75) return "Trung bình 🙂"; // 30 Mbps = 3.75 MB/s
  if (speed < 6.25) return "Khá tốt 👍";    // 50 Mbps = 6.25 MB/s
  if (speed < 12.5) return "Tốt 🚀";        // 100 Mbps = 12.5 MB/s
  return "Rất tốt 🏃‍♂️";
}

/**
 * Format date
 */
function formatDate(date) {
  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Test ping to server
 */
async function testPing(url) {
  const pings = [];
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    try {
      await axios.get(url, { timeout: 3000 });
      const ping = Date.now() - start;
      pings.push(ping);
    } catch (error) {
      pings.push(999); // Failed ping
    }
  }
  
  const validPings = pings.filter(p => p < 999);
  if (validPings.length === 0) return { avg: 999, min: 999, max: 999, jitter: 0, loss: 100 };
  
  const avg = Math.round(validPings.reduce((a, b) => a + b, 0) / validPings.length);
  const min = Math.min(...validPings);
  const max = Math.max(...validPings);
  const jitter = Math.round(Math.sqrt(validPings.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / validPings.length));
  const loss = Math.round(((5 - validPings.length) / 5) * 100);
  
  return { avg, min, max, jitter, loss };
}

/**
 * Test download speed
 */
async function testDownloadSpeed() {
  const testSizes = [5, 10, 15]; // MB
  const speeds = [];
  
  for (const size of testSizes) {
    try {
      const startTime = Date.now();
      const testUrl = `https://speed.cloudflare.com/__down?bytes=${size * 1000000}`;
      await axios.get(testUrl, { 
        timeout: 20000,
        responseType: 'arraybuffer'
      });
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      const speed = size / duration;
      speeds.push(speed);
    } catch (error) {
      console.error(`Download test ${size}MB failed:`, error.message);
    }
  }
  
  if (speeds.length === 0) return 0;
  
  // Return average speed
  return (speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(2);
}

/**
 * Test upload speed (simulated with POST requests)
 */
async function testUploadSpeed() {
  const testSizes = [1, 2, 3]; // MB
  const speeds = [];
  
  for (const size of testSizes) {
    try {
      const data = Buffer.alloc(size * 1000000, 'a'); // Create buffer
      const startTime = Date.now();
      
      await axios.post('https://httpbin.org/post', data, {
        timeout: 20000,
        headers: { 'Content-Type': 'application/octet-stream' }
      });
      
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      const speed = size / duration;
      speeds.push(speed);
    } catch (error) {
      console.error(`Upload test ${size}MB failed:`, error.message);
    }
  }
  
  if (speeds.length === 0) return 0;
  
  return (speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(2);
}

/**
 * Detect connection type and network info
 */
async function detectConnectionType(ip, isp) {
  try {
    // Check if IP is private (local network)
    const isPrivate = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(ip);
    
    let networkName = isp || "Unknown Network";
    let connectionType = "🌐 Broadband";
    let asn = "Unknown";
    let network = "Unknown";
    
    // Try multiple APIs for better results
    try {
      // Try ipapi.co first
      const ipInfoResponse = await axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 5000 });
      const ipInfo = ipInfoResponse.data;
      
      if (ipInfo.org) {
        networkName = ipInfo.org;
        asn = ipInfo.asn || asn;
        network = ipInfo.network || network;
        console.log(`[SPEEDTEST] Network detected from ipapi.co: ${networkName}`);
      }
    } catch (error) {
      console.log(`[SPEEDTEST] ipapi.co failed: ${error.message}, trying fallback...`);
      
      // Fallback to ip-api.com
      try {
        const fallbackResponse = await axios.get(`http://ip-api.com/json/${ip}?fields=status,isp,org,as`, { timeout: 5000 });
        const fallbackInfo = fallbackResponse.data;
        
        if (fallbackInfo.org) {
          networkName = fallbackInfo.org;
        } else if (fallbackInfo.isp) {
          networkName = fallbackInfo.isp;
        }
        
        if (fallbackInfo.as) {
          asn = fallbackInfo.as;
        }
        
        console.log(`[SPEEDTEST] Network detected from fallback: ${networkName}`);
      } catch (fallbackError) {
        console.log(`[SPEEDTEST] Fallback also failed: ${fallbackError.message}, using ISP name: ${isp}`);
        networkName = isp || "Unknown Network";
      }
    }
    
    // Detect connection type based on network name and ISP (AFTER getting network name)
    const nameLower = networkName.toLowerCase();
    const ispLower = (isp || "").toLowerCase();
    
    // Check for mobile carriers (including typos like VIETEL)
    if (nameLower.includes("mobile") || 
        nameLower.includes("viettel") || nameLower.includes("vietel") ||
        nameLower.includes("vinaphone") || nameLower.includes("mobifone") || 
        nameLower.includes("vietnamobile") || nameLower.includes("gmobile") ||
        ispLower.includes("mobile") || ispLower.includes("viettel") || ispLower.includes("vietel")) {
      connectionType = "📱 Mobile Data";
    } 
    // Check for fiber/broadband
    else if (nameLower.includes("fiber") || nameLower.includes("fpt") || 
             nameLower.includes("vnpt") || nameLower.includes("ftth") || 
             nameLower.includes("broadband") || ispLower.includes("fiber")) {
      connectionType = "🌐 Fiber/Broadband";
    } 
    // Check for cable
    else if (nameLower.includes("cable") || nameLower.includes("cmc")) {
      connectionType = "📡 Cable";
    } 
    // Check for satellite
    else if (nameLower.includes("satellite")) {
      connectionType = "🛰️ Satellite";
    } 
    // Check for wireless/wifi
    else if (nameLower.includes("wireless") || nameLower.includes("wifi")) {
      connectionType = "📶 Wireless";
    } 
    // Check for local network
    else if (isPrivate) {
      connectionType = "🏠 Local Network";
    }
    
    console.log(`[SPEEDTEST] Final result - Network: ${networkName}, Type: ${connectionType}, ASN: ${asn}`);
    
    return {
      connectionType,
      networkName,
      asn,
      network
    };
  } catch (error) {
    console.error("Error detecting connection type:", error);
    return {
      connectionType: "🌐 Broadband",
      networkName: isp || "Unknown Network",
      asn: "Unknown",
      network: "Unknown"
    };
  }
}

/**
 * Kiểm tra tốc độ mạng đầy đủ
 */
async function testNetworkSpeed() {
  try {
    // Get IP info
    const ipResponse = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
    const ip = ipResponse.data.ip;
    
    // Get location info
    const locationResponse = await axios.get(`http://ip-api.com/json/${ip}`, { timeout: 5000 });
    const location = locationResponse.data;
    
    // Detect connection type and network name (pass ISP for fallback)
    const connectionInfo = await detectConnectionType(ip, location.isp);
    
    // Test ping
    const pingStats = await testPing('https://www.google.com');
    
    // Test download speed
    const downloadSpeed = await testDownloadSpeed();
    
    // Test upload speed
    const uploadSpeed = await testUploadSpeed();
    
    // Calculate Mbps
    const downloadMbps = (downloadSpeed * 8).toFixed(2);
    const uploadMbps = (uploadSpeed * 8).toFixed(2);
    
    return {
      ip,
      isp: location.isp || "Unknown ISP",
      country: location.country || "Unknown",
      countryCode: location.countryCode || "??",
      city: location.city || "Unknown",
      region: location.regionName || "Unknown",
      timezone: location.timezone || "Unknown",
      lat: location.lat || 0,
      lon: location.lon || 0,
      connectionType: connectionInfo.connectionType,
      networkName: connectionInfo.networkName,
      asn: connectionInfo.asn,
      network: connectionInfo.network,
      downloadSpeed,
      uploadSpeed,
      downloadMbps,
      uploadMbps,
      ping: pingStats.avg,
      pingMin: pingStats.min,
      pingMax: pingStats.max,
      jitter: pingStats.jitter,
      packetLoss: pingStats.loss
    };
  } catch (error) {
    console.error("Error testing network speed:", error);
    throw new Error("Không thể kiểm tra tốc độ mạng");
  }
}

module.exports.run = async ({ args, event, api }) => {
  const { threadId, type, data } = event;
  const senderId = data.uidFrom;
  const senderName = data.dName || "Người dùng";

  if (isTestingSpeed) {
    await api.sendMessage(
      {
        msg: `⏳ Hiện tại bot đang thực hiện kiểm tra tốc độ mạng theo yêu cầu của ${currentTester.name}. Vui lòng đợi kết quả.`,
        ttl: 30000
      },
      threadId,
      type
    );
    
    if (threadId !== currentTester.threadId && !otherThreadRequester[threadId]) {
      otherThreadRequester[threadId] = {
        name: senderName,
        id: senderId,
        type: type
      };
    }
    return;
  }

  try {
    isTestingSpeed = true;
    currentTester = {
      id: senderId,
      name: senderName,
      threadId: threadId
    };

    const progressMsg = await api.sendMessage(
      {
        msg: `⏳ Đang kiểm tra tốc độ mạng...\n\n` +
             `🔍 Đang lấy thông tin IP...\n` +
             `📍 Đang xác định vị trí...\n` +
             `🏓 Đang test ping (5 lần)...\n` +
             `📥 Đang test download (3 lần)...\n` +
             `📤 Đang test upload (3 lần)...\n\n` +
             `⏱️ Ước tính: 30-45 giây`,
        ttl: 50000
      },
      threadId,
      type
    );

    const result = await testNetworkSpeed();
    
    const downloadEval = evaluateSpeed(parseFloat(result.downloadSpeed));
    const uploadEval = evaluateSpeed(parseFloat(result.uploadSpeed));
    
    // Evaluate ping quality
    let pingQuality = "Tuyệt vời 🎯";
    if (result.ping > 100) pingQuality = "Kém 😢";
    else if (result.ping > 50) pingQuality = "Trung bình 🙂";
    else if (result.ping > 20) pingQuality = "Tốt 👍";

    let message = `╭━━━━━━━━━━━━━━━━━━━━━╮\n`;
    message += `┃  🌐 KẾT QUẢ SPEEDTEST  ┃\n`;
    message += `╰━━━━━━━━━━━━━━━━━━━━━╯\n\n`;
    
    message += `━━━ 📍 THÔNG TIN MẠNG ━━━\n`;
    message += `🌐 Tên mạng: ${result.networkName}\n`;
    message += `📡 ISP: ${result.isp}\n`;
    message += `🔌 Loại kết nối: ${result.connectionType}\n`;
    message += `🔢 ASN: ${result.asn}\n`;
    message += `🌍 Quốc gia: ${result.country} ${result.countryCode}\n`;
    message += `🏙️ Thành phố: ${result.city}\n`;
    message += `📍 Khu vực: ${result.region}\n`;
    message += `💻 IP: ${result.ip}\n`;
    message += `🕐 Múi giờ: ${result.timezone}\n`;
    message += `📌 Tọa độ: ${result.lat}, ${result.lon}\n\n`;
    
    message += `━━━ ⚡ TỐC ĐỘ MẠNG ━━━\n`;
    message += `📥 Download:\n`;
    message += `   • ${result.downloadSpeed} MB/s\n`;
    message += `   • ${result.downloadMbps} Mbps\n`;
    message += `   • ${downloadEval}\n\n`;
    
    message += `📤 Upload:\n`;
    message += `   • ${result.uploadSpeed} MB/s\n`;
    message += `   • ${result.uploadMbps} Mbps\n`;
    message += `   • ${uploadEval}\n\n`;
    
    message += `━━━ 🏓 PING & LATENCY ━━━\n`;
    message += `🏓 Ping trung bình: ${result.ping}ms\n`;
    message += `   • ${pingQuality}\n`;
    message += `📊 Ping min/max: ${result.pingMin}ms / ${result.pingMax}ms\n`;
    message += `📈 Jitter: ${result.jitter}ms\n`;
    message += `📦 Packet Loss: ${result.packetLoss}%\n\n`;
    
    message += `━━━ ℹ️ THÔNG TIN KHÁC ━━━\n`;
    message += `⏰ Thời gian: ${formatDate(new Date())}\n`;
    message += `👤 Yêu cầu bởi: @${senderName}\n\n`;
    
    message += `💡 Lưu ý: Kết quả có thể thay đổi\ntùy theo điều kiện mạng hiện tại.`;

    // Send to requester
    await api.sendMessage(
      {
        msg: message,
        mentions: [{ uid: senderId, pos: message.indexOf('@'), len: senderName.length + 1 }],
        ttl: TIME_TO_LIVE_MESSAGE
      },
      threadId,
      type
    );

    // Send to other requesters
    for (const otherThreadId in otherThreadRequester) {
      if (otherThreadId !== currentTester.threadId) {
        const requester = otherThreadRequester[otherThreadId];
        const otherMessage = message.replace(`@${senderName}`, `@${requester.name}`);
        await api.sendMessage(
          {
            msg: otherMessage,
            mentions: [{ uid: requester.id, pos: otherMessage.indexOf('@'), len: requester.name.length + 1 }],
            ttl: TIME_TO_LIVE_MESSAGE
          },
          otherThreadId,
          requester.type
        );
      }
    }

  } catch (error) {
    console.error('Lỗi khi test tốc độ mạng:', error);

    await api.sendMessage(
      {
        msg: `❌ Đã xảy ra lỗi khi kiểm tra tốc độ mạng. Vui lòng thử lại sau.\n🔧 Lỗi: ${error.message}`,
        ttl: 30000
      },
      threadId,
      type
    );
  } finally {
    isTestingSpeed = false;
    currentTester = {
      id: null,
      name: null,
      threadId: null
    };
    otherThreadRequester = {};
  }
};
