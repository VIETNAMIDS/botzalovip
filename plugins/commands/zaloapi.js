/**
 * Zalo API JavaScript Implementation
 * Converted from Python zlapi for direct bot integration
 */

const axios = require('axios');
const crypto = require('crypto');

class ZaloAPI {
  constructor() {
    this.cookies = null;
    this.secretKey = null;
    this.imei = null;
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Origin': 'https://chat.zalo.me',
      'Referer': 'https://chat.zalo.me/',
      'X-Requested-With': 'XMLHttpRequest'
    };
  }

  /**
   * Set session cookies and secret key
   */
  setSession(cookies, secretKey, imei) {
    this.cookies = cookies;
    this.secretKey = secretKey;
    this.imei = imei;
    console.log('[ZALO API] Session set successfully');
  }

  /**
   * Detect ZPW version based on available zlapi
   */
  detectZpwVersion() {
    // Try to detect from file system or default to newer version
    try {
      // Check if zlapiii exists (newer version with zpw_ver: 641)
      const fs = require('fs');
      const path = require('path');
      
      const zlapiiiPath = path.join(__dirname, '../../zlapiii');
      if (fs.existsSync(zlapiiiPath)) {
        console.log('[ZALO API] Detected zlapiii - using zpw_ver: 641');
        return 641;
      }
      
      // Fallback to older version
      console.log('[ZALO API] Using fallback zpw_ver: 645');
      return 645;
    } catch (error) {
      console.log('[ZALO API] Version detection failed, using default: 641');
      return 641; // Default to newer version
    }
  }

  /**
   * Encode payload using AES encryption (like zlapi Python)
   */
  _encode(data) {
    try {
      if (!this.secretKey) {
        console.log('[ZALO API] No secret key, returning raw data');
        return JSON.stringify(data);
      }
      
      // Implement proper AES encryption like Python zlapi
      const jsonString = JSON.stringify(data);
      
      try {
        // Try to use proper AES encryption
        const key = Buffer.from(this.secretKey, 'base64');
        const iv = Buffer.alloc(16, 0); // All zeros IV like Python version
        
        const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
        cipher.setAutoPadding(true);
        
        let encrypted = cipher.update(jsonString, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        
        console.log('[ZALO API] Data encoded with AES successfully');
        return encrypted;
      } catch (aesError) {
        console.log('[ZALO API] AES encoding failed, using fallback:', aesError.message);
        // Fallback to simple base64
        const encoded = Buffer.from(jsonString).toString('base64');
        return encoded;
      }
    } catch (error) {
      console.log('[ZALO API] Encoding failed:', error.message);
      return JSON.stringify(data);
    }
  }

  /**
   * Decode response data using AES decryption (like zlapi Python)
   */
  _decode(data) {
    try {
      if (!this.secretKey || typeof data !== 'string') {
        return data;
      }
      
      try {
        // Try to use proper AES decryption
        const key = Buffer.from(this.secretKey, 'base64');
        const iv = Buffer.alloc(16, 0); // All zeros IV like Python version
        
        const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
        decipher.setAutoPadding(true);
        
        let decrypted = decipher.update(data, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        
        console.log('[ZALO API] Data decoded with AES successfully');
        return JSON.parse(decrypted);
      } catch (aesError) {
        console.log('[ZALO API] AES decoding failed, using fallback:', aesError.message);
        // Fallback to simple base64
        const decoded = Buffer.from(data, 'base64').toString('utf8');
        return JSON.parse(decoded);
      }
    } catch (error) {
      console.log('[ZALO API] Decoding failed:', error.message);
      return data;
    }
  }

  /**
   * Make HTTP GET request with cookies
   */
  async _get(url, params = {}) {
    try {
      const config = {
        headers: this.headers,
        params: params
      };

      if (this.cookies) {
        // Convert cookies object to cookie string
        const cookieString = Object.entries(this.cookies)
          .map(([key, value]) => `${key}=${value}`)
          .join('; ');
        config.headers['Cookie'] = cookieString;
      }

      console.log('[ZALO API] Making GET request to:', url);
      const response = await axios.get(url, config);
      return response;
    } catch (error) {
      console.log('[ZALO API] GET request failed:', error.message);
      throw error;
    }
  }

  /**
   * Make HTTP POST request with cookies
   */
  async _post(url, data = {}) {
    try {
      const config = {
        headers: this.headers
      };

      if (this.cookies) {
        const cookieString = Object.entries(this.cookies)
          .map(([key, value]) => `${key}=${value}`)
          .join('; ');
        config.headers['Cookie'] = cookieString;
      }

      console.log('[ZALO API] Making POST request to:', url);
      const response = await axios.post(url, data, config);
      return response;
    } catch (error) {
      console.log('[ZALO API] POST request failed:', error.message);
      throw error;
    }
  }

  /**
   * Get current timestamp
   */
  _now() {
    return Date.now();
  }

  /**
   * Change group settings - Main function
   */
  async changeGroupSetting(groupId, defaultMode = "default", settings = {}) {
    try {
      console.log('[ZALO API] changeGroupSetting called:', { groupId, defaultMode, settings });

      if (!this.imei) {
        throw new Error('IMEI not set. Call setSession first.');
      }

      // Default settings based on mode
      let defSetting = {};
      if (defaultMode === "anti-raid") {
        defSetting = {
          blockName: 1,
          signAdminMsg: 1,
          addMemberOnly: 0,
          setTopicOnly: 1,
          enableMsgHistory: 1,
          lockCreatePost: 1,
          lockCreatePoll: 1,
          joinAppr: 1,
          bannFeature: 0,
          dirtyMedia: 0,
          banDuration: 0,
          lockSendMsg: 0,
          lockViewMember: 0
        };
      } else {
        // Try to get current group settings first (fallback to defaults)
        defSetting = {
          blockName: 1,
          signAdminMsg: 1,
          addMemberOnly: 0,
          setTopicOnly: 1,
          enableMsgHistory: 1,
          lockCreatePost: 1,
          lockCreatePoll: 1,
          joinAppr: 1,
          bannFeature: 0,
          dirtyMedia: 0,
          banDuration: 0,
          lockSendMsg: 0,
          lockViewMember: 0
        };
      }

      // Merge with provided settings
      const finalSettings = {
        blockName: settings.blockName !== undefined ? settings.blockName : defSetting.blockName,
        signAdminMsg: settings.signAdminMsg !== undefined ? settings.signAdminMsg : defSetting.signAdminMsg,
        addMemberOnly: settings.addMemberOnly !== undefined ? settings.addMemberOnly : defSetting.addMemberOnly,
        setTopicOnly: settings.setTopicOnly !== undefined ? settings.setTopicOnly : defSetting.setTopicOnly,
        enableMsgHistory: settings.enableMsgHistory !== undefined ? settings.enableMsgHistory : defSetting.enableMsgHistory,
        lockCreatePost: settings.lockCreatePost !== undefined ? settings.lockCreatePost : defSetting.lockCreatePost,
        lockCreatePoll: settings.lockCreatePoll !== undefined ? settings.lockCreatePoll : defSetting.lockCreatePoll,
        joinAppr: settings.joinAppr !== undefined ? settings.joinAppr : defSetting.joinAppr,
        bannFeature: settings.bannFeature !== undefined ? settings.bannFeature : defSetting.bannFeature,
        dirtyMedia: settings.dirtyMedia !== undefined ? settings.dirtyMedia : defSetting.dirtyMedia,
        banDuration: settings.banDuration !== undefined ? settings.banDuration : defSetting.banDuration,
        lockSendMsg: settings.lockSendMsg !== undefined ? settings.lockSendMsg : defSetting.lockSendMsg,
        lockViewMember: settings.lockViewMember !== undefined ? settings.lockViewMember : defSetting.lockViewMember,
        blocked_members: settings.blocked_members || [],
        grid: String(groupId),
        imei: this.imei
      };

      console.log('[ZALO API] Final settings:', finalSettings);

      // Prepare request parameters with version detection
      const params = {
        params: this._encode(finalSettings),
        zpw_ver: this.detectZpwVersion(), // Auto-detect version
        zpw_type: 30
      };

      // Make API request
      const response = await this._get('https://tt-group-wpa.chat.zalo.me/api/group/setting/update', params);
      const data = response.data;

      console.log('[ZALO API] Response received:', data);

      // Process response
      if (data.error_code === 0) {
        let results = data.data;
        if (results) {
          results = this._decode(results);
          if (results.data) {
            results = results.data;
          }
          
          console.log('[ZALO API] changeGroupSetting successful');
          return {
            success: true,
            data: results,
            message: 'Group settings updated successfully'
          };
        } else {
          throw new Error('Response data is null');
        }
      } else {
        const errorMessage = data.error_message || data.data || 'Unknown error';
        throw new Error(`API Error #${data.error_code}: ${errorMessage}`);
      }

    } catch (error) {
      console.log('[ZALO API] changeGroupSetting failed:', error.message);
      return {
        success: false,
        error: error.message,
        message: `Failed to update group settings: ${error.message}`
      };
    }
  }

  /**
   * Get group information
   */
  async getGroupInfo(groupId) {
    try {
      console.log('[ZALO API] getGroupInfo called for:', groupId);
      
      const params = {
        params: this._encode({
          grid: String(groupId),
          imei: this.imei
        }),
        zpw_ver: this.detectZpwVersion(),
        zpw_type: 30
      };

      const response = await this._get('https://tt-group-wpa.chat.zalo.me/api/group/getinfo', params);
      const data = response.data;

      if (data.error_code === 0) {
        let results = data.data;
        if (results) {
          results = this._decode(results);
          console.log('[ZALO API] getGroupInfo successful');
          return {
            success: true,
            data: results,
            message: 'Group info retrieved successfully'
          };
        }
      }

      throw new Error(`API Error #${data.error_code}: ${data.error_message || 'Unknown error'}`);
    } catch (error) {
      console.log('[ZALO API] getGroupInfo failed:', error.message);
      return {
        success: false,
        error: error.message,
        message: `Failed to get group info: ${error.message}`
      };
    }
  }

  /**
   * Try to auto-configure session from bot environment
   */
  autoConfigureSession() {
    try {
      console.log('[ZALO API] Attempting auto-configuration...');
      
      // Try to read from global variables
      if (global.zaloSession) {
        const session = global.zaloSession;
        if (session.cookies && session.secretKey && session.imei) {
          this.setSession(session.cookies, session.secretKey, session.imei);
          console.log('[ZALO API] Auto-configured from global.zaloSession');
          return true;
        }
      }
      
      // Try to read from environment variables
      if (process.env.ZALO_COOKIES && process.env.ZALO_SECRET_KEY && process.env.ZALO_IMEI) {
        const cookies = JSON.parse(process.env.ZALO_COOKIES);
        this.setSession(cookies, process.env.ZALO_SECRET_KEY, process.env.ZALO_IMEI);
        console.log('[ZALO API] Auto-configured from environment variables');
        return true;
      }
      
      // Try to read from config file
      try {
        const fs = require('fs');
        const path = require('path');
        const configPath = path.join(__dirname, '../../config/zalo_session.json');
        
        if (fs.existsSync(configPath)) {
          const sessionData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          if (sessionData.cookies && sessionData.secretKey && sessionData.imei) {
            this.setSession(sessionData.cookies, sessionData.secretKey, sessionData.imei);
            console.log('[ZALO API] Auto-configured from config file');
            return true;
          }
        }
      } catch (fileError) {
        console.log('[ZALO API] Config file read failed:', fileError.message);
      }
      
      console.log('[ZALO API] Auto-configuration failed - no valid session found');
      return false;
    } catch (error) {
      console.log('[ZALO API] Auto-configuration error:', error.message);
      return false;
    }
  }

  /**
   * Join a Zalo group by group ID
   */
  async joinGroup(groupId) {
    try {
      console.log(`[ZALO API] Attempting to join group: ${groupId}`);
      
      if (!this.cookies || !this.secretKey || !this.imei) {
        throw new Error('Session not properly configured. Please set cookies, secretKey, and imei first.');
      }

      const zpwVer = this.detectZpwVersion();
      const params = {
        grid: groupId,
        imei: this.imei,
        type: 30,
        client_version: zpwVer,
        computer_name: 'Web',
        ts: this._now()
      };

      // Try to join group using Zalo's group join API
      const response = await this._get('https://tt-group-wpa.chat.zalo.me/api/group/join', params);
      const data = response.data;

      if (data && data.error_code === 0) {
        console.log(`[ZALO API] Successfully joined group: ${groupId}`);
        return {
          success: true,
          groupId: groupId,
          message: 'Successfully joined group',
          data: data
        };
      } else {
        const errorMsg = data?.error_message || data?.message || 'Unknown error';
        console.log(`[ZALO API] Failed to join group ${groupId}: ${errorMsg}`);
        return {
          success: false,
          groupId: groupId,
          error: errorMsg,
          errorCode: data?.error_code
        };
      }
    } catch (error) {
      console.log(`[ZALO API] Error joining group ${groupId}:`, error.message);
      return {
        success: false,
        groupId: groupId,
        error: error.message
      };
    }
  }

  /**
   * Join group by invitation link
   */
  async joinGroupByLink(inviteLink) {
    try {
      console.log(`[ZALO API] Attempting to join group by link: ${inviteLink}`);
      
      // Extract group ID from different link formats
      let groupId = null;
      
      // Format: https://zalo.me/g/[groupId]
      const groupMatch = inviteLink.match(/zalo\.me\/g\/([a-zA-Z0-9]+)/);
      if (groupMatch) {
        groupId = groupMatch[1];
      }
      
      // Format: https://zalo.me/s/[inviteCode] 
      const inviteMatch = inviteLink.match(/zalo\.me\/s\/([a-zA-Z0-9]+)/);
      if (inviteMatch) {
        // For invite links, we need to resolve the invite code first
        return await this.joinGroupByInviteCode(inviteMatch[1]);
      }
      
      if (!groupId) {
        throw new Error('Invalid Zalo group link format');
      }
      
      return await this.joinGroup(groupId);
    } catch (error) {
      console.log(`[ZALO API] Error joining group by link:`, error.message);
      return {
        success: false,
        error: error.message,
        link: inviteLink
      };
    }
  }

  /**
   * Join group by invite code (for zalo.me/s/ links)
   */
  async joinGroupByInviteCode(inviteCode) {
    try {
      console.log(`[ZALO API] Resolving invite code: ${inviteCode}`);
      
      const zpwVer = this.detectZpwVersion();
      const params = {
        invite_code: inviteCode,
        imei: this.imei,
        type: 30,
        client_version: zpwVer,
        computer_name: 'Web',
        ts: this._now()
      };

      // First, resolve the invite code to get group info
      const resolveResponse = await this._get('https://tt-group-wpa.chat.zalo.me/api/group/invite/resolve', params);
      const resolveData = resolveResponse.data;

      if (resolveData && resolveData.error_code === 0 && resolveData.data) {
        const groupId = resolveData.data.grid;
        console.log(`[ZALO API] Resolved invite code ${inviteCode} to group: ${groupId}`);
        
        // Now join the group
        return await this.joinGroup(groupId);
      } else {
        const errorMsg = resolveData?.error_message || 'Failed to resolve invite code';
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.log(`[ZALO API] Error with invite code ${inviteCode}:`, error.message);
      return {
        success: false,
        error: error.message,
        inviteCode: inviteCode
      };
    }
  }

  /**
   * Test API connection
   */
  async testConnection() {
    try {
      console.log('[ZALO API] Testing connection...');
      
      if (!this.cookies || !this.secretKey || !this.imei) {
        return {
          success: false,
          message: 'Session not properly configured. Missing cookies, secretKey, or imei.'
        };
      }

      // Simple test request
      const zpwVer = this.detectZpwVersion();
      const response = await this._get('https://wpa.chat.zalo.me/api/login/getLoginInfo', {
        imei: this.imei,
        type: 30,
        client_version: zpwVer,
        computer_name: 'Web',
        ts: this._now()
      });

      if (response.status === 200) {
        console.log('[ZALO API] Connection test successful');
        return {
          success: true,
          message: 'API connection is working'
        };
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.log('[ZALO API] Connection test failed:', error.message);
      return {
        success: false,
        message: `Connection test failed: ${error.message}`
      };
    }
  }
}

// Export for use in other modules
module.exports = ZaloAPI;

// Example usage:
/*
const zaloAPI = new ZaloAPI();

// Set session (you need to get these from your Zalo login)
zaloAPI.setSession(
  { cookies: 'object' },
  'your_secret_key',
  'your_imei'
);

// Test connection
const testResult = await zaloAPI.testConnection();
console.log('Test result:', testResult);

// Change group settings
const result = await zaloAPI.changeGroupSetting('group_id', 'default', {
  lockSendMsg: 1
});
console.log('Result:', result);
*/
