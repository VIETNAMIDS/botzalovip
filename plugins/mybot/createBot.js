const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { Zalo, LoginQRCallbackEventType } = require("zca-js");
const qrcode = require("qrcode-terminal");
const { sendMessageFailed, sendMessageComplete, sendMessageFromSQL } = require("./chat-style-fake.js");

const projectRoot = path.resolve(__dirname, "..", "..", "..");
const myBotDir = path.join(projectRoot, "mybot");
const botsDir = path.join(myBotDir, "bots");
const myBotsPath = path.join(myBotDir, "mybots.json");
const defaultCommand = path.join(myBotDir, "defaultCommand.json");
const qrTempDir = path.join(myBotDir, "qr-codes");
const launcherPath = path.join(projectRoot, "index.js");
const adminListPath = path.join("C:", "Users", "Administrator", "Downloads", "HHH_BOT", "HHH_BOT", "assets", "data", "list_admin.json");
const isWindows = process.platform === "win32";

async function createBot(api, message, groupAdmins, arg) {
  const { threadId, data: { uidFrom, dName, content }, type } = message;
  let args = content.split(/\s+/);
  if (arg) args = arg;
  
  // Kiểm tra nếu tin nhắn được gửi trong nhóm
  if (type === 1) {
    try {
      await sendMessageFailed(
        api,
        message,
        "Thông tin khởi tạo bot là thông tin nhạy cảm, vui lòng sử dụng lệnh tại tin nhắn riêng tư!",
        true,
        60000
      );
    } catch (err) {
      console.error(`Lỗi khi gửi tin nhắn: ${err.message}`);
    }

async function acquireCredentialsViaQR(api, message, uidFrom) {
  await sendMessageFromSQL(
    api,
    message,
    { message: `🔐 ${uidFrom}, đang tạo mã QR đăng nhập...`, success: true },
    true,
    60000
  );

  if (!fs.existsSync(qrTempDir)) {
    fs.mkdirSync(qrTempDir, { recursive: true });
  }

  const zalo = new Zalo({
    selfListen: false,
    checkUpdate: true,
    logging: false
  });

  const qrPath = path.join(qrTempDir, `qr-${uidFrom}-${Date.now()}.png`);
  let tempCredentials = null;

  const apiInstance = await zalo.loginQR({ qrPath }, (event) => {
    if (!event) return;

    switch (event.type) {
      case LoginQRCallbackEventType.QRCodeGenerated: {
        event.actions?.saveToFile?.(qrPath);
        const imageData = event.data?.image?.replace(/^data:image\/png;base64,/, "");
        if (imageData) {
          qrcode.generate(imageData, { small: true }, (qr) => {
            console.log(qr);
          });
        }
        sendQrImage(api, message, qrPath, uidFrom);
        break;
      }
      case LoginQRCallbackEventType.QRCodeScanned:
        sendMessageFromSQL(
          api,
          message,
          { message: `✅ Bot ${uidFrom}: Đã quét QR, hãy xác nhận đăng nhập trên điện thoại.`, success: true },
          true,
          60000
        ).catch(() => {});
        break;
      case LoginQRCallbackEventType.QRCodeExpired:
        sendMessageFromSQL(
          api,
          message,
          { message: `⏳ QR của bot ${uidFrom} đã hết hạn, đang tạo lại...`, success: false },
          true,
          60000
        ).catch(() => {});
        event.actions?.retry();
        break;
      case LoginQRCallbackEventType.QRCodeDeclined:
        sendMessageFailed(
          api,
          message,
          `❌ Bạn đã từ chối đăng nhập QR cho bot ${uidFrom}. Vui lòng thử lại.`,
          true,
          60000
        ).catch(() => {});
        break;
      case LoginQRCallbackEventType.GotLoginInfo:
        tempCredentials = {
          cookie: event.data?.cookie,
          imei: event.data?.imei,
          userAgent: event.data?.userAgent
        };
        break;
      default:
        break;
    }
  });

  if (!tempCredentials) {
    tempCredentials = {
      cookie: apiInstance?.ctx?.cookie?.toJSON?.().cookies || [],
      imei: apiInstance?.ctx?.imei,
      userAgent: apiInstance?.ctx?.userAgent
    };
  }

  if (!tempCredentials?.cookie || !tempCredentials?.imei) {
    throw new Error("Không thể lấy thông tin đăng nhập từ QR.");
  }

  try {
    fs.unlinkSync(qrPath);
  } catch {}

  return tempCredentials;
}

async function sendQrImage(api, message, qrPath, uidFrom) {
  try {
    await api.sendMessage(
      {
        msg: `📸 QR đăng nhập cho bot ${uidFrom}\n• Quét trong 100s và xác nhận trên điện thoại\n• Nếu hết hạn bot sẽ tự gửi lại`,
        attachments: [qrPath],
        ttl: 120000
      },
      message.threadId,
      message.type
    );
  } catch (error) {
    console.error(`Không thể gửi ảnh QR cho bot ${uidFrom}: ${error.message}`);
  }
}
    return;
  }

  let credentials = null;
  if (args.length >= 3) {
    // Kiểm tra tính hợp lệ của thông tin xác thực cũ (cookie + imei)
    const validationResult = validateCredentials(args);
    if (!validationResult.valid) {
      try {
        await sendMessageFromSQL(api, message, { message: validationResult.message, success: false }, true);
      } catch (err) {
        console.error(`Lỗi khi gửi tin nhắn: ${err.message}`);
      }
      return;
    }
    credentials = validationResult.credentials;
  }

  try {
    // Kiểm tra bot đã tồn tại
    const checkResult = await checkExistingBot(uidFrom);
    if (checkResult.exists) {
      if (checkResult.message) {
        await sendMessageFailed(api, message, checkResult.message, true);
      }
      return;
    }

    // Kiểm tra file launcher tồn tại
    if (!fs.existsSync(launcherPath)) {
      try {
        await sendMessageFailed(api, message, "Đã xảy ra lỗi nghiêm trọng trong dự án!", true);
      } catch (err) {
        console.error(`Lỗi khi gửi tin nhắn: ${err.message}`);
      }
      return;
    }

    // Đảm bảo các thư mục cần thiết tồn tại
    await ensureDirectoriesExist();

    // Nếu chưa có thông tin đăng nhập hợp lệ, chuyển sang đăng nhập QR
    if (!credentials) {
      credentials = await acquireCredentialsViaQR(api, message, uidFrom);
    }

    // Gửi thông báo đang khởi tạo bot
    try {
      await sendMessageFromSQL(
        api,
        message,
        { message: "Đang khởi tạo bot của bạn, vui lòng chờ hoàn tất!", success: true },
        true,
        60000
      );
    } catch (err) {
      console.error(`Lỗi khi gửi tin nhắn: ${err.message}`);
    }

    // Tạo cấu hình bot và các file cần thiết
    const webPort = getAvailablePort();
    const botConfig = createBotConfig(uidFrom, webPort);
    await createAllRequiredFiles(uidFrom, credentials, botConfig);
    const now = new Date();
    const expiryTime = new Date(now.getTime() + 5 * 60 * 1000);
    await saveBotToMyBots(uidFrom, dName, webPort, expiryTime);

    // Gửi thông báo bot đã được tạo
    try {
      await sendMessageComplete(
        api,
        message,
        `Bot "${uidFrom}" đã được khởi tạo và đang chờ phê duyệt!\n\n📋 Thông tin bot:\n• Bot ID: ${uidFrom}\n• Người tạo: ${dName}\n• Trạng thái: ⌛ Chờ phê duyệt\n• Web Port: ${webPort}\n• ⏰ Thời hạn tạm thời: 5 phút (HSD: ${formatDateTime(expiryTime)})\n\n💡 Vui lòng chờ admin phê duyệt bot của bạn. Sau khi được phê duyệt, bạn có thể sử dụng lệnh !mybot add admin <uid của bạn>.`,
        true,
        60000
      );
    } catch (err) {
      console.error(`Lỗi khi gửi tin nhắn: ${err.message}`);
    }

  } catch (error) {
    console.error(`Lỗi tạo bot: ${error.message}`);
    try {
      await sendMessageFailed(api, message, `Đã xảy ra lỗi khi tạo bot!\nChi tiết: ${error.message}`, true);
    } catch (err) {
      console.error(`Lỗi khi gửi tin nhắn: ${err.message}`);
    }
  }
}

// Các hàm hỗ trợ khác giữ nguyên
function getAvailablePort() {
  try {
    if (!fs.existsSync(myBotsPath)) {
      return 2100;
    }
    const myBots = JSON.parse(fs.readFileSync(myBotsPath, "utf8"));
    const usedPorts = Object.values(myBots).map(bot => parseInt(bot.webPort));
    for (let port = 3334; port <= 3600; port++) {
      if (!usedPorts.includes(port)) {
        return port;
      }
    }
    throw new Error("Không còn port khả dụng (2100–2400)");
  } catch (error) {
    console.error(`Lỗi lấy port: ${error.message}`);
    return 2100;
  }
}

function validateCredentials(args) {
  const defaultUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";
  let cookie;
  try {
    cookie = JSON.parse(args[1]);
    if (typeof cookie !== "object" || cookie === null || Array.isArray(cookie)) {
      return {
        valid: false,
        message: "❌ Cookie phải là JSON object hợp lệ!\n\n📝 Ví dụ: {\"session\":\"abc123\",\"token\":\"xyz789\"}"
      };
    }
  } catch (error) {
    return {
      valid: false,
      message: "❌ Cookie không đúng định dạng JSON!\n\n📝 Ví dụ: {\"session\":\"abc123\",\"token\":\"xyz789\"}"
    };
  }
  const imei = args[2];
  if (typeof imei !== "string" || imei.trim() === "") {
    return {
      valid: false,
      message: "❌ IMEI phải là chuỗi không rỗng!\n\n📝 Ví dụ: \"123456789012345\""
    };
  }
  let userAgent = args.slice(3).join(" ") || defaultUserAgent;
  if (args[3] && !isValidUserAgent(args[3])) {
    userAgent = defaultUserAgent;
  }
  return {
    valid: true,
    credentials: { cookie, imei, userAgent }
  };
}

function isValidUserAgent(userAgent) {
  if (typeof userAgent !== "string" || userAgent.trim() === "") return false;
  const commonPatterns = [/Mozilla/i, /Chrome/i, /Safari/i, /Firefox/i, /Edge/i, /Opera/i];
  return commonPatterns.some(pattern => pattern.test(userAgent)) && userAgent.length > 20;
}

async function checkExistingBot(uidFrom) {
  try {
    if (!fs.existsSync(myBotsPath)) {
      return { exists: false };
    }
    const myBots = JSON.parse(fs.readFileSync(myBotsPath, "utf8"));
    const existingBot = myBots[uidFrom];
    if (!existingBot) {
      return { exists: false };
    }
    const pm2Status = await checkPM2Status(uidFrom);
    if (pm2Status.running) {
      return { exists: true, message: "❌ Bạn đã có một bot đang hoạt động! Mỗi người chỉ được tạo 1 bot." };
    }
    switch (existingBot.status) {
      case "running":
        if (!pm2Status.running) {
          existingBot.status = "stopped";
          myBots[uidFrom] = existingBot;
          fs.writeFileSync(myBotsPath, JSON.stringify(myBots, null, 2));
          return { exists: false };
        }
        return { exists: true, message: "❌ Bạn đã có một bot đang hoạt động! Mỗi người chỉ được tạo 1 bot." };
      case "trialExpired":
        return { exists: true, message: "❌ Bạn đã hết thời gian dùng thử! Hãy gia hạn bot của bạn." };
      case "expired":
        return { exists: true, message: "❌ Bot của bạn đã hết hạn! Hãy gia hạn để tiếp tục sử dụng." };
      case "stopping":
        return { exists: true, message: "❌ Bot của bạn đang trong trạng thái bảo trì! Hãy liên hệ admin." };
      default:
        return { exists: true };
    }
  } catch (error) {
    console.error(`Lỗi kiểm tra bot hiện có: ${error.message}`);
    return { exists: false };
  }
}

function createBotConfig(uidFrom, webPort) {
  return {
    "name": uidFrom,
    "configFilePath": `mybot/credentials/${uidFrom}.json`,
    "groupSettingsPath": `mybot/settings/groupSettings-${uidFrom}.json`,
    "adminFilePath": `mybot/configs/admins-${uidFrom}.json`,
    "commandFilePath": `mybot/json-data/command-${uidFrom}.json`,
    "MANAGER_FILE_PATH": `mybot/json-data/manager-${uidFrom}.json`,
    "DATA_GAME_FILE_PATH": `mybot/json-data/game_data-${uidFrom}.json`,
    "DATA_NT_PATH": `mybot/json-data/nong-trai-${uidFrom}.json`,
    "PROPHYLACTIC_CONFIG_PATH": `mybot/json-data/prophylactic-${uidFrom}.json`,
    "logDir": `logs/${uidFrom}`,
    "resourceDir": `assets/resources/${uidFrom}`,
    "tempDir": `assets/temp/${uidFrom}`,
    "dataGifPath": `assets/resources/gif/${uidFrom}`,
    "WEB_CONFIG_PATH": `mybot/json-data/web_config-${uidFrom}.json`,
    "webPort": webPort.toString(),
    "databaseFile": `mybot/json-data/database_config-${uidFrom}.json`,
    "dataTrainingPath": `mybot/json-data/data_training-${uidFrom}.json`,
    "rankInfoPath": `mybot/json-data/rank_info-${uidFrom}.json`
  };
}

async function createAllRequiredFiles(uidFrom, credentials, botConfig) {
  const requiredDirs = [
    path.join(myBotDir, "credentials"),
    path.join(myBotDir, "configs"),
    path.join(myBotDir, "settings"),
    path.join(myBotDir, "json-data"),
    path.join(projectRoot, "logs", uidFrom),
    path.join(projectRoot, "assets", "resources", uidFrom),
    path.join(projectRoot, "assets", "temp", uidFrom),
    path.join(projectRoot, "assets", "resources", "gif", uidFrom)
  ];
  requiredDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  const credentialsData = {
    "cookie": credentials.cookie,
    "imei": credentials.imei,
    "userAgent": credentials.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"
  };

  const fileMap = {
    [path.join(projectRoot, botConfig.configFilePath)]: credentialsData,
    [path.join(projectRoot, botConfig.groupSettingsPath)]: {},
    [path.join(projectRoot, botConfig.adminFilePath)]: [],
    [path.join(projectRoot, botConfig.MANAGER_FILE_PATH)]: {
      "groupRequiredReset": "-1",
      "onGamePrivate": true,
      "onBotPrivate": true
    },
    [path.join(projectRoot, botConfig.DATA_GAME_FILE_PATH)]: {},
    [path.join(projectRoot, botConfig.PROPHYLACTIC_CONFIG_PATH)]: {
      "prophylacticUploadAttachment": {
        "enable": false,
        "lastBlocked": Date.now(),
        "numRequestZalo": 1,
        "lastRequestTime": Date.now()
      }
    },
    [path.join(projectRoot, botConfig.WEB_CONFIG_PATH)]: {},
    [path.join(projectRoot, botConfig.databaseFile)]: {
      "nameServer": "HA HUY HOANG",
      "host": "localhost",
      "user": "root",
      "password": "",
      "database": `${uidFrom}`,
      "port": 3306,
      "tablePlayerZalo": "players_zalo",
      "tableAccount": "account",
      "dailyReward": 100000000000
    },
    [path.join(projectRoot, botConfig.dataTrainingPath)]: {},
    [path.join(projectRoot, botConfig.rankInfoPath)]: {}
  };

  for (const [filePath, data] of Object.entries(fileMap)) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      throw new Error(`Không thể tạo file ${filePath}: ${error.message}`);
    }
  }

  if (fs.existsSync(defaultCommand)) {
    try {
      await fs.promises.copyFile(defaultCommand, path.join(projectRoot, botConfig.commandFilePath));
    } catch (error) {
      throw new Error(`Không thể copy file defaultCommand.json: ${error.message}`);
    }
  } else {
    fs.writeFileSync(path.join(projectRoot, botConfig.commandFilePath), JSON.stringify({}, null, 2));
  }

  const botConfigPath = path.join(botsDir, `${uidFrom}.json`);
  try {
    fs.writeFileSync(botConfigPath, JSON.stringify(botConfig, null, 4));
  } catch (error) {
    throw new Error(`Không thể tạo file config bot: ${error.message}`);
  }
}

async function startBotWithLauncher(uidFrom) {
  return new Promise((resolve) => {
    const launcherProcess = spawn("node", [launcherPath, uidFrom], {
      stdio: "pipe",
      shell: isWindows,
      windowsHide: isWindows,
      detached: !isWindows,
      env: {
        ...process.env,
        UID_FROM: uidFrom
      }
    });
    let output = "";
    let errorOutput = "";
    let hasStarted = false;
    launcherProcess.stdout?.on("data", (data) => {
      const text = data.toString();
      output += text;
      if (text.includes("Successfully") || text.includes("started") || text.includes("listening")) {
        hasStarted = true;
      }
    });
    launcherProcess.stderr?.on("data", (data) => {
      errorOutput += data.toString();
    });
    const checkTimeout = setTimeout(async () => {
      try {
        const isRunning = await waitForPM2Process(uidFrom, 45000);
        resolve(isRunning);
      } catch (error) {
        console.error(`Error checking PM2 status: ${error.message}`);
        resolve(false);
      }
    }, 5000);
    launcherProcess.on("close", (code) => {
      clearTimeout(checkTimeout);
      resolve(code === 0 || hasStarted);
    });
    launcherProcess.on("error", (error) => {
      clearTimeout(checkTimeout);
      console.error(`Launcher process error: ${error.message}`);
      resolve(false);
    });
    if (!isWindows) {
      launcherProcess.unref();
    }
  });
}

async function waitForPM2Process(processName, maxWaitTime = 60000) {
  const startTime = Date.now();
  const checkInterval = 2000;
  while (Date.now() - startTime < maxWaitTime) {
    const status = await checkPM2Status(processName);
    if (status.running && status.status === "online") {
      return true;
    }
    if (status.status === "stopped") {
      return false;
    }
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
  return false;
}

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

async function saveBotToMyBots(uidFrom, dName, webPort, expiryTime) {
  try {
    let myBots = {};
    if (fs.existsSync(myBotsPath)) {
      myBots = JSON.parse(fs.readFileSync(myBotsPath, "utf8"));
    }
    myBots[uidFrom] = {
      name: uidFrom,
      displayName: dName,
      createdBy: dName,
      createdAt: new Date().toISOString(),
      expiryAt: expiryTime.toISOString(),
      hsd: formatDateTime(expiryTime),
      webPort: webPort.toString(),
      status: "pending",
      database: uidFrom
    };
    fs.writeFileSync(myBotsPath, JSON.stringify(myBots, null, 2));
  } catch (error) {
    console.error(`Lỗi khi lưu thông tin bot: ${error.message}`);
    throw error;
  }
}

async function ensureDirectoriesExist() {
  const directories = [
    myBotDir,
    botsDir,
    path.join(myBotDir, "credentials"),
    path.join(myBotDir, "configs"),
    path.join(myBotDir, "settings"),
    path.join(myBotDir, "json-data")
  ];
  directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  if (!fs.existsSync(myBotsPath)) {
    fs.writeFileSync(myBotsPath, JSON.stringify({}, null, 2));
  }
}

function formatDateTime(date) {
  const options = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh"
  };
  return date.toLocaleString("vi-VN", options);
}