const chalk = require('chalk');
const { DateTime } = require("luxon");
const axios = require("axios");

async function printBanner() {
  console.clear();
  
  const bigText = `
██████╗  ██████╗ ███╗   ██╗███████╗    ███╗   ███╗ █████╗     ██╗   ██╗██╗██████╗ 
██╔══██╗██╔═══██╗████╗  ██║╚══███╔╝    ████╗ ████║██╔══██╗    ██║   ██║██║██╔══██╗
██████╔╝██║   ██║██╔██╗ ██║  ███╔╝     ██╔████╔██║███████║    ██║   ██║██║██████╔╝
██╔══██╗██║   ██║██║╚██╗██║ ███╔╝      ██║╚██╔╝██║██╔══██║    ╚██╗ ██╔╝██║██╔═══╝ 
██████╔╝╚██████╔╝██║ ╚████║███████╗    ██║ ╚═╝ ██║██║  ██║     ╚████╔╝ ██║██║     
╚═════╝  ╚═════╝ ╚═╝  ╚═══╝╚══════╝    ╚═╝     ╚═╝╚═╝  ╚═╝      ╚═══╝  ╚═╝╚═╝     

███╗   ███╗ █████╗ ██╗    ████████╗██████╗ ██╗   ██╗ ██████╗ ███╗   ██╗ ██████╗     ████████╗ ██████╗ ███╗   ██╗
████╗ ████║██╔══██╗██║    ╚══██╔══╝██╔══██╗██║   ██║██╔═══██╗████╗  ██║██╔════╝     ╚══██╔══╝██╔═══██╗████╗  ██║
██╔████╔██║███████║██║       ██║   ██████╔╝██║   ██║██║   ██║██╔██╗ ██║██║  ███╗       ██║   ██║   ██║██╔██╗ ██║
██║╚██╔╝██║██╔══██║██║       ██║   ██╔══██╗██║   ██║██║   ██║██║╚██╗██║██║   ██║       ██║   ██║   ██║██║╚██╗██║
██║ ╚═╝ ██║██║  ██║██║       ██║   ██║  ██║╚██████╔╝╚██████╔╝██║ ╚████║╚██████╔╝       ██║   ╚██████╔╝██║ ╚████║
╚═╝     ╚═╝╚═╝  ╚═╝╚═╝       ╚═╝   ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝        ╚═╝    ╚═════╝ ╚═╝  ╚═══╝
`;
  
  // Tạo hiệu ứng nhấp nháy với logo lớn
  const blinkText = () => {
    console.clear();
    console.log(chalk.bold.magenta(bigText));
    console.log(chalk.bold.yellow("🌟🌟🌟 MÃI TRƯỜNG TỒN 🌟🌟🌟"));
  };
  
  const hideText = () => {
    console.clear();
    console.log(chalk.black(bigText));
    console.log(chalk.black("🌟🌟🌟 MÃI TRƯỜNG TỒN 🌟🌟🌟"));
  };
  
  // Nhấp nháy 5 lần
  for (let i = 0; i < 5; i++) {
    blinkText();
    await new Promise(resolve => setTimeout(resolve, 600));
    hideText();
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  
  // Hiển thị cuối cùng với màu sắc cầu vồng
  console.clear();
  
  // Tạo hiệu ứng cầu vồng cho logo lớn
  const lines = bigText.split('\n');
  const colors = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];
  
  lines.forEach((line, index) => {
    if (line.trim()) {
      const color = colors[index % colors.length];
      console.log(chalk.bold[color](line));
    } else {
      console.log(line);
    }
  });
  
  console.log(chalk.bold.yellow("🌟🌟🌟 MÃI TRƯỜNG TỒN 🌟🌟🌟"));
  console.log(chalk.bold.cyan("👑 Admin Bot: bonz vip | Bot: bonz 👑"));
  console.log();
}

// Biến đếm để theo dõi số lần gọi
let logCount = 0;

function getTimestamp() {
  logCount++;
  
  // Mỗi 10 lần log sẽ có animation bonz
  if (logCount % 10 === 0) {
    triggerBonzAnimation();
  }
  
  const text = "[bonz vip]";
  const colors = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta', 'redBright', 'yellowBright', 'greenBright'];
  let coloredText = '';
  
  for (let i = 0; i < text.length; i++) {
    const color = colors[i % colors.length];
    coloredText += chalk.bold[color](text[i]);
  }
  
  return coloredText;
}

// Hàm tạo animation bonz lặp lại
function triggerBonzAnimation() {
  setTimeout(() => {
    const colors = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];
    let animationText = '';
    
    // Tạo chuỗi "bonz bonz bonz bonz bonz"
    for (let i = 0; i < 5; i++) {
      const color = colors[i % colors.length];
      animationText += chalk.bold[color]('bonz') + ' ';
    }
    
    console.log(chalk.bold.cyan('🎉 ') + animationText + chalk.bold.cyan(' 🎉'));
    
    // Animation lặp lại 3 lần
    let count = 0;
    const interval = setInterval(() => {
      count++;
      let newAnimationText = '';
      
      for (let i = 0; i < 5; i++) {
        const color = colors[(i + count) % colors.length]; // Thay đổi màu theo thời gian
        newAnimationText += chalk.bold[color]('bonz') + ' ';
      }
      
      console.log(chalk.bold.cyan('🎉 ') + newAnimationText + chalk.bold.cyan(' 🎉'));
      
      if (count >= 3) {
        clearInterval(interval);
        console.log(chalk.bold.magenta('✨ BONZ VIP MÃI TRƯỜNG TỒN ✨'));
        console.log(chalk.bold.cyan('👑 Admin Bot: bonz vip | Bot: bonz 👑'));
      }
    }, 500);
    
  }, 100);
}

function log(data, option) {
    const time = getTimestamp();
    switch (option) {
        case "warn":
            console.log(chalk.bold.hex("#FFD700")(time +' » ') + data);
            break;
        case "error":
            console.log(chalk.bold.hex("#FF0000")(time +' » ') + data);
            break;
        case "info":
            console.log(chalk.bold.hex("#00BFFF")(time +' » ') + data);
            break;
        default:
          console.log(chalk.bold.hex("#00BFFF")(data));
    }
}

// Hàm log message với format mới (hàng dọc)
function logMessage(messageData) {
    const time = getTimestamp();
    const groupName = messageData.groupName || "Unknown Group";
    const groupId = messageData.groupId || "Unknown ID";
    const userName = messageData.userName || "Unknown User";
    const content = messageData.content || "No content";
    const memberCount = messageData.memberCount || 0;
    const isUserAdmin = messageData.isUserAdmin || false;
    
    // Kiểm tra trạng thái bot
    const botStatus = global.config?.bot_offline === true ? "ĐANG OFF" : "ĐANG ON";
    const botStatusColor = global.config?.bot_offline === true ? "red" : "green";
    const botStatusIcon = global.config?.bot_offline === true ? "😴" : "🚀";
    
    // Tạo thời gian hiện tại với format rõ ràng
    const now = new Date();
    const timestamp = now.toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    // Tạo màu sắc đa dạng cho khung
    const colors = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta', 'redBright', 'yellowBright', 'greenBright'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    // Hiển thị bonz vip ở trên khung
    console.log(chalk.bold.magenta('🌟 ') + getTimestamp() + chalk.bold.magenta(' 🌟'));
    console.log(chalk.bold[randomColor]('┌─────────────────────────────────────────────'));
    console.log(chalk.bold[randomColor]('│ ') + chalk.bold.white('🎉 TIN NHẮN MỚI 🎉'));
    console.log(chalk.bold[randomColor]('├─') + chalk.cyanBright(` 🏠 Nhóm: `) + chalk.bold.cyan(`${groupName}`));
    console.log(chalk.bold[randomColor]('├─') + chalk.yellowBright(` 🆔 ID: `) + chalk.bold.yellow(`${groupId}`));
    console.log(chalk.bold[randomColor]('├─') + chalk.blueBright(` 👥 Thành viên: `) + chalk.bold.blue(`${memberCount} người`));
    console.log(chalk.bold[randomColor]('├─') + chalk.greenBright(` 👤 Người dùng: `) + chalk.bold.green(`${userName}`));
    console.log(chalk.bold[randomColor]('├─') + chalk.redBright(` 👑 Admin nhóm: `) + (isUserAdmin ? chalk.bold.green('✅ Có') : chalk.bold.red('❌ Không')));
    console.log(chalk.bold[randomColor]('├─') + chalk.whiteBright(` 💬 Nội dung: `) + chalk.bold.white(`${content}`));
    console.log(chalk.bold[randomColor]('├─') + chalk.magentaBright(` ⏰ Thời gian: `) + chalk.bold.magenta(`${timestamp}`));
    console.log(chalk.bold[randomColor]('├─') + chalk.redBright(` 👑 Admin Bot: `) + chalk.bold.red(`bonz menu`));
    console.log(chalk.bold[randomColor]('├─') + chalk.blueBright(` 🤖 Bot Name: `) + chalk.bold.blue(`bonz vip`));
    console.log(chalk.bold[randomColor]('└─') + chalk.bold[botStatusColor](` ${botStatusIcon} Bot: ${botStatus}`));
    console.log(chalk.bold[randomColor]('═══════════════════════════════════════════════'));
    console.log('');
}

// Hàm hiển thị trạng thái bot
function logBotStatus() {
    const botStatus = global.config?.bot_offline === true ? "ĐANG OFF" : "ĐANG ON";
    const botStatusColor = global.config?.bot_offline === true ? "red" : "green";
    const botStatusIcon = global.config?.bot_offline === true ? "😴" : "🚀";
    
    const time = getTimestamp();
    console.log(chalk.bold.cyan('╔═══════════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║') + chalk.bold.white('           TRẠNG THÁI BOT                     ') + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('╠═══════════════════════════════════════════════╣'));
    console.log(chalk.bold.cyan('║ ') + chalk.bold[botStatusColor](`${botStatusIcon} Bot: ${botStatus}`) + ' '.repeat(47 - (`${botStatusIcon} Bot: ${botStatus}`).length) + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('╚═══════════════════════════════════════════════╝'));
    console.log('');
}

module.exports = {
    log,
    printBanner,
    logMessage,
    logBotStatus
};
