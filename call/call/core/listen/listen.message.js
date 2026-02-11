/**
 * @Author
 */
import { run as runCommand } from "../handle/handle.commands.js";

export const ListenMessage = (api, commands = null, prefix = "!") => {
    api.listener.on("message", async (message) => {
        try {
            const data = message?.data || {};
            const displayName = data.dName || data.displayName || data.name || data.uidFrom || "(unknown)";
            const msgType = data.msgType || "";
            const isGroup = Number(message?.type) === 1;
            const typeLabel = isGroup ? "Group" : "User";
            let contentStr = "";
            const content = data.content ?? data.text ?? data.message ?? data.body;
            
            if (typeof content === "string") {
                contentStr = content;
            } else if (content && typeof content === "object") {
                switch (msgType) {
                    case "chat.sticker": {
                        const id = content.id ?? content.stickerId ?? "?";
                        const cat = content.catId ?? content.packId ?? "?";
                        contentStr = `Sticker | id=${id}, cat=${cat}`;
                        break;
                    }
                    case "chat.photo": {
                        const url = content.href || content.thumb || content.url || "(no url)";
                        contentStr = `Photo | ${url}`;
                        break;
                    }
                    case "chat.video.msg": {
                        const url = content.href || content.url || "(no url)";
                        const params = content.params ? (()=>{ try { return JSON.parse(content.params); } catch { return {}; } })() : {};
                        const durMs = params.duration ?? params.dur ?? null;
                        const durSec = durMs != null ? Math.round(Number(durMs)/1000) : null;
                        contentStr = `Video | ${url}${durSec!=null?` | duration=${durSec}s`:''}`;
                        break;
                    }
                    case "chat.recommended": {
                        const title = content.title || "Card";
                        let descObj = null;
                        if (typeof content.description === "string") {
                            try { descObj = JSON.parse(content.description); } catch {}
                        }
                        const extra = descObj && descObj.qrCodeUrl ? ` | qr=${descObj.qrCodeUrl}` : "";
                        const thumb = content.thumb || "";
                        contentStr = `Card | ${title}${extra}${thumb?` | thumb=${thumb}`:""}`;
                        break;
                    }
                    case "share.file": {
                        const title = content.title || "File";
                        const href = content.href || content.url || "(no url)";
                        const params = content.params ? (()=>{ try { return JSON.parse(content.params); } catch { return {}; } })() : {};
                        const ext = params.fileExt || params.ext || "";
                        const size = params.fileSize || params.size || "";
                        contentStr = `File | ${title}${ext?`.${ext}`:""}${size?` | size=${size}`:""} | ${href}`;
                        break;
                    }
                    case "chat.ecard": {
                        const title = content.title || "ECard";
                        const desc = content.description || "";
                        const thumb = content.thumb || "";
                        contentStr = `ECard | ${title}${desc?` | ${desc}`:""}${thumb?` | thumb=${thumb}`:""}`;
                        break;
                    }
                    case "group.poll": {
                        const action = content.action || "";
                        const params = content.params ? (()=>{ try { return JSON.parse(content.params); } catch { return {}; } })() : {};
                        const question = params.question || "";
                        const pollId = params.pollId || params.id || "";
                        contentStr = `Poll | ${action}${question?` | question=${question}`:""}${pollId?` | id=${pollId}`:""}`;
                        break;
                    }
                    default: {
                        try { contentStr = JSON.stringify(content); } catch { contentStr = String(content); }
                    }
                }
            } else if (content == null) {
                contentStr = "";
            }
            
            let ts = data.ts || data.timestamp || data.time;
            if (typeof ts === "string" && /^\d+$/.test(ts)) ts = Number(ts);
            const timeStr = ts ? new Date(ts).toLocaleString("vi-VN") : new Date().toLocaleString("vi-VN");

            console.log(`User: ${displayName}`);
            console.log(`Type: ${msgType || "unknown"} | ${typeLabel}`);
            console.log(`Message: ${contentStr}`);
            console.log(`Time: ${timeStr}`);
            console.log("═══════════════════");

            let text = contentStr;
            
            if (text && !text.startsWith(prefix) && typeof data.content === 'string' && Array.isArray(data.mentions) && data.mentions.length) {
                try {
                    let cleaned = String(data.content);
                    const list = [...data.mentions].filter(m => Number.isInteger(m?.pos) && Number.isInteger(m?.len)).sort((a,b)=>b.pos-a.pos);
                    for (const m of list) {
                        const s = Math.max(0, m.pos);
                        const e = Math.min(cleaned.length, m.pos + m.len);
                        if (s < e) cleaned = cleaned.slice(0, s) + cleaned.slice(e);
                    }
                    cleaned = cleaned.replace(/^[\s,:;\-–—]+/, '').replace(/\s{2,}/g,' ').trim();
                    if (cleaned.startsWith(prefix)) text = cleaned;
                } catch {}
            }
            
            if (text.startsWith(prefix)) {
                await runCommand({ 
                    prefix, 
                    content: text, 
                    ctx: message, 
                    commands, 
                    api 
                });
            }
        } catch (e) {
            console.log(message);
            console.log("═══════════════════");
        }
    });
};