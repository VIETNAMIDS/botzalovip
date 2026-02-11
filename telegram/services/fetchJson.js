const axios = require('axios');

async function fetchJson(url, options = {}) {
  try {
    const response = await axios.get(url, {
      timeout: options.timeout || 12000,
      headers: {
        'User-Agent': 'Bonz-Telegram-Bot/1.0',
        ...(options.headers || {}),
      },
      ...options.axios,
    });
    return response.data;
  } catch (error) {
    const err = new Error(error?.response?.data?.message || error?.message || 'request_failed');
    err.status = error?.response?.status;
    throw err;
  }
}

module.exports = {
  fetchJson,
};
