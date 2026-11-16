// Growth system data: levels, the shop catalogue, and the daily quest pool.
// Server-side only (like words.js). The server sends `items` and `levels` to the tablets in "welcome".
'use strict';

// ---------- levels ----------
// A player's level comes from the stars they have EARNED in total (profile.stars). Spending never lowers it.
// LEVELS[i] = total stars needed to be level i + 1.   1:0  2:10  3:30  4:60  5:100  6:150 ...
const MAX_LEVEL = 30;
const LEVELS = [];
for (let l = 1; l <= MAX_LEVEL; l++) LEVELS.push(5 * l * (l - 1));
function levelOf(stars) {
  let lv = 1;
  while (lv < MAX_LEVEL && stars >= LEVELS[lv]) lv++;
  return lv;
}

// ---------- shop catalogue ----------
// id = kind.key.value, where kind is "outfit" (Dress-Up) or "car" (Car Garage), key is a field of the
// design object and value is the option index. Anything NOT listed here is free for everyone.
//   cost: price in stars      lv: level needed to buy      rare: 0 common, 1 rare, 2 epic, 3 legendary
//   chest: true -> cannot be bought, only found in the daily chest
// Names are shown in all three languages when the item is looked at.
const ITEMS = {
  // Dress-Up: on top
  'outfit.head.2': { cost: 30, lv: 3, rare: 1, en: 'Tiara', zh: '头冠', py: 'tóuguān', ms: 'tiara' },
  'outfit.head.1': { cost: 60, lv: 5, rare: 2, en: 'Crown', zh: '皇冠', py: 'huángguān', ms: 'mahkota' },
  'outfit.head.5': { chest: true, rare: 3, en: 'Rainbow crown', zh: '彩虹皇冠', py: 'cǎihóng huángguān', ms: 'mahkota pelangi' },
  // Dress-Up: dress
  'outfit.dress.5': { cost: 20, lv: 2, rare: 0, en: 'Ruffle dress', zh: '荷叶边裙', py: 'héyèbiān qún', ms: 'gaun beropol' },
  'outfit.dress.0': { cost: 40, lv: 4, rare: 1, en: 'Ball gown', zh: '舞会礼服', py: 'wǔhuì lǐfú', ms: 'gaun majlis' },
  'outfit.dress.2': { cost: 50, lv: 5, rare: 2, en: 'Fairy dress', zh: '仙女裙', py: 'xiānnǚ qún', ms: 'gaun pari-pari' },
  'outfit.dress.3': { cost: 80, lv: 7, rare: 2, en: 'Mermaid dress', zh: '美人鱼裙', py: 'měirényú qún', ms: 'gaun duyung' },
  // Dress-Up: wings or cape
  'outfit.back.2': { cost: 35, lv: 3, rare: 1, en: 'Cape', zh: '披风', py: 'pīfēng', ms: 'jubah' },
  'outfit.back.1': { cost: 70, lv: 6, rare: 2, en: 'Fairy wings', zh: '仙女翅膀', py: 'xiānnǚ chìbǎng', ms: 'sayap pari-pari' },
  'outfit.back.3': { chest: true, rare: 3, en: 'Butterfly wings', zh: '蝴蝶翅膀', py: 'húdié chìbǎng', ms: 'sayap rama-rama' },
  // Dress-Up: in hand
  'outfit.item.3': { cost: 25, lv: 2, rare: 1, en: 'Teddy', zh: '小熊', py: 'xiǎoxióng', ms: 'patung beruang' },
  'outfit.item.1': { cost: 45, lv: 4, rare: 1, en: 'Star wand', zh: '星星魔法棒', py: 'xīngxing mófǎbàng', ms: 'tongkat sakti bintang' },
  'outfit.item.4': { chest: true, rare: 3, en: 'Magic staff', zh: '魔法杖', py: 'mófǎzhàng', ms: 'tongkat ajaib' },
  // Dress-Up: the boy's side (T-shirt and shorts, hoodie and jeans, the cap, backpack and football are free)
  'outfit.dress.8': { cost: 20, lv: 2, rare: 0, en: 'Football kit', zh: '足球服', py: 'zúqiú fú', ms: 'jersi bola sepak' },
  'outfit.dress.11': { cost: 40, lv: 4, rare: 1, en: 'Astronaut suit', zh: '宇航服', py: 'yǔhángfú', ms: 'sut angkasawan' },
  'outfit.dress.9': { cost: 50, lv: 5, rare: 2, en: 'Superhero suit', zh: '超级英雄服', py: 'chāojí yīngxióng fú', ms: 'sut adiwira' },
  'outfit.dress.10': { cost: 80, lv: 7, rare: 2, en: 'Knight armour', zh: '骑士盔甲', py: 'qíshì kuījiǎ', ms: 'baju besi kesatria' },
  'outfit.head.8': { cost: 25, lv: 2, rare: 1, en: 'Headphones', zh: '耳机', py: 'ěrjī', ms: 'fon kepala' },
  'outfit.head.7': { cost: 35, lv: 3, rare: 1, en: 'Knight helmet', zh: '骑士头盔', py: 'qíshì tóukuī', ms: 'topi besi kesatria' },
  'outfit.back.5': { cost: 70, lv: 6, rare: 2, en: 'Jetpack', zh: '喷气背包', py: 'pēnqì bēibāo', ms: 'pek jet' },
  'outfit.item.7': { cost: 25, lv: 2, rare: 1, en: 'Toy robot', zh: '玩具机器人', py: 'wánjù jīqìrén', ms: 'robot mainan' },
  'outfit.item.6': { cost: 45, lv: 4, rare: 1, en: 'Sword', zh: '宝剑', py: 'bǎojiàn', ms: 'pedang' },

  // Car Garage: car body
  'car.body.3': { cost: 30, lv: 3, rare: 1, en: 'Buggy', zh: '越野车', py: 'yuèyěchē', ms: 'kereta bugi' },
  'car.body.0': { cost: 50, lv: 4, rare: 1, en: 'Racer', zh: '赛车', py: 'sàichē', ms: 'kereta lumba' },
  'car.body.2': { cost: 80, lv: 6, rare: 2, en: 'Monster truck', zh: '大脚车', py: 'dàjiǎochē', ms: 'trak raksasa' },
  'car.body.4': { cost: 120, lv: 8, rare: 3, en: 'Rocket car', zh: '火箭车', py: 'huǒjiànchē', ms: 'kereta roket' },
  // Car Garage: sticker
  'car.decal.4': { cost: 15, lv: 2, rare: 0, en: 'Star stickers', zh: '星星贴纸', py: 'xīngxing tiēzhǐ', ms: 'pelekat bintang' },
  'car.decal.5': { cost: 20, lv: 2, rare: 0, en: 'Check stickers', zh: '格子贴纸', py: 'gézi tiēzhǐ', ms: 'pelekat petak' },
  'car.decal.3': { cost: 30, lv: 3, rare: 1, en: 'Lightning stickers', zh: '闪电贴纸', py: 'shǎndiàn tiēzhǐ', ms: 'pelekat kilat' },
  'car.decal.2': { cost: 45, lv: 5, rare: 2, en: 'Flame stickers', zh: '火焰贴纸', py: 'huǒyàn tiēzhǐ', ms: 'pelekat api' },
  'car.decal.6': { chest: true, rare: 3, en: 'Rainbow stickers', zh: '彩虹贴纸', py: 'cǎihóng tiēzhǐ', ms: 'pelekat pelangi' },
  // Car Garage: wheels
  'car.wheel.1': { cost: 20, lv: 2, rare: 1, en: 'Star wheels', zh: '星星车轮', py: 'xīngxing chēlún', ms: 'roda bintang' },
  'car.wheel.3': { cost: 30, lv: 4, rare: 1, en: 'Big wheels', zh: '大车轮', py: 'dà chēlún', ms: 'roda besar' },
  'car.wheel.4': { cost: 50, lv: 6, rare: 2, en: 'Turbine wheels', zh: '涡轮车轮', py: 'wōlún chēlún', ms: 'roda turbin' },
  'car.wheel.5': { chest: true, rare: 3, en: 'Golden wheels', zh: '金车轮', py: 'jīn chēlún', ms: 'roda emas' },
  // Car Garage: spoiler and extras
  'car.spoiler.2': { cost: 35, lv: 4, rare: 1, en: 'Big wing', zh: '大尾翼', py: 'dà wěiyì', ms: 'sayap belakang besar' },
  'car.extra.2': { cost: 15, lv: 2, rare: 0, en: 'Flag', zh: '旗子', py: 'qízi', ms: 'bendera' },
  'car.extra.1': { cost: 40, lv: 4, rare: 1, en: 'Roof light', zh: '车顶灯', py: 'chēdǐng dēng', ms: 'lampu bumbung' },
  'car.extra.3': { cost: 90, lv: 7, rare: 2, en: 'Rocket booster', zh: '火箭推进器', py: 'huǒjiàn tuījìnqì', ms: 'penggalak roket' },
  'car.extra.4': { chest: true, rare: 3, en: 'Rainbow trail', zh: '彩虹尾巴', py: 'cǎihóng wěiba', ms: 'jejak pelangi' }
};

// What a design falls back to when it uses something the player does not own.
// An outfit with body 1 (the boy) falls back to the boy's free things, so he is never put into a dress.
const FREE = {
  outfit: { head: 3, dress: 1, back: 0, item: 2 },
  outfitBoy: { head: 0, dress: 6, back: 0, item: 5 },
  car: { body: 1, decal: 1, wheel: 0, spoiler: 1, extra: 0 }
};

// ---------- daily quests ----------
// Every player gets 3 of these each day. `tiers` are [how many, reward in stars]; one tier is picked at random.
// `solo: true` means it can be finished alone; at least 2 of the 3 daily quests are solo ones.
// {n} in the texts is replaced by the number. Game modules in games/ add their own with api.addQuest().
const QUESTS = [
  { type: 'stars', icon: '⭐', solo: true, tiers: [[8, 5], [12, 7], [16, 9]],
    en: 'Collect {n} stars', zh: '收集 {n} 颗星星', py: 'shōují {n} kē xīngxing', ms: 'Kumpul {n} bintang' },
  { type: 'drive', icon: '🚗', solo: true, tiers: [[5, 5], [8, 7]],
    en: 'Collect {n} stars by car', zh: '开车收集 {n} 颗星星', py: 'kāichē shōují {n} kē xīngxing', ms: 'Kumpul {n} bintang dengan kereta' },
  { type: 'gallery', icon: '🖼️', solo: true, tiers: [[1, 5]],
    en: 'Hang {n} picture in the Gallery', zh: '在画廊挂 {n} 幅画', py: 'zài huàláng guà {n} fú huà', ms: 'Gantung {n} lukisan di galeri' },
  { type: 'dress', icon: '👗', solo: true, tiers: [[1, 3]],
    en: 'Try a new outfit', zh: '换一套新衣服', py: 'huàn yí tào xīn yīfu', ms: 'Cuba pakaian baharu' },
  { type: 'guess', icon: '🤔', solo: false, tiers: [[2, 6], [3, 8]],
    en: 'Guess {n} drawings', zh: '猜对 {n} 幅画', py: 'cāi duì {n} fú huà', ms: 'Teka {n} lukisan' },
  { type: 'draw', icon: '✏️', solo: false, tiers: [[1, 6], [2, 8]],
    en: 'Draw {n} words for others to guess', zh: '画 {n} 个词让别人猜', py: 'huà {n} gè cí ràng biérén cāi', ms: 'Lukis {n} perkataan untuk diteka' },
  { type: 'tag', icon: '🏃', solo: false, tiers: [[1, 6]],
    en: 'Win {n} game of tag', zh: '赢 {n} 次捉人游戏', py: 'yíng {n} cì zhuō rén yóuxì', ms: 'Menang {n} kali main kejar-kejar' },
  { type: 'emote', icon: '👋', solo: false, tiers: [[2, 3]],
    en: 'Wave to a friend {n} times', zh: '向朋友打招呼 {n} 次', py: 'xiàng péngyou dǎ zhāohu {n} cì', ms: 'Lambai kawan {n} kali' }
];

module.exports = { MAX_LEVEL: MAX_LEVEL, LEVELS: LEVELS, levelOf: levelOf, ITEMS: ITEMS, FREE: FREE, QUESTS: QUESTS };
