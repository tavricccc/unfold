# 產品影片

一支一分鐘的 Unfold 介紹影片，完全用程式渲染。片中的 app 就是真正的 app（同樣的 React 元件和 CSS），只是後端換成 `src/promo-api.ts`：它重播 `data/lessons.json` 裡錄好的課程，送出的事件和 sidecar 一模一樣。點擊、打字和拖曳滑桿都是真實輸入，透過 DevTools protocol 送出，所以 app 的反應就跟真人操作時一樣。

## 渲染

```sh
node showcase/video/prep.mjs          # 選用：從 app 的課程資料夾更新 data/lessons.json
cd showcase/video
node node_modules/vite/bin/vite.js build     # 輸出到 $TMPDIR/unfold-video/dist（可用 FILM_OUT / FILM_WORK 改位置）
node capture.mjs --dsf 2 --out ./out/film-v.mp4   # 1080p，另外用 2 倍畫格輸出 -4k.mp4
node audio.mjs                        # 從 FILM_WORK（或 $TMPDIR/unfold-video）讀 cues.json，寫出 music.wav
ffmpeg -i ./out/film-v.mp4 -i <work>/music.wav -c:v copy -c:a aac -b:a 256k -shortest out/unfold.mp4
```

這裡的 `node_modules` 是指向 `app/node_modules` 的 junction（`mklink /J showcase\video\node_modules app\node_modules`）。

預覽：`node capture.mjs --dsf 1 --stills <dir> --every 30` 每半秒輸出一格；`--from` / `--to` 限制範圍。

## 運作方式

- `cdp.mjs`：小型 DevTools 用戶端。它用 BeginFrame 控制和虛擬時間執行 `chrome-headless-shell`（取自 Playwright 快取），所以每一格都是精確算出來的，不是即時錄影：畫格再慢也不會掉格或卡頓。虛擬時間以整數毫秒前進，所以畫格間隔是 17、17、16 ms。
- `src/engine.ts`：時間軸。每個動畫值都是 `t` 的函數；`at(t, f)` 只執行一次動作。
- `src/film-main.ts`：影片本身，包含場景、對 app 視窗的鏡頭移動、游標和字幕。每次點擊或按鍵都會呼叫 `input()`，`capture.mjs` 會在下一格之前把它轉成真實的滑鼠或鍵盤事件。
- `audio.mjs`：合成的配樂，一段依段落起伏的 120 BPM 底樂，再加上影片擷取時寫下的提示點（`cues.json`）上的音效。
