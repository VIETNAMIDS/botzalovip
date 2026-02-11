const axios = require('axios')
const cheerio = require('cheerio')

module.exports.config = {
  name: 'nct',
  aliases: [],
  version: '1.0.1',
  role: 0,
  author: 'Trae-IDE',
  description: 'Tìm bài hát trên NhacCuaTui (text màu, đơn giản)',
  category: 'Tiện ích',
  usage: 'nct <từ khóa>',
  cooldowns: 3,
  dependencies: { 'axios': '', 'cheerio': '' }
}

const COLORS = ['🟥','🟧','🟨','🟩','🟦','🟪']

async function searchMusic(keyword) {
  try {
    const encoded = encodeURIComponent(keyword)
    const url = `https://www.nhaccuatui.com/tim-kiem/bai-hat?q=${encoded}&b=keyword&l=tat-ca&s=default`
    const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, timeout: 10000 })
    const $ = cheerio.load(res.data)
    const items = []
    $('.sn_search_returns_list_song .sn_search_single_song').each((i, el) => {
      const songEl = $(el)
      const linkEl = songEl.find('a').first()
      const title = linkEl.attr('title')?.trim() || ''
      const href = linkEl.attr('href') || ''
      const artist = songEl.find('.name_singer').text().trim()
      items.push({ title, artist, href })
    })
    return items
  } catch (e) {
    return []
  }
}

function buildColoredList(items, keyword) {
  const bar = COLORS.join('')
  let msg = `${bar}\n🎵 KẾT QUẢ NCT: ${keyword}\n${bar}\n`
  items.slice(0, 10).forEach((it, idx) => {
    const color = COLORS[idx % COLORS.length]
    msg += `\n${color} ${(idx+1).toString().padStart(2,'0')}. ${it.title} — ${it.artist}\n🔗 ${it.href}`
  })
  msg += `\n\n${bar}`
  return msg
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event
  const keyword = (args || []).join(' ').trim()
  if (!keyword) return api.sendMessage('⚠️ Dùng: nct <từ khóa>', threadId, type)
  const items = await searchMusic(keyword)
  if (!items.length) return api.sendMessage('❌ Không tìm thấy bài hát phù hợp.', threadId, type)
  return api.sendMessage(buildColoredList(items, keyword), threadId, type)
}
