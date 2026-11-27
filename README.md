<p align="center"><img src="showcase/icon-1024.png" width="128" alt="Unfold"></p>

<h1 align="center">Unfold</h1>

<p align="center">用你電腦上的 <a href="https://docs.anthropic.com/en/docs/claude-code">Claude Code</a> 當家教：問一個問題，它會一步一步展開成一堂配有互動視覺的課。</p>

![Unfold 首頁](showcase/home.png)

## 功能

- **逐步互動視覺**：每堂課都是一段段短講解，搭配同步變化的視覺：
  - **函數圖**：Mafs 座標平面，參數會動畫變化，可以拖曳點，並有切線、面積、黎曼和與即時數值。
  - **視覺元件組**：內建互動圖表、流程圖、系統架構圖、時間軸、比較、重點卡、文本註解、逐步程式追蹤與隨堂測驗。
  - **自訂 HTML/SVG**：在 sandbox 裡執行、為物理、化學、生物、幾何與機構原理現場生成的動畫元件。
- **先問再教、整套課程**：可以先問清楚你的需求再開始教，也可以規劃好多章節的課程，一章一章寫出來。
- **參考資料夾**：附上本機的專案或文件資料夾（也可以直接拖進視窗），課程會照你的檔案來教。只能讀、不能寫，並標出引用的來源。
- **接著追問**：在同一堂課裡繼續問，會接續原本的對話，並自動決定要開新章節、延伸目前的視覺，還是用文字回答。
- **自動更新**：有新版本時，app 會提示你一鍵更新並重新啟動。
- **離線字型**：內建 Instrument Sans、DM Mono，以及切片過的源樣黑體。

## 需求

- 已安裝並登入 [Claude Code](https://docs.anthropic.com/en/docs/claude-code)（`claude --version`）
- [Bun](https://bun.sh/)
- [Rust](https://www.rust-lang.org/)（用來建置 Tauri 桌面程式）

## 快速開始

```sh
cd app
bun install
bun run tauri dev
```

在瀏覽器預覽介面，使用錄好的範例課程（不需要 Claude）：

```sh
cd app
bun run dev
```

執行檢查：

```sh
cd app
bun run check
```

建置安裝檔（Windows NSIS，免系統管理員）：

```sh
cd app
bun run tauri build
```

## 發佈新版

1. 更新 `app/src-tauri/tauri.conf.json` 的 `version`。
2. 推送對應的 tag，例如 `git tag v0.2.0 && git push origin v0.2.0`。
3. GitHub Actions 會建置、簽署更新檔，並建立 draft release；到 GitHub 把它發佈後，已安裝的 app 就會收到更新。

更新簽章私鑰放在 `prod` environment 的 `TAURI_SIGNING_PRIVATE_KEY` secret。

## 專案結構

- [`app/`](app/)：桌面程式（Tauri + React + Vite）與 Claude Agent SDK sidecar。架構細節與快捷鍵見 [`app/README.md`](app/README.md)。
- [`showcase/`](showcase/)：截圖、視覺元件範例，以及用程式渲染的產品影片（[`showcase/video/README.md`](showcase/video/README.md)）。

## 第三方素材

- **圖示**：[Lucide](https://lucide.dev) 的子集（ISC License；部分來自 Feather，MIT License）。
- **字型**：[Instrument Sans](https://fonts.google.com/specimen/Instrument+Sans)、[DM Mono](https://fonts.google.com/specimen/DM+Mono)、[源樣黑體 GenYo Gothic TW](https://github.com/buttaiwan/genyog-font)（SIL Open Font License 1.1）。

## 授權

[MIT](LICENSE)
