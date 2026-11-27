// Backend access. Inside Tauri this calls the Rust commands; in a plain browser (design review,
// screenshots) it falls back to an in-memory store seeded with recorded lessons.
import type { Answer, Draft, Lesson, LessonEvent, LessonMeta, LessonRecord, Part } from './lesson';
import type { Gen } from './settings';
import { chaptersOf, courseWritten, itemsOf } from './chapters';
import bubble from '../fixtures/bubble.json';
import deriv from '../fixtures/deriv.json';
import pyth from '../fixtures/pyth.json';
import { playableSteps } from '../sidecar/check';

/** A reference folder as the UI shows it. */
export interface Ref { path: string; name: string }

export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export const isMacApp = inTauri && typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent);

export interface Api {
  listLessons(): Promise<LessonMeta[]>;
  getLesson(id: string): Promise<LessonRecord>;
  setProgress(id: string, step: number): Promise<void>;
  /** askFirst: the learner wants Claude to ask before teaching; refs: folders Claude may read for it */
  startLesson(question: string, gen?: Gen, askFirst?: boolean, refs?: string[]): Promise<string>;
  /** the system folder picker; empty when the learner cancels */
  pickFolders(): Promise<string[]>;
  /** checks a folder (one dropped on the window, say) and names it */
  inspectRef(path: string): Promise<Ref>;
  /** paths dropped on the window; the callback sees each drag's phase */
  onDrop(cb: (e: { phase: 'over' | 'drop' | 'leave'; paths: string[] }) => void): () => void;
  /** answers to the questions Claude asked; an empty list skips them */
  answerLesson(id: string, answers: Answer[], gen: Gen | undefined): Promise<void>;
  /** writes the rest of a course after a chapter failed or was stopped */
  continueCourse(id: string, gen: Gen | undefined): Promise<void>;
  /** a follow-up asked while reading `chapter` (0-based) */
  continueLesson(id: string, question: string, gen: Gen | undefined, chapter: number): Promise<void>;
  renameChapter(id: string, chapter: number, name: string): Promise<void>;
  deleteLesson(id: string): Promise<void>;
  cancelLesson(id: string): Promise<void>;
  claudeStatus(): Promise<string>;
  appVersion(): Promise<string>;
  /** a newer release, if one is published; install() downloads it, installs it and restarts */
  checkUpdate(): Promise<{ version: string; install: () => Promise<void> } | null>;
  openLink(url: string): Promise<void>;
  onLessonEvent(cb: (e: LessonEvent) => void): () => void;
}

function tauriApi(): Api {
  const core = import('@tauri-apps/api/core');
  const event = import('@tauri-apps/api/event');
  const call = async <T,>(cmd: string, args?: Record<string, unknown>) => (await core).invoke<T>(cmd, args);
  return {
    listLessons: () => call('list_lessons'),
    getLesson: (id) => call('get_lesson', { id }),
    setProgress: (id, step) => call('set_progress', { id, step }),
    startLesson: (question, gen, askFirst, refs) => call('start_lesson', { question, model: gen?.model, effort: gen?.effort, askFirst, refs }),
    async pickFolders() {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const r = await open({ directory: true, multiple: true, title: '選擇要參考的資料夾' });
      return r == null ? [] : Array.isArray(r) ? r : [r];
    },
    inspectRef: (path) => call('inspect_ref', { path }),
    onDrop(cb) {
      let off: (() => void) | undefined;
      let dead = false;
      import('@tauri-apps/api/webview').then((m) => m.getCurrentWebview().onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === 'drop') cb({ phase: 'drop', paths: p.paths });
        else if (p.type === 'leave') cb({ phase: 'leave', paths: [] });
        else cb({ phase: 'over', paths: p.type === 'enter' ? p.paths : [] });
      })).then((u) => (dead ? u() : (off = u)));
      return () => { dead = true; off?.(); };
    },
    answerLesson: (id, answers, gen) => call('answer_lesson', { id, answers, model: gen?.model, effort: gen?.effort }),
    continueCourse: (id, gen) => call('continue_course', { id, model: gen?.model, effort: gen?.effort }),
    continueLesson: (id, question, gen, chapter) => call('continue_lesson', { id, question, model: gen?.model, effort: gen?.effort, chapter }),
    renameChapter: (id, chapter, name) => call('rename_chapter', { id, chapter, name }),
    deleteLesson: (id) => call('delete_lesson', { id }),
    cancelLesson: (id) => call('cancel_lesson', { id }),
    claudeStatus: () => call('claude_status'),
    appVersion: async () => (await import('@tauri-apps/api/app')).getVersion(),
    async checkUpdate() {
      if (isMacApp) return null;
      const { check } = await import('@tauri-apps/plugin-updater');
      const u = await check();
      if (!u) return null;
      return {
        version: u.version,
        async install() {
          await u.downloadAndInstall();
          const { relaunch } = await import('@tauri-apps/plugin-process');
          await relaunch();
        },
      };
    },
    openLink: (url) => call('open_link', { url }),
    onLessonEvent(cb) {
      let off: (() => void) | undefined;
      let dead = false;
      event.then((m) => m.listen<LessonEvent>('lesson-event', (e) => cb(e.payload))).then((u) => (dead ? u() : (off = u)));
      return () => { dead = true; off?.(); };
    },
  };
}

/** Browser preview only: the questions a broad question gets before the lesson. */
const PREVIEW_ASK = {
  text: '開始之前想先確認兩件事，讓這堂課剛好是你要的。',
  questions: [
    { id: 'scope', text: '你想學到多完整？', options: ['只要弄懂一個重點', '一整課，分幾章從頭教'] },
    { id: 'how', text: '怎麼呈現比較好懂？', options: ['看它動起來', '跟著例題一步步算', '整理比較表'], multi: true },
    { id: 'level', text: '你現在的程度？', options: ['第一次學', '學過但不太懂', '準備考試'] },
  ],
};

/** Browser preview only: a made-up cost so the cost line has something to show. */
/** A lesson saved before scenes existed, rewritten the way Claude now writes one: its visual opens on the first step. */
const withScenes = (L: Lesson): Lesson => {
  if (!L.widget || L.steps[0]?.scene) return L;
  const { widget, task, ...rest } = L;
  return { ...rest, steps: L.steps.map((st, k) => (k === 0 ? { ...st, scene: widget, task } : st)) };
};

/** What the sidecar streams once `n` of a chapter's steps have begun: the playable ones whole, the rest as text. */
function draftOf(L: Lesson, n: number): Draft {
  const steps = L.steps.slice(0, n);
  const ready = playableSteps(steps, n === L.steps.length);
  return {
    mode: 'chapter', title: L.title, subject: L.subject, crumbs: L.crumbs,
    steps: steps.map((st, k) => (k < ready ? st : { text: st.text })), ...(ready ? { ready } : {}),
  };
}

/** Two scenes and a board on every calculation: the derivative on a plot, then a summary of three views of it. */
function previewScenes(): Lesson {
  const L = withScenes(deriv.lesson as unknown as Lesson);
  const boards = [
    undefined,
    { lines: ['高度變化 = 3² − 1² = 9 − 1 = 8', '割線斜率 = 8 ÷ 2 = **4**'] },
    { lines: ['高度變化 = 2² − 1² = 4 − 1 = 3', '割線斜率 = 3 ÷ 1 = **3**'] },
    { values: [{ label: '間距 h', value: '0.001' }, { label: '割線斜率', value: '2.001' }] },
    { lines: ['[f(p+h) − f(p)] ÷ h = (2ph + h²) ÷ h', '= 2p + h', 'h → 0 ⇒ f′(p) = 2p', 'f′(1) = 2 × 1 = **2**'] },
    { lines: ['f′(x) = 2x', 'f′(2) = 2 × 2 = **4**'] },
  ];
  const steps = L.steps.map((st, k) => (boards[k] ? { ...st, board: boards[k] } : st));
  steps.push(
    {
      text: '換個角度整理：同一個導數，可以用**三種方式**來看。',
      task: '對照三張卡，把每一張連回前面看到的畫面。',
      scene: { kind: 'points', points: { center: '導數是什麼？', items: [
        { id: 'geo', title: '幾何', text: '曲線在那一點的切線斜率' },
        { id: 'lim', title: '極限', text: '割線斜率在 h → 0 時逼近的值' },
        { id: 'rate', title: '變化率', text: '那一瞬間變化得多快，例如瞬時速度' },
      ] } },
      reveal: ['geo'], focus: ['geo'],
    },
    { text: '割線斜率逼近的值，就是切線的斜率：**極限是算法，切線是它在圖上的樣子**。', reveal: ['lim'], focus: ['lim'] },
    { text: '而切線斜率說的，正是那一瞬間的變化快慢，所以**位置對時間的導數就是瞬時速度**。', reveal: ['rate'], focus: ['rate'] },
  );
  return { ...L, steps };
}
const PREVIEW_SCENES = previewScenes();

const PREVIEW_COST = { usd: 0.0214, input: 3, output: 2870, cacheRead: 11200, cacheWrite: 4100 };

/** Preview-only lessons demonstrating the code walkthrough and interactive quiz kit visuals. */
const PREVIEW_CODE: Lesson = {
  title: '二分搜尋：每次砍掉一半',
  subject: 'algorithm',
  crumbs: ['演算法', '搜尋'],
  task: '觀察每一輪 `lo`、`hi` 與 `mid` 如何夾逼目標值 `13`，也可以點擊右側狀態列對照。',
  suggestions: ['為什麼條件是 lo <= hi 而不是 lo < hi？', '如果陣列沒排好順序會發生什麼？', '出幾題小測驗考考我'],
  steps: [
    { text: '要在已排序陣列 `[2, 5, 8, 13, 21, 34]` 中找 `13`，我們先設左右界 `lo = 0`、`hi = 5`。', focus: ['s0'] },
    { text: '算出中間索引 `mid = 2`，讀到 `arr[2] = 8`。因為 **8 比目標 13 小**，左半邊全部不可能。', focus: ['s1'] },
    { text: '把左界一口氣推到 `lo = mid + 1 = 3`，直接**丟掉前半段三個元素**。', focus: ['s2'] },
    { text: '新一輪 `mid = 4`，讀到 `arr[4] = 21`。這次比 13 大，所以把右界拉回 `hi = 3`。', focus: ['s3'] },
    { text: '最後只剩 `lo = hi = 3`，`arr[3]` 剛好是 `13`，**只比較 3 次就找到答案**，複雜度是 `O(log n)`。', focus: ['s4'] },
  ],
  widget: {
    kind: 'code',
    code: {
      title: 'binary_search.py',
      language: 'python',
      lines: [
        'def binary_search(arr, target):',
        '    lo, hi = 0, len(arr) - 1',
        '    while lo <= hi:',
        '        mid = (lo + hi) // 2',
        '        if arr[mid] == target:',
        '            return mid',
        '        elif arr[mid] < target:',
        '            lo = mid + 1',
        '        else:',
        '            hi = mid - 1',
        '    return -1',
      ],
      states: [
        { id: 's0', lines: [2], vars: { arr: '[2, 5, 8, 13, 21, 34]', target: '13', lo: '0', hi: '5' }, note: '搜尋區間涵蓋整個陣列 [0..5]' },
        { id: 's1', lines: [4, 7], vars: { lo: '0', hi: '5', mid: '2', 'arr[mid]': '8' }, note: '8 < 13，目標一定在右半邊' },
        { id: 's2', lines: [8], vars: { lo: '3', hi: '5', mid: '2', 'arr[mid]': '8' }, note: '排除索引 0、1、2' },
        { id: 's3', lines: [4, 9, 10], vars: { lo: '3', hi: '3', mid: '4', 'arr[mid]': '21' }, note: '21 > 13，將右界縮到 mid - 1' },
        { id: 's4', lines: [4, 5, 6], vars: { lo: '3', hi: '3', mid: '3', 'arr[mid]': '13' }, output: 'return 3', note: '命中目標，結束搜尋' },
      ],
    },
  },
};

const PREVIEW_QUIZ: Lesson = {
  title: '隨堂檢核：導數與斜率觀念',
  subject: 'math',
  crumbs: ['數學', '微積分'],
  task: '直接點選選項作答並送出，確認自己真的抓到核心觀念。',
  suggestions: ['幫我用圖形再看一次切線斜率', '導數為零一定是極值嗎？'],
  steps: [
    { text: '先試第一題：確認你分得清楚**平均變化率**與**瞬時變化率**的差別。', focus: ['q1'] },
    { text: '第二題換個角度：當某一點的導數等於 `0` 時，幾何上代表什麼？', focus: ['q2'] },
  ],
  widget: {
    kind: 'quiz',
    quiz: {
      title: '導數核心觀念檢核',
      questions: [
        {
          id: 'q1',
          prompt: '當我們把割線兩點的水平間距 h 一步步縮小趨近 0，割線斜率逼近的是什麼？',
          options: ['該點切線的斜率（瞬時變化率）', '函數在整個區間的平均值', '曲線下的面積大小', '函數在這一點的 y 座標'],
          answer: [0],
          hint: '回想割線從兩點慢慢收斂成只碰觸曲線一點的直線。',
          explanation: '割線斜率是區間平均變化率；當 h → 0，割線收斂為切線，其斜率即為該點的導數（瞬時變化率）。',
        },
        {
          id: 'q2',
          prompt: '若可微函數在 x = a 處滿足 f′(a) = 0，下列哪些敘述一定正確？（複選）',
          options: ['曲線在 x = a 處的切線是水平的', '函數在 x = a 處的瞬時變化率為 0', 'x = a 一定是最大值或最小值', 'f(a) 的數值一定等於 0'],
          answer: [0, 1],
          hint: '想想 y = x³ 在 x = 0 的切線，它是平的，但沒有折返。',
          explanation: 'f′(a) = 0 代表水平切線與零瞬時變化率，但不保證是極值（例如 x³ 在 0 點是反曲點），也不代表函數值 f(a) 為 0。',
        },
      ],
    },
  },
};

/** Preview-only: how a project lesson with a reference folder reads, drawn as an architecture. */
const PREVIEW_ARCH: Lesson = {
  title: 'Unfold 的架構：一個問題怎麼變成一堂課',
  subject: 'software',
  crumbs: ['軟體', '專案架構'],
  task: '把滑鼠移到元件上看它連到誰；跟著亮起的箭頭走一次資料流。',
  suggestions: ['sidecar 為什麼要分成獨立的程式？', '追問時怎麼接著同一個 session？', '畫出回答出錯時的流程'],
  sources: ['README.md', 'src/views/Home.tsx', 'src-tauri/src/lib.rs', 'sidecar/agent.ts', 'src/kit/runtime.js'],
  steps: [
    { text: '學生在 `src/views/Home.tsx` 打下問題。**介面只負責顯示**，自己不碰 Claude。', focus: ['learner', 'home', 'learner>home'] },
    { text: '介面用 Tauri 的 `invoke` 呼叫 `src-tauri/src/lib.rs` 的 `start_lesson`，它先**把這一課存成 JSON**。', reveal: ['core'], focus: ['home>lib', 'lib', 'lib>store', 'store'] },
    { text: '`lib.rs` 接著啟動 sidecar `sidecar/agent.ts`，把問題當成**一行 JSON 從 stdin 送進去**。', reveal: ['agent'], focus: ['lib>agent', 'agent'] },
    { text: 'sidecar 用 Agent SDK 的 `query()` 驅動你電腦上的 Claude Code，回答是**照 schema 寫的結構化輸出**。', focus: ['agent>claude', 'claude'] },
    { text: '寫到一半的標題和步驟變成 NDJSON 事件，`lib.rs` **一邊存檔一邊通知介面**（`lesson-event`）。', focus: ['agent>lib', 'lib', 'lib>store', 'lib>home'] },
    { text: '最後視覺放進沙盒 iframe，每換一步就用 `postMessage` **送一個 step 進去**，由 `src/kit/runtime.js` 畫出來。', focus: ['home>frame', 'frame'] },
  ],
  widget: {
    kind: 'architecture',
    architecture: {
      groups: [
        { id: 'ui', label: '介面', text: 'React · src/' },
        { id: 'core', label: '桌面殼', text: 'Tauri · src-tauri/' },
        { id: 'agent', label: 'Sidecar', text: 'Bun · sidecar/' },
      ],
      nodes: [
        { id: 'learner', label: '學生', kind: 'user' },
        { id: 'home', label: 'Home / LessonView', text: 'src/views', group: 'ui', kind: 'client' },
        { id: 'frame', label: '視覺 iframe', text: 'kit/runtime.js', group: 'ui', kind: 'module' },
        { id: 'lib', label: 'lib.rs', text: '命令與存檔', group: 'core', kind: 'service' },
        { id: 'store', label: '課程 JSON', text: 'app data/lessons', group: 'core', kind: 'db' },
        { id: 'agent', label: 'agent.ts', text: '一個問題一個行程', group: 'agent', kind: 'process' },
        { id: 'claude', label: 'Claude Code', text: 'Agent SDK', group: 'agent', kind: 'external' },
      ],
      edges: [
        { from: 'learner', to: 'home', label: '提問' },
        { from: 'home', to: 'lib', label: 'invoke' },
        { from: 'lib', to: 'home', label: 'lesson-event', dashed: true },
        { from: 'lib', to: 'store', label: '讀寫' },
        { from: 'lib', to: 'agent', label: 'stdin' },
        { from: 'agent', to: 'lib', label: 'NDJSON', dashed: true },
        { from: 'agent', to: 'claude', label: 'query()', both: true },
        { from: 'home', to: 'frame', label: 'step' },
      ],
    },
  },
};

/** Preview-only: a flowchart, a diagram whose nodes have shapes. */
const PREVIEW_FLOW: Lesson = {
  title: '回答出錯時：檢查、修正一次',
  subject: 'software',
  crumbs: ['軟體', '流程'],
  task: '跟著亮起的路徑走，比較「沒問題」和「有問題」兩條路。',
  suggestions: ['check.ts 會檢查哪些東西？', '為什麼只修正一次？'],
  sources: ['sidecar/agent.ts', 'sidecar/check.ts'],
  steps: [
    { text: 'Claude 寫完一章，sidecar **先不給你看**，而是交給 `sidecar/check.ts` 檢查。', focus: ['got', 'check', 'got>check'] },
    { text: '檢查視覺的每個 id、表達式和圖示。**沒有問題就直接存檔顯示**。', focus: ['bad', 'check>bad', 'bad>show', 'show'] },
    { text: '有問題時，在**同一個 session** 把問題列給 Claude，請它只修正、內容不變。', focus: ['bad>fix', 'fix'] },
    { text: '修好了就照常顯示；**還是不行才回報錯誤**，你可以再試一次。', focus: ['fix>ok', 'ok', 'ok>show', 'ok>err', 'err'] },
  ],
  widget: {
    kind: 'diagram',
    diagram: {
      layout: 'down',
      nodes: [
        { id: 'got', label: '收到回答', shape: 'terminal' },
        { id: 'check', label: '檢查視覺與步驟', text: 'check.ts' },
        { id: 'bad', label: '有問題？', shape: 'decision' },
        { id: 'fix', label: '請 Claude 修正', text: '同一個 session' },
        { id: 'ok', label: '修好了？', shape: 'decision' },
        { id: 'show', label: '存檔並顯示', shape: 'io' },
        { id: 'err', label: '回報錯誤', shape: 'terminal' },
      ],
      edges: [
        { from: 'got', to: 'check' },
        { from: 'check', to: 'bad' },
        { from: 'bad', to: 'show', label: '沒有' },
        { from: 'bad', to: 'fix', label: '有' },
        { from: 'fix', to: 'ok' },
        { from: 'ok', to: 'show', label: '是' },
        { from: 'ok', to: 'err', label: '否' },
      ],
    },
  },
};

function mockApi(): Api {
  const fixtures = [bubble, pyth, deriv] as { lesson: NonNullable<LessonRecord['lesson']>; model: string }[];
  const questions = ['泡泡排序是怎麼運作的？', '畢氏定理為什麼成立？', '導數到底在算什麼？'];
  const timers = new Map<string, number[]>();
  const now = Date.now();
  const store = new Map<string, LessonRecord>();
  fixtures.forEach((f, i) => {
    const id = `demo${i}`;
    store.set(id, { id, question: questions[i], status: 'ready', createdAt: now - (i + 1) * 3600e3, step: 0, lesson: f.lesson, model: f.model, cost: PREVIEW_COST });
  });
  const bus = new EventTarget();
  const emit = (e: LessonEvent) => bus.dispatchEvent(new CustomEvent('e', { detail: e }));
  const meta = (r: LessonRecord): LessonMeta => ({
    id: r.id, question: r.question, status: r.status, createdAt: r.createdAt, step: r.step,
    title: r.course?.title ?? r.lesson?.title, subject: r.lesson?.subject,
    total: r.lesson && itemsOf(chaptersOf(r)).length, refs: r.refs?.length,
  });
  const pickFixture = (q: string): { lesson: Lesson; model: string } => {
    if (/測驗|考考|練習|題目|檢核/i.test(q)) return { lesson: PREVIEW_QUIZ, model: 'preview' };
    if (/二分|程式碼|追蹤|code|python/i.test(q)) return { lesson: PREVIEW_CODE, model: 'preview' };
    if (/架構|結構|專案|系統/.test(q)) return { lesson: PREVIEW_ARCH, model: 'preview' };
    if (/流程|判斷|迴圈/.test(q)) return { lesson: PREVIEW_FLOW, model: 'preview' };
    if (/畢氏|三角|幾何|證明/i.test(q)) return fixtures[1];
    if (/導數|斜率|微積分|函數/.test(q)) return { lesson: PREVIEW_SCENES, model: 'preview' };
    return fixtures[0];
  };
  /**
   * Streams a fixture's steps from `at` ms on, as the lesson's first chapter or (with `part`) as a
   * chapter in the lesson's pending slot; returns when it lands.
   */
  const playChapter = (id: string, f: { lesson: Lesson; model: string }, t: number[], at: number, part?: Omit<Part, 'lesson'>, next?: string) => {
    const r = store.get(id)!;
    const L = withScenes(f.lesson);
    t.push(window.setTimeout(() => emit({ id, type: 'status', text: '正在寫步驟…' }), at + 400));
    // slow enough to watch the first steps play while the rest is written
    L.steps.forEach((_, i) => t.push(window.setTimeout(() => {
      const d = draftOf(L, i + 1);
      if (part) r.pending!.draft = d; else r.draft = d;
      emit({ id, type: 'partial', lesson: d, more: !!part });
    }, at + 700 + i * 1100)));
    const end = at + 1400 + L.steps.length * 1100;
    t.push(window.setTimeout(() => {
      if (!store.has(id)) return;
      if (part) { r.more = [...(r.more ?? []), { ...part, lesson: L, model: f.model, cost: PREVIEW_COST }]; r.pending = undefined; }
      else Object.assign(r, { status: 'ready', lesson: L, model: f.model, draft: undefined, cost: PREVIEW_COST });
      if (next) r.pending = { question: next, status: 'generating', course: true };
      emit({ id, type: 'ready' });
    }, end));
    return end;
  };
  /** Writes the preview course's chapters from `k` on, one after another. */
  const writeCourse = (id: string, k: number, t: number[], at: number) => {
    const goal = (n: number) => `弄懂${fixtures[n].lesson.title.split('：')[0]}在做什麼`;
    for (let n = k; n < fixtures.length; n++) {
      const next = n + 1 < fixtures.length ? goal(n + 1) : undefined;
      const part = n > 0 ? { question: goal(n), mode: 'chapter' as const, course: true, suggestions: fixtures[n].lesson.suggestions } : undefined;
      at = playChapter(id, fixtures[n], t, at, part, next) + 100;
    }
    t.push(window.setTimeout(() => timers.delete(id), at));
  };
  return {
    async listLessons() { return [...store.values()].sort((a, b) => b.createdAt - a.createdAt).map(meta); },
    async getLesson(id) {
      const r = store.get(id);
      if (!r) throw new Error(`no lesson ${id}`);
      return structuredClone(r);
    },
    async setProgress(id, step) { const r = store.get(id); if (r) r.step = step; },
    async startLesson(question, _gen, askFirst, refs) {
      const id = `m${Date.now().toString(36)}`;
      store.set(id, { id, question, status: 'generating', createdAt: Date.now(), step: 0, ...(refs?.length ? { refs } : {}) });
      if (refs?.length) {
        const t: number[] = [];
        timers.set(id, t);
        const paths = ['README.md', 'package.json', 'src-tauri/src/lib.rs', 'sidecar/agent.ts', 'src/App.tsx'];
        paths.forEach((p, k) => t.push(window.setTimeout(() => emit({ id, type: 'status', text: `正在讀 ${p}…` }), 200 + k * 260)));
        playChapter(id, { lesson: PREVIEW_ARCH, model: 'preview' }, t, paths.length * 260);
        return id;
      }
      const t: number[] = [];
      timers.set(id, t);
      if (askFirst || question.length <= 6 || /整課|一整|全部|單元/.test(question)) {
        t.push(window.setTimeout(() => emit({ id, type: 'status', text: '正在想要先問你什麼…' }), 300));
        t.push(window.setTimeout(() => {
          const cur = store.get(id);
          if (!cur) return;
          Object.assign(cur, { status: 'asking', ask: PREVIEW_ASK, model: 'preview', cost: PREVIEW_COST });
          timers.delete(id);
          emit({ id, type: 'ready' });
        }, 1400));
        return id;
      }
      playChapter(id, pickFixture(question), t, 0);
      return id;
    },
    async answerLesson(id, answers) {
      const r = store.get(id);
      if (!r || r.status !== 'asking') throw new Error('這一課沒有在等你回答');
      Object.assign(r, { status: 'generating', answers });
      const t: number[] = [];
      timers.set(id, t);
      if (!answers.some((a) => a.answer.includes('一整課'))) { playChapter(id, pickFixture(r.question), t, 0); return; }
      const course = { title: `${r.question}：整課`, outline: fixtures.map((f) => ({ title: f.lesson.title.split('：')[0], goal: `弄懂${f.lesson.title.split('：')[0]}在做什麼` })) };
      t.push(window.setTimeout(() => emit({ id, type: 'status', text: '正在規劃整課…' }), 200));
      t.push(window.setTimeout(() => { if (!store.has(id)) return; r.course = course; emit({ id, type: 'ready' }); }, 900));
      writeCourse(id, 0, t, 1000);
    },
    async continueCourse(id) {
      const r = store.get(id);
      if (!r?.course) throw new Error('這一課沒有要接著寫的章節');
      const k = courseWritten(r);
      r.pending = { question: r.course.outline[k].goal, status: 'generating', course: true };
      const t: number[] = [];
      timers.set(id, t);
      writeCourse(id, k, t, 100);
    },
    async continueLesson(id, question, _gen, chapter) {
      const r = store.get(id);
      if (!r || r.status !== 'ready') throw new Error('這一課還沒準備好');
      if (r.pending?.status === 'generating') throw new Error('上一個追問還在生成');
      r.pending = { question, status: 'generating', at: chapter };
      const n = r.more?.length ?? 0;
      const t: number[] = [];
      const done = (part: Part) => t.push(window.setTimeout(() => {
        if (!store.has(id)) return;
        r.more = [...(r.more ?? []), part];
        r.pending = undefined;
        timers.delete(id);
        emit({ id, type: 'ready' });
      }, 2400));
      t.push(window.setTimeout(() => emit({ id, type: 'status', text: '正在想怎麼教…' }), 300));
      if (/測驗|考考|練習|題目|檢核|二分|程式碼|架構|流程/i.test(question)) {
        const f = pickFixture(question);
        const L = withScenes(f.lesson);
        L.steps.forEach((_, i) => t.push(window.setTimeout(() => {
          if (!r.pending) return;
          r.pending.draft = draftOf(L, i + 1);
          emit({ id, type: 'partial', lesson: r.pending.draft, more: true });
        }, 450 + i * 260)));
        done({ question, mode: 'chapter', lesson: L, model: f.model, cost: PREVIEW_COST });
      } else if (n % 2 === 0) {
        const text = '好問題背後通常是同一件事：**每一步只看眼前兩個數字**。所以不用記整個過程，只要跟著當下的核心條件走就好。';
        for (let k = 1; k <= 4; k++) t.push(window.setTimeout(() => {
          if (!r.pending) return;
          r.pending.draft = { mode: 'text', text: text.slice(0, Math.ceil((text.length * k) / 4)) };
          emit({ id, type: 'partial', lesson: r.pending.draft, more: true });
        }, 400 + k * 350));
        done({ question, mode: 'text', at: chapter, text, suggestions: r.lesson!.suggestions, model: 'preview', cost: PREVIEW_COST });
      } else {
        const f = fixtures[(fixtures.findIndex((x) => x.lesson.title === r.lesson!.title) + 1 + n) % fixtures.length];
        const L = withScenes(f.lesson);
        L.steps.forEach((_, i) => t.push(window.setTimeout(() => {
          if (!r.pending) return;
          r.pending.draft = draftOf(L, i + 1);
          emit({ id, type: 'partial', lesson: r.pending.draft, more: true });
        }, 500 + i * 250)));
        done({ question, mode: 'chapter', lesson: L, model: f.model, cost: PREVIEW_COST });
      }
      timers.set(id, t);
    },
    async renameChapter(id, chapter, name) {
      const r = store.get(id);
      if (!r) return;
      r.names = { ...r.names };
      if (name.trim()) r.names[chapter] = name.trim(); else delete r.names[chapter];
    },
    async deleteLesson(id) {
      timers.get(id)?.forEach(clearTimeout);
      timers.delete(id);
      store.delete(id);
    },
    async cancelLesson(id) {
      if (!timers.has(id)) throw new Error('這一課已經不在生成了');
      timers.get(id)?.forEach(clearTimeout);
      timers.delete(id);
      const r = store.get(id);
      if (!r) return;
      if (r.pending) Object.assign(r.pending, { status: 'error', error: '你停止了這次生成' });
      else Object.assign(r, { status: 'error', error: '你停止了這次生成' });
      emit({ id, type: 'error', message: '你停止了這次生成' });
    },
    async claudeStatus() { return 'preview'; },
    async checkUpdate() { return null; },
    async appVersion() { return 'preview'; },
    async pickFolders() { return ['C:\\Users\\demo\\projects\\unfold']; },
    async inspectRef(path) { return { path, name: path.split(/[\\/]/).filter(Boolean).pop() ?? path }; },
    onDrop() { return () => {}; },
    async openLink(url) { open(url, '_blank', 'noopener'); },
    onLessonEvent(cb) {
      const h = (e: Event) => cb((e as CustomEvent<LessonEvent>).detail);
      bus.addEventListener('e', h);
      return () => bus.removeEventListener('e', h);
    },
  };
}

export const api: Api = inTauri ? tauriApi() : mockApi();
