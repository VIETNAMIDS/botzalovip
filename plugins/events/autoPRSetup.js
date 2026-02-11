module.exports.config = {
    event_type: ["message"],
    name: "autoPRSetup",
    version: "1.0.0",
    author: "NG ĐÌNH THẮNG LỢI",
    description: "Xử lý setup chiến dịch Auto PR qua reply",
    dependencies: {}
};

module.exports.run = async ({ event, eventType, api, replyData }) => {
    const { threadId, type, data } = event;
    const senderId = String(data?.uidFrom || event?.authorId || '');
    const content = data?.content || '';
    
    if (eventType !== 'message' || !content || !replyData) return;
    
    // Kiểm tra có setup đang chờ không
    if (!global.autoPRSetup || !global.autoPRSetup.has(senderId)) return;
    
    const setup = global.autoPRSetup.get(senderId);
    const { campaignId, step } = setup;
    
    // Lấy chiến dịch từ global autoPRCampaigns
    const autoPRCampaigns = global.autoPRCampaigns || new Map();
    const campaign = autoPRCampaigns.get(campaignId);
    
    if (!campaign) {
        global.autoPRSetup.delete(senderId);
        return api.sendMessage("❌ Không tìm thấy chiến dịch! Vui lòng tạo lại.", threadId, type);
    }
    
    try {
        switch (step) {
            case 'groups':
                await handleGroupsInput(api, event, setup, campaign, content);
                break;
            case 'message':
                await handleMessageInput(api, event, setup, campaign, content);
                break;
            case 'interval':
                await handleIntervalInput(api, event, setup, campaign, content);
                break;
            case 'maxSends':
                await handleMaxSendsInput(api, event, setup, campaign, content);
                break;
        }
    } catch (error) {
        console.error("Error in autoPRSetup:", error);
        api.sendMessage("❌ Có lỗi xảy ra! Vui lòng thử lại.", threadId, type);
    }
};

// Xử lý nhập danh sách nhóm
async function handleGroupsInput(api, event, setup, campaign, content) {
    const { threadId, type } = event;
    const senderId = String(event.data?.uidFrom || event?.authorId || '');
    
    // Parse danh sách ID nhóm
    const groupIds = content.split(',').map(id => id.trim()).filter(id => id.length > 0);
    
    if (groupIds.length === 0) {
        return api.sendMessage("❌ Danh sách ID nhóm không hợp lệ! Vui lòng nhập lại.", threadId, type);
    }
    
    // Validate ID nhóm (chỉ số)
    const invalidIds = groupIds.filter(id => !/^\d+$/.test(id));
    if (invalidIds.length > 0) {
        return api.sendMessage(`❌ ID nhóm không hợp lệ: ${invalidIds.join(', ')}\n💡 ID nhóm chỉ được chứa số!`, threadId, type);
    }
    
    // Cập nhật campaign
    campaign.groups = groupIds;
    
    // Chuyển sang bước tiếp theo
    setup.step = 'message';
    
    const nextStepText = [
        '✅ Đã lưu danh sách nhóm!',
        `👥 Số nhóm: ${groupIds.length}`,
        '',
        '📝 BƯỚC 2: Nhập nội dung tin nhắn PR',
        '• Đây là nội dung sẽ được gửi đến các nhóm',
        '• Có thể nhiều dòng, emoji, link...',
        '',
        '💬 Vui lòng reply tin nhắn này với nội dung PR:'
    ].join('\n');
    
    return api.sendMessage(nextStepText, threadId, type);
}

// Xử lý nhập nội dung tin nhắn
async function handleMessageInput(api, event, setup, campaign, content) {
    const { threadId, type } = event;
    
    if (content.length < 10) {
        return api.sendMessage("❌ Nội dung tin nhắn quá ngắn! Tối thiểu 10 ký tự.", threadId, type);
    }
    
    if (content.length > 2000) {
        return api.sendMessage("❌ Nội dung tin nhắn quá dài! Tối đa 2000 ký tự.", threadId, type);
    }
    
    // Cập nhật campaign
    campaign.message = content;
    
    // Chuyển sang bước tiếp theo
    setup.step = 'interval';
    
    const nextStepText = [
        '✅ Đã lưu nội dung tin nhắn!',
        `📝 Độ dài: ${content.length} ký tự`,
        '',
        '⏰ BƯỚC 3: Nhập thời gian gửi (phút)',
        '• Khoảng thời gian giữa các lần gửi',
        '• Tối thiểu: 5 phút',
        '• Tối đa: 1440 phút (24 giờ)',
        '',
        '💬 Vui lòng reply tin nhắn này với số phút:'
    ].join('\n');
    
    return api.sendMessage(nextStepText, threadId, type);
}

// Xử lý nhập thời gian
async function handleIntervalInput(api, event, setup, campaign, content) {
    const { threadId, type } = event;
    
    const interval = parseInt(content);
    
    if (isNaN(interval) || interval < 5 || interval > 1440) {
        return api.sendMessage("❌ Thời gian không hợp lệ! Vui lòng nhập số từ 5 đến 1440 phút.", threadId, type);
    }
    
    // Cập nhật campaign
    campaign.interval = interval;
    
    // Chuyển sang bước cuối
    setup.step = 'maxSends';
    
    const nextStepText = [
        '✅ Đã lưu thời gian gửi!',
        `⏰ Chu kỳ: ${interval} phút`,
        '',
        '🎯 BƯỚC 4: Nhập số lượt gửi tối đa',
        '• Tổng số lần gửi tin nhắn',
        '• Tối thiểu: 1 lượt',
        '• Tối đa: 1000 lượt',
        '• Chiến dịch sẽ tự dừng khi đạt số lượt này',
        '',
        '💬 Vui lòng reply tin nhắn này với số lượt:'
    ].join('\n');
    
    return api.sendMessage(nextStepText, threadId, type);
}

// Xử lý nhập số lượt tối đa
async function handleMaxSendsInput(api, event, setup, campaign, content) {
    const { threadId, type } = event;
    const senderId = String(event.data?.uidFrom || event?.authorId || '');
    
    const maxSends = parseInt(content);
    
    if (isNaN(maxSends) || maxSends < 1 || maxSends > 1000) {
        return api.sendMessage("❌ Số lượt không hợp lệ! Vui lòng nhập số từ 1 đến 1000.", threadId, type);
    }
    
    // Cập nhật campaign
    campaign.maxSends = maxSends;
    campaign.status = 'ready';
    
    // Xóa setup
    global.autoPRSetup.delete(senderId);
    
    const completedText = [
        '🎉 ĐÃ TẠO CHIẾN DỊCH AUTO PR THÀNH CÔNG!',
        '',
        `📋 Tên: ${campaign.name}`,
        `🆔 ID: ${campaign.id}`,
        `👥 Số nhóm: ${campaign.groups.length}`,
        `📝 Nội dung: ${campaign.message.substring(0, 50)}${campaign.message.length > 50 ? '...' : ''}`,
        `⏰ Chu kỳ: ${campaign.interval} phút`,
        `🎯 Số lượt tối đa: ${campaign.maxSends}`,
        '',
        '🚀 CÁCH SỬ DỤNG:',
        `• Bắt đầu: bonz auto pr start ${campaign.id}`,
        `• Dừng: bonz auto pr stop ${campaign.id}`,
        `• Xóa: bonz auto pr delete ${campaign.id}`,
        '',
        '✅ Chiến dịch đã sẵn sàng để chạy!'
    ].join('\n');
    
    return api.sendMessage(completedText, threadId, type);
}
