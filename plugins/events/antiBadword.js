const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');
const chalk = require('chalk');

// Đường dẫn lưu dữ liệu
const DATA_DIR = path.join(__dirname, '../../data');
const BADWORD_FILE = path.join(DATA_DIR, 'badwords.json');

// Ensure data directory exists
function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (error) {
    console.error('Error creating data directory:', error);
  }
}

// Load dữ liệu từ file
function loadBadwordData() {
  try {
    ensureDataDir();
    if (!fs.existsSync(BADWORD_FILE)) {
      const defaultData = {
        badWords: [],
        violations: {}
      };
      fs.writeFileSync(BADWORD_FILE, JSON.stringify(defaultData, null, 2));
      return defaultData;
    }
    const raw = fs.readFileSync(BADWORD_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('Error loading badword data:', error);
    return {
      badWords: [],
      violations: {}
    };
  }
}

// Lưu dữ liệu vào file
function saveBadwordData(data) {
  try {
    ensureDataDir();
    fs.writeFileSync(BADWORD_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving badword data:', error);
    return false;
  }
}

// Cache data trong RAM
let badwordDataCache = loadBadwordData();

// Hàm chuẩn hóa văn bản
function normalizeText(text) {
  return text.toLowerCase().trim();
}

// Hàm kiểm tra từ cấm
function checkBadWords(content) {
  const badWords = badwordDataCache.badWords || [];
  const normalizedContent = normalizeText(content);
  const words = normalizedContent.split(/\s+/);

  for (const badWord of badWords) {
    const normalizedBadWord = normalizeText(badWord);

    // Kiểm tra từng từ riêng biệt
    for (const word of words) {
      if (word === normalizedBadWord) {
        return {
          found: true,
          word: badWord,
        };
      }
    }

    // Kiểm tra cụm từ trong nội dung
    if (normalizedBadWord.includes(" ")) {
      if (normalizedContent.includes(normalizedBadWord)) {
        return {
          found: true,
          word: badWord,
        };
      }
    }
  }

  return {
    found: false,
    word: null,
  };
}

// Hàm lưu vi phạm
function saveViolation(threadId, userId, userName, badWord) {
  const violations = badwordDataCache.violations || {};
  
  if (!violations[threadId]) {
    violations[threadId] = {};
  }

  if (!violations[threadId][userId]) {
    violations[threadId][userId] = {
      count: 0,
      words: [],
      name: userName
    };
  }

  violations[threadId][userId].count++;
  violations[threadId][userId].words.push({
    word: badWord,
    time: Date.now()
  });

  // Chỉ giữ lại 3 vi phạm gần nhất
  if (violations[threadId][userId].words.length > 3) {
    violations[threadId][userId].words = 
      violations[threadId][userId].words.slice(-3);
  }

  badwordDataCache.violations = violations;
  saveBadwordData(badwordDataCache);

  return violations[threadId][userId];
}

// Kiểm tra và xóa vi phạm cũ (chạy mỗi 5 giây)
function startViolationCleanup() {
  const jobName = "badwordViolationCheck";
  const existingJob = schedule.scheduledJobs[jobName];
  if (existingJob) {
    existingJob.cancel();
  }

  schedule.scheduleJob(jobName, "*/5 * * * * *", () => {
    try {
      let hasChanges = false;
      const currentTime = Date.now();
      const VIOLATION_TIMEOUT = 30 * 60 * 1000; // 30 phút

      const violations = {...badwordDataCache.violations};

      for (const threadId in violations) {
        for (const userId in violations[threadId]) {
          const userViolations = violations[threadId][userId];

          // Lọc ra các vi phạm trong vòng 30 phút
          const recentViolations = userViolations.words.filter((violation) => {
            return currentTime - violation.time < VIOLATION_TIMEOUT;
          });

          if (recentViolations.length < userViolations.words.length) {
            hasChanges = true;
            userViolations.words = recentViolations;
            userViolations.count = recentViolations.length;

            if (recentViolations.length === 0) {
              delete violations[threadId][userId];
            }
          }
        }

        if (Object.keys(violations[threadId]).length === 0) {
          delete violations[threadId];
        }
      }

      if (hasChanges) {
        badwordDataCache.violations = violations;
        saveBadwordData(badwordDataCache);
      }
    } catch (error) {
      console.error("Lỗi khi kiểm tra vi phạm:", error);
    }
  });

  console.log(chalk.yellow("✅ Đã khởi động schedule kiểm tra vi phạm từ cấm"));
}

// Khởi động cleanup khi load module
startViolationCleanup();

module.exports.config = {
  event_type: ["message"],
  name: "antiBadword",
  version: "2.0.0",
  author: "Bonz",
  description: "Kiểm duyệt và xóa tin nhắn chứa từ cấm"
};

module.exports.run = async ({ event, eventType, api }) => {
  if (eventType !== 'message') return;
  
  try {
    const { data, threadId, type } = event;
    let content = data?.content?.title || data?.content;
    
    // Chỉ xử lý text
    if (typeof content !== 'string') return;
    
    const senderId = data?.uidFrom;
    const senderName = data?.dName || 'Unknown';
    
    // Bỏ qua tin nhắn của bot
    if (data?.isOutbox || data?.isSelf) return;
    
    // Bỏ qua admin bot
    const admins = global?.config?.admin_bot || [];
    if (admins.includes(String(senderId))) return;
    
    // Kiểm tra từ cấm
    const checkResult = checkBadWords(content);
    
    if (checkResult.found) {
      // LOG RA TERMINAL
      console.log('');
      console.log(chalk.bold.red('╔════════════════════════════════════════════════════════════════╗'));
      console.log(chalk.bold.red('║') + chalk.bold.yellow('  🚫 PHÁT HIỆN TỪ CẤM - ANTI BADWORD  🚫'.padEnd(62)) + chalk.bold.red('║'));
      console.log(chalk.bold.red('╠════════════════════════════════════════════════════════════════╣'));
      console.log(chalk.bold.red('║ ') + chalk.bold.white('👤 Người vi phạm: ') + chalk.bold.yellow((senderName || 'Unknown').padEnd(42)) + chalk.bold.red('║'));
      console.log(chalk.bold.red('║ ') + chalk.bold.white('🆔 User ID: ') + chalk.bold.magenta((senderId || 'Unknown').padEnd(49)) + chalk.bold.red('║'));
      console.log(chalk.bold.red('║ ') + chalk.bold.white('🏠 Thread ID: ') + chalk.bold.blue(String(threadId).padEnd(47)) + chalk.bold.red('║'));
      console.log(chalk.bold.red('║ ') + chalk.bold.white('🎯 Từ cấm: ') + chalk.bold.green((checkResult.word || '').slice(0, 48).padEnd(48)) + chalk.bold.red('║'));
      console.log(chalk.bold.red('║ ') + chalk.bold.white('💬 Nội dung: ') + chalk.bold.white((content || '').slice(0, 46).padEnd(46)) + chalk.bold.red('║'));
      console.log(chalk.bold.red('╠════════════════════════════════════════════════════════════════╣'));
      console.log(chalk.bold.red('║ ') + chalk.bold.green('✅ ĐÃ XÓA TIN NHẮN TỰ ĐỘNG!'.padEnd(61)) + chalk.bold.red('║'));
      console.log(chalk.bold.red('╚════════════════════════════════════════════════════════════════╝'));
      console.log('');
      
      try {
        // Xóa tin nhắn
        await api.deleteMessage({
          threadId,
          type,
          data: {
            cliMsgId: data?.cliMsgId,
            msgId: data?.msgId,
            uidFrom: data?.uidFrom
          }
        }, false);
        
        // Lưu vi phạm
        const violation = saveViolation(threadId, senderId, senderName, checkResult.word);
        
        // Gửi cảnh báo
        let warningMsg = `⚠️ ${senderName} - Tin nhắn bị xóa vì chứa từ cấm: "${checkResult.word}"\n`;
        warningMsg += `📊 Cảnh cáo lần ${violation.count}/3`;
        
        if (violation.count >= 3) {
          warningMsg += '\n\n🚫 VI PHẠM 3 LẦN! Đang kick khỏi nhóm...';
          
          // Kick user khỏi nhóm
          try {
            await api.removeUserFromGroup(senderId, threadId);
            console.log(chalk.red(`👢 Đã kick ${senderName} (${senderId}) khỏi nhóm ${threadId} vì vi phạm 3 lần`));
            
            // Reset count sau khi kick
            const violations = {...badwordDataCache.violations};
            if (violations[threadId]?.[senderId]) {
              delete violations[threadId][senderId]; // Xóa hẳn khỏi danh sách
              badwordDataCache.violations = violations;
              saveBadwordData(badwordDataCache);
            }
          } catch (kickError) {
            console.error('Lỗi khi kick user:', kickError.message);
            warningMsg += '\n❌ Không thể kick (Bot không phải admin hoặc lỗi khác)';
            
            // Vẫn reset count nếu không kick được
            const violations = {...badwordDataCache.violations};
            if (violations[threadId]?.[senderId]) {
              violations[threadId][senderId].count = 0;
              badwordDataCache.violations = violations;
              saveBadwordData(badwordDataCache);
            }
          }
        }
        
        warningMsg += '\n\n⏱️ Tin nhắn này sẽ tự động xóa sau 60 giây...';
        
        // Gửi cảnh báo và lưu để xóa sau 60 giây
        const sentMsg = await api.sendMessage(warningMsg, threadId, type);
        
        // Tự động xóa tin nhắn sau 60 giây
        setTimeout(async () => {
          try {
            if (sentMsg?.data?.msgId) {
              await api.deleteMessage({
                threadId,
                type,
                data: {
                  cliMsgId: sentMsg.data.cliMsgId,
                  msgId: sentMsg.data.msgId,
                  uidFrom: sentMsg.data.uidFrom
                }
              }, false);
              console.log(chalk.gray(`🗑️ Đã tự động xóa tin cảnh báo từ cấm sau 60s (Thread: ${threadId})`));
            }
          } catch (error) {
            console.error('Lỗi khi tự động xóa tin nhắn cảnh báo:', error.message);
          }
        }, 60000); // 60 giây
        
      } catch (error) {
        console.error('Lỗi khi xử lý vi phạm từ cấm:', error);
      }
      
      return true;
    }
    
  } catch (error) {
    console.error('Lỗi trong antiBadword event:', error);
  }
};

// Export các hàm để command sử dụng
module.exports.getBadwordData = () => badwordDataCache;
module.exports.updateBadwordData = (newData) => {
  badwordDataCache = { ...badwordDataCache, ...newData };
  saveBadwordData(badwordDataCache);
};
module.exports.checkBadWords = checkBadWords;
module.exports.saveViolation = saveViolation;
