import { Zalo } from "../../zca-gwendev/dist/index.js";

/**
 * Wrapper to initiate a group call via SDK api.sendGroupCall
 * @param api SDK API instance returned after login
 * @param groupId group id (number or string)
 * @param userIds array of user ids (string[]|number[])
 * @param options optional { groupName, groupAvatar, callType, maxUsers, codecProfile }
 */
export async function sendGroupCall(api, groupId, userIds, options = {}) {
  const t0 = Date.now();
  if (!api || typeof api.sendGroupCall !== "function") {
    throw new Error("SDK api is not ready or sendGroupCall not available");
  }
  if (!groupId) throw new Error("Missing groupId");
  if (!Array.isArray(userIds) || userIds.length === 0) throw new Error("userIds must be a non-empty array");

  // Ẩn tên bot/chủ trì cuộc gọi
  const groupName = options.hideCaller ? "" : (options.groupName || "");
  const groupAvatar = options.hideCaller ? "" : (options.groupAvatar || "");
  const opts = {
    callType: options.callType,
    maxUsers: options.maxUsers,
    codecProfile: options.codecProfile,
  };

  try {
    const res = await api.sendGroupCall(String(groupId), groupName, groupAvatar, userIds.map(String), opts);
    const dt = Date.now() - t0;
    return res;
  } catch (e) {
    const dt = Date.now() - t0;
    throw e;
  }
}


