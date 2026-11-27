# Unfold

個人互動家教。你問一個問題，電腦上的 Claude Code（透過 Agent SDK）寫出課程腳本，app 再配合互動元件一步一步播放。

## 執行

```sh
bun install
bun run tauri dev
```

需要已安裝並登入的 Claude Code（`claude --version`），以及 Rust 和 Bun。
可以設定 `CARGO_TARGET_DIR`，把 Rust 建置輸出放到別處（例如 RAMDisk）。

### 安裝檔

```sh
bun run tauri build
```

會在 `<target>/release/bundle/nsis/` 產生 `Unfold_<version>_x64-setup.exe`（NSIS，裝在使用者目錄，免系統管理員）。
建置時會先用 `bun build --compile` 把 sidecar 編成 `src-tauri/binaries/unfold-agent-*.exe`；app 從安裝資料夾執行它，並讓它使用使用者自己的 `claude` 執行檔。
設定 `TAURI_SIGNING_PRIVATE_KEY` 時，會一併產生自動更新用的簽章檔（`.sig`）。

字型內建在 `src/fonts`；`bun tools/fetch-fonts.ts` 會重新產生（Instrument Sans、DM Mono，以及依 unicode-range 切片的源樣黑體；需要裝有 fonttools 和 brotli 的 Python）。

`bun run check` 執行運算式、串流解析器、視覺元件組、參考資料夾，以及畫面與邊寫邊播的檢查。

單獨執行 `bun run dev` 會在瀏覽器開啟介面，使用錄好的範例課程和假的生成器，方便不靠 Claude 調整版面。

## 架構

- `sidecar/agent.ts`：從 stdin 讀一個問題，以 NDJSON 輸出事件（`status`、`session`、`partial`、`lesson` / `part`、`error`）。它用自訂系統提示呼叫 Agent SDK，所有回答共用一個 JSON schema（`sidecar/prompt.ts`），並提供一個工具 `read_chapter`，讓 Claude 讀取某一章目前的樣子（步驟和編輯後的視覺）。帳號問題（未登入、付款、帳號暫停）會轉成看得懂的說明。
- 新課程可以先發問：當範圍、呈現方式或學生程度會影響課程時，Claude 會以 `ask` 回答（1 到 4 題，附選項）。課程停在 `asking`，學生選選項、自己打字或略過，答案會接續同一個 session。首頁的「先問我」會要求 Claude 一律先問；沒開時由它自己判斷。
- 整套課程：Claude 以 `course` 回答新課程，列出 2 到 8 章的大綱，sidecar 再在同一個 session 裡逐章寫出。每章寫好就馬上出現（第一章是課程本身，其餘是 `more` 裡的課程部分）；中途停止或失敗的課程會從下一章接著寫（`continue_course`）。
- 參考資料夾：首頁的「參考資料夾」（或把資料夾拖進視窗）會把資料夾附到新課程上，可以是要解說的專案，也可以是要拿來教的文件。資料夾在這堂課裡固定不變（課程檔裡的 `refs`）。Claude 會多拿到 Read、Glob 和 Grep，由 PreToolUse hook 和 `canUseTool` 限制在這些資料夾內（`sidecar/refs.ts`），系統提示也會多一段要求先讀再教、並註明檔案。回答時讀過的檔案會存成 `sources`，顯示在回答下方。
- 畫面與字框：視覺寫在步驟上。每一章的第一步用 `scene` 開一個畫面，之後的步驟都在這個畫面上播放，直到某一步再開新的畫面（例如換個情境、放大某個部分、最後的總整理）。每個畫面的步驟各自從 0 開始編號。開畫面的步驟會附上 `task`（現在要看什麼、試什麼）；任何一步都可以附 `board`，由介面在視覺旁邊寫出算式和關鍵數值，同一個畫面裡會延續到後面的步驟。舊的課程只有一個 `widget`，照原本的方式播放。
- 每次追問都會選一種模式：`chapter`（新章節，有自己的畫面）、`extend`（在正在讀的章節加步驟：接著最後一個畫面編號，HTML 用尋找取代來改，或開一個新畫面）或 `text`（只用文字回答）。章節標題由 Claude 決定，學生可以改名。
- 追問會接續課程的 Claude Code session（課程檔裡的 `session`），讓 Claude 記得自己先前的回答，prompt cache 也能持續命中。同樣的原因，同一堂課的系統提示和工具列表不會改變。session 無法接續時，sidecar 會根據課程大綱開一個新的。session 存在 app 資料夾的 `sessions` 底下。
- `src/chapters.ts`：課程檔如何解讀成章節、項目、畫面和字框，介面和 sidecar 共用。生成中的章節也會照同樣方式解讀，只包含已經能播的步驟。
- `src-tauri/src/lib.rs`：啟動 sidecar，把課程以 JSON 存在 app 資料夾（附每次生成的花費），並向介面送出 `lesson-event`。
- `sidecar/partial.ts`：在回答串流時解析寫到一半的內容，讓標題和步驟（或回覆文字）一寫出來就出現在介面上。
- 邊寫邊播：新的一章還在寫時，sidecar 會在草稿裡標出前幾步已經完整、檢查過，可以播放（`ready`，判斷在 `sidecar/check.ts` 的 `playableSteps`）。一步要等下一步開始寫才算完整。用 reveal 逐步顯示的元件組畫面，要等它的步驟全部寫完才播，否則之後才出現的東西會一開始就看得到。學生可以先看前幾步，後面的邊寫邊加進來；追問開的新章節一可以播就會跳過去。
- `src/`：React 介面。元件在 `src/widgets/`：
  - `BubbleSort`：內建。
  - `Plot`：Mafs 座標平面，由 Claude 以參數加項目描述（function、area、riemann、tangent、point、vector、segment、polygon、text）。步驟會讓參數動畫變化；運算式經過 `expr.ts` 裡的小型解析器，從不使用 `eval`。
  - 視覺元件組（`src/kit/runtime.js`）：chart、diagram（也包含流程圖，靠節點形狀：terminal、decision、io、store）、architecture（以帶標籤的連線串起的元件群組）、timeline、compare、points、passage、code、quiz。
  - `HtmlWidget`：Claude 寫的 HTML，在 sandbox iframe 裡執行，透過 `postMessage({ type: 'step', index, animate })` 驅動。
- 安全：主視窗有 CSP，只能連 Tauri IPC；sandbox iframe 另有自己的 CSP，不能連網。
- 更新：啟動時用 `tauri-plugin-updater` 檢查 GitHub Releases 的 `latest.json`，有新版就提示安裝並重新啟動。
- 停止：輸入框的停止鍵會結束整個 sidecar 程序樹。

課程裡的按鍵：→ 或 Enter 下一步，← 上一步，PageDown / PageUp 下一章或上一章。步驟還在動畫時按下一步，會先把動畫跑完。雙擊章節標題（或點鉛筆）可以改名。
