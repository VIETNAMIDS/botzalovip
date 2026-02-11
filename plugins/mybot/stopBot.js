import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { sendMessageFromSQL } from "./chat-style-fake.js";

const projectRoot = path.resolve(__dirname, "..", "..", "..");
const myBotDir = path.join(projectRoot, "mybot");
const myBotsPath = path.join(myBotDir, "mybots.json");
const isWindows = process.platform === "win32";

export async function stopBot(api, message, groupAdmins) {
  const { threadId, data: { uidFrom, dName }, type } = message;
  try {
    const checkResult = await checkBotExists(uidFrom);
    if (!checkResult.exists) {
      if (api) {
        try {
          await sendMessageFromSQL(
            api,
            message,
            {
              success: false,
              message: "Bạn chưa có bot nào được tạo!"
            },
            true,
            60000
          );
        } catch (err) {
          
        }
      }
      return;
    }
    const botInfo = checkResult.botInfo;
    if (["expired", "stopped"].includes(botInfo.status)) {
      if (api) {
        try {
          await sendMessageFromSQL(
            api,
            message,
            {
              success: false,
              message: "Bot của bạn đã dừng sẵn rồi!"
            },
            true,
            60000
          );
        } catch (err) {
         
        }
      }
      return;
    }
    if (["trialExpired", "stopping"].includes(botInfo.status)) {
      const statusMessages = {
        "trialExpired": "Bạn đã hết thời gian dùng thử! Hãy gia hạn bot của bạn.",
        "stopping": "Bot của bạn đang trong trạng thái bảo trì! Hãy liên hệ admin."
      };
      if (api) {
        try {
          await sendMessageFromSQL(
            api,
            message,
            {
              success: false,
              message: statusMessages[botInfo.status]
            },
            true,
            60000
          );
        } catch (err) {
          
        }
      }
      return;
    }
    const pm2Status = await checkPM2Status(uidFrom);
    if (!pm2Status.running) {
      await updateBotStatus(uidFrom, "stopped");
      if (api) {
        try {
          await sendMessageFromSQL(
            api,
            message,
            {
              success: false,
              message: "Bot của bạn đã dừng từ trước!"
            },
            true,
            60000
          );
        } catch (err) {
         
        }
      }
      return;
    }
    if (api) {
      try {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: "Đang dừng bot..."
          },
          true,
          60000
        );
      } catch (err) {
        
      }
    }
    const stopSuccess = await stopPM2Process(uidFrom);
    if (stopSuccess) {
      await updateBotStatus(uidFrom, "stopped");
      const botName = botInfo.displayName || botInfo.name || uidFrom;
      const now = new Date();
      const expiryAt = new Date(botInfo.expiryAt);
      const timeRemaining = expiryAt > now ? formatTimeDifference(now, expiryAt) : "Đã hết hạn";
      const stopMessage = 
        `⏹️ Đã tắt bot ${botName} thành công!\n` +
        `👤 Chủ sở hữu: ${dName}\n` +
        `🆔 ID tài khoản: ${uidFrom}\n` +
        `⏰ Thời hạn còn lại: ${timeRemaining}`;
      if (api) {
        try {
          await sendMessageFromSQL(
            api,
            message,
            {
              success: true,
              message: stopMessage
            },
            true,
            60000
          );
        } catch (err) {
         
        }
      }
    } else {
      if (api) {
        try {
          await sendMessageFromSQL(
            api,
            message,
            {
              success: false,
              message: "Không thể dừng bot. Vui lòng thử lại hoặc liên hệ admin!"
            },
            true,
            60000
          );
        } catch (err) {
      
        }
      }
  
    }
  } catch (error) {
   
    if (api) {
      try {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: `Đã xảy ra lỗi khi dừng bot!\nChi tiết: ${error.message}`
          },
          true,
          60000
        );
      } catch (err) {
   
      }
    } else {
    }
  }
}

// Các hàm hỗ trợ khác giữ nguyên
async function checkPM2Status(processName) {
  return new Promise((resolve) => {
    const pm2Command = isWindows ? "pm2.cmd" : "pm2";
    const pm2Process = spawn(pm2Command, ["describe", processName], {
      stdio: "pipe",
      shell: true,
      windowsHide: isWindows
    });
    let output = "";
    let errorOutput = "";
    pm2Process.stdout?.on("data", (data) => {
      output += data.toString();
    });
    pm2Process.stderr?.on("data", (data) => {
      errorOutput += data.toString();
    });
    pm2Process.on("close", (code) => {
      if (code === 0 && output.includes("online")) {
        resolve({ running: true, status: "online" });
      } else if (code === 0 && output.includes("stopped")) {
        resolve({ running: false, status: "stopped" });
      } else {
        resolve({ running: false, status: "not_found" });
      }
    });
    pm2Process.on("error", () => {
      resolve({ running: false, status: "error" });
    });
    setTimeout(() => {
      pm2Process.kill();
      resolve({ running: false, status: "timeout" });
    }, 10000);
  });
}

async function stopPM2Process(processName) {
  return new Promise((resolve) => {
    const pm2Command = isWindows ? "pm2.cmd" : "pm2";
    const pm2Process = spawn(pm2Command, ["stop", processName], {
      stdio: "pipe",
      shell: true,
      windowsHide: isWindows
    });
    let output = "";
    let errorOutput = "";
    pm2Process.stdout?.on("data", (data) => {
      output += data.toString();
    });
    pm2Process.stderr?.on("data", (data) => {
      errorOutput += data.toString();
    });
    pm2Process.on("close", (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        console.error(`Failed to stop PM2 process: ${processName}`);
        if (errorOutput) console.error(`Error: ${errorOutput}`);
        resolve(false);
      }
    });
    pm2Process.on("error", (error) => {
      console.error(`Error stopping PM2 process: ${error.message}`);
      resolve(false);
    });
    setTimeout(() => {
      pm2Process.kill();
      console.error(`Timeout stopping PM2 process: ${processName}`);
      resolve(false);
    }, 15000);
  });
}

async function checkBotExists(uidFrom) {
  try {
    if (!fs.existsSync(myBotsPath)) {
      return { exists: false };
    }
    const myBots = JSON.parse(fs.readFileSync(myBotsPath, "utf8"));
    const botInfo = myBots[uidFrom];
    if (!botInfo) {
      return { exists: false };
    }
    return { exists: true, botInfo };
  } catch (error) {
    console.error(`Lỗi kiểm tra bot: ${error.message}`);
    return { exists: false };
  }
}

async function updateBotStatus(uidFrom, status) {
  try {
    if (!fs.existsSync(myBotsPath)) {
      throw new Error("File mybots.json không tồn tại");
    }
    const myBots = JSON.parse(fs.readFileSync(myBotsPath, "utf8"));
    if (!myBots[uidFrom]) {
      throw new Error("Bot không tồn tại trong danh sách");
    }
    myBots[uidFrom].status = status;
    myBots[uidFrom].lastUpdated = new Date().toISOString();
    fs.writeFileSync(myBotsPath, JSON.stringify(myBots, null, 2));
  } catch (error) {
   
    throw error;
  }
}

function formatTimeDifference(startDate, endDate) {
  const diffMs = Math.abs(endDate - startDate);
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays > 0) {
    const remainingHours = diffHours % 24;
    return `${diffDays} ngày ${remainingHours} giờ`;
  } else if (diffHours > 0) {
    const remainingMinutes = diffMinutes % 60;
    return `${diffHours} giờ ${remainingMinutes} phút`;
  } else if (diffMinutes > 0) {
    const remainingSeconds = diffSeconds % 60;
    return `${diffMinutes} phút ${remainingSeconds} giây`;
  } else {
    return `${diffSeconds} giây`;
  }
}