// Writes the showcase lessons into the installed app's lesson folder (%APPDATA%\app.unfold.desktop\lessons).
// Each one is checked with the same checks the sidecar runs. Usage: bun showcase/lessons/make.ts
import fs from 'fs';
import path from 'path';
import { problems } from '../../app/sidecar/check.ts';
import type { Lesson, LessonRecord } from '../../app/src/lesson.ts';

const L = (o: Lesson & { question: string }) => o;
const lessons = [
  L({
    question: '台灣的產業結構這幾十年怎麼變的？', title: '產業結構：從農業到服務業', subject: 'civics', crumbs: ['公民與社會', '經濟'],
    task: '看每個年代三根長條的高低怎麼換位。',
    suggestions: ['加工出口區是什麼？', '為什麼服務業會變最大？'],
    widget: { kind: 'chart', chart: { type: 'bar', title: '台灣各產業占 GDP 比例（約）', unit: '%', labels: ['1952', '1970', '1990', '2020'], series: [{ id: 'agri', name: '農業', values: [32, 15, 4, 1.6] }, { id: 'ind', name: '工業', values: [20, 37, 38, 36] }, { id: 'svc', name: '服務業', values: [48, 48, 58, 62] }], marks: [{ id: 'm1', label: '1970', series: 'ind', text: '加工出口區帶動**工業**' }, { id: 'm2', label: '2020', series: 'svc', text: '超過六成是**服務業**' }] } },
    steps: [
      { text: '圖上是台灣經濟裡三種產業各占多少。先看 **1952 年**：農業占了將近三分之一。', focus: ['1952'] },
      { text: '接下來二十年，農業的比例一路往下掉，**變化最大的是農業**。', focus: ['agri'] },
      { text: '1970 年前後，政府設加工出口區，工廠大量出現，**工業比例衝到最高**。', reveal: ['m1'], focus: ['ind', 'm1'] },
      { text: '之後所得提高，金融、零售、醫療、資訊服務需求變多，**服務業成為最大宗**。', reveal: ['m2'], focus: ['svc', 'm2'] },
      { text: '這就是常說的**產業結構轉型**：農業 → 工業 → 服務業，很多已開發國家都走過這條路。' },
    ],
  }),
  L({
    question: '油價上漲為什麼會讓東西都變貴？', title: '油價與通貨膨脹', subject: 'civics', crumbs: ['公民與社會', '經濟'],
    task: '順著箭頭走一遍，再看那條虛線為什麼往回指。',
    suggestions: ['升息為什麼能壓低物價？', '什麼是停滯性通膨？'],
    widget: { kind: 'diagram', diagram: { layout: 'flow', nodes: [{ id: 'a', label: '油價上漲', icon: 'fuel' }, { id: 'b', label: '運輸成本增加', icon: 'truck' }, { id: 'c', label: '物價上漲', text: '通貨膨脹', icon: 'shopping-cart' }, { id: 'd', label: '央行升息', icon: 'landmark' }, { id: 'e', label: '消費減少', icon: 'trending-down' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', label: '轉嫁' }, { from: 'c', to: 'd' }, { from: 'd', to: 'e' }, { from: 'e', to: 'c', label: '壓低', dashed: true }] } },
    steps: [
      { text: '幾乎所有商品都要靠卡車、船運送，而它們都**燒油**。', focus: ['a'] },
      { text: '油價一漲，**運輸成本**跟著漲。', reveal: ['b', 'a>b'], focus: ['b', 'a>b'] },
      { text: '商家不想自己吸收，就把成本**轉嫁**到售價上，到處的東西都變貴，這就是通貨膨脹。', reveal: ['c', 'b>c'], focus: ['c', 'b>c'] },
      { text: '物價漲太快時，央行會**升息**：借錢變貴、存錢變划算。', reveal: ['d', 'c>d'], focus: ['d'] },
      { text: '大家少花錢，需求下降，物價上漲的壓力就被**往回壓**。', reveal: ['e', 'd>e', 'e>c'], focus: ['e', 'e>c'] },
    ],
  }),
  L({
    question: '水循環是怎麼運作的？', title: '水循環', subject: 'earth', crumbs: ['地球科學', '水圈'],
    task: '跟著箭頭繞一圈，想想太陽在哪一步出力。',
    suggestions: ['為什麼海水是鹹的但雨是淡的？', '地下水算在哪一步？'],
    widget: { kind: 'diagram', diagram: { layout: 'cycle', nodes: [{ id: 'ev', label: '蒸發', text: '太陽加熱', icon: 'sun' }, { id: 'co', label: '凝結', text: '形成雲', icon: 'cloud' }, { id: 'pr', label: '降水', text: '雨、雪', icon: 'cloud-rain' }, { id: 'ru', label: '逕流', text: '流回海洋', icon: 'waves' }], edges: [{ from: 'ev', to: 'co' }, { from: 'co', to: 'pr' }, { from: 'pr', to: 'ru' }, { from: 'ru', to: 'ev' }] } },
    steps: [
      { text: '太陽把海洋和湖泊的水加熱，水變成水氣升上天空，這是**蒸發**。', focus: ['ev'] },
      { text: '高空比較冷，水氣遇冷**凝結**成小水滴，聚在一起就是雲。', focus: ['co', 'ev>co'] },
      { text: '小水滴越聚越大，重到飄不住就**降水**：下雨或下雪。', focus: ['pr', 'co>pr'] },
      { text: '落到地面的水沿著河流**流回海洋**，也有一部分滲入地下。', focus: ['ru', 'pr>ru'] },
      { text: '然後又被太陽蒸發，**一直循環下去**，推動它的能量來自太陽。', focus: ['ru>ev', 'ev'] },
    ],
  }),
  L({
    question: '清朝對台灣的治理態度怎麼轉變的？', title: '清領時期：從消極到積極', subject: 'history', crumbs: ['歷史', '台灣史'],
    task: '比較兩段時期的長度，和轉折點那一年發生了什麼。',
    suggestions: ['為什麼清朝一開始不想管台灣？', '沈葆楨做了哪些事？'],
    widget: { kind: 'timeline', timeline: { title: '清領時期的台灣', events: [{ id: 'e1', when: '1683', at: 1683, title: '施琅攻台', icon: 'ship' }, { id: 'e2', when: '1721', at: 1721, title: '朱一貴事件', text: '民變頻繁' }, { id: 'e3', when: '1786', at: 1786, title: '林爽文事件' }, { id: 'e4', when: '1874', at: 1874, title: '牡丹社事件', text: '日本出兵台灣', icon: 'flag' }, { id: 'e5', when: '1885', at: 1885, title: '台灣建省' }, { id: 'e6', when: '1895', at: 1895, title: '馬關條約', icon: 'scroll' }], spans: [{ id: 's1', from: 'e1', to: 'e4', label: '消極治台' }, { id: 's2', from: 'e4', to: 'e6', label: '積極治台' }] } },
    steps: [
      { text: '1683 年清朝打下台灣。朝廷原本覺得這裡是**海外孤島**，甚至考慮放棄。', focus: ['e1'] },
      { text: '之後近兩百年，清朝怕台灣成為反抗基地，**限制移民、防範多於建設**，民變也不斷。', reveal: ['s1'], focus: ['s1', 'e2', 'e3'] },
      { text: '1874 年牡丹社事件，日本出兵台灣，清廷這才發現**台灣的戰略價值**。', focus: ['e4'] },
      { text: '此後改為積極治台：開山撫番、**1885 年建省**，劉銘傳推動鐵路和電報。', reveal: ['s2'], focus: ['s2', 'e5'] },
      { text: '但積極經營只維持了約二十年，1895 年**馬關條約**把台灣割讓給日本。', focus: ['e6'] },
    ],
  }),
  L({
    question: '總統制和內閣制差在哪？', title: '總統制與內閣制', subject: 'civics', crumbs: ['公民與社會', '政治'],
    task: '一列一列比對，找出兩種制度最根本的差別。',
    suggestions: ['台灣是哪一種？', '雙首長制是什麼？'],
    widget: { kind: 'compare', compare: { columns: [{ id: 'pres', title: '總統制', icon: 'user' }, { id: 'parl', title: '內閣制', icon: 'users' }], rows: [{ id: 'r1', label: '行政首長', cells: ['總統', '總理（首相）'] }, { id: 'r2', label: '怎麼產生', cells: ['人民直選', '國會多數黨領袖'] }, { id: 'r3', label: '權力關係', cells: ['行政與立法**分立**', '行政對立法**負責**'] }, { id: 'r4', label: '代表國家', cells: ['美國', '英國、日本'] }] } },
    steps: [
      { text: '兩種制度都要回答同一件事：**誰來領導政府**。', reveal: ['r1'], focus: ['r1'] },
      { text: '總統制的總統由人民選；內閣制的首相則是**國會裡的多數黨領袖**。', reveal: ['r2'], focus: ['r2'] },
      { text: '最根本的差別在這一列：總統制裡行政和立法**互相制衡**；內閣制裡內閣要對國會負責，國會可以倒閣。', reveal: ['r3'], focus: ['r3'] },
      { text: '美國是總統制的代表，英國、日本是內閣制。**沒有哪一種一定比較好**，各有優缺點。', reveal: ['r4'], focus: ['r4'] },
    ],
  }),
  L({
    question: '工業革命為什麼先在英國發生？', title: '工業革命的條件', subject: 'history', crumbs: ['歷史', '世界史'],
    task: '想想少了其中一個條件，工業革命還會發生嗎？',
    suggestions: ['蒸汽機是怎麼運作的？', '圈地運動是什麼？'],
    widget: { kind: 'points', points: { center: '工業革命為什麼先在英國發生？', items: [{ id: 'p1', icon: 'pickaxe', title: '煤鐵豐富', text: '蒸汽機的燃料與材料就在身邊' }, { id: 'p2', icon: 'coins', title: '資本充足', text: '海外貿易累積了大量財富' }, { id: 'p3', icon: 'users', title: '勞力充沛', text: '圈地運動讓農民湧入城市' }, { id: 'p4', icon: 'ship', title: '廣大市場', text: '殖民地提供原料，也購買商品' }] } },
    steps: [
      { text: '機器要動，需要燃料和材料。英國地下有大量**煤和鐵礦**。', reveal: ['p1'], focus: ['p1'] },
      { text: '蓋工廠要錢。英國靠海外貿易累積了**資本**，願意投資新技術。', reveal: ['p2'], focus: ['p2'] },
      { text: '工廠需要工人。圈地運動讓失去土地的農民**湧進城市**找工作。', reveal: ['p3'], focus: ['p3'] },
      { text: '東西做出來要賣得掉。龐大的殖民地既是原料來源，也是**市場**。', reveal: ['p4'], focus: ['p4'] },
      { text: '四個條件**同時具備**，英國才成為第一個工業化的國家。' },
    ],
  }),
  L({
    question: '「學而時習之，不亦說乎」是什麼意思？', title: '《論語・學而》首章', subject: 'language', crumbs: ['國文', '論語'],
    task: '注意被標起來的字，它們和現在的意思不一樣。',
    suggestions: ['「君子」在論語裡是什麼意思？', '這一章的三句話有什麼關係？'],
    widget: { kind: 'passage', passage: { text: '子曰：「[[a|學而時習之]]，不亦[[b|說]]乎？有[[f|朋]]自遠方來，不亦樂乎？人不知而[[c|不慍]]，不亦[[d|君子]]乎？」', source: '《論語・學而》', notes: [{ id: 'a', text: '學了之後，在適當的時候溫習、實踐它。' }, { id: 'b', text: '通「悅」，內心的喜悅。' }, { id: 'f', text: '志同道合的人。' }, { id: 'c', text: '慍：生氣、怨恨。別人不了解自己也不生氣。' }, { id: 'd', text: '品德修養高尚的人。' }] } },
    steps: [
      { text: '第一句講學習：學了之後**時常溫習、實踐**。', focus: ['a'] },
      { text: '這裡的「說」不是說話，而是通「悅」，**內心的喜悅**。', focus: ['b'] },
      { text: '有**志同道合的朋友**從遠方來一起切磋，是更外放的快樂。', focus: ['f'] },
      { text: '最後一句最難：別人不了解我，我也**不生氣**。', focus: ['c'] },
      { text: '能做到這樣，就是孔子心中的**君子**。三句從自己、朋友到旁人，一層一層往外。', focus: ['d'] },
    ],
  }),
  L({
    question: '台灣的生育率到底有多低？', title: '少子化：生育率的下降', subject: 'civics', crumbs: ['公民與社會', '人口'],
    task: '找出曲線掉得最快的那一段。',
    suggestions: ['生育率低會造成什麼問題？', '人口替代水準是多少？'],
    widget: { kind: 'chart', chart: { type: 'line', title: '台灣總生育率（約）', labels: ['1960', '1980', '2000', '2010', '2023'], series: [{ id: 'tfr', name: '總生育率', values: [5.75, 2.52, 1.68, 0.9, 0.87] }], marks: [{ id: 'm', label: '2010', text: '跌破 1，**全球最低**之一' }] } },
    steps: [
      { text: '總生育率是**一位女性一生平均生幾個孩子**。1960 年接近 6 個。', focus: ['1960'] },
      { text: '到 1980 年已經掉到 2.5 左右，**下降得最快**。', focus: ['1980'] },
      { text: '要維持人口不減少，大約需要 2.1，台灣在 1980 年代就**跌破這條線**。', focus: ['2000'] },
      { text: '2010 年只剩約 0.9，**全球最低之一**。', reveal: ['m'], focus: ['m', '2010'] },
    ],
  }),
  L({
    question: '生物是怎麼分類的？', title: '生物分類：有沒有細胞核', subject: 'biology', crumbs: ['生物', '生物多樣性'],
    task: '從最上面往下讀，每一層都是一次分類。',
    suggestions: ['病毒算生物嗎？', '真菌為什麼不是植物？'],
    widget: { kind: 'diagram', diagram: { layout: 'tree', nodes: [{ id: 'r', label: '生物', icon: 'leaf' }, { id: 'a', label: '原核生物', text: '無細胞核' }, { id: 'b', label: '真核生物', text: '有細胞核' }, { id: 'c', label: '細菌', icon: 'bug' }, { id: 'd', label: '動物', icon: 'rabbit' }, { id: 'e', label: '植物', icon: 'sprout' }, { id: 'f', label: '真菌', icon: 'flower' }], edges: [{ from: 'r', to: 'a' }, { from: 'r', to: 'b' }, { from: 'a', to: 'c' }, { from: 'b', to: 'd' }, { from: 'b', to: 'e' }, { from: 'b', to: 'f' }] } },
    steps: [
      { text: '分類生物時，第一刀切在細胞**有沒有細胞核**。', reveal: ['a', 'b', 'r>a', 'r>b'], focus: ['r'] },
      { text: '沒有細胞核的是**原核生物**，例如細菌。', reveal: ['c', 'a>c'], focus: ['a', 'c'] },
      { text: '有細胞核的是**真核生物**。', focus: ['b'] },
      { text: '真核生物再依取得養分的方式分：動物**吃別的生物**，植物**自己行光合作用**，真菌**分解吸收**。', reveal: ['d', 'e', 'f', 'b>d', 'b>e', 'b>f'], focus: ['d', 'e', 'f'] },
    ],
  }),
];

const dir = path.join(process.env.APPDATA!, 'app.unfold.desktop', 'lessons');
fs.mkdirSync(dir, { recursive: true });
let t = Date.now();
for (const { question, ...lesson } of lessons) {
  const bad = problems(lesson.widget, lesson.steps);
  if (bad.length) throw new Error(`${lesson.title}: ${bad.join('; ')}`);
  const id = (t++).toString(16);
  const rec: LessonRecord = { id, question, status: 'ready', createdAt: t, step: 0, lesson, model: 'showcase' };
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(rec, null, 2));
  console.log(id, lesson.title);
}
