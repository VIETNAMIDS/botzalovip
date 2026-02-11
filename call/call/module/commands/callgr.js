import { sendGroupCall } from "../../api/gwendev/sendGroupCall.js";
import { Reactions } from "../../zca-gwendev/dist/index.js";
import fs from "fs/promises";
import path from "path";
// gwendev . style text lấy ở message
let HIDE_CALLER = true;

const isGroupLink = (s) => /^https?:\/\/zalo\.me\/g\//i.test(String(s || ""));
const parseCallType = (t) => (String(t || "voice").toLowerCase() === "video" ? 2 : 1);

const addReactionSafe = async (api, reaction, dest) => {
  try {
    await api.addReaction(reaction, dest);
  } catch (error) {
  }
};

const autoDeleteMessage = async (api, messageData, delayMs = 6000) => {
  try {
    setTimeout(async () => {
      try {
        const dest = {
          type: messageData.threadType,
          threadId: messageData.threadId,
          data: {
            msgId: messageData.msgId || 0,
            cliMsgId: messageData.cliMsgId || 0
          }
        };
        await api.deleteMessage(dest, false);
      } catch (error) {
      }
    }, delayMs);
  } catch (error) {
  }
};

const sendMessageWithAutoDelete = async (api, messageData, delayMs = 6000) => {
  try {
    const result = await api.sendMessage(messageData, messageData.threadId, messageData.threadType);
    
    if (result && result.msgId) {
      await autoDeleteMessage(api, {
        threadType: messageData.threadType,
        threadId: messageData.threadId,
        msgId: result.msgId,
        cliMsgId: result.cliMsgId || 0
      }, delayMs);
    }
    
    return result;
  } catch (error) {
    throw error;
  }
};

const getMembersFromResponse = (response, groupId) => {
  try {
    const groupInfo = response?.gridInfoMap?.[groupId];
    if (groupInfo?.memVerList?.length) {
      return groupInfo.memVerList.map(id => String(id).split('_')[0]).filter(Boolean);
    }
    
    const linkData = response?.data || response;
    if (linkData?.currentMems?.length) {
      return linkData.currentMems.map(member => String(member.id || member.userId)).filter(Boolean);
    }
    
    return [];
  } catch {
    return [];
  }
};

const saveGroupInfo = async (groupId, groupName, members, link = null) => {
  try {
    const jsonDir = path.join(process.cwd(), "core", "json");
    const jsonFile = path.join(jsonDir, `${groupId}.json`);
    
    await fs.mkdir(jsonDir, { recursive: true });
    
    const groupData = {
      groupId: String(groupId),
      groupName: String(groupName),
      members: members.map(String),
      link: link ? String(link) : null,
      lastUpdated: new Date().toISOString()
    };
    
    await fs.writeFile(jsonFile, JSON.stringify(groupData, null, 2), 'utf8');
  } catch (error) {
  }
};

const loadGroupInfo = async (groupId) => {
  try {
    const jsonFile = path.join(process.cwd(), "core", "json", `${groupId}.json`);
    const data = await fs.readFile(jsonFile, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
};

const processMultipleCalls = async (api, links, count, callType, threadId, threadType, quote, userId) => {
  const startTime = new Date();
  
  const reactionDest = {
    type: threadType,
    threadId: threadId,
    data: {
      msgId: quote?.msgId || quote?.messageId || "0",
      cliMsgId: quote?.cliMsgId || quote?.clientMsgId || "0"
    }
  };

  const callTypeText = callType === 2 ? "Video Call" : "Voice Call";
  
  await addReactionSafe(api, Reactions.SUN, reactionDest);
  
  const warningMsg = callType === 2 ? 
    `⚠️ [ CẢNH BÁO VIDEO CALL ]\nVideo call có thể bị lỗi do giới hạn API\n💡 Khuyến nghị: Dùng voice call để ổn định hơn\n\n` : '';
  
  await sendMessageWithAutoDelete(api, { 
    msg: `🚀 [ BẮT ĐẦU GỌI NHIỀU NHÓM ]\n` +
         `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
         `🔗 Số nhóm: ${links.length}\n` +
         `📱 Loại: ${callTypeText}\n` +
         `🔄 Số lần/nhóm: ${count}\n` +
         `⏱️ Ước tính: ${Math.ceil(links.length * count * 2 / 60)} phút\n` +
         `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
         warningMsg +
         `⏰ Bắt đầu lúc: ${new Date().toLocaleString('vi-VN')}`, 
    quote,
    ttl: 10_000,
    threadId,
    threadType
  });

  const allResults = [];
  let totalGroups = 0;
  let successfulGroups = 0;
  let totalMembersCalled = 0;
  let totalCallsMade = 0;
  let totalCallsAttempted = 0;

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const groupNum = i + 1;
    
    try {
      await sendMessageWithAutoDelete(api, {
        msg: `📞 [ NHÓM ${groupNum}/${links.length} ]\n🔗 ${link}\n⏳ Đang lấy thông tin nhóm...`,
        quote,
        ttl: 15_000,
        threadId,
        threadType
      });

      const linkInfo = await api.getGroupLinkInfo({ link, memberPage: 1 });
      const groupData = linkInfo?.data || linkInfo;
      
      if (!groupData) {
        allResults.push({ 
          success: false, 
          groupName: "Unknown", 
          link, 
          error: "Không thể lấy thông tin nhóm từ link" 
        });
        continue;
      }

      const groupId = groupData.groupId || groupData.id;
      const groupName = groupData.name || groupData.groupName || "Unknown";
      
      let allMembers = getMembersFromResponse(linkInfo, groupId);
      
      if (groupData.hasMoreMember === 1) {
        let currentPage = 2;
        while (currentPage <= 5) {
          try {
            const pageInfo = await api.getGroupLinkInfo({ link, memberPage: currentPage });
            const pageMembers = getMembersFromResponse(pageInfo, groupId);
            if (pageMembers.length === 0) break;
            allMembers = allMembers.concat(pageMembers);
            currentPage++;
          } catch {
            break;
          }
        }
      }
      
      const uniqueMembers = [...new Set(allMembers)];

      if (!uniqueMembers.length) {
        allResults.push({ 
          success: false, 
          groupName, 
          link, 
          error: "Không có thành viên hợp lệ" 
        });
        continue;
      }

      if (uniqueMembers.length > 0) {
        await saveGroupInfo(groupId, groupName, uniqueMembers, link);
      }

      const batchSize = 50;
      const batches = [];
      for (let j = 0; j < uniqueMembers.length; j += batchSize) {
        batches.push(uniqueMembers.slice(j, j + batchSize));
      }

      let groupSuccessCalls = 0;
      let groupFailedCalls = 0;
      
      await addReactionSafe(api, Reactions.HANDCLAP, reactionDest);
      
      await sendMessageWithAutoDelete(api, {
        msg: `📞 [ ĐANG GỌI NHÓM ${groupNum}/${links.length} ]\n` +
             `📝 ${groupName}\n` +
             `👥 ${uniqueMembers.length} thành viên\n` +
             `📦 ${batches.length} đợt\n` +
             `🔄 ${count} lần/đợt`,
        quote,
        ttl: 10_000,
        threadId,
        threadType
      });

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        
        for (let callIndex = 0; callIndex < count; callIndex++) {
          try {
            await sendGroupCall(api, groupId, batch, { callType, hideCaller: HIDE_CALLER });
            groupSuccessCalls++;
            totalCallsMade++;
          } catch (error) {
            groupFailedCalls++;
            if (callType === 2) {
              console.warn(`[VIDEO CALL ERROR] Group ${groupNum}, Batch ${batchIndex + 1}, Call ${callIndex + 1}:`, error?.message || error);
            }
          }
          
          if (callIndex < count - 1) {
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
        
        if (batchIndex < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      totalGroups++;
      totalMembersCalled += uniqueMembers.length;
      totalCallsAttempted += batches.length * count;
      
      if (groupSuccessCalls > 0) {
        successfulGroups++;
        await addReactionSafe(api, Reactions.OK, reactionDest);
      }
      if (groupFailedCalls > 0) {
        await addReactionSafe(api, Reactions.DISLIKE, reactionDest);
      }

      allResults.push({ 
        success: true, 
        groupName, 
        link, 
        membersCalled: uniqueMembers.length,
        successCalls: groupSuccessCalls,
        failedCalls: groupFailedCalls,
        totalCalls: batches.length * count
      });

    } catch (error) {
      allResults.push({ 
        success: false, 
        groupName: "Unknown", 
        link, 
        error: String(error?.message || error) 
      });
      await addReactionSafe(api, Reactions.BOMB, reactionDest);
    }

    if (i < links.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  const successRate = totalCallsAttempted > 0 ? Math.round((totalCallsMade / totalCallsAttempted) * 100) : 0;
  const endTime = new Date();
  const durationMinutes = Math.round((endTime - startTime) / 1000 / 60);
  
  // Tạo báo cáo chi tiết
  let detailReport = `📊 [ CHI TIẾT TỪNG NHÓM ]\n`;
  allResults.forEach((result, index) => {
    if (result.success) {
      detailReport += `✅ ${index + 1}. ${result.groupName}\n` +
                     `   👥 ${result.membersCalled} người | ✅ ${result.successCalls} cuộc gọi\n`;
    } else {
      detailReport += `❌ ${index + 1}. ${result.groupName}\n` +
                     `   🚨 ${result.error}\n`;
    }
  });

  const summaryMsg = `🏁 [ BÁO CÁO HOÀN THÀNH NHIỀU NHÓM ]\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `🔗 Tổng số nhóm: ${links.length}\n` +
                    `📱 Loại: ${callTypeText}\n` +
                    `⏱️ Thời gian: ${durationMinutes} phút\n\n` +
                    `📊 [ THỐNG KÊ TỔNG QUAN ]\n` +
                    `✅ Nhóm thành công: ${successfulGroups}/${totalGroups}\n` +
                    `👥 Tổng người được gọi: ${totalMembersCalled}\n` +
                    `📞 Tổng cuộc gọi: ${totalCallsAttempted}\n` +
                    `✅ Thành công: ${totalCallsMade} (${successRate}%)\n` +
                    `❌ Thất bại: ${totalCallsAttempted - totalCallsMade}\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    detailReport +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `⏰ Hoàn thành lúc: ${new Date().toLocaleString('vi-VN')}`;
  
  if (successRate >= 80) {
    await addReactionSafe(api, Reactions.COOL, reactionDest);
  } else if (successRate >= 50) {
    await addReactionSafe(api, Reactions.OK, reactionDest);
  } else {
    await addReactionSafe(api, Reactions.SAD, reactionDest);
  }
  
  await sendMessageWithAutoDelete(api, { 
    msg: summaryMsg, 
    quote, 
    ttl: 120_000,
    threadId,
    threadType
  }, 30000);
};

const processSingleCall = async (api, params, threadId, threadType, quote, userId) => {
  const { link, groupId, targetUid, count, callType, isKeyBac, isKeyVang, isGroupId } = params;
  
  const startTime = new Date();
  
  const reactionDest = {
    type: threadType,
    threadId: threadId,
    data: {
      msgId: quote?.msgId || quote?.messageId || "0",
      cliMsgId: quote?.cliMsgId || quote?.clientMsgId || "0"
    }
  };
  
  try {
    let finalGroupId, groupName, totalMembers, targetMembers, callMode;
    
    if (isGroupId) {
      const cachedGroup = await loadGroupInfo(groupId);
      
      if (cachedGroup) {
        finalGroupId = cachedGroup.groupId;
        groupName = cachedGroup.groupName;
        totalMembers = cachedGroup.members.length;
        
        if (targetUid) {
          targetMembers = [String(targetUid)];
          callMode = "specific";
        } else {
          targetMembers = cachedGroup.members;
          callMode = "all";
        }
      } else {
        finalGroupId = groupId;
        groupName = "Unknown Group";
        
        if (targetUid) {
          totalMembers = 1;
          targetMembers = [String(targetUid)];
          callMode = "specific";
        } else {
          await addReactionSafe(api, Reactions.CONFUSED, reactionDest);
          await sendMessageWithAutoDelete(api, {
            msg: `❌ [ KHÔNG CÓ CACHE NHÓM ]\n` +
                 `🆔 Group ID: ${finalGroupId}\n` +
                 `💡 Hướng dẫn: callgr <link> ... để tạo cache\n` +
                 `💾 Hoặc: callgr cache <link> để lưu thông tin`,
            quote,
            ttl: 10_000,
            threadId,
            threadType
          });
          return;
        }
      }
    } else {
      const linkInfo = await api.getGroupLinkInfo({ link, memberPage: 1 });
      const groupData = linkInfo?.data || linkInfo;
      
      if (!groupData) {
        throw new Error("❌ Không thể lấy thông tin nhóm từ link\n🔗 Link có thể không hợp lệ hoặc nhóm đã bị xóa");
      }

      finalGroupId = groupData.groupId || groupData.id;
      groupName = groupData.name || groupData.groupName || "Unknown";
      totalMembers = groupData.totalMember || 0;
      const adminIds = groupData.adminIds || [];
      const creatorId = groupData.creatorId || groupData.creator?.id || groupData.creator?.uid;
      
      if (isKeyBac) {
        targetMembers = Array.isArray(adminIds) ? adminIds.map(String) : [];
        callMode = "keybac";
      } else if (isKeyVang) {
        targetMembers = creatorId ? [String(creatorId)] : [];
        callMode = "keyvang";
      } else {
        let allMembers = getMembersFromResponse(linkInfo, finalGroupId);
        
        if (groupData.hasMoreMember === 1) {
          let currentPage = 2;
          while (currentPage <= 5) {
            try {
              const pageInfo = await api.getGroupLinkInfo({ link, memberPage: currentPage });
              const pageMembers = getMembersFromResponse(pageInfo, finalGroupId);
              if (pageMembers.length === 0) break;
              allMembers = allMembers.concat(pageMembers);
              currentPage++;
            } catch {
              break;
            }
          }
        }
        targetMembers = [...new Set(allMembers)];
        callMode = "all";
        
        if (targetMembers.length > 0) {
          await saveGroupInfo(finalGroupId, groupName, targetMembers, link);
        }
      }
    }

    const uniqueMembers = targetMembers;

    if (!uniqueMembers.length) {
      await addReactionSafe(api, Reactions.NO, reactionDest);
      await sendMessageWithAutoDelete(api, { 
        msg: `❌ [ KHÔNG CÓ THÀNH VIÊN HỢP LỆ ]\n` +
             `📞 ${groupName}\n` +
             `👥 Tổng thành viên: ${uniqueMembers.length}\n` +
             `✅ Có thể gọi: ${uniqueMembers.length}`, 
        quote, 
        ttl: 10_000,
        threadId,
        threadType
      });
      return;
    }

    const batchSize = 50;
    const batches = [];
    for (let i = 0; i < uniqueMembers.length; i += batchSize) {
      batches.push(uniqueMembers.slice(i, i + batchSize));
    }

    const callTypeText = callType === 2 ? "Video Call" : "Voice Call";
    const modeText = isGroupId && targetUid ? `🎯 GỌI CHỈ ĐỊNH (UID: ${targetUid})` :
                    isGroupId ? "💾 GỌI TẤT CẢ TỪ CACHE" :
                    isKeyBac ? "🔑 KEY BẠC (Admin)" : 
                    isKeyVang ? "🔑 KEY VÀNG (Creator)" : 
                    "👥 TẤT CẢ THÀNH VIÊN";
    
    await addReactionSafe(api, Reactions.SUN, reactionDest);
    
    const warningMsg = callType === 2 ? 
      `⚠️ [ CẢNH BÁO VIDEO CALL ]\nVideo call có thể bị lỗi do giới hạn API\n💡 Khuyến nghị: Dùng voice call để ổn định hơn\n\n` : '';
    
    await sendMessageWithAutoDelete(api, { 
      msg: `🚀 [ BẮT ĐẦU GỌI NHÓM ]\n` +
           `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
           `📞 Nhóm: ${groupName}\n` +
           `🎯 Chế độ: ${modeText}\n` +
           `📱 Loại: ${callTypeText}\n` +
           `👥 Số người: ${uniqueMembers.length}\n` +
           `🔄 Số lần/đợt: ${count}\n` +
           `📦 Tổng đợt: ${batches.length}\n` +
           `⏱️ Ước tính: ${Math.ceil(batches.length * count * 2 / 60)} phút\n` +
           `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
           warningMsg +
           `⏰ Bắt đầu lúc: ${new Date().toLocaleString('vi-VN')}`, 
      quote,
      ttl: 10_000,
      threadId,
      threadType
    });

    const results = [];
    let totalSuccessCalls = 0;
    let totalFailedCalls = 0;
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchNum = i + 1;

      await addReactionSafe(api, Reactions.HANDCLAP, reactionDest);

      try {
        let successCount = 0;
        let failedCount = 0;
        
        for (let j = 0; j < count; j++) {
          try {
            await sendGroupCall(api, finalGroupId, batch, { callType, hideCaller: HIDE_CALLER });
            successCount++;
            totalSuccessCalls++;
          } catch (error) {
            failedCount++;
            totalFailedCalls++;
            if (callType === 2) {
              console.warn(`[VIDEO CALL ERROR] Batch ${batchNum}, Call ${j + 1}:`, error?.message || error);
            }
          }
          
          if (j < count - 1) {
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }

        results.push({ success: true, memberCount: batch.length, callCount: successCount, failedCount, totalCalls: count });
        
        if (successCount > 0) {
          await addReactionSafe(api, Reactions.OK, reactionDest);
        }
        if (failedCount > 0) {
          await addReactionSafe(api, Reactions.DISLIKE, reactionDest);
        }
        
      } catch (e) {
        results.push({ success: false, error: String(e?.message || e) });
        
        await addReactionSafe(api, Reactions.BOMB, reactionDest);
      }

      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    const successBatches = results.filter(r => r.success).length;
    const failedBatches = results.filter(r => !r.success).length;
    const totalMembersCalled = results.reduce((sum, r) => sum + (r.memberCount || 0), 0);
    const totalCallsMade = results.reduce((sum, r) => sum + (r.callCount || 0), 0);
    const totalCallsAttempted = results.reduce((sum, r) => sum + (r.totalCalls || 0), 0);
    const totalFailedCallsFromResults = results.reduce((sum, r) => sum + (r.failedCount || 0), 0);
    
    const successRate = totalCallsAttempted > 0 ? Math.round((totalCallsMade / totalCallsAttempted) * 100) : 0;
    const endTime = new Date();
    const durationMinutes = Math.round((endTime - startTime) / 1000 / 60);
    
    const summaryMsg = `🏁 [ BÁO CÁO HOÀN THÀNH ]\n` +
                      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                      `📞 Nhóm: ${groupName}\n` +
                      `🎯 Chế độ: ${modeText}\n` +
                      `📱 Loại: ${callTypeText}\n` +
                      `⏱️ Thời gian: ${durationMinutes} phút\n\n` +
                      `📊 [ THỐNG KÊ TỔNG QUAN ]\n` +
                      `👥 Tổng người được gọi: ${totalMembersCalled}\n` +
                      `📦 Tổng số đợt: ${batches.length}\n` +
                      `✅ Đợt thành công: ${successBatches}\n` +
                      `❌ Đợt thất bại: ${failedBatches}\n\n` +
                      `📞 [ THỐNG KÊ CUỘC GỌI ]\n` +
                      `🎯 Tổng cuộc gọi: ${totalCallsAttempted}\n` +
                      `✅ Thành công: ${totalCallsMade} (${successRate}%)\n` +
                      `❌ Thất bại: ${totalFailedCallsFromResults}\n` +
                      `🔄 Trung bình: ${Math.round(totalCallsMade / Math.max(successBatches, 1))} lần/đợt\n\n` +
                      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                      `⏰ Hoàn thành lúc: ${new Date().toLocaleString('vi-VN')}`;
    
    if (successRate >= 80) {
      await addReactionSafe(api, Reactions.COOL, reactionDest);
    } else if (successRate >= 50) {
      await addReactionSafe(api, Reactions.OK, reactionDest);
    } else {
      await addReactionSafe(api, Reactions.SAD, reactionDest);
    }
    
    await sendMessageWithAutoDelete(api, { 
      msg: summaryMsg, 
      quote, 
      ttl: 120_000,
      threadId,
      threadType
    }, 30000);
    
  } catch (e) {
    await addReactionSafe(api, Reactions.BOMB, reactionDest);
    
    await sendMessageWithAutoDelete(api, { 
      msg: `❌ [ LỖI HỆ THỐNG ]\n` +
           `📞 ${groupName || "Unknown Group"}\n` +
           `🚨 ${String(e?.message || e).slice(0, 100)}\n` +
           `⏰ ${new Date().toLocaleString('vi-VN')}`, 
      quote,
      ttl: 30_000,
      threadId,
      threadType
    });
  }
};

export default {
  name: "callgr",
  description: "Gọi nhóm từ link Zalo với số lần thực thi",
  tag: "zalo",
  cooldown: 5,
  async run({ message, api, args }) {
    const threadId = message.threadId;
    const threadType = message.type;
    const quote = message?.data || null;
    const rawArgs = Array.isArray(args) ? args.map(v => String(v).trim()).filter(Boolean) : [];
   
    if (!rawArgs.length || rawArgs[0]?.toLowerCase() === "help") {
      const msg = `📞 [ HƯỚNG DẪN CALLGR ]\n` +
                  `• callgr <link> <số_lần> <voice|video>\n` +
                  `• callgr <link1> <link2> <link3> ... <số_lần> <voice|video>\n` +
                  `• callgr <groupid> <số_lần> <voice|video>\n` +
                  `• callgr keybac <link> <số_lần> <voice|video>\n` +
                  `• callgr keyvang <link> <số_lần> <voice|video>\n` +
                  `• callgr <groupid> <uid_member> <số_lần> <voice|video>\n` +
                  `• callgr cache <link> - Lưu thông tin nhóm vào cache\n` +
                  `• callgr hide - Bật ẩn tên bot\n` +
                  `• callgr show - Tắt ẩn tên bot\n\n` +
                  `💡 [ VÍ DỤ NHIỀU LINK ]\n` +
                  `• callgr https://zalo.me/g/abc123 https://zalo.me/g/def456 3 voice\n` +
                  `• callgr link1 link2 link3 5 video`;
      await api.sendMessage({ msg, quote, ttl: 60_000 }, threadId, threadType);
      return;
    }

    const firstArg = rawArgs[0]?.toLowerCase();
    const isKeyBac = firstArg === "keybac";
    const isKeyVang = firstArg === "keyvang";
    const isCache = firstArg === "cache";
    const isGroupId = /^[0-9]{6,30}$/.test(String(rawArgs[0] || "").trim());
    
    let link, count, callType, targetUid, groupId;
    
    if (isCache) {
      if (rawArgs.length < 2) {
        await api.sendMessage({ 
          msg: `❌ Thiếu tham số\n💡 callgr cache <link>`,
          quote, 
          ttl: 30_000 
        }, threadId, threadType);
        return;
      }

      const link = rawArgs[1];
      if (!isGroupLink(link)) {
        await api.sendMessage({ 
          msg: `❌ Link không hợp lệ\n💡 callgr cache https://zalo.me/g/abc123`,
          quote, 
          ttl: 30_000 
        }, threadId, threadType);
        return;
      }

      try {
        await sendMessageWithAutoDelete(api, {
          msg: `🔄 Đang lấy thông tin nhóm từ link...`,
          quote,
          ttl: 20_000,
          threadId,
          threadType
        });

        const linkInfo = await api.getGroupLinkInfo({ link, memberPage: 1 });
        const groupData = linkInfo?.data || linkInfo;
        
        if (!groupData) {
          throw new Error("Không thể lấy thông tin nhóm từ link");
        }

        const groupId = groupData.groupId || groupData.id;
        const groupName = groupData.name || groupData.groupName || "Unknown";
        
        let allMembers = getMembersFromResponse(linkInfo, groupId);
        
        if (groupData.hasMoreMember === 1) {
          let currentPage = 2;
          while (currentPage <= 5) {
            try {
              const pageInfo = await api.getGroupLinkInfo({ link, memberPage: currentPage });
              const pageMembers = getMembersFromResponse(pageInfo, groupId);
              if (pageMembers.length === 0) break;
              allMembers = allMembers.concat(pageMembers);
              currentPage++;
            } catch {
              break;
            }
          }
        }
        
        const uniqueMembers = [...new Set(allMembers)];
        
        if (uniqueMembers.length > 0) {
          await saveGroupInfo(groupId, groupName, uniqueMembers, link);
          
          await addReactionSafe(api, Reactions.OK, reactionDest);
          await sendMessageWithAutoDelete(api, {
            msg: `✅ Đã lưu thông tin nhóm vào cache\n📝 ${groupName}\n🆔 ID: ${groupId}\n👥 ${uniqueMembers.length} thành viên`,
            quote,
            ttl: 30_000,
            threadId,
            threadType
          });
        } else {
          await addReactionSafe(api, Reactions.DISLIKE, reactionDest);
          await sendMessageWithAutoDelete(api, {
            msg: `❌ Không thể lấy danh sách thành viên`,
            quote,
            ttl: 30_000,
            threadId,
            threadType
          });
        }
        
      } catch (e) {
        await addReactionSafe(api, Reactions.BOMB, reactionDest);
        await sendMessageWithAutoDelete(api, { 
          msg: `❌ ${String(e?.message || e).slice(0, 100)}`, 
          quote,
          ttl: 30_000,
          threadId,
          threadType
        });
      }
      return;
    }

    if (args[0] === "hide") {
      HIDE_CALLER = true;
      await addReactionSafe(api, Reactions.OK, reactionDest);
      await sendMessageWithAutoDelete(api, {
        msg: "✅ Đã bật chế độ ẩn tên bot khi gọi",
        ttl: 60_000,
        threadId,
        threadType
      });
      return;
    }
    
    if (args[0] === "show") {
      HIDE_CALLER = false;
      await addReactionSafe(api, Reactions.OK, reactionDest);
      await sendMessageWithAutoDelete(api, {
        msg: "✅ Đã tắt chế độ ẩn tên bot khi gọi",
        ttl: 60_000,
        threadId,
        threadType
      });
      return;
    }
    
    if (isKeyBac || isKeyVang) {
      link = rawArgs[1];
      count = Math.min(10, Math.max(1, parseInt(rawArgs[2] || "1", 10) || 1));
      callType = parseCallType(rawArgs[3] || "voice");
    } else if (isGroupId && rawArgs.length >= 2) {
      if (rawArgs.length >= 3 && /^[0-9]{6,30}$/.test(String(rawArgs[1] || "").trim())) {
        groupId = rawArgs[0];
        targetUid = rawArgs[1];
        count = Math.min(100, Math.max(1, parseInt(rawArgs[2] || "1", 10) || 1));
        callType = parseCallType(rawArgs[3] || "voice");
      } else {
        groupId = rawArgs[0];
        count = Math.min(10, Math.max(1, parseInt(rawArgs[1] || "1", 10) || 1));
        callType = parseCallType(rawArgs[2] || "voice");
      }
    } else {
      const links = [];
      let countIndex = -1;
      let callTypeIndex = -1;
      
      for (let i = rawArgs.length - 1; i >= 0; i--) {
        const arg = rawArgs[i];
        if (callTypeIndex === -1 && (arg.toLowerCase() === "voice" || arg.toLowerCase() === "video")) {
          callTypeIndex = i;
        } else if (countIndex === -1 && /^\d+$/.test(arg)) {
          countIndex = i;
        }
      }
      
      if (countIndex !== -1 && callTypeIndex !== -1 && callTypeIndex > countIndex) {
        count = Math.min(10, Math.max(1, parseInt(rawArgs[countIndex], 10) || 1));
        callType = parseCallType(rawArgs[callTypeIndex]);
        
        for (let i = 0; i < countIndex; i++) {
          const arg = rawArgs[i];
          if (isGroupLink(arg)) {
            links.push(arg);
          }
        }
      } else if (countIndex !== -1) {
        count = Math.min(10, Math.max(1, parseInt(rawArgs[countIndex], 10) || 1));
        callType = parseCallType("voice");
        
        for (let i = 0; i < countIndex; i++) {
          const arg = rawArgs[i];
          if (isGroupLink(arg)) {
            links.push(arg);
          }
        }
      } else {
        link = rawArgs[0];
        count = Math.min(10, Math.max(1, parseInt(rawArgs[1] || "1", 10) || 1));
        callType = parseCallType(rawArgs[2] || "voice");
      }
      
      if (links.length > 1) {
        const userId = message.senderId || "unknown";
        await processMultipleCalls(api, links, count, callType, threadId, threadType, quote, userId);
        return;
      } else if (links.length === 1) {
        link = links[0];
      }
    }

    if (isKeyBac || isKeyVang) {
      if (!isGroupLink(link)) {
        const example = isKeyBac ? "callgr keybac https://zalo.me/g/abc123 3 voice" :
                       "callgr keyvang https://zalo.me/g/abc123 3 voice";
        
        await api.sendMessage({ 
          msg: `❌ Link không hợp lệ\n💡 ${example}`,
          quote,
          ttl: 30_000
        }, threadId, threadType);
        return;
      }
    } else if (isGroupId) {
      if (targetUid && !/^[0-9]{6,30}$/.test(String(targetUid).trim())) {
        await api.sendMessage({ 
          msg: `❌ UID không hợp lệ\n💡 callgr <groupid> <uid> <số_lần> <voice|video>`,
          quote,
          ttl: 30_000
        }, threadId, threadType);
        return;
      }
    } else {
      if (!isGroupLink(link)) {
        await api.sendMessage({ 
          msg: `❌ Link không hợp lệ\n💡 callgr https://zalo.me/g/abc123 3 voice\n💡 Hoặc: callgr link1 link2 link3 3 voice`,
          quote,
          ttl: 30_000
        }, threadId, threadType);
        return;
      }
    }

    const userId = message.senderId || "unknown";
    await processSingleCall(api, { link, groupId, targetUid, count, callType, isKeyBac, isKeyVang, isGroupId }, threadId, threadType, quote, userId);
  }
};