/**
 * Convert Python zlapi session to JavaScript format
 * This script reads session data from Python zlapi and converts it for Direct Zalo API
 */

const fs = require('fs');
const path = require('path');

function convertPythonSession() {
  try {
    console.log('[PYTHON SESSION CONVERTER] Starting conversion...');
    
    // Try to find Python session files
    const possiblePaths = [
      path.join(__dirname, '../../zlapiii'),
      path.join(__dirname, '../../zlapi'),
      path.join(__dirname, '../../'),
      path.join(__dirname, '../../../zlapiii'),
      path.join(__dirname, '../../../zlapi')
    ];
    
    let sessionData = null;
    let sourcePath = null;
    
    // Look for session files
    for (const basePath of possiblePaths) {
      const sessionFiles = [
        path.join(basePath, 'session.json'),
        path.join(basePath, 'cookies.json'),
        path.join(basePath, 'state.json'),
        path.join(basePath, '_state.json'),
        path.join(basePath, 'appstate.json')
      ];
      
      for (const sessionFile of sessionFiles) {
        if (fs.existsSync(sessionFile)) {
          try {
            const data = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
            if (data && typeof data === 'object') {
              sessionData = data;
              sourcePath = sessionFile;
              console.log(`[PYTHON SESSION CONVERTER] ✅ Found session at: ${sessionFile}`);
              break;
            }
          } catch (e) {
            console.log(`[PYTHON SESSION CONVERTER] ❌ Failed to read ${sessionFile}:`, e.message);
          }
        }
      }
      
      if (sessionData) break;
    }
    
    // If no JSON files found, try to extract from Python files
    if (!sessionData) {
      console.log('[PYTHON SESSION CONVERTER] 📝 No JSON session found, trying Python files...');
      
      for (const basePath of possiblePaths) {
        const pythonFiles = [
          path.join(basePath, '_state.py'),
          path.join(basePath, 'state.py'),
          path.join(basePath, 'session.py')
        ];
        
        for (const pythonFile of pythonFiles) {
          if (fs.existsSync(pythonFile)) {
            console.log(`[PYTHON SESSION CONVERTER] 📄 Found Python file: ${pythonFile}`);
            // Note: We can't directly execute Python from Node.js without additional setup
            // But we can provide instructions for manual extraction
          }
        }
      }
    }
    
    if (!sessionData) {
      return {
        success: false,
        message: 'No Python session files found',
        instructions: [
          '🔧 MANUAL EXTRACTION FROM PYTHON:',
          '',
          '1. Chạy Python script để extract session:',
          '```python',
          'import json',
          'from zlapiii import State  # hoặc zlapi',
          '',
          '# Assuming you have a logged-in state object',
          'state = State()',
          '# After login...',
          '',
          'session_data = {',
          '    "cookies": state.get_cookies(),',
          '    "secretKey": state.get_secret_key(),',
          '    "imei": state.user_imei,',
          '    "userId": state.user_id,',
          '    "config": state._config',
          '}',
          '',
          'with open("session.json", "w") as f:',
          '    json.dump(session_data, f, indent=2)',
          '```',
          '',
          '2. Copy session.json vào thư mục config/',
          '3. Rename thành zalo_session.json',
          '4. Thử lại bonz chat off'
        ]
      };
    }
    
    // Convert Python session format to JavaScript format
    const convertedSession = {
      cookies: null,
      secretKey: null,
      imei: null,
      userId: null,
      extractedAt: new Date().toISOString(),
      source: 'python_zlapi',
      sourcePath: sourcePath
    };
    
    // Extract cookies
    if (sessionData.cookies || sessionData._cookies) {
      convertedSession.cookies = sessionData.cookies || sessionData._cookies;
      console.log('[PYTHON SESSION CONVERTER] ✅ Cookies extracted');
    }
    
    // Extract secret key
    if (sessionData.secretKey || sessionData.secret_key) {
      convertedSession.secretKey = sessionData.secretKey || sessionData.secret_key;
      console.log('[PYTHON SESSION CONVERTER] ✅ Secret key extracted');
    } else if (sessionData.config && (sessionData.config.secret_key || sessionData.config.secretKey)) {
      convertedSession.secretKey = sessionData.config.secret_key || sessionData.config.secretKey;
      console.log('[PYTHON SESSION CONVERTER] ✅ Secret key extracted from config');
    } else if (sessionData._config && (sessionData._config.secret_key || sessionData._config.secretKey)) {
      convertedSession.secretKey = sessionData._config.secret_key || sessionData._config.secretKey;
      console.log('[PYTHON SESSION CONVERTER] ✅ Secret key extracted from _config');
    }
    
    // Extract IMEI
    if (sessionData.imei || sessionData.user_imei) {
      convertedSession.imei = sessionData.imei || sessionData.user_imei;
      console.log('[PYTHON SESSION CONVERTER] ✅ IMEI extracted');
    }
    
    // Extract User ID
    if (sessionData.userId || sessionData.user_id) {
      convertedSession.userId = sessionData.userId || sessionData.user_id;
      console.log('[PYTHON SESSION CONVERTER] ✅ User ID extracted');
    } else if (sessionData.config && (sessionData.config.send2me_id || sessionData.config.user_id)) {
      convertedSession.userId = sessionData.config.send2me_id || sessionData.config.user_id;
      console.log('[PYTHON SESSION CONVERTER] ✅ User ID extracted from config');
    } else if (sessionData._config && (sessionData._config.send2me_id || sessionData._config.user_id)) {
      convertedSession.userId = sessionData._config.send2me_id || sessionData._config.user_id;
      console.log('[PYTHON SESSION CONVERTER] ✅ User ID extracted from _config');
    }
    
    // Validate converted session
    const isComplete = convertedSession.cookies && convertedSession.secretKey && convertedSession.imei;
    
    if (!isComplete) {
      console.log('[PYTHON SESSION CONVERTER] ⚠️ Incomplete conversion:');
      console.log('- Cookies:', !!convertedSession.cookies);
      console.log('- Secret Key:', !!convertedSession.secretKey);
      console.log('- IMEI:', !!convertedSession.imei);
      
      return {
        success: false,
        message: 'Incomplete session data after conversion',
        data: convertedSession,
        originalData: sessionData
      };
    }
    
    // Save converted session
    const configDir = path.join(__dirname, '../../config');
    const outputPath = path.join(configDir, 'zalo_session.json');
    
    // Create config directory if it doesn't exist
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
      console.log('[PYTHON SESSION CONVERTER] Created config directory');
    }
    
    // Save session data
    fs.writeFileSync(outputPath, JSON.stringify(convertedSession, null, 2));
    console.log('[PYTHON SESSION CONVERTER] ✅ Converted session saved to:', outputPath);
    
    return {
      success: true,
      message: 'Python session converted successfully',
      path: outputPath,
      data: {
        cookies: !!convertedSession.cookies,
        secretKey: !!convertedSession.secretKey,
        imei: convertedSession.imei,
        userId: convertedSession.userId
      },
      source: sourcePath
    };
    
  } catch (error) {
    console.log('[PYTHON SESSION CONVERTER] ❌ Error:', error.message);
    return {
      success: false,
      message: `Python session conversion failed: ${error.message}`,
      error: error.message
    };
  }
}

// Export for use in other modules
module.exports = { convertPythonSession };

// Example usage:
/*
const { convertPythonSession } = require('./convert_python_session.js');

// In bonz command handler:
if (args[0] === 'convert-python') {
  const result = convertPythonSession();
  return api.sendMessage(
    `🔄 PYTHON SESSION CONVERSION\n\n` +
    `Status: ${result.success ? '✅ Success' : '❌ Failed'}\n` +
    `Message: ${result.message}\n\n` +
    `${result.success ? 
      `📁 Saved to: ${result.path}\n` +
      `📊 Data:\n` +
      `• Cookies: ${result.data.cookies ? '✅' : '❌'}\n` +
      `• Secret Key: ${result.data.secretKey ? '✅' : '❌'}\n` +
      `• IMEI: ${result.data.imei}\n` +
      `• User ID: ${result.data.userId}\n` +
      `• Source: ${result.source}\n\n` +
      `💡 Now you can use Direct Zalo API!`
      : 
      result.instructions ? 
        result.instructions.join('\n') :
        `❌ Error: ${result.error || 'Unknown error'}`
    }`,
    threadId, type
  );
}
*/
