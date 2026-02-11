const fs = require("fs");
const path = require("path");
const axios = require("axios");
const Jimp = require("jimp");

module.exports.config = {
  name: "baucua",
  version: "2.0.0",
  role: 0,
  author: "Enhanced by Bonz Team",
  description: "Game Bầu Cua Tôm Cá truyền thống Việt Nam với leaderboard",
  category: "casino",
  usage: "baucua bet <con_vật>:<tiền> | baucua help | baucua stats",
  cooldowns: 3,
  dependencies: { 
    "jimp": "0.16.1"
 }
};

// Game Configuration
const cacheDir = path.join(__dirname, "cache", "baucua");
const animalList = ["bau", "cua", "ca", "nai", "ga", "tom"];
const animalNames = {
  bau: "Bầu", cua: "Cua", ca: "Cá", 
  nai: "Nai", ga: "Gà", tom: "Tôm"
};
const emojiMap = {
  bau: "🍐", cua: "🦀", ca: "🐟",
  nai: "🦌", ga: "🐓", tom: "🦞"
};
const imgMap = {
  bau: "https://i.postimg.cc/T2L1mkc1/bau.jpg",
  cua: "https://i.postimg.cc/v8JBvWPz/cua.jpg",
  ca: "https://i.postimg.cc/grFf6cHV/ca.jpg",
  nai: "https://i.postimg.cc/90q6MwZX/nai.jpg",
  ga: "https://i.postimg.cc/KvtYpRwy/ga.jpg",
  tom: "https://i.postimg.cc/nhkhZNnR/tom.jpg",
  gif: "https://i.postimg.cc/PJYd7R6M/gif.gif"
};

// Game Settings
const MIN_BET = 1000;
const MAX_BET = 10000000;
const HOUSE_EDGE = 0.05; // 5% house edge

// Initialize global leaderboard if not exists
if (!global.gameLeaderboard) {
  global.gameLeaderboard = {
    caro: new Map(),
    fishing: new Map(),
    taixiu: {},
    blackjack: {},
    poker: {},
    roulette: {},
    baccarat: {},
    baucua: {}
  };
}

if (!global.gameLeaderboard.baucua) {
  global.gameLeaderboard.baucua = {};
}

async function downloadImage(url, dest) {
  if (fs.existsSync(dest)) return;
  const response = await axios.get(url, { 
    responseType: "arraybuffer",
    headers: {
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://imgur.com/',
            'Accept': 'image/*,*/*;q=0.8'
          }
   });
  fs.writeFileSync(dest, response.data);
}

async function ensureCache() {
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  for (const key in imgMap) {
    const ext = key === "gif" ? "gif" : "jpg";
    const filePath = path.join(cacheDir, `${key}.${ext}`);
    await downloadImage(imgMap[key], filePath);
  }
}

module.exports.onLoad = async () => {
  await ensureCache();
}

// Helper Functions
function updatePlayerStats(userId, won, betAmount, winAmount) {
  if (!global.gameLeaderboard.baucua[userId]) {
    global.gameLeaderboard.baucua[userId] = {
      wins: 0,
      losses: 0,
      gamesPlayed: 0,
      totalBet: 0,
      totalWin: 0,
      biggestWin: 0,
      winStreak: 0,
      maxWinStreak: 0
    };
  }
  
  const stats = global.gameLeaderboard.baucua[userId];
  stats.gamesPlayed++;
  stats.totalBet += betAmount;
  
  if (won) {
    stats.wins++;
    stats.totalWin += winAmount;
    stats.winStreak++;
    if (winAmount > stats.biggestWin) stats.biggestWin = winAmount;
    if (stats.winStreak > stats.maxWinStreak) stats.maxWinStreak = stats.winStreak;
  } else {
    stats.losses++;
    stats.winStreak = 0;
  }
}

function showHelp() {
  return `🎲 HƯỚNG DẪN GAME BẦU CUA TÔM CÁ

🎯 CÁCH CHƠI:
• baucua bet <con_vật>:<tiền> - Đặt cược
• Có thể cược nhiều con cùng lúc
• 3 xúc xắc sẽ được lắc
• Trúng 1 con = x1, 2 con = x2, 3 con = x3

🐾 CÁC CON VẬT:
🍐 bau (Bầu) | 🦀 cua (Cua) | 🐟 ca (Cá)
🦌 nai (Nai) | 🐓 ga (Gà) | 🦞 tom (Tôm)

💰 CƯỢC TỐI THIỂU: ${MIN_BET.toLocaleString()}đ
💎 CƯỢC TỐI ĐA: ${MAX_BET.toLocaleString()}đ

📊 VÍ DỤ:
• baucua bet bau:5000 - Cược 5k vào Bầu
• baucua bet ca:2000 tom:3000 - Cược 2k Cá, 3k Tôm
• baucua bet nai:allin - Cược tất cả vào Nai

🏆 LỆNH KHÁC:
• baucua stats - Xem thống kê cá nhân
• baucua help - Xem hướng dẫn này`;
}

function showStats(userId, userName) {
  const stats = global.gameLeaderboard.baucua[userId];
  if (!stats || stats.gamesPlayed === 0) {
    return `📊 THỐNG KÊ BẦU CUA - ${userName}

🎮 Chưa chơi game nào!
💡 Gõ "baucua help" để xem hướng dẫn`;
  }

  const winRate = ((stats.wins / stats.gamesPlayed) * 100).toFixed(1);
  const profit = stats.totalWin - stats.totalBet;
  const profitStatus = profit >= 0 ? "📈" : "📉";

  return `📊 THỐNG KÊ BẦU CUA - ${userName}

🎮 Tổng trận: ${stats.gamesPlayed}
🏆 Thắng: ${stats.wins} | ❌ Thua: ${stats.losses}
📊 Tỷ lệ thắng: ${winRate}%

💰 Tổng cược: ${stats.totalBet.toLocaleString()}đ
🏆 Tổng thắng: ${stats.totalWin.toLocaleString()}đ
${profitStatus} Lợi nhuận: ${profit.toLocaleString()}đ

🔥 Thắng liên tiếp: ${stats.winStreak}
⭐ Kỷ lục streak: ${stats.maxWinStreak}
💎 Thắng lớn nhất: ${stats.biggestWin.toLocaleString()}đ

🏅 Gõ "leaderboard baucua" để xem BXH!`;
}

module.exports.run = async function ({ args, event, api, Users }) {
  const { threadId, type, data } = event;
  const uid = data.uidFrom;
  const send = msg => api.sendMessage({ msg }, threadId, type);

  // Get user data
  const userData = (await Users.getData(uid)).data;
  const userName = userData.name || "Unknown";
  let money = userData.money || 0;

  // Handle commands
  if (args.length === 0 || args[0] === "help") {
    return send(showHelp());
  }

  if (args[0] === "stats") {
    return send(showStats(uid, userName));
  }

  if (args[0] !== "bet") {
    return send("⚠️ Lệnh không hợp lệ! Gõ 'baucua help' để xem hướng dẫn.");
  }

  // Parse bets
  let bets = {};
  let totalBet = 0;
  
  for (let i = 1; i < args.length; i++) {
    let [animal, amount] = args[i].split(":");
    animal = animal?.toLowerCase();
    
    if (!animalList.includes(animal)) {
      return send(`⚠️ Con vật "${animal}" không hợp lệ!\n🐾 Các con hợp lệ: ${animalList.join(", ")}`);
    }

    if (amount?.toLowerCase() === "allin") {
      amount = money;
    } else {
      amount = parseInt(amount);
      if (isNaN(amount) || amount <= 0) {
        return send(`⚠️ Số tiền cược "${args[i]}" không hợp lệ!`);
      }
    }

    if (amount < MIN_BET) {
      return send(`⚠️ Cược tối thiểu ${MIN_BET.toLocaleString()}đ cho mỗi con!`);
    }

    if (amount > MAX_BET) {
      return send(`⚠️ Cược tối đa ${MAX_BET.toLocaleString()}đ cho mỗi con!`);
    }

    bets[animal] = (bets[animal] || 0) + amount;
    totalBet += amount;
  }

  if (Object.keys(bets).length === 0) {
    return send("⚠️ Không có cược hợp lệ! Gõ 'baucua help' để xem hướng dẫn.");
  }

  if (totalBet > money) {
    return send(`⚠️ Không đủ tiền!\n💰 Số dư: ${money.toLocaleString()}đ\n🎯 Cần: ${totalBet.toLocaleString()}đ`);
  }

  // Show betting summary
  let betSummary = "🎲 BẦU CUA TÔM CÁ\n\n🎯 Cược của bạn:\n";
  for (const [animal, amount] of Object.entries(bets)) {
    betSummary += `${emojiMap[animal]} ${animalNames[animal]}: ${amount.toLocaleString()}đ\n`;
  }
  betSummary += `\n💰 Tổng cược: ${totalBet.toLocaleString()}đ`;
  betSummary += `\n🎲 Đang lắc xúc xắc...`;

  // Send gif animation
  const gifPath = path.join(cacheDir, "gif.gif");
  try {
    await api.sendMessage({ msg: betSummary, attachments: [gifPath] }, threadId, type);
  } catch (error) {
    await api.sendMessage({ msg: betSummary }, threadId, type);
  }

  // Roll dice after 4 seconds
  setTimeout(async () => {
    try {
      // Generate results
      const result = Array.from({ length: 3 }, () => 
        animalList[Math.floor(Math.random() * animalList.length)]
      );
      
      // Create result image
      const images = await Promise.all(
        result.map(animal => Jimp.read(path.join(cacheDir, `${animal}.jpg`)))
      );
      
      const width = images.reduce((w, img) => w + img.bitmap.width, 0);
      const height = images[0].bitmap.height;
      const final = new Jimp(width, height, '#2C3E50');
      
      let x = 0;
      for (const img of images) {
        final.composite(img, x, 0);
        x += img.bitmap.width;
      }
      
      const resultPath = path.join(cacheDir, `result_${uid}_${Date.now()}.jpg`);
      await final.writeAsync(resultPath);

      // Calculate winnings
      let totalWin = 0;
      let won = false;
      let resultMsg = `🎲 KẾT QUẢ BẦU CUA\n\n`;
      resultMsg += `🎯 Kết quả: ${result.map(a => emojiMap[a]).join(" | ")}\n\n`;

      for (const [animal, betAmount] of Object.entries(bets)) {
        const count = result.filter(r => r === animal).length;
        if (count > 0) {
          const winAmount = count * betAmount;
          totalWin += winAmount;
          won = true;
          resultMsg += `✅ ${emojiMap[animal]} ${animalNames[animal]} x${count}: +${winAmount.toLocaleString()}đ\n`;
        } else {
          resultMsg += `❌ ${emojiMap[animal]} ${animalNames[animal]}: -${betAmount.toLocaleString()}đ\n`;
        }
      }

      const profit = totalWin - totalBet;
      const finalMoney = money + profit;

      resultMsg += `\n💰 Tổng cược: ${totalBet.toLocaleString()}đ`;
      resultMsg += `\n🏆 Tổng thắng: ${totalWin.toLocaleString()}đ`;
      
      if (profit > 0) {
        resultMsg += `\n📈 Lợi nhuận: +${profit.toLocaleString()}đ`;
        resultMsg += `\n🎉 CHÚC MỪNG!`;
      } else if (profit < 0) {
        resultMsg += `\n📉 Thua lỗ: ${profit.toLocaleString()}đ`;
        resultMsg += `\n😢 Chúc bạn may mắn lần sau!`;
      } else {
        resultMsg += `\n⚖️ Hòa vốn: 0đ`;
      }

      resultMsg += `\n💳 Số dư mới: ${finalMoney.toLocaleString()}đ`;

      // Update user money
      userData.money = finalMoney;
      await Users.setData(uid, userData);

      // Update stats
      updatePlayerStats(uid, won, totalBet, totalWin);

      // Send result with image
      await api.sendMessage({ msg: resultMsg, attachments: [resultPath] }, threadId, type);

      // Clean up image file after 10 seconds
      setTimeout(() => {
        try {
          if (fs.existsSync(resultPath)) {
            fs.unlinkSync(resultPath);
          }
        } catch (error) {
          console.log("[BAUCUA] Error cleaning up result image:", error);
        }
      }, 10000);

    } catch (error) {
      console.log("[BAUCUA] Error in game execution:", error);
      send("❌ Có lỗi xảy ra trong quá trình chơi game. Vui lòng thử lại!");
    }
  }, 4000);
};
