# kotoba — Claude Code 分階段執行指令

## 使用方式

1. 建立空專案目錄，把 `CLAUDE.md` 放在根目錄。
2. 在目錄下啟動 `claude`，用 `/model` 確認目前模型（建議 `claude-sonnet-4-6`）。
3. 依序貼上各 Phase 的指令。**每個 Phase 結束後，先驗證通過驗收標準，再進下一個 Phase。**
4. 若執行中偏離預期，要求 Claude Code 停下重新規劃，不要讓它硬推。
5. 每個 Phase 開始時可加一句：「先閱讀 CLAUDE.md 與『累積規則』段落再開工。」

---

## Phase 0 — 專案腳手架

```
先閱讀 CLAUDE.md。建立專案腳手架：

【目標】建立可運行、可測試的 Vite + React + TS PWA 專案骨架
【核准安裝的依賴】
  dependencies: react, react-dom, dexie, ts-fsrs
  devDependencies: vite, @vitejs/plugin-react, typescript, vite-plugin-pwa,
    vitest, @testing-library/react, @testing-library/jest-dom, jsdom, zod
  （此清單以外的套件需先徵求我同意）
【步驟】
1. 以 Vite react-ts template 初始化，啟用 TypeScript strict。
2. 建立 CLAUDE.md 中定義的目錄結構（空目錄放 .gitkeep）。
3. 設定 vite-plugin-pwa：registerType 'autoUpdate'，先用預設 workbox 設定，
   manifest 填入 name "kotoba"、display "standalone"、theme_color、
   直向手機優先。icon 先用暫代的單色 SVG 生成 192/512 png。
4. vite.config 的 base 設為 '/kotoba/'（GitHub Pages 子路徑，repo 名若不同再改）。
5. 設定 Vitest + testing-library，寫一個 App 冒煙測試。
6. git init，建立 .gitignore（含 pipeline/raw/、dist/、.env）。
【驗收標準】
- npm run dev 可啟動並顯示 placeholder 首頁
- npm test 通過
- npm run build 成功且 dist/ 內含 manifest 與 service worker
【明確排除】不做任何 UI 設計、不建立資料管線、不設定部署
```

## Phase 1 — 資料管線

```
【目標】建立 idempotent 的資料管線，產出分級後的靜態 JSON
【核准安裝的依賴】devDependencies: kuromoji, tsx, papaparse（+ @types）
【步驟】
1. pipeline/fetch.ts：下載以下原始資料到 pipeline/raw/（已存在則跳過，
   加 --force 才重抓）：
   a. github.com/jamsinclair/open-anki-jlpt-decks 的 N5–N1 單字 CSV
      （先用 GitHub API 或瀏覽 repo 確認實際檔案路徑與欄位，不要憑記憶假設）
   b. github.com/mwhirls/tatoeba-json 的 latest release JSON
   c. github.com/scriptin/jmdict-simplified 的 latest release 中
      jmdict-eng JSON（檔案大，注意用 streaming 或分段解析）
   d. github.com/tristcoil/hanabira.org repo 中的文法點內容檔
      （只抓內容 JSON/資料檔，嚴禁複製任何程式碼；先探查 repo 結構
      找出 grammar 資料的實際位置與格式，回報給我看過再繼續）
2. pipeline/grade.ts：實作 CLAUDE.md 定義的例句分級演算法。
   kuromoji 字典初始化一次重複使用。
3. pipeline/link.ts：
   - 用 tatoeba-json 的單字索引把例句掛到 JLPT 單字上，優先取有
     "checked" 標記的句子，每字最多保留 8 句、依難度分布保留
   - 文法點的例句：hanabira 內容若自帶例句則沿用並跑同一分級器
   - 單字讀音/詞性缺漏處用 jmdict 補齊
4. pipeline/emit.ts：輸出到 public/data/：
   - vocab-n5.json … vocab-n1.json（單字含：漢字、假名、詞性、英文釋義、
     繁中釋義欄位先留 null、例句陣列[句子、翻譯、難度]）
   - grammar-n5.json … grammar-n1.json
   - index.json（各檔案的筆數、版本、來源標註）
   全部輸出前經 zod schema 驗證；排序穩定確保 idempotent。
5. 產出分級品質報告：隨機抽 30 句印出「句子 / 判定難度 / 實詞等級明細」
   存到 pipeline/report.md 給我人工抽查。
【驗收標準】
- npm run pipeline 完整跑通，重跑兩次 public/data/ 內容 diff 為空
- schema 驗證全數通過，index.json 筆數合理（單字總數約 8000±20%）
- report.md 存在，我抽查後分級方向大致合理（明顯離譜再調參數）
【明確排除】不做繁中翻譯（下一 Phase）、不動前端
```

## Phase 1b —（可選）繁中釋義生成

```
【目標】用 Anthropic API 批次為單字生成繁中釋義，寫回資料
【前置】我會提供 ANTHROPIC_API_KEY，放在 .env（已在 .gitignore）。
  除寫入 .env 外不得將 key 寫進任何檔案或 log。
【核准安裝的依賴】dependencies(pipeline 用): @anthropic-ai/sdk, dotenv
【步驟】
1. pipeline/translate.ts：
   - model 用 claude-sonnet-4-6，每次請求批 50 個單字
   - 輸入給模型：單字、假名、詞性、英文釋義；要求輸出 JSON 陣列，
     每項為 {id, zh}，繁中釋義精簡（≤15 字），台灣用語習慣
   - 系統提示明確要求「只輸出 JSON，無其他文字」，解析失敗該批重試一次
   - 結果快取到 pipeline/raw/translations.json，中斷可續跑
   - 併發上限 4，遇 429 指數退避
   - 完成後印出實際 token 用量與估算費用
2. emit.ts 整合：有翻譯快取時填入 zh 欄位，無則維持 null。
3. 文法解說翻譯：先跑完單字翻譯、我確認品質後，再問我是否翻文法解說。
【驗收標準】
- 抽 20 筆繁中釋義給我人工檢查
- 中斷後重跑不會重複計費（快取生效）
- 總費用回報給我
【明確排除】未經確認不翻文法解說
```

## Phase 2 — SRS 複習核心

```
【目標】完成「新卡學習 → 到期複習 → FSRS 重排」的完整循環
【步驟】
1. src/db/：Dexie schema：
   - cards（itemId、itemType: 'vocab'|'grammar'、fsrs 狀態欄位）
   - reviewLogs（複習紀錄，供統計與 FSRS 參數用）
2. review feature：
   - 佇列邏輯：到期卡優先，其次每日新卡上限（預設 10，可設定）
   - 翻卡 UI：正面顯示單字（或文法點名稱），翻面顯示假名、釋義
     （有繁中用繁中，無則英文）、與使用者等級最接近難度的例句 1–2 句
   - 四鍵評分（Again / Hard / Good / Easy）對接 ts-fsrs，寫回排程
   - 手機直向優化：評分鍵在拇指區、卡片可點擊翻面
3. 首頁顯示：今日到期數、新卡數、開始複習按鈕。
4. 測試：FSRS 排程循環（新卡→Good→到期時間前移）、佇列排序、
   評分寫入 IndexedDB（fake-indexeddb 若需要，先問我核准安裝）。
【驗收標準】
- 測試通過；手動走完一輪 10 張卡的複習並附操作說明與畫面描述
- 重新整理頁面後進度不遺失
【明確排除】不做統計頁、不做瀏覽頁
```

## Phase 3 — 單字瀏覽

```
【目標】可依 JLPT 等級與詞性瀏覽、搜尋單字，並加入複習佇列
【步驟】
1. 等級分頁（N5–N1），lazy load 對應 vocab-*.json，載入狀態與錯誤處理。
2. 詞性篩選 chips、假名/漢字/釋義關鍵字搜尋（前端記憶體內過濾即可）。
3. 單字詳情：讀音、詞性、釋義、全部例句（標示難度）、
   「加入複習」按鈕（已加入顯示狀態）。
4. 批次加入：目前篩選結果一鍵全部加入複習佇列（需確認對話框）。
【驗收標準】
- 各等級載入正常、搜尋結果正確、加入後出現在複習佇列（附驗證步驟）
- 手機上單手可操作
【明確排除】不做主題標籤系統（資料有標籤就顯示，沒有不補）
```

## Phase 4 — 文法模組

```
【目標】文法點瀏覽與學習，與單字共用同一套 SRS 引擎
【步驟】
1. 文法列表按等級分頁，lazy load grammar-*.json。
2. 文法詳情頁：接續方式、解說、例句（依使用者目前主要學習等級
   排序：最接近的難度在前）。
3. 「加入複習」：itemType 'grammar' 進同一 cards 表；
   複習卡正面為文法點、翻面為意義+一句例句。
4. About 頁：列出全部資料來源、授權標註、hanabira.org 回連。
【驗收標準】
- 文法卡與單字卡在同一複習佇列中混合出現且評分排程正常
- About 頁涵蓋 CLAUDE.md 授權表的全部義務
【明確排除】不做文法測驗題型（只做翻卡）
```

## Phase 5 — PWA 完善與部署

```
【目標】離線可用、可加入主畫面、部署上 GitHub Pages
【授權聲明】本 Phase 明確授權建立 .github/workflows/deploy.yml
  與 GitHub Pages 相關設定，其餘 CI/CD 變更仍需先問。
【步驟】
1. Workbox 快取策略：app shell precache；public/data/*.json 用
   CacheFirst + 版本化（index.json 的版本變更時失效）。
2. manifest 與 icon 正式化（簡潔的假名主題 icon 即可）。
3. 建立 GitHub Actions：push main → build → 部署 gh-pages。
   確認 vite base 與 repo 名一致。
4. 提供我需要手動做的事項清單（建 repo、開啟 Pages 設定等），
   一步一步列出。
【驗收標準】
- 部署後手機可開啟、可「加入主畫面」
- 開啟過一次後，飛航模式下仍可完整複習已快取等級的卡片
- Lighthouse PWA 檢查通過（回報分數）
【明確排除】不做自訂網域、不做推播通知
```

## Phase 6 — 統計與打磨

```
【目標】學習統計、深色模式、資料備份
【步驟】
1. stats：每日複習量長條圖（近 30 天）、目前各等級已學/總數、
   連續天數。圖表用純 SVG 自繪，不新增圖表套件。
2. 深色模式：跟隨系統 prefers-color-scheme，可手動切換。
3. 資料匯出/匯入：cards + reviewLogs 匯出 JSON 檔、可匯入還原
   （匯入前顯示筆數確認，屬不可逆操作需二次確認 UI）。
【驗收標準】
- 匯出→清空瀏覽器資料→匯入，進度完整還原（附驗證步驟）
- 深色模式下所有頁面可讀
【明確排除】不做雲端同步、不做多裝置
```

---

## 給你的操作備忘

- **模型**：Claude Code 內 `/model` 選 `claude-sonnet-4-6`。管線翻譯（Phase 1b）走 API 需另在 console.anthropic.com 儲值，與訂閱分開計費。
- **每 Phase 結束**：要求 Claude Code 給最終摘要（改了什麼、為什麼、如何驗證），確認驗收項後 commit，再進下一 Phase。
- **糾正它時**：同時要求它把教訓寫進 CLAUDE.md 的「累積規則」段落。
- **Phase 1 有一個中途檢查點**：hanabira 文法資料的實際格式需要它探查後回報給你確認，因為該 repo 結構可能與預期不同——這是刻意設計的停損點。
