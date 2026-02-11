const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');
const loaderCommand = require('./loaderCommand');

const debounceTimers = new Map();

function debounceReload(filePath, delay = 700) {
  const previous = debounceTimers.get(filePath);
  if (previous) clearTimeout(previous);
  const timer = setTimeout(async () => {
    debounceTimers.delete(filePath);
    const commandName = path.basename(filePath, '.js');
    try {
      const result = await loaderCommand(commandName);
      if (result?.status) {
        if (result.restart) {
          logger.log(`⚠️ Lệnh "${commandName}" yêu cầu khởi động lại để hoàn tất cài đặt phụ thuộc.`, 'warn');
        } else {
          logger.log(`🔁 Đã tự động tải lại lệnh "${commandName}"`, 'info');
        }
      } else if (result?.error) {
        logger.log(`❌ Không thể tải lại lệnh "${commandName}": ${result.error}`, 'error');
      }
    } catch (error) {
      logger.log(`❌ Lỗi khi tự động tải lệnh "${commandName}": ${error.message || error}`, 'error');
    }
  }, delay);
  debounceTimers.set(filePath, timer);
}

function startCommandWatcher() {
  const commandsDir = path.join(__dirname, '../..', 'plugins', 'commands');

  if (!fs.existsSync(commandsDir)) {
    logger.log('⚠️ Không tìm thấy thư mục commands để bật auto-load.', 'warn');
    return;
  }

  try {
    fs.watch(commandsDir, { persistent: true }, (eventType, filename) => {
      if (!filename || !filename.endsWith('.js')) return;
      const filePath = path.join(commandsDir, filename);
      debounceReload(filePath);
    });

    logger.log('🔄 Auto load command watcher đã bật. Thêm/sửa file .js sẽ được tải lại tự động.', 'info');
  } catch (error) {
    logger.log(`❌ Không thể bật auto load commands: ${error.message || error}`, 'error');
  }
}

module.exports = startCommandWatcher;
