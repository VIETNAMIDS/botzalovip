const express = require('express');
const path = require('path');
const { ZefoyAPI } = require('../plugins/commands/zefoy.js');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Store active sessions
const activeSessions = new Map();

// Route để mở Zefoy với session
app.get('/zefoy/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  
  if (!activeSessions.has(sessionId)) {
    return res.status(404).send(`
      <html>
        <head>
          <title>Session Not Found</title>
          <meta charset="utf-8">
        </head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h2>❌ Session không tồn tại hoặc đã hết hạn</h2>
          <p>Vui lòng tạo yêu cầu mới từ bot Zalo</p>
        </body>
      </html>
    `);
  }
  
  const session = activeSessions.get(sessionId);
  
  // Tạo HTML page để mở Zefoy
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Zefoy - ${session.service.toUpperCase()}</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
          background: rgba(255,255,255,0.1);
          padding: 30px;
          border-radius: 15px;
          backdrop-filter: blur(10px);
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        .service-info {
          background: rgba(255,255,255,0.2);
          padding: 20px;
          border-radius: 10px;
          margin-bottom: 20px;
        }
        .zefoy-frame {
          width: 100%;
          height: 600px;
          border: none;
          border-radius: 10px;
          background: white;
        }
        .instructions {
          background: rgba(255,255,255,0.2);
          padding: 15px;
          border-radius: 10px;
          margin-top: 20px;
        }
        .btn {
          background: #4CAF50;
          color: white;
          padding: 10px 20px;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 16px;
          margin: 5px;
        }
        .btn:hover {
          background: #45a049;
        }
        .btn-danger {
          background: #f44336;
        }
        .btn-danger:hover {
          background: #da190b;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎯 ZEFOY - DỊCH VỤ TIKTOK</h1>
          <p>Giải captcha để sử dụng dịch vụ</p>
        </div>
        
        <div class="service-info">
          <h3>📋 Thông tin yêu cầu:</h3>
          <p><strong>🎯 Dịch vụ:</strong> ${session.service.toUpperCase()}</p>
          <p><strong>🔗 Link TikTok:</strong> <a href="${session.url}" target="_blank" style="color: #FFD700;">${session.url}</a></p>
          <p><strong>⏰ Thời gian:</strong> ${new Date(session.timestamp).toLocaleString('vi-VN')}</p>
        </div>
        
        <div class="instructions">
          <h3>📝 Hướng dẫn:</h3>
          <ol>
            <li>Trang Zefoy sẽ mở bên dưới</li>
            <li>Tìm dịch vụ <strong>${session.service.toUpperCase()}</strong> trên Zefoy</li>
            <li>Nhập link TikTok và giải captcha</li>
            <li>Sau khi thành công, bấm nút "Hoàn thành" bên dưới</li>
          </ol>
        </div>
        
        <iframe src="https://zefoy.com" class="zefoy-frame" id="zefoyFrame"></iframe>
        
        <div style="text-align: center; margin-top: 20px;">
          <button class="btn" onclick="markCompleted()">✅ Hoàn thành</button>
          <button class="btn btn-danger" onclick="markFailed()">❌ Thất bại</button>
        </div>
        
        <div class="instructions">
          <h3>⚠️ Lưu ý:</h3>
          <ul>
            <li>Session sẽ hết hạn sau 10 phút</li>
            <li>Chỉ sử dụng cho dịch vụ đã chọn: <strong>${session.service.toUpperCase()}</strong></li>
            <li>Không đóng tab này cho đến khi hoàn thành</li>
          </ul>
        </div>
      </div>
      
      <script>
        function markCompleted() {
          if (confirm('Bạn đã hoàn thành giải captcha trên Zefoy?')) {
            fetch('/api/complete/${sessionId}', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'success' })
            }).then(response => {
              if (response.ok) {
                alert('✅ Đã báo cáo thành công! Kiểm tra bot Zalo để xem kết quả.');
                window.close();
              }
            });
          }
        }
        
        function markFailed() {
          if (confirm('Xác nhận thất bại? Bot sẽ được thông báo.')) {
            fetch('/api/complete/${sessionId}', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'failed' })
            }).then(response => {
              if (response.ok) {
                alert('❌ Đã báo cáo thất bại! Thử lại từ bot Zalo.');
                window.close();
              }
            });
          }
        }
        
        // Auto refresh iframe every 30 seconds to keep session alive
        setInterval(() => {
          document.getElementById('zefoyFrame').src = document.getElementById('zefoyFrame').src;
        }, 30000);
      </script>
    </body>
    </html>
  `;
  
  res.send(html);
});

// API để xử lý kết quả từ web
app.post('/api/complete/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { status } = req.body;
  
  if (!activeSessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const session = activeSessions.get(sessionId);
  session.completed = true;
  session.result = status;
  session.completedAt = Date.now();
  
  // Notify bot about completion
  if (global.zefoyWebCallbacks && global.zefoyWebCallbacks[sessionId]) {
    global.zefoyWebCallbacks[sessionId](status);
    delete global.zefoyWebCallbacks[sessionId];
  }
  
  // Clean up session after 1 minute
  setTimeout(() => {
    activeSessions.delete(sessionId);
  }, 60000);
  
  res.json({ success: true, message: 'Session completed' });
});

// API để tạo session mới từ bot
app.post('/api/create-session', (req, res) => {
  const { service, url, threadId, userId } = req.body;
  
  if (!service || !url || !threadId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const sessionId = `${threadId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const session = {
    id: sessionId,
    service,
    url,
    threadId,
    userId,
    timestamp: Date.now(),
    completed: false,
    result: null
  };
  
  activeSessions.set(sessionId, session);
  
  // Auto cleanup after 10 minutes
  setTimeout(() => {
    if (activeSessions.has(sessionId)) {
      activeSessions.delete(sessionId);
      // Notify bot about timeout
      if (global.zefoyWebCallbacks && global.zefoyWebCallbacks[sessionId]) {
        global.zefoyWebCallbacks[sessionId]('timeout');
        delete global.zefoyWebCallbacks[sessionId];
      }
    }
  }, 600000); // 10 minutes
  
  const webUrl = `http://localhost:${PORT}/zefoy/${sessionId}`;
  
  res.json({
    success: true,
    sessionId,
    webUrl,
    expiresAt: Date.now() + 600000
  });
});

// API để kiểm tra trạng thái session
app.get('/api/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  if (!activeSessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const session = activeSessions.get(sessionId);
  res.json({
    id: session.id,
    service: session.service,
    completed: session.completed,
    result: session.result,
    timestamp: session.timestamp,
    completedAt: session.completedAt
  });
});

// Start server only if not already started
let server = null;

function startServer() {
  if (!server) {
    server = app.listen(PORT, () => {
      console.log(`🌐 Zefoy Web Server running on http://localhost:${PORT}`);
      console.log(`📊 Active sessions: ${activeSessions.size}`);
    });
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`⚠️ Port ${PORT} already in use - server may already be running`);
      } else {
        console.error('🔴 Web server error:', err);
      }
    });
  }
  return server;
}

// Auto start server when module is loaded
startServer();

// Export functions for bot integration
module.exports = {
  startServer,
  createSession: (service, url, threadId, userId) => {
    return new Promise((resolve) => {
      const sessionId = `${threadId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const session = {
        id: sessionId,
        service,
        url,
        threadId,
        userId,
        timestamp: Date.now(),
        completed: false,
        result: null
      };
      
      activeSessions.set(sessionId, session);
      
      // Auto cleanup after 10 minutes
      setTimeout(() => {
        if (activeSessions.has(sessionId)) {
          activeSessions.delete(sessionId);
        }
      }, 600000);
      
      const webUrl = `http://localhost:${PORT}/zefoy/${sessionId}`;
      
      resolve({
        success: true,
        sessionId,
        webUrl,
        expiresAt: Date.now() + 600000
      });
    });
  },
  
  getSessionStatus: (sessionId) => {
    if (!activeSessions.has(sessionId)) {
      return null;
    }
    return activeSessions.get(sessionId);
  }
};
