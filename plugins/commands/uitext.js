const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

module.exports.config = {
  name: "doiten",
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Đổi text UI cho phần chỉ prefix và sai lệnh",
  category: "Hệ thống",
  usage: "doiten show | doiten prefix <text> | doiten wrong <h1>|<h2>|<h3> | doiten brand <b1>|<b2>|<b3>",
  aliases: ["uitext"],
  cooldowns: 2
};

function normalizeText(s, maxLen = 80) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

function parseHeadings(raw) {
  const joined = String(raw ?? "").trim();
  if (!joined) return [];
  const parts = joined
    .split("|")
    .map((p) => normalizeText(p, 60))
    .filter(Boolean);
  return Array.from(new Set(parts));
}

function parseBrands(raw) {
  const joined = String(raw ?? "").trim();
  if (!joined) return [];
  const parts = joined
    .split("|")
    .map((p) => normalizeText(p, 40))
    .filter(Boolean);
  return Array.from(new Set(parts));
}

function getUiTextsFromConfig(config) {
  const root = config && typeof config === "object" ? config : {};
  const custom = root.command_ui_texts && typeof root.command_ui_texts === "object" ? root.command_ui_texts : {};
  const prefixOnlyTitle = typeof custom.prefix_only_title === "string" ? custom.prefix_only_title : "";
  const headings = Array.isArray(custom.unknown_command_headings) ? custom.unknown_command_headings : [];
  const brands = Array.isArray(custom.brand_variants) ? custom.brand_variants : [];
  return {
    prefix_only_title: normalizeText(prefixOnlyTitle, 80) || "BAN CHI GO PREFIX",
    brand_variants: brands.map(String).map((b) => normalizeText(b, 40)).filter(Boolean).length
      ? brands.map(String).map((b) => normalizeText(b, 40)).filter(Boolean)
      : ["BONZ VIP", "BONZ VIP BOT", "⚡ BONZ VIP COMMAND ⚡"],
    unknown_command_headings: headings.map(String).map((h) => normalizeText(h, 60)).filter(Boolean).length
      ? headings.map(String).map((h) => normalizeText(h, 60)).filter(Boolean)
      : ["LENH KHONG TON TAI", "KHONG TIM THAY LENH", "INVALID COMMAND"]
  };
}

function saveUiTextsToConfigFile(nextUiTexts) {
  const configPath = path.join(__dirname, "..", "..", "config.yml");
  const fileContent = fs.readFileSync(configPath, "utf8");
  const config = YAML.parse(fileContent) || {};

  if (!config.command_ui_texts || typeof config.command_ui_texts !== "object") {
    config.command_ui_texts = {};
  }

  if (typeof nextUiTexts.prefix_only_title === "string") {
    config.command_ui_texts.prefix_only_title = nextUiTexts.prefix_only_title;
  }
  if (Array.isArray(nextUiTexts.brand_variants)) {
    config.command_ui_texts.brand_variants = nextUiTexts.brand_variants;
  }
  if (Array.isArray(nextUiTexts.unknown_command_headings)) {
    config.command_ui_texts.unknown_command_headings = nextUiTexts.unknown_command_headings;
  }

  const updatedYaml = YAML.stringify(config);
  fs.writeFileSync(configPath, updatedYaml, "utf8");
  return config;
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;
  const sub = (args?.[0] || "").toString().toLowerCase();

  const send = async (msg, ttl = 30000) => {
    return api.sendMessage({ msg, ttl }, threadId, type);
  };

  const current = getUiTextsFromConfig(global.config);

  if (sub === "help") {
    const msg =
      `DOITEN - HUONG DAN\n` +
      `1) Xem cai dang dung:\n` +
      `- doiten show\n\n` +
      `2) Doi text chi go prefix:\n` +
      `- doiten prefix <text>\n\n` +
      `3) Doi tieu de sai lenh (cach nhau bang |):\n` +
      `- doiten wrong <h1>|<h2>|<h3>\n\n` +
      `4) Doi brand (dong o giua, cach nhau bang |):\n` +
      `- doiten brand <b1>|<b2>|<b3>\n\n` +
      `Ghi chu: tu dong luu vao config.yml.`;
    await send(msg, 60000);
    return;
  }

  if (!sub || sub === "show") {
    const msg =
      `UI TEXT HIEN TAI:\n` +
      `- PREFIX: ${current.prefix_only_title}\n` +
      `- BRAND: ${current.brand_variants.join(" | ")}\n` +
      `- SAI LENH: ${current.unknown_command_headings.join(" | ")}\n\n` +
      `Nhap: doiten help de xem huong dan.`;
    await send(msg, 45000);
    return;
  }

  if (sub === "prefix") {
    const text = normalizeText(args.slice(1).join(" "), 80);
    if (!text) {
      await send("⚠️ Thiếu text. Ví dụ: doiten prefix BAN CHI GO PREFIX", 20000);
      return;
    }

    const nextUiTexts = {
      ...current,
      prefix_only_title: text
    };

    const saved = saveUiTextsToConfigFile(nextUiTexts);
    global.config = saved;

    await send(`✅ Đã đổi text PREFIX thành: ${text}`, 30000);
    return;
  }

  if (sub === "wrong" || sub === "sailenh" || sub === "unknown") {
    const raw = args.slice(1).join(" ");
    const headings = parseHeadings(raw);
    if (!headings.length) {
      await send("⚠️ Thiếu headings. Ví dụ: doiten wrong SAI LENH ROI|LENH KHONG CO|NHAP LAI", 25000);
      return;
    }

    const nextUiTexts = {
      ...current,
      unknown_command_headings: headings
    };

    const saved = saveUiTextsToConfigFile(nextUiTexts);
    global.config = saved;

    await send(`✅ Đã đổi heading SAI LỆNH thành: ${headings.join(" | ")}`, 35000);
    return;
  }

  if (sub === "brand" || sub === "ten" || sub === "name") {
    const raw = args.slice(1).join(" ");
    const brands = parseBrands(raw);
    if (!brands.length) {
      await send("⚠️ Thiếu brand. Ví dụ: doiten brand TEN 1|TEN 2|TEN 3", 25000);
      return;
    }

    const nextUiTexts = {
      ...current,
      brand_variants: brands
    };

    const saved = saveUiTextsToConfigFile(nextUiTexts);
    global.config = saved;

    await send(`✅ Đã đổi BRAND thành: ${brands.join(" | ")}`, 35000);
    return;
  }

  await send("⚠️ Sai cú pháp. Dùng: doiten show | doiten prefix <text> | doiten wrong <h1>|<h2>|<h3> | doiten brand <b1>|<b2>|<b3>", 30000);
};
