import fs from "fs/promises";
import path from "path";
import { log } from "../utils/logger.js";
import { Reactions } from "../../zca-gwendev/dist/index.js";


export async function load(commandsRoot, allowSet) {
    const commands = new Map();
    try {
        const files = await fs.readdir(commandsRoot, { withFileTypes: true });
        for (const f of files) {
            if (!f.isFile()) continue;
            if (!f.name.endsWith(".js")) continue;
            const full = path.join(commandsRoot, f.name);
            try {
                const mod = await import(urlsafe(full));
                const cmd = mod?.default || mod;
                if (cmd && cmd.name && typeof cmd.run === "function") {
                    const key = String(cmd.name || '').toLowerCase();
                    if (allowSet && !allowSet.has(key)) {
                        continue;
                    }
                    commands.set(key, cmd);
                    log(`${cmd.name.toUpperCase()} | SUCCESS`, "auto");
                }
            } catch (e) {
                const base = f.name.replace(/\.js$/i, "");
                log(`${base.toUpperCase()} | ERROR${e?.message?`: ${e.message}`:""}`, "error");
            }
        }
    } catch (e) {
        log(`LOAD COMMANDS | ERROR${e?.message?`: ${e.message}`:""}`, "error");
    }
    return commands;
}

function urlsafe(p) {
    let s = path.resolve(p).replace(/\\/g, "/");
    if (!s.startsWith("/")) s = "/" + s;
    return `file://${s}`;
}

const cooldowns = new Map();
const cooldownVisuals = new Map();

export async function run({ prefix, content, ctx, commands, api }) {
    if (!content.startsWith(prefix)) return false;
    const raw = content.slice(prefix.length).trim();
    if (!raw) return false;
    const [name, ...args] = raw.split(/\s+/);
    const cmd = commands.get(name.toLowerCase());
    if (!cmd || typeof cmd.run !== "function") {
        try {
            const data = ctx?.data || {};
            const dest = {
                type: ctx.type,
                threadId: ctx.threadId,
                data: {
                    msgId: data.msgId || data.messageId,
                    cliMsgId: (data?.content && (data.content.cliMsgId ?? data.content.clientMsgId)) || data.cliMsgId || data.clientMsgId || 0,
                },
            };
            if (!dest.threadId) {
                console.warn(`[REACTION] ThreadId is undefined, cannot add SUN reaction`);
                return false;
            }
            await api.addReaction(Reactions.SUN, dest);
        } catch (err) {
            console.warn(`[REACTION] Thả SUN thất bại:`, err);
        }
        return false;
    }

    const cooldownTime = cmd.cooldown || 0;
    if (cooldownTime > 0) {
        if (!cooldowns.has(name)) cooldowns.set(name, new Map());
        
        const now = Date.now();
        const userCooldowns = cooldowns.get(name);
        const senderUid = String(ctx?.data?.uidFrom || ctx?.senderId || ctx?.data?.uid || '');
        const scopeId = String(ctx.threadId || 'global');
        const key = `${scopeId}:${senderUid || 'unknown'}`;
        const lastUsed = userCooldowns.get(key) || 0;
        const endAt = lastUsed + cooldownTime * 1000;
        const remaining = endAt - now;
    
        if (remaining > 0) {
            const secondsLeft = Math.ceil(remaining / 1000);
            const data = ctx?.data || {};
            const dest = {
                type: ctx.type,
                threadId: ctx.threadId,
                data: {
                    msgId: data.msgId || data.messageId,
                    cliMsgId: (data?.content && (data.content.cliMsgId ?? data.content.clientMsgId)) || data.cliMsgId || data.clientMsgId || 0,
                },
            };
            
            try {
                const visualKey = `${name}:${key}`;
                const v = cooldownVisuals.get(visualKey);
                if (v) return true;
                const sessionId = Math.random().toString(36).slice(2);
                const entry = { endAt, timer: null, sessionId };
                cooldownVisuals.set(visualKey, entry);
                
                const burstReactions = async (count) => {
                    const tasks = Array.from({ length: count }, () => api.addReaction(Reactions.DISLIKE, dest));
                    const results = await Promise.allSettled(tasks);
                    const ok = results.filter(r => r.status === 'fulfilled').length;
                    const fail = count - ok;
                    if (fail) try { console.warn(`[CD] burst fail=${fail}/${count}`); } catch {}
                };

                try {
                    try { await api.addReaction(Reactions.NONE, dest); } catch {}
                    await burstReactions(secondsLeft);
                } catch (e) { try { console.warn('[CD] burst-once error', e?.message||e); } catch {} }
                const msLeft = Math.max(0, endAt - Date.now() + 20);
                entry.timer = setTimeout(async () => {
                    const current = cooldownVisuals.get(visualKey);
                    if (!current || current.sessionId !== sessionId) return;
                    try { await api.addReaction(Reactions.NONE, dest); } catch (e2) { try { console.warn('[CD] none-end error', e2?.message||e2); } catch {} }
                    cooldownVisuals.delete(visualKey);
                }, msLeft);
                cooldownVisuals.set(visualKey, entry);
            } catch (err) {
                console.warn(`[REACTION] DISLIKE burst thất bại:`, err);
            }
            
            return true;
        }
        
        userCooldowns.set(key, now);
    }

    try {
        const data = ctx?.data || {};
        const dest = {
            type: ctx.type,
            threadId: ctx.threadId,
            data: {
                msgId: data.msgId || data.messageId,
                cliMsgId: (data?.content && (data.content.cliMsgId ?? data.content.clientMsgId)) || data.cliMsgId || data.clientMsgId || 0,
            },
        };
        await api.addReaction(Reactions.OK, dest);
    } catch (err) {
        console.warn(`[REACTION] Thả OK thất bại:`, err);
    }

    try {
        await cmd.run({ message: ctx, api, args, commands });
        return true;
    } catch {
        return false;
    }
}



