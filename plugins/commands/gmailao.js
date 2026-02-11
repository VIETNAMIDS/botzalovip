const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");
const { createCanvas } = require('canvas');

module.exports.config = {
    name: "gmail",
    version: "1.0.0",
    role: 0,
    author: "Cascade",
    description: "Tạo email ảo tạm thời và kiểm tra hộp thư",
    category: "Tiện ích",
    usage: "<prefix>gmail [create|check <email>|read <email> <id>]",
    cooldowns: 3
};

// API endpoints - Sử dụng nhiều service để backup
const TEMP_MAIL_API = "https://api.mail.tm";
const GUERRILLA_API = "https://api.guerrillamail.com/ajax.php";

// Helper: Generate random email
function generateRandomEmail() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const length = 8 + Math.floor(Math.random() * 5);
    let email = '';
    for (let i = 0; i < length; i++) {
        email += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    const domains = [
        'tmpmail.net',
        'tmpmail.org', 
        'tmpmail.top',
        'tmpbox.net',
        'tempmail.com',
        '10minutemail.com',
        'guerrillamail.com',
        'sharklasers.com',
        'grr.la',
        'spam4.me'
    ];
    
    const domain = domains[Math.floor(Math.random() * domains.length)];
    return `${email}@${domain}`;
}

// Axios config
const axiosConfig = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
    },
    timeout: 10000
};

// Helper: Rounded rectangle
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// Tạo ảnh email mới
async function createEmailImage(email, domain) {
    const width = 1200;
    const height = 700;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background gradient
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#0f172a');
    bgGradient.addColorStop(0.5, '#1e293b');
    bgGradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Pattern overlay
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    for (let i = 0; i < width; i += 60) {
        for (let j = 0; j < height; j += 60) {
            ctx.fillRect(i, j, 30, 30);
        }
    }

    // Border gradient
    const borderGradient = ctx.createLinearGradient(0, 0, width, 0);
    borderGradient.addColorStop(0, '#3b82f6');
    borderGradient.addColorStop(0.5, '#8b5cf6');
    borderGradient.addColorStop(1, '#ec4899');

    // Header
    const headerGradient = ctx.createLinearGradient(0, 0, width, 0);
    headerGradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
    headerGradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.2)');
    headerGradient.addColorStop(1, 'rgba(236, 72, 153, 0.2)');
    
    roundRect(ctx, 40, 30, width - 80, 120, 25);
    ctx.fillStyle = headerGradient;
    ctx.fill();
    
    roundRect(ctx, 40, 30, width - 80, 120, 25);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Title
    const titleGradient = ctx.createLinearGradient(0, 0, width, 0);
    titleGradient.addColorStop(0, '#3b82f6');
    titleGradient.addColorStop(0.5, '#8b5cf6');
    titleGradient.addColorStop(1, '#ec4899');
    
    ctx.fillStyle = titleGradient;
    ctx.textAlign = 'center';
    ctx.font = 'bold 56px Arial';
    ctx.shadowColor = 'rgba(59, 130, 246, 0.8)';
    ctx.shadowBlur = 25;
    ctx.fillText('📧 EMAIL ẢO TẠM THỜI', width / 2, 105);
    ctx.shadowBlur = 0;

    // Email icon
    const iconY = 200;
    const iconSize = 120;
    const iconX = (width - iconSize) / 2;
    
    // Icon background
    const iconGradient = ctx.createRadialGradient(
        iconX + iconSize / 2, iconY + iconSize / 2, 0,
        iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2
    );
    iconGradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
    iconGradient.addColorStop(1, 'rgba(139, 92, 246, 0.3)');
    
    ctx.fillStyle = iconGradient;
    ctx.beginPath();
    ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
    ctx.stroke();
    
    // Email icon
    ctx.fillStyle = '#3b82f6';
    ctx.font = 'bold 70px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('📧', iconX + iconSize / 2, iconY + iconSize / 2 + 25);

    // Email card
    const cardY = 360;
    const cardHeight = 240;
    
    const cardGradient = ctx.createLinearGradient(60, cardY, width - 60, cardY);
    cardGradient.addColorStop(0, 'rgba(30, 41, 59, 0.8)');
    cardGradient.addColorStop(1, 'rgba(15, 23, 42, 0.8)');
    
    roundRect(ctx, 60, cardY, width - 120, cardHeight, 20);
    ctx.fillStyle = cardGradient;
    ctx.fill();
    
    roundRect(ctx, 60, cardY, width - 120, cardHeight, 20);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Email info
    let infoY = cardY + 60;
    
    // Label
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('📬 ĐỊA CHỈ EMAIL CỦA BẠN:', width / 2, infoY);
    
    infoY += 60;
    
    // Email address
    const emailGradient = ctx.createLinearGradient(0, 0, width, 0);
    emailGradient.addColorStop(0, '#10b981');
    emailGradient.addColorStop(1, '#06b6d4');
    
    ctx.fillStyle = emailGradient;
    ctx.font = 'bold 38px Arial';
    const fullEmail = `${email}@${domain}`;
    const displayEmail = fullEmail.length > 45 ? fullEmail.substring(0, 45) + '...' : fullEmail;
    ctx.fillText(displayEmail, width / 2, infoY);
    
    infoY += 70;
    
    // Instructions
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('💡 Dùng lệnh "gmail check <email>" để xem thư đến', width / 2, infoY);

    // Footer
    const footerY = height - 80;
    const footerGradient = ctx.createLinearGradient(0, footerY, width, footerY);
    footerGradient.addColorStop(0, 'rgba(59, 130, 246, 0.15)');
    footerGradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.15)');
    footerGradient.addColorStop(1, 'rgba(236, 72, 153, 0.15)');
    
    roundRect(ctx, 40, footerY, width - 80, 60, 20);
    ctx.fillStyle = footerGradient;
    ctx.fill();
    
    roundRect(ctx, 40, footerY, width - 80, 60, 20);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 3;
    ctx.stroke();
    
    const footerTextGradient = ctx.createLinearGradient(0, 0, width, 0);
    footerTextGradient.addColorStop(0, '#3b82f6');
    footerTextGradient.addColorStop(0.5, '#8b5cf6');
    footerTextGradient.addColorStop(1, '#ec4899');
    
    ctx.fillStyle = footerTextGradient;
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px Arial';
    ctx.shadowColor = 'rgba(59, 130, 246, 0.5)';
    ctx.shadowBlur = 15;
    ctx.fillText('⚠️ Email này tự động xóa sau vài giờ - Chỉ dùng tạm thời!', width / 2, footerY + 40);
    ctx.shadowBlur = 0;

    return canvas.toBuffer('image/png');
}

// Tạo ảnh inbox
async function createInboxImage(email, messages) {
    const width = 1200;
    const baseHeight = 800;
    const messageHeight = messages.length * 100;
    const height = Math.min(baseHeight + messageHeight, 2500);
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#0f172a');
    bgGradient.addColorStop(0.5, '#1e293b');
    bgGradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Pattern
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    for (let i = 0; i < width; i += 60) {
        for (let j = 0; j < height; j += 60) {
            ctx.fillRect(i, j, 30, 30);
        }
    }

    const borderGradient = ctx.createLinearGradient(0, 0, width, 0);
    borderGradient.addColorStop(0, '#3b82f6');
    borderGradient.addColorStop(0.5, '#8b5cf6');
    borderGradient.addColorStop(1, '#ec4899');

    // Header
    const headerGradient = ctx.createLinearGradient(0, 0, width, 0);
    headerGradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
    headerGradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.2)');
    headerGradient.addColorStop(1, 'rgba(236, 72, 153, 0.2)');
    
    roundRect(ctx, 40, 30, width - 80, 120, 25);
    ctx.fillStyle = headerGradient;
    ctx.fill();
    
    roundRect(ctx, 40, 30, width - 80, 120, 25);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 4;
    ctx.stroke();

    const titleGradient = ctx.createLinearGradient(0, 0, width, 0);
    titleGradient.addColorStop(0, '#3b82f6');
    titleGradient.addColorStop(0.5, '#8b5cf6');
    titleGradient.addColorStop(1, '#ec4899');
    
    ctx.fillStyle = titleGradient;
    ctx.textAlign = 'center';
    ctx.font = 'bold 52px Arial';
    ctx.shadowColor = 'rgba(59, 130, 246, 0.8)';
    ctx.shadowBlur = 25;
    ctx.fillText(`📬 HỘP THƯ ĐÊN (${messages.length})`, width / 2, 105);
    ctx.shadowBlur = 0;

    // Email address
    let currentY = 200;
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    const emailDisplay = email.length > 60 ? email.substring(0, 60) + '...' : email;
    ctx.fillText(`📧 Email: ${emailDisplay}`, width / 2, currentY);
    
    currentY += 50;

    // Messages
    if (messages.length === 0) {
        const emptyY = currentY + 100;
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 38px Arial';
        ctx.fillText('📭 Chưa có thư nào', width / 2, emptyY);
        
        ctx.font = 'bold 24px Arial';
        ctx.fillText('Hãy gửi email đến địa chỉ trên để nhận thư', width / 2, emptyY + 50);
    } else {
        for (let i = 0; i < Math.min(messages.length, 10); i++) {
            const msg = messages[i];
            const cardY = currentY + 10;
            const cardHeight = 150;
            
            const cardGradient = ctx.createLinearGradient(80, cardY, width - 80, cardY);
            cardGradient.addColorStop(0, 'rgba(30, 41, 59, 0.8)');
            cardGradient.addColorStop(1, 'rgba(15, 23, 42, 0.8)');
            
            roundRect(ctx, 80, cardY, width - 160, cardHeight, 15);
            ctx.fillStyle = cardGradient;
            ctx.fill();
            
            roundRect(ctx, 80, cardY, width - 160, cardHeight, 15);
            ctx.strokeStyle = borderGradient;
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Message info
            let msgY = cardY + 35;
            
            // ID
            ctx.fillStyle = '#fbbf24';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(`🆔 ID: ${msg.id}`, 110, msgY);
            
            msgY += 35;
            
            // From
            ctx.fillStyle = '#3b82f6';
            ctx.font = 'bold 20px Arial';
            const fromText = msg.from.length > 45 ? msg.from.substring(0, 45) + '...' : msg.from;
            ctx.fillText(`👤 ${fromText}`, 110, msgY);
            
            msgY += 35;
            
            // Subject
            ctx.fillStyle = '#10b981';
            ctx.font = 'bold 18px Arial';
            const subject = msg.subject.length > 60 ? msg.subject.substring(0, 60) + '...' : msg.subject;
            ctx.fillText(`📝 ${subject}`, 110, msgY);
            
            msgY += 35;
            
            // Date
            ctx.fillStyle = '#94a3b8';
            ctx.font = 'bold 18px Arial';
            const date = new Date(msg.date);
            ctx.fillText(`🕐 ${date.toLocaleString('vi-VN')}`, 110, msgY);
            
            currentY += cardHeight + 20;
        }
        
        if (messages.length > 10) {
            currentY += 30;
            ctx.fillStyle = '#64748b';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`... và ${messages.length - 10} thư khác`, width / 2, currentY);
        }
    }

    // Footer
    const footerY = height - 80;
    const footerGradient = ctx.createLinearGradient(0, footerY, width, footerY);
    footerGradient.addColorStop(0, 'rgba(59, 130, 246, 0.15)');
    footerGradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.15)');
    footerGradient.addColorStop(1, 'rgba(236, 72, 153, 0.15)');
    
    roundRect(ctx, 40, footerY, width - 80, 60, 20);
    ctx.fillStyle = footerGradient;
    ctx.fill();
    
    roundRect(ctx, 40, footerY, width - 80, 60, 20);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 3;
    ctx.stroke();
    
    const footerTextGradient = ctx.createLinearGradient(0, 0, width, 0);
    footerTextGradient.addColorStop(0, '#3b82f6');
    footerTextGradient.addColorStop(0.5, '#8b5cf6');
    footerTextGradient.addColorStop(1, '#ec4899');
    
    ctx.fillStyle = footerTextGradient;
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px Arial';
    ctx.shadowColor = 'rgba(59, 130, 246, 0.5)';
    ctx.shadowBlur = 15;
    ctx.fillText('💎 BONZ VIP - MUA BOT LH 0785000270', width / 2, footerY + 40);
    ctx.shadowBlur = 0;

    return canvas.toBuffer('image/png');
}

// Tạo ảnh nội dung email
async function createEmailContentImage(email, message) {
    const width = 1200;
    const baseHeight = 900;
    
    // Tính chiều cao dựa vào nội dung
    const bodyLines = Math.ceil((message.textBody || message.body || "").length / 80);
    const additionalHeight = bodyLines * 30;
    const height = Math.min(baseHeight + additionalHeight, 3000);
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#0f172a');
    bgGradient.addColorStop(0.5, '#1e293b');
    bgGradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Pattern
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    for (let i = 0; i < width; i += 60) {
        for (let j = 0; j < height; j += 60) {
            ctx.fillRect(i, j, 30, 30);
        }
    }

    const borderGradient = ctx.createLinearGradient(0, 0, width, 0);
    borderGradient.addColorStop(0, '#3b82f6');
    borderGradient.addColorStop(0.5, '#8b5cf6');
    borderGradient.addColorStop(1, '#ec4899');

    // Header
    const headerGradient = ctx.createLinearGradient(0, 0, width, 0);
    headerGradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
    headerGradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.2)');
    headerGradient.addColorStop(1, 'rgba(236, 72, 153, 0.2)');
    
    roundRect(ctx, 40, 30, width - 80, 120, 25);
    ctx.fillStyle = headerGradient;
    ctx.fill();
    
    roundRect(ctx, 40, 30, width - 80, 120, 25);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 4;
    ctx.stroke();

    const titleGradient = ctx.createLinearGradient(0, 0, width, 0);
    titleGradient.addColorStop(0, '#3b82f6');
    titleGradient.addColorStop(0.5, '#8b5cf6');
    titleGradient.addColorStop(1, '#ec4899');
    
    ctx.fillStyle = titleGradient;
    ctx.textAlign = 'center';
    ctx.font = 'bold 52px Arial';
    ctx.shadowColor = 'rgba(59, 130, 246, 0.8)';
    ctx.shadowBlur = 25;
    ctx.fillText('📩 NỘI DUNG EMAIL', width / 2, 105);
    ctx.shadowBlur = 0;

    // Email info card
    let currentY = 200;
    const infoCardHeight = 280;
    
    const cardGradient = ctx.createLinearGradient(60, currentY, width - 60, currentY);
    cardGradient.addColorStop(0, 'rgba(30, 41, 59, 0.8)');
    cardGradient.addColorStop(1, 'rgba(15, 23, 42, 0.8)');
    
    roundRect(ctx, 60, currentY, width - 120, infoCardHeight, 20);
    ctx.fillStyle = cardGradient;
    ctx.fill();
    
    roundRect(ctx, 60, currentY, width - 120, infoCardHeight, 20);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 3;
    ctx.stroke();

    let infoY = currentY + 50;
    
    // From
    ctx.fillStyle = '#3b82f6';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('👤 Từ:', 100, infoY);
    
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 20px Arial';
    const fromText = message.from.length > 50 ? message.from.substring(0, 50) + '...' : message.from;
    ctx.fillText(fromText, 200, infoY);
    
    infoY += 50;
    
    // To
    ctx.fillStyle = '#3b82f6';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('📧 Đến:', 100, infoY);
    
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 20px Arial';
    const emailText = email.length > 50 ? email.substring(0, 50) + '...' : email;
    ctx.fillText(emailText, 200, infoY);
    
    infoY += 50;
    
    // Subject
    ctx.fillStyle = '#3b82f6';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('📝 Tiêu đề:', 100, infoY);
    
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 20px Arial';
    const subjectText = message.subject.length > 45 ? message.subject.substring(0, 45) + '...' : message.subject;
    ctx.fillText(subjectText, 250, infoY);
    
    infoY += 50;
    
    // Date
    ctx.fillStyle = '#3b82f6';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('🕐 Thời gian:', 100, infoY);
    
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 22px Arial';
    const date = new Date(message.date);
    ctx.fillText(date.toLocaleString('vi-VN'), 280, infoY);

    // Content card
    currentY += infoCardHeight + 40;
    
    ctx.fillStyle = titleGradient;
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('📄 NỘI DUNG', width / 2, currentY);
    
    currentY += 40;
    
    const contentCardHeight = Math.min(height - currentY - 100, 1500);
    
    roundRect(ctx, 60, currentY, width - 120, contentCardHeight, 20);
    ctx.fillStyle = cardGradient;
    ctx.fill();
    
    roundRect(ctx, 60, currentY, width - 120, contentCardHeight, 20);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Email body
    const emailBody = message.textBody || message.body || "Không có nội dung";
    // Remove HTML tags
    const cleanBody = emailBody.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    const lines = cleanBody.split('\n');
    
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '18px Arial';
    ctx.textAlign = 'left';
    
    let bodyY = currentY + 40;
    const maxWidth = width - 200;
    
    for (let line of lines) {
        if (bodyY > currentY + contentCardHeight - 40) break;
        
        if (line.trim() === '') {
            bodyY += 25;
            continue;
        }
        
        // Word wrap
        const words = line.split(' ');
        let currentLine = '';
        
        for (let word of words) {
            const testLine = currentLine + word + ' ';
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > maxWidth && currentLine !== '') {
                ctx.fillText(currentLine.trim(), 100, bodyY);
                currentLine = word + ' ';
                bodyY += 28;
                if (bodyY > currentY + contentCardHeight - 40) break;
            } else {
                currentLine = testLine;
            }
        }
        
        if (currentLine.trim() !== '') {
            ctx.fillText(currentLine.trim(), 100, bodyY);
            bodyY += 28;
        }
    }
    
    if (bodyY > currentY + contentCardHeight - 40) {
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('... (Nội dung dài, không thể hiển thị hết)', width / 2, currentY + contentCardHeight - 20);
    }

    // Footer
    const footerY = height - 80;
    const footerGradient = ctx.createLinearGradient(0, footerY, width, footerY);
    footerGradient.addColorStop(0, 'rgba(59, 130, 246, 0.15)');
    footerGradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.15)');
    footerGradient.addColorStop(1, 'rgba(236, 72, 153, 0.15)');
    
    roundRect(ctx, 40, footerY, width - 80, 60, 20);
    ctx.fillStyle = footerGradient;
    ctx.fill();
    
    roundRect(ctx, 40, footerY, width - 80, 60, 20);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 3;
    ctx.stroke();
    
    const footerTextGradient = ctx.createLinearGradient(0, 0, width, 0);
    footerTextGradient.addColorStop(0, '#3b82f6');
    footerTextGradient.addColorStop(0.5, '#8b5cf6');
    footerTextGradient.addColorStop(1, '#ec4899');
    
    ctx.fillStyle = footerTextGradient;
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px Arial';
    ctx.shadowColor = 'rgba(59, 130, 246, 0.5)';
    ctx.shadowBlur = 15;
    ctx.fillText('💎 BONZ VIP - MUA BOT LH 0785000270', width / 2, footerY + 40);
    ctx.shadowBlur = 0;

    return canvas.toBuffer('image/png');
}

module.exports.run = async function({ api, event, args }) {
    const { threadId, type } = event;
    const tempPath = path.join(__dirname, '../../cache');
    
    try {
        await fs.mkdir(tempPath, { recursive: true });
    } catch (e) {
        console.error("Không thể tạo thư mục cache:", e);
    }

    try {
        const command = args[0]?.toLowerCase();

        if (!command || command === 'create') {
            // Tạo email mới với Guerrilla Mail
            const emailResponse = await axios.get(`${GUERRILLA_API}?f=get_email_address`, axiosConfig);
            
            if (!emailResponse.data || !emailResponse.data.email_addr) {
                return api.sendMessage("❌ Không thể tạo email tạm thời. Vui lòng thử lại!", threadId, type);
            }
            
            const emailFull = emailResponse.data.email_addr;
            const sidToken = emailResponse.data.sid_token;
            const [email, domain] = emailFull.split('@');

            const imageBuffer = await createEmailImage(email, domain);
            const imagePath = path.join(tempPath, `gmail_${Date.now()}.png`);
            await fs.writeFile(imagePath, imageBuffer);

            await api.sendMessage({
                msg: `✅ Đã tạo email tạm thời!\n📧 ${emailFull}\n🔑 Token: ${sidToken}\n\n💡 Dùng: gmail check ${emailFull}`,
                attachments: [imagePath]
            }, threadId, type);

            setTimeout(async () => {
                try {
                    await fs.unlink(imagePath);
                } catch (_) {}
            }, 10000);

        } else if (command === 'check') {
            const emailFull = args[1];
            if (!emailFull || !emailFull.includes('@')) {
                return api.sendMessage("⚠️ Vui lòng nhập email hợp lệ!\nVí dụ: gmail check example@guerrillamail.com", threadId, type);
            }

            // Lấy danh sách email từ Guerrilla Mail
            // Tạo session mới để check email
            const sessionResponse = await axios.get(`${GUERRILLA_API}?f=set_email_user&email_user=${emailFull.split('@')[0]}`, axiosConfig);
            
            if (!sessionResponse.data || !sessionResponse.data.sid_token) {
                return api.sendMessage("❌ Không thể kết nối đến email. Hãy tạo email mới bằng lệnh 'gmail'", threadId, type);
            }
            
            const sidToken = sessionResponse.data.sid_token;
            
            // Lấy danh sách email
            const emailListResponse = await axios.get(`${GUERRILLA_API}?f=get_email_list&sid_token=${sidToken}&offset=0`, axiosConfig);
            const emailList = emailListResponse.data.list || [];
            
            // Convert sang format tương thích
            const messages = emailList.map(email => ({
                id: email.mail_id,
                from: email.mail_from,
                subject: email.mail_subject,
                date: email.mail_timestamp,
                excerpt: email.mail_excerpt
            }));

            const imageBuffer = await createInboxImage(emailFull, messages);
            const imagePath = path.join(tempPath, `inbox_${Date.now()}.png`);
            await fs.writeFile(imagePath, imageBuffer);

            let msg = `📬 Hộp thư đến của ${emailFull}\n📧 ${messages.length} thư`;
            
            if (messages.length > 0) {
                msg += `\n\n💡 Đọc email: gmail read ${emailFull} ${messages[0].id}`;
            }

            await api.sendMessage({
                msg: msg,
                attachments: [imagePath]
            }, threadId, type);

            setTimeout(async () => {
                try {
                    await fs.unlink(imagePath);
                } catch (_) {}
            }, 10000);

            // Tự động hiển thị email mới nhất nếu có
            if (messages.length > 0) {
                setTimeout(async () => {
                    try {
                        const msgDetailResponse = await axios.get(
                            `${GUERRILLA_API}?f=fetch_email&sid_token=${sidToken}&email_id=${messages[0].id}`,
                            axiosConfig
                        );
                        
                        const msgDetail = {
                            id: msgDetailResponse.data.mail_id,
                            from: msgDetailResponse.data.mail_from,
                            subject: msgDetailResponse.data.mail_subject,
                            date: msgDetailResponse.data.mail_timestamp,
                            textBody: msgDetailResponse.data.mail_body || msgDetailResponse.data.mail_excerpt,
                            body: msgDetailResponse.data.mail_body || msgDetailResponse.data.mail_excerpt
                        };
                        
                        const contentBuffer = await createEmailContentImage(emailFull, msgDetail);
                        const contentPath = path.join(tempPath, `email_content_${Date.now()}.png`);
                        await fs.writeFile(contentPath, contentBuffer);

                        await api.sendMessage({
                            msg: `📩 Email mới nhất:\n${messages[0].subject}`,
                            attachments: [contentPath]
                        }, threadId, type);

                        setTimeout(async () => {
                            try {
                                await fs.unlink(contentPath);
                            } catch (_) {}
                        }, 10000);
                    } catch (err) {
                        console.error("Lỗi khi đọc email:", err);
                    }
                }, 2000);
            }

        } else if (command === 'read') {
            const emailFull = args[1];
            const messageId = args[2];

            if (!emailFull || !emailFull.includes('@')) {
                return api.sendMessage("⚠️ Vui lòng nhập email hợp lệ!\nVí dụ: gmail read example@guerrillamail.com 12345", threadId, type);
            }

            if (!messageId) {
                return api.sendMessage("⚠️ Vui lòng nhập ID email!\nVí dụ: gmail read example@guerrillamail.com 12345", threadId, type);
            }

            // Tạo session
            const sessionResponse = await axios.get(`${GUERRILLA_API}?f=set_email_user&email_user=${emailFull.split('@')[0]}`, axiosConfig);
            
            if (!sessionResponse.data || !sessionResponse.data.sid_token) {
                return api.sendMessage("❌ Không thể kết nối đến email!", threadId, type);
            }
            
            const sidToken = sessionResponse.data.sid_token;

            // Đọc email theo ID
            const response = await axios.get(
                `${GUERRILLA_API}?f=fetch_email&sid_token=${sidToken}&email_id=${messageId}`,
                axiosConfig
            );

            const data = response.data;

            if (!data || !data.mail_id) {
                return api.sendMessage("❌ Không tìm thấy email với ID này!", threadId, type);
            }

            const message = {
                id: data.mail_id,
                from: data.mail_from,
                subject: data.mail_subject,
                date: data.mail_timestamp,
                textBody: data.mail_body || data.mail_excerpt,
                body: data.mail_body || data.mail_excerpt
            };

            const imageBuffer = await createEmailContentImage(emailFull, message);
            const imagePath = path.join(tempPath, `email_content_${Date.now()}.png`);
            await fs.writeFile(imagePath, imageBuffer);

            await api.sendMessage({
                msg: `📩 Nội dung email:\n${message.subject}`,
                attachments: [imagePath]
            }, threadId, type);

            setTimeout(async () => {
                try {
                    await fs.unlink(imagePath);
                } catch (_) {}
            }, 10000);

        } else {
            // Tạo ảnh help
            const helpImage = await createHelpImage();
            const helpPath = path.join(tempPath, `gmail_help_${Date.now()}.png`);
            await fs.writeFile(helpPath, helpImage);

            await api.sendMessage({
                msg: "📧 Hướng dẫn sử dụng Email Ảo",
                attachments: [helpPath]
            }, threadId, type);

            setTimeout(async () => {
                try {
                    await fs.unlink(helpPath);
                } catch (_) {}
            }, 10000);
        }

    } catch (error) {
        console.error("Lỗi khi xử lý email:", error);
        await api.sendMessage("❌ Đã xảy ra lỗi khi xử lý email. Vui lòng thử lại!", threadId, type);
    }
};

// Tạo ảnh help
async function createHelpImage() {
    const width = 1200;
    const height = 1050;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#0f172a');
    bgGradient.addColorStop(0.5, '#1e293b');
    bgGradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Pattern
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    for (let i = 0; i < width; i += 60) {
        for (let j = 0; j < height; j += 60) {
            ctx.fillRect(i, j, 30, 30);
        }
    }

    const borderGradient = ctx.createLinearGradient(0, 0, width, 0);
    borderGradient.addColorStop(0, '#3b82f6');
    borderGradient.addColorStop(0.5, '#8b5cf6');
    borderGradient.addColorStop(1, '#ec4899');

    // Header
    const headerGradient = ctx.createLinearGradient(0, 0, width, 0);
    headerGradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
    headerGradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.2)');
    headerGradient.addColorStop(1, 'rgba(236, 72, 153, 0.2)');
    
    roundRect(ctx, 40, 30, width - 80, 120, 25);
    ctx.fillStyle = headerGradient;
    ctx.fill();
    
    roundRect(ctx, 40, 30, width - 80, 120, 25);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 4;
    ctx.stroke();

    const titleGradient = ctx.createLinearGradient(0, 0, width, 0);
    titleGradient.addColorStop(0, '#3b82f6');
    titleGradient.addColorStop(0.5, '#8b5cf6');
    titleGradient.addColorStop(1, '#ec4899');
    
    ctx.fillStyle = titleGradient;
    ctx.textAlign = 'center';
    ctx.font = 'bold 52px Arial';
    ctx.shadowColor = 'rgba(59, 130, 246, 0.8)';
    ctx.shadowBlur = 25;
    ctx.fillText('📧 HƯỚNG DẪN EMAIL ẢO', width / 2, 105);
    ctx.shadowBlur = 0;

    // Commands
    let currentY = 220;
    const commands = [
        { icon: '➕', title: 'Tạo Email Mới', cmd: 'gmail', desc: 'hoặc gmail create' },
        { icon: '📬', title: 'Xem Hộp Thư', cmd: 'gmail check <email>', desc: 'Tự động hiển thị email mới nhất' },
        { icon: '📩', title: 'Đọc Email', cmd: 'gmail read <email> <id>', desc: 'Xem chi tiết nội dung email' }
    ];

    for (let cmd of commands) {
        const cardHeight = 160;
        const cardGradient = ctx.createLinearGradient(80, currentY, width - 80, currentY);
        cardGradient.addColorStop(0, 'rgba(30, 41, 59, 0.8)');
        cardGradient.addColorStop(1, 'rgba(15, 23, 42, 0.8)');
        
        roundRect(ctx, 80, currentY, width - 160, cardHeight, 20);
        ctx.fillStyle = cardGradient;
        ctx.fill();
        
        roundRect(ctx, 80, currentY, width - 160, cardHeight, 20);
        ctx.strokeStyle = borderGradient;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Icon
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 50px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(cmd.icon, 120, currentY + 70);

        // Title
        ctx.fillStyle = '#3b82f6';
        ctx.font = 'bold 32px Arial';
        ctx.fillText(cmd.title, 200, currentY + 50);

        // Command
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 24px Arial';
        ctx.fillText(cmd.cmd, 200, currentY + 90);

        // Description
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 20px Arial';
        ctx.fillText(cmd.desc, 200, currentY + 125);

        currentY += cardHeight + 20;
    }

    // Examples
    currentY += 30;
    ctx.fillStyle = titleGradient;
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('💡 VÍ DỤ SỬ DỤNG', width / 2, currentY);
    
    currentY += 50;
    
    const exampleCard = currentY;
    const cardGradient = ctx.createLinearGradient(80, exampleCard, width - 80, exampleCard);
    cardGradient.addColorStop(0, 'rgba(30, 41, 59, 0.8)');
    cardGradient.addColorStop(1, 'rgba(15, 23, 42, 0.8)');
    
    roundRect(ctx, 80, exampleCard, width - 160, 180, 20);
    ctx.fillStyle = cardGradient;
    ctx.fill();
    
    roundRect(ctx, 80, exampleCard, width - 160, 180, 20);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Examples với font lớn hơn và rõ ràng hơn
    ctx.textAlign = 'left';
    let exY = exampleCard + 45;
    
    // Example 1
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 26px Arial';
    ctx.fillText('➊', 120, exY);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('gmail', 170, exY);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '20px Arial';
    ctx.fillText('(Tạo email mới)', 260, exY);
    
    exY += 50;
    
    // Example 2
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 26px Arial';
    ctx.fillText('➋', 120, exY);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('gmail check', 170, exY);
    ctx.fillStyle = '#3b82f6';
    ctx.font = '22px Arial';
    ctx.fillText('email@guerrillamail.com', 330, exY);
    
    exY += 50;
    
    // Example 3
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 26px Arial';
    ctx.fillText('➌', 120, exY);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('gmail read', 170, exY);
    ctx.fillStyle = '#3b82f6';
    ctx.font = '22px Arial';
    ctx.fillText('email@guerrillamail.com', 320, exY);
    ctx.fillStyle = '#ec4899';
    ctx.fillText('123456', 640, exY);

    // Footer
    const footerY = height - 80;
    const footerGradient = ctx.createLinearGradient(0, footerY, width, footerY);
    footerGradient.addColorStop(0, 'rgba(59, 130, 246, 0.15)');
    footerGradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.15)');
    footerGradient.addColorStop(1, 'rgba(236, 72, 153, 0.15)');
    
    roundRect(ctx, 40, footerY, width - 80, 60, 20);
    ctx.fillStyle = footerGradient;
    ctx.fill();
    
    roundRect(ctx, 40, footerY, width - 80, 60, 20);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 3;
    ctx.stroke();
    
    const footerTextGradient = ctx.createLinearGradient(0, 0, width, 0);
    footerTextGradient.addColorStop(0, '#3b82f6');
    footerTextGradient.addColorStop(0.5, '#8b5cf6');
    footerTextGradient.addColorStop(1, '#ec4899');
    
    ctx.fillStyle = footerTextGradient;
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px Arial';
    ctx.shadowColor = 'rgba(59, 130, 246, 0.5)';
    ctx.shadowBlur = 15;
    ctx.fillText('💎 BONZ VIP - MUA BOT LH 0785000270', width / 2, footerY + 40);
    ctx.shadowBlur = 0;

    return canvas.toBuffer('image/png');
}
