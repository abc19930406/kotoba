# kotoba — 日文學習 PWA

> 新任務開工前，先讀 [PROJECT_PROGRESS.md](PROJECT_PROGRESS.md)（進度、架構決策、資料層現況）。

個人使用的日文單字與文法學習 PWA。以 JLPT N5–N1 分級單字為主軸，搭配自動分級的例句與文法點，使用 FSRS 間隔重複演算法排程複習。前端為主，另有一個 Vercel serverless function（`api/daily-material.ts`，每日教材 AI 短文生成）；部署於 Vercel，主要於手機瀏覽器使用。

## 技術棧

- Vite + React 19 + TypeScript（strict mode）
- SRS：`ts-fsrs`（不得自行實作排程演算法）
- 使用者資料：IndexedDB via `dexie`
- 帳密登入：`@supabase/supabase-js`（共用主站 Supabase 專案的 Auth；目前僅登入/登出，尚無資料同步）
- 內容資料：建置期產出的靜態 JSON，位於 `public/data/`，按等級分塊
- PWA：`vite-plugin-pwa`（Workbox）
- 測試：Vitest + @testing-library/react
- 資料管線：Node.js scripts（`pipeline/`），形態素分析用 `kuromoji`
- AI：`@anthropic-ai/sdk`（管線翻譯 `pipeline/translate*.ts` 與 `api/daily-material.ts` 每日短文共用）；`zod`（管線輸出驗證 + API 請求/回應驗證）
- 部署：Vercel（zero-config Vite preset，push `main` 自動重新部署；另含 `api/` 底下的 serverless function，見下方「部署」段落的特殊限制）

## 常用指令

```bash
npm run dev          # 開發伺服器
npm test             # Vitest 單元測試
npm run build        # 產出 dist/
npm run pipeline     # 執行完整資料管線（fetch → grade → link → emit）
npm run pipeline -- --translate   # 含單字繁中釋義生成（需 ANTHROPIC_API_KEY）
npm run pipeline -- --translate-grammar   # 含文法解說繁中翻譯（需 ANTHROPIC_API_KEY）
```

## 目錄結構

```
api/                 # Vercel serverless functions（見「部署」段落的自足性限制）
  daily-material.ts  # 每日教材 AI 短文生成，通行碼驗證 + 每日次數上限
  tsconfig.json      # 獨立於 src/ 的 TS 專案（api/ 必須完全自足，見下方）
pipeline/            # 資料管線（僅建置期執行，不打包進前端）
  fetch.ts           # 下載原始資料至 pipeline/raw/（raw/ 加入 .gitignore）
  grade.ts           # 例句難度自動分級
  link.ts            # 單字↔例句、文法↔例句 對應
  translate.ts       # （可選）呼叫 Anthropic API 生成單字繁中釋義
  translateGrammar.ts # （可選）呼叫 Anthropic API 生成文法解說繁中翻譯
  llmBatch.ts        # translate*.ts 共用的批次呼叫/重試/backoff 工具
  emit.ts            # 輸出 public/data/*.json
src/
  db/                # Dexie schema、FSRS 卡片狀態、review log、筆記、每日教材快取
  features/
    review/          # SRS 複習流程（核心功能）
    vocab/           # 單字瀏覽：等級/詞性篩選、搜尋、加入複習佇列
    grammar/         # 文法點列表、解說頁、分級例句
    stats/           # 學習統計、資料備份匯出/匯入
    notes/           # 單字/文法個人筆記（文字 + 圖片）
    notebook/        # 獨立筆記本（不綁定單字/文法項目）
    daily/           # 每日教材：本地學習包 + AI 短文（呼叫 api/daily-material.ts）
  shared/            # 共用 UI 元件、hooks、utils
public/data/         # 管線產物（commit 進 repo）
```

## 資料來源與授權（About 頁必須完整標註）

| 資料 | 來源 repo | 授權 | 義務 |
|---|---|---|---|
| JLPT 單字 N5–N1 | jamsinclair/open-anki-jlpt-decks | 開源 | 標註來源 |
| 日英例句 | mwhirls/tatoeba-json（取 latest release） | CC BY 2.0 FR | 標註 Tatoeba |
| 文法點內容 | tristcoil/hanabira.org-japanese-content（`grammar_json/`；僅取內容檔，不複製其程式碼） | Creative Commons（來源標示介於 BY 與 BY-SA 之間，從嚴以 BY-SA 4.0 對待） | 標註並回連 hanabira.org |
| 字典補充 | scriptin/jmdict-simplified（release JSON） | CC BY-SA | 標註 JMdict/EDRDG |

About 頁文法內容區塊標註文字：
「文法內容取自 hanabira.org（tristcoil/hanabira.org-japanese-content），依 Creative Commons 授權使用（來源標示為 CC ShareAlike，本專案從嚴依 CC BY-SA 4.0 對待）。本專案為個人非商業用途。」

規則：只允許使用 hanabira.org-japanese-content 的**內容資料**（grammar JSON），任何情況下不得複製其程式碼（含 hanabira.org 主 repo 的程式碼）——非授權風險考量（該程式碼實為 MIT），純粹是架構潔癖：本專案不需要它的程式碼，維持這條規則可避免未來誤引入。

## 例句難度分級演算法（pipeline/grade.ts）

1. kuromoji 對句子斷詞，取實詞（名詞、動詞、形容詞、副詞；排除助詞、助動詞、記號）。
2. 每個實詞查 JLPT 單字表：N5=1、N4=2、N3=3、N2=4、N1=5，查無者=6。
3. 句子難度 = 實詞等級的 90th percentile（四捨五入）。
4. 句長修正：詞素數 > 25 時難度 +1（上限 6）。
5. 難度 1–5 對應 N5–N1 標籤，6 標為 "N1+"。

## 部署（Vercel）

- 部署平台為 Vercel，獨立專案，zero-config（自動偵測 Vite framework preset，build command `npm run build`，output `dist/`）。正式網址：https://kotoba-delta.vercel.app
- `vite.config.ts` 的 `base` 為 `/`（Vercel 部署在網域根路徑，非子路徑）。
- push GitHub `main` 分支會觸發 Vercel 自動重新部署。
- **部署網域即 IndexedDB 資料的永久住址，不得隨意更換**。使用者的複習進度（FSRS 卡片狀態、複習紀錄、已熟悉清單、所有設定）全部存在瀏覽器的 IndexedDB，而 IndexedDB 是依「來源網域」隔離的——換一個部署網域（例如從 Vercel 預設網域改綁自訂網域、或建立新的 Vercel 專案）會讓使用者在舊網域累積的所有複習資料變得無法存取，等同資料遺失。若未來真的需要換網域，必須先設計資料遷移方案（例如匯出/匯入），不能直接切換。
- Workbox 快取策略：app shell（HTML/CSS/JS/icons/manifest）走 precache；`public/data/*.json`「不」進 precache，改用 CacheFirst 執行期快取，快取名稱綁定 `pipeline/emit.ts` 算出的 `dataVersion`（所有 vocab/grammar 檔案內容的 hash），資料實際變更時才會失效，單純重新部署不會讓使用者已快取的等級重新下載。
- **`api/` 目錄必須完全自足，禁止任何相對 import**（Phase 10 三次部署事故換來的教訓，見 `api/daily-material.ts` 檔頭註解）：Vercel 的 Node function builder 只打包 `api/` 內的檔案，且不處理 `.ts` 副檔名的 import specifier——跨目錄 import 部署後直接 `ERR_MODULE_NOT_FOUND`，同目錄但保留 `.ts` 副檔名一樣抓不到檔案。所有型別/常數一律內聯進該檔案本身，需要與 `src/shared/` 對應型別手動保持同步（刻意接受的重複，不是疏漏）。
- **`api/` 的 handler 簽名是 Node 式 `(req: IncomingMessage, res: ServerResponse)`**，不是 Web 標準 `Request`/`Response`（實測過，用 Web 標準簽名會在執行期噴 `req.headers.get is not a function`）。
- **本地 `npm run dev`（Vite dev server）無法執行 `api/*.ts`**——那是 Vercel 專屬的 serverless 執行環境。本地開發只能驗證離線可用的部分（前端 UI、本地資料組裝、錯誤/降級路徑）；`api/` 本身的邏輯正確性靠 Vitest 單元測試涵蓋，實際生成流程只能在真正部署到 Vercel 後才能驗證。

## 開發規則

- 找 root cause，禁止表面修補或臨時繞過。
- 每個改動保持最小 diff，不夾帶無關修改。
- 非簡單改動提交前自問是否有更優雅的做法；簡單修復不過度工程。
- 管線必須 idempotent：重跑產出相同結果（排序穩定、無時間戳污染）。
- 所有管線產出 JSON 須通過 schema 驗證（zod），驗證失敗即中止。
- 前端資料載入採 lazy：只抓使用者當前需要的等級分塊。
- TypeScript strict，禁止 `any`（不得已時用 `unknown` + narrowing）。
- UI 以手機直向為第一優先（viewport ~390px），觸控目標 ≥ 44px。
- 介面語言為繁體中文。

## 完成的定義（每項任務標記完成前必須通過）

1. 既有測試全部通過；若無測試，寫最小重現腳本證明修復有效。
2. 行為變更附上前後對比（輸出、畫面截圖說明、或 log）。
3. Diff 是最小必要範圍。
4. 錯誤處理與邊界條件已檢查。
5. 提供最終摘要：改了什麼、為什麼、如何驗證。

## 安全紅線（以下操作一律先徵求同意，不得自行執行）

- 刪除檔案或資料、清空目錄（pipeline/raw/ 的重新下載除外）。
- git force push、改寫歷史、直接操作 main 分支保護設定。
- 修改 CI/CD、部署設定、環境變數、.env、任何憑證或金鑰（各 Phase 指令中明確授權的項目除外）。
- 安裝或升級「各 Phase 指令核准清單以外」的依賴套件。
- 執行不可逆的資料操作。

## 經驗外部化

被使用者糾正後，立即將教訓改寫成一條可判斷違反與否的具體規則，追加到本檔案末尾的「## 累積規則」段落，不是內部記住。每次開工前先讀取該段落。

## 累積規則

- 資料源的路徑、格式、授權以探查結果為準；與 CLAUDE.md 記載不一致時，先回報並修正 CLAUDE.md，再繼續實作。
- 批次呼叫 LLM 時，識別碼一律用本地索引對應，不得要求模型原樣抄寫任何 id 或長字串。原因：文法翻譯曾要求模型把組合出來的長 id（含羅馬拼音括號）原樣抄回，模型會悄悄簡化掉部分內容，導致翻譯結果存進快取時對不回原始 id，78 筆翻譯變孤兒資料且無報錯。改用 batch 內純數字索引（0,1,2...）送給模型、本地端用索引映射回真正的 id/物件後，問題不再發生。
- 管線輸出的驗證必須包含跨筆 invariant（如 id 全域唯一性、跨檔重複 id 的內容一致性），不能只驗證單筆的 schema 結構。原因：`grade.ts`/`link.ts` 用「等級-標題」組字串當文法 id，來源資料裡有同標題但內容不同的 3 筆文法點（N3「～ように」），id 撞在一起導致其中 2 筆的翻譯被覆蓋成另一筆的內容，且 zod 單筆 schema 驗證完全抓不到（每筆自己的欄位都合法）。修法：`emit.ts` 在寫檔後對整批資料額外做跨筆檢查——文法 id 全域唯一（違反即中止），單字 id 若跨檔重複則要求其代表單字本身的欄位（不含 `level`／`sentences`，這兩者跨等級本來就會不同）逐筆比對必須一致。
- 涉及捲動／觸控／版面（sticky、fixed、overflow、viewport 相關）的修改，自我驗證必須包含 DevTools 響應式模式（模擬 iPhone 尺寸），並在回報中明確註明驗證環境（桌面瀏覽器／DevTools 行動模擬／真機）。原因：捲動位置還原功能在桌面瀏覽器測試時行為完全正確，但部署到 iPhone Safari 真機後不僅還原失效，還引發原本沒有的版面回歸（一段原本感覺「吸頂」的區塊不再固定）——桌面測試結果不能代表已驗證真機行為，回報「已驗證」前必須誠實列出實際驗證環境，讓使用者知道哪些情境還沒被覆蓋到。
- 正式站（Vercel）上線後，所有請使用者驗收的訊息必須明確標示測試環境與網址（dev／preview／正式站），並提醒：手機主畫面圖示與瀏覽器記憶的分頁一律是正式站，測 dev 版修復必須手動輸入 dev 網址。未 commit／未部署的修復，不得請使用者在正式站驗收——會誤判成修復失效。原因：捲動位置還原修好後請使用者到 Vercel 正式站測試，但修復從未 push，使用者測到的其實是完全沒有這次修復的舊版本，被誤判為「修復無效」，浪費一輪真機除錯才發現真正原因是「根本沒部署」。
- 使用者回報「原本正常的功能壞了」時，先確認該「功能」是否真的存在於程式碼中（grep 找對應的實作，例如 CSS 規則、元件邏輯），再假設是這次改動造成的回歸。原因：使用者回報「原本吸頂的等級分頁不再固定」，直覺以為是版面被改壞，但全專案 grep 後發現這幾個元素從來沒有 `position: sticky`——所謂「原本吸頂」其實是另一個 bug（捲動位置每次重置為 0）的副作用造成的錯覺，不是被移除的功能。若沒有先查證程式碼是否真的有這個功能，會把「舊 bug 副作用消失」誤判成「新回歸」，方向整個走偏。
- 規劃跨專案共用資源（helper function、既有表、既有機制）時，若只憑文件推斷其存在與行為、沒有實際查證過，必須在方案裡明確標示為「未驗證」，並提供不依賴它也能運作的備案。原因：Phase C2 規劃 kotoba 的 RLS 政策時，依「主站文件說明」假設 `public.is_admin()` 這個 helper function 存在並直接寫進 SQL，使用者實際到 Supabase Dashboard 執行時發現這個函式根本不存在——文件推斷有誤。最終改用 `auth.uid() = 固定 uid` 直接判斷使用者身分，不依賴任何主站 helper function，kotoba 的 RLS 只認自己的固定使用者 id，跟主站是否有這類 helper 完全脫鉤，也更簡單直接。
- 在任何管理後台（Supabase Dashboard、雲端主控台等）對「正確專案」執行操作前，先用一個能唯一識別該專案的查詢確認目前開啟的就是目標專案，不能只憑瀏覽器分頁還開著、URL 看起來對就假設沒切換過。原因：使用者在 Supabase Dashboard 執行 kotoba 建表 SQL 時，曾誤植到一個空的獨立測試專案而非主站專案（ref `ltmrkdldmgysczfnidra`），建表當下沒有任何錯誤或警告，因為空專案一樣能成功建表。後來確立的判斷法：對的專案應該查得到主站既有的 `auth.users` 帳號（`SELECT count(*) FROM auth.users;` 或直接查後台的 Authentication 頁面），查不到代表開錯專案。之後任何跨專案操作前，這類「確認法」都應該是第一步，不是建表建完才驗證。
- PWA 正式站上線後，全新裝置或已快取過舊版的裝置，開啟 app 時可能吃到舊版 Service Worker（未即時更新到最新部署），導致驗收到的其實不是最新程式碼。任何雙裝置／跨裝置驗證，應優先用無痕視窗（或先手動清除該網域的 SW／快取）排除「裝置吃到舊版」這個變因，才能把測到的行為差異正確歸因於程式邏輯本身。且驗收前務必先確認：要驗收的程式碼是否已經實際 `git push` 且 Vercel 部署完成（用 commit SHA 對應部署，不能只憑「我 commit 過了」就假設）。原因：Phase C3b pull 功能一度被誤判為有 bug，追查後發現根本原因是 commit 完成後忘記 push，正式站上跑的其實是舊版——這是同一類「未確認已部署就請人驗收」的教訓（呼應前一條），但這次額外確認了 PWA 快取本身也是另一個常見的干擾變因，两者都要先排除才能可靠定位問題。
- 凡是把 `itemId` 用作外部系統的鍵（Storage 路徑、URL、檔名等，資料庫主鍵除外），一律先轉成安全鍵（例如穩定雜湊），不可直接把 `itemId` 原文拼進去。原因：grammar 的 `itemId` 是人類可讀字串（標題形式，含全形括號、波浪號、空格），這個特性已經踩過兩次——Phase C2 曾用它組文法 id 導致跨筆撞號（見前面的跨筆 invariant 教訓），Phase C4a 直接拿它組 Supabase Storage 物件路徑，全形括號等字元讓上傳全部回 400，卡在「待同步」。凡是 `itemId` 要離開「本地資料庫主鍵」這個用途、進到任何對字元集有限制的外部系統，都要先假設它「什麼字元都可能有」，而不是假設它長得像英數 slug。
