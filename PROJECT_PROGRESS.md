# PROJECT_PROGRESS.md
# kotoba — 日文學習 PWA 進度總覽

> 每次開始新任務前，請先閱讀 CLAUDE.md（專案規則、開發規範、累積規則）
> 與本文件（進度、架構決策、資料層現況），了解目前狀態後再開始執行。

---

## 一、已完成階段（Phase 0–C5）

### ✅ Phase 0 + 1：專案骨架 + 資料管線（2026-07-17）
- Vite + React 18 + TypeScript strict PWA 骨架建立
- 資料管線第一版：`fetch → grade → link → emit`，JLPT 單字表 + Tatoeba 例句自動分級與連結，含分級演算法修正
- 產出 `public/data/*.json`（依等級分塊），commit 進 repo

### ✅ Phase 1b：單字/文法繁中翻譯（2026-07-17）
- 管線新增 `--translate`/`--translate-grammar` 選項，呼叫 Anthropic API 生成單字釋義與文法解說的繁體中文翻譯
- 本地快取避免重跑管線時重複呼叫 API；批次呼叫用本地索引對應，不要求模型抄寫 id（教訓見 CLAUDE.md 累積規則）

### ✅ Phase 2：SRS 複習核心（2026-07-18）
- 新卡 → 到期複習 → FSRS 重新排程的完整迴圈
- 排程演算法完全委派 `ts-fsrs`，本專案程式碼只負責資料存取與呼叫時機

### ✅ Phase 3 + 3.5：單字瀏覽（2026-07-18）
- 單字瀏覽頁：等級/詞性篩選、搜尋、批次加入複習
- 新卡誠實限流（避免超收當日額度）、全域搜尋、「已熟悉」退休機制正式上線

### ✅ Phase 4 + 4.5：文法模組（2026-07-18）
- 文法列表頁、解說頁、依等級分級例句
- About 頁（資料來源與授權完整標註）
- 例句假名注音改為 segment 編碼（非 ruby HTML 字串）——見下方架構決策

### ✅ Phase 5：PWA 完善與部署遷移（2026-07-18）
- manifest／icons／Service Worker 設定完善
- 部署平台由 GitHub Pages 改為 Vercel（`kotoba-delta.vercel.app`）

### ✅ Phase 6：統計與備份（2026-07-19）
- 統計頁（近 30 天複習量圖表、等級進度、連續學習天數）
- 深色模式、IndexedDB 資料備份匯出/匯入（JSON 檔）

### ✅ Phase 6.5：瀏覽歷史整合（2026-07-19）
- `history.pushState`-based backStack 機制，讓系統返回鍵/手勢可逐層退回 app 內部畫面，而非直接離開整個 PWA

### ✅ Phase 7 + 修正：發音（2026-07-19）
- 單字/例句發音（Web Speech API），純文字由 furigana segment 的第一元素拼回
- 修正加入語速調整設定（慢/標準/快）

### ✅ Phase 8：個人筆記（2026-07-19）
- 單字/文法個人筆記：文字 + 最多 4 張圖片，圖片存 Blob 於獨立的 `noteImages` 表

### ✅ Phase 9：文法搜尋 + 獨立筆記本（2026-07-19）
- 文法搜尋（比照單字瀏覽頁的搜尋體驗）
- 獨立筆記本：不綁定任何單字/文法項目的自由筆記

### ✅ Phase 10：每日教材（2026-07-20～21）
- 本地組裝「今日學習包」：依主要學習等級抽新字/新文法/快忘清單，日期當種子確定性抽選，飛航模式可用
- AI 短文層（`api/daily-material.ts` serverless function）：通行碼驗證、每日次數上限、呼叫 Anthropic 生成短文，結果快取進 IndexedDB
- **部署事故**：連續踩到三個 Vercel 陷阱（跨目錄 import 抓不到檔案、`.ts` 副檔名 import 執行期失敗、handler 簽名誤用 Web 標準 Request/Response 而非 Node 式 `(req,res)`），最終確立「`api/` 必須完全自足」的鐵律，見下方架構決策 #4

### ✅ Phase 10.5：教材內容擴充（2026-07-22）
- 學習包單字/文法補上例句（零成本，資料本來就在既有 JSON，純顯示層改動）
- AI 短文新增文法解析（`grammarNotes`）：引用短文中實際出現的原句，伺服器端逐字驗證過濾非逐字引用的內容，不觸發整體重試
- 快取鍵加入內容版本號機制（`:v2`），見下方架構決策 #5

### ✅ Phase 10.6：例句翻譯顯示（2026-07-23）
- 實查發現例句從未有過逐句繁中翻譯欄位（只有英文），與使用者確認後改用英文 fallback，未新增管線翻譯步驟
- 文法解析引用句新增專屬繁中翻譯（`grammarNotes[].zh`，只譯該句非整篇節錄）
- 快取版本號遞增至 `:v3`

### ✅ Phase C0：雲端同步前置——資料規模盤點（2026-07-25）
- 臨時 DEBUG 診斷工具（`src/features/debug/DataInventoryDebug.tsx`，掛在統計頁底部，**已於 Phase C5 移除**）：統計 7 張 IndexedDB 表筆數、`noteImages` 圖片總數/總大小/單張最大值、非圖片資料的 JSON 序列化大小估計
- 純讀取顯示，不修改任何資料；程式碼集中單一檔案，之後易於整段移除
- 為雲端同步方案與成本評估提供實測資料規模依據，本身不做任何同步邏輯

### ✅ Phase C1：接主站 Supabase + 帳密登入（2026-07-26）
- 安裝 `@supabase/supabase-js`，`src/db/supabase.ts` 建立 client，共用主站 Supabase 專案的 Auth（同一組帳密）
- 登入頁（email/password → `signInWithPassword`）、`useAuthSession()` hook（`onAuthStateChange` 反應式更新）、首頁顯示登入 email + 登出按鈕
- 本階段僅驗證 Auth 本身可用，**不接任何資料同步**——見下方架構決策 #7
- **開發時發現並修正一個嚴重的離線優先違規**：`createClient()` 在環境變數缺漏時會同步拋錯，而 `src/db/supabase.ts` 原本在模組層級無條件呼叫它、又被首頁無條件 import，等於「只要沒設定 Supabase 環境變數，整個 app 一載入就白屏」——不只是登入功能失效，是所有功能全滅。修正為 `supabase: SupabaseClient | null`（環境變數缺任一個就是 `null`），`useAuthSession()`/`LoginPage.tsx`/`HomePage.tsx` 對應加上 null 防護，在 dev server 用今天實際尚未設定 `.env` 的環境驗證過修正前會崩潰、修正後不會

### ✅ Phase C2：kotoba 資料表 + RLS（2026-07-26）
- 在主站 Supabase 專案（ref `ltmrkdldmgysczfnidra`）建立 6 張 `kotoba_` 前綴資料表：`kotoba_cards`／`kotoba_review_logs`／`kotoba_queued_items`／`kotoba_notes`／`kotoba_standalone_notes`／`kotoba_settings`，欄位對應 IndexedDB 現有結構，每張表加 `updated_at`（timestamptz，C3 同步「最後寫入勝」依據）
- 主鍵設計：有天然邏輯鍵的表（`cards`/`queued_items`/`notes`）沿用本地複合鍵 `(item_type, item_id)`；沒有天然鍵的表（`review_logs`/`standalone_notes`，本地是裝置內 auto-increment 整數、跨裝置必撞）改用 `uuid`（`gen_random_uuid()`），本地 id 與遠端 uuid 目前並存，對應邏輯留給 C3
- 此階段只建表與 RLS，不接前端、不做任何同步邏輯（純後端結構）
- **規劃階段的錯誤**：原本假設主站現成的 `public.is_admin()` helper function 存在，直接寫進 RLS policy——使用者實際執行時才發現這個函式根本不存在（文件推斷有誤）。改為 RLS 直接用 `auth.uid() = 固定 uid` 判斷，不依賴任何主站 helper function，kotoba 的權限模型完全自成一格
- 六張表的 RLS 全部啟用，四個操作（SELECT/INSERT/UPDATE/DELETE）都限本人，連 SELECT 都不對外開放——學習資料視為純私人資料

### ✅ Phase C3a：同步引擎——push（本地推送到雲端）（2026-07-26）
- 新增 `syncQueue` outbox 表：六類本地資料（cards/reviewLogs/queuedItems/notes/standaloneNotes/settings）寫入時記錄待同步標記，debounce 5 秒後批次 push 到對應 `kotoba_*` 表；未登入/離線/連不上時靜默跳過，絕不依雲端狀態刪改本地資料
- `reviewLogs`/`standaloneNotes` 本地是裝置內 auto-increment 整數、跨裝置會撞，改用 client 端產生的 uuid（`remoteId`）當遠端主鍵；Dexie v7 遷移回填既有資料的 `remoteId` 並整批排入同步佇列，讓既有使用者登入後舊資料也會逐步推上雲
- **離線指示修正**：原本純被動依賴 `navigator.onLine`（部分瀏覽器尤其 iOS Safari 不可靠），後改回被動雙訊號判定，佇列非空時優先顯示待同步數而非離線標籤
- 已在 iPhone Safari 正式站真機驗收通過

### ✅ Phase C3b：同步引擎——pull（雲端拉取到本地）（2026-07-27）
- 新增 `pullRemoteChanges()`：六張表各自獨立 try/catch 從 `kotoba_*` 拉取，依 `updated_at` 做 last-write-wins 比對（本地沒有則新增、遠端較新才覆蓋、本地較新或相等一律保留本地）；`reviewLogs` 只用 `remoteId` 判斷是否已存在，不做時間比較
- 絕不刪除本地資料——結構上完全不存在對六張表呼叫 `.delete()`/`.clear()` 的路徑；所有寫入直接呼叫 `db.X.put()`/`.add()`，完全繞過 `enqueueSync()`，避免 pull 覆蓋本地後又把同一筆重新推回雲端造成迴圈
- **前置修正**：push 送往雲端的 `updated_at` 原本來自 `syncQueue` 佇列項自己的暫存時間戳，push 成功後就消失，本地完全沒有留下「上次何時修改」的紀錄，pull 的 last-write-wins 比對無從比起。改為 `cards`/`settings` 新增持久化的 `updatedAt` 欄位（schema v8，既有資料回填為遷移當下時間）；`queuedItems` 借用既有 `addedAt`；`reviewLogs` 借用 `review` 時間——push 與 pull 現在共用同一組本地欄位當作 `updated_at` 的權威來源
- 觸發時機：app 啟動、登入、回前景、恢復網路，一律先 pull 再 push（`syncNow`）；寫入後 debounce 觸發維持純 push，不牽動 pull
- 雙裝置驗證通過：文字類資料（cards/reviewLogs/queuedItems/notes/standaloneNotes/settings）雙向同步已打通。驗證過程中發現一則裝置間 notes 差異，追查後確認是「其中一裝置本地刪除但雲端保留」的**預期行為**（C3b 明確排除刪除同步），非 bug——刪除同步現況見下方「待決事項」
- **驗收流程教訓**：本次一度誤判 pull 有 bug，追查後發現是 pull 的 commit 完成後忘記 push/部署，正式站上跑的還是舊版——教訓已寫入 CLAUDE.md 累積規則

### ✅ Phase C4a：圖片上傳同步（本地 → Supabase Storage）（2026-07-27）
- `noteImages` 表擴充 `remoteId`（client 端 uuid，Storage 物件檔名）與 `storagePath`（成功上傳後才填入，其存在與否即代表「已上傳」狀態，無需額外 boolean 欄位）；schema v9
- Storage 路徑安全鍵：`itemId` 可能含全形括號/波浪號/空格等人類可讀字元（grammar 標題），不能直接組進路徑。改用 `${itemType}/{sha256(itemId).slice(0,16)}/{remoteId}.jpg`（單字/文法筆記，純函式雜湊，任何裝置可獨立重算）與 `standalone/{該筆記的 remoteId}/{remoteId}.jpg`（獨立筆記，用筆記自己的跨裝置穩定 uuid，不用本地 auto-increment id）
- 上傳觸發時機與文字 push 共用同一顆 debounce；待上傳圖片數併入同一個「N 筆待同步」計數（本地零成本可算，與下載積壓不同，見 C4b）
- **踩過的雷**：最初直接用 `noteKey`（含原始 `itemId`）組路徑，grammar 特殊字元導致上傳全部回 400；獨立筆記另外發現用本地 auto-increment id 組路徑也不穩定（跨裝置 pull 會產生新的本地 id）。兩者皆已修正，詳見 CLAUDE.md 累積規則「itemId 離開本地主鍵用途前必須先轉安全鍵」一條

### ✅ Phase C4b：圖片下載同步（Supabase Storage → 本地）+ 獨立筆記本加圖 UI（2026-07-28）
- 補上獨立筆記本缺少的「加入圖片」入口（資料層本就支援，純 UI 缺口：加圖按鈕原本要求筆記已存檔才顯示，比照 Phase 8 單字/文法筆記改為未存檔也能顯示，選圖時自動代為建立筆記）
- `downloadPendingImages()`：重用 C4a 的路徑雜湊規則反查雲端資料夾，`.list()` 列出檔名、以圖片 `remoteId` 全域去重、下載後 `storagePath` 立即填入（與 uploadPendingImages 判斷「待上傳」用同一個欄位，自然防止 pull→upload 迴圈，不需額外旗標）；絕不刪除本地既有圖片
- 私有 bucket 顯示不需要 signed URL：`.download()` 本身就是用目前 session 認證直接回傳 Blob，顯示端本來就只用本地 Blob（`URL.createObjectURL`），不需改動
- **三個真實 bug**（依序修正，過程見對應 commit）：
  1. `noteImages` 表缺 `remoteId` 索引（C4a 只 backfill 欄位沒建索引）——下載端的全域去重查詢因此靜默失敗，schema 補到 v10
  2. 無痕視窗下 `refreshPendingCount()` 在 schema migration 完成前就存取 object store，拋 `NotFoundError`——新增 `dbReady`（`db.open()` 的顯式 await 訊號），該函式與 `runSync`/`runPushOnly` 都改為等它、失敗安全預設空值
  3. 無痕視窗下載圖片寫入 IndexedDB 失敗（`DexieError: Error preparing Blob/File data to be stored in object store`）——Chrome 無痕視窗的 IndexedDB 無法對「直接由網路回應支撐」的 Blob 做 structured clone，改用 `new Blob([await blob.arrayBuffer()], {type})` 重新包裝後解決
- 這三個 bug 的除錯過程本身也留下教訓（測試 mock 深度、dev server 版本確認、靜默 catch 的危害），已寫入 CLAUDE.md 累積規則，不在此重複
- 正式站真機雙裝置驗證通過：圖片雙向同步（上傳+下載）全部打通

### ✅ Phase C5：雲端同步收尾（2026-07-28）
- 移除 Phase C0 的臨時 DEBUG 資料盤點工具（`src/features/debug/`整個目錄 + `StatsPage.tsx`/`index.css` 的對應引用），當初設計成集中單一資料夾即為了此刻能整段移除
- 首頁同步狀態旁新增一句使用者可見說明：「同步採最終一致：資料在 app 啟動或回到前景時對帳，非即時」，避免「切回才更新」被誤認為 bug
- 修正兩個收尾發現的問題：獨立筆記本存檔後未自動返回列表（`handleSave()` 原本沒有導航）；`visibilitychange` 在 iOS Safari/WebKit 上對「已加到主畫面的 standalone PWA 從背景切回前景」時常不觸發（已紀錄的已知限制），加上 `window focus`/`pageshow` 兩個更可靠訊號互為備援
- 本文件完整歸檔雲端同步工程（本節其餘條目 + 下方架構/資料層/Supabase 資源章節）

---

## 二、關鍵架構決策與理由

1. **例句假名注音用 segment 編碼，不用 ruby HTML 字串**（Phase 4.5）
   `FuriganaSegment = [text] | [text, reading]` 是純資料，前端用 `JapaneseSentence.tsx` 組出 `<ruby>`，不需要 `dangerouslySetInnerHTML`、沒有 HTML 注入風險；同一份 segment 資料也直接拿來組發音用的純文字（`segment[0]` 依序拼接），一份資料兩種用途，AI 短文（Phase 10）沿用同一格式。

2. **項目標記「已熟悉」（suspend）而非刪除**（Phase 3.5 起）
   `suspendCard`/`resumeCard` 只切換 `suspended` flag，FSRS 排程與複習歷史完整保留在原本的 `cards` 列；恢復複習時接續原排程，不會因為誤觸「已熟悉」而遺失進度。

3. **今日學習包本地組裝，AI 只負責短文**（Phase 10）
   單字/文法/例句資料品質已經足夠好且已在本機，本地確定性抽選（日期當種子的 seeded shuffle）零成本、飛航模式可用；AI 的價值在「生成一篇全新短文」這種本地資料做不到的事，把 API 成本與失敗風險限縮在真正需要它的地方。

4. **`api/` 目錄下的檔案必須完全自足，禁止任何相對 import**（Phase 10 部署事故後確立）
   Vercel 的 Node function builder 只打包 `api/` 內的檔案，且不處理 `.ts` 副檔名的 import specifier——連續踩雷才發現。最終型別直接內聯進 `api/daily-material.ts`，寧可手動維護與 `src/shared/dailyMaterialTypes.ts` 兩份重複定義，也不要有任何本地看似合法、部署卻會炸的 import。詳見該檔案檔頭註解。

5. **快取鍵內嵌內容版本號，不做欄位遷移**（Phase 10.5 起）
   `dailyMaterialCache` 的主鍵格式是 `${date}:${level}:v${N}`，回應格式一變動就把 N +1，舊格式的列直接變成查不到的孤兒資料，前端「沒快取→重新生成」的既有邏輯自動接手，不需要另外寫遷移或防禦性欄位補完邏輯（讀取端仍保留 `?? []`/`?.` 防禦，屬多一層保險，非依賴此機制本身）。

6. **不自行實作 SRS 排程演算法**（CLAUDE.md 既定原則）
   `ts-fsrs` 是成熟函式庫，`gradeItem`/`toFsrsCard`/`scheduler.get_retrievability` 全部委派給它，本專案程式碼只負責資料存取與呼叫時機。

7. **Auth 與資料同步分兩階段**（Phase C1）
   先驗證登入本身可用（能登入、能登出、能記住登入狀態），資料同步邏輯留到後續 Phase 才做。避免一次把「離線優先」的核心承諾跟雲端依賴綁在一起——這次的改動已經證明了風險是真實的（見上方 Phase C1 條目：env var 缺漏一度會讓整個 app 崩潰），分階段能把每一步的風險範圍縮到最小、獨立驗證。

---

## 三、資料層現況

**Dexie（IndexedDB）**：`DB_SCHEMA_VERSION = 10`（見 `src/db/schema.ts`），9 張表：

| 表 | 用途 |
|---|---|
| `cards` | FSRS 卡片狀態（含 suspended flag、`updatedAt`），複合主鍵 `[itemType+itemId]` |
| `reviewLogs` | 每次複習的評分紀錄，`remoteId`（client 端產生的 uuid）為雲端主鍵 |
| `settings` | 全域設定（等級、假名開關、主題、語速、每日新卡上限、`updatedAt`） |
| `queuedItems` | 已加入複習但尚未首次評分的項目（`addedAt` 兼作同步用的最後修改時間） |
| `notes` | 單字/文法個人筆記文字，複合主鍵 `[itemType+itemId]` |
| `noteImages` | 筆記圖片 Blob（單字/文法筆記與獨立筆記本共用，`noteKey` 字串關聯），`remoteId`（已建索引，C4b 圖片下載全域去重用）為 Storage 檔名、`storagePath` 存在與否即代表「已上傳/已下載」 |
| `standaloneNotes` | 獨立筆記本，`remoteId` 為雲端主鍵 |
| `dailyMaterialCache` | AI 短文快取，主鍵 `dateLevel`（含版本號後綴），**排除於備份之外**（可重新生成，非珍貴資料） |
| `syncQueue` | Push outbox，記錄待同步的 `(table, key, op)`，**排除於備份之外**（操作性佇列，非使用者內容） |

`cards`/`reviewLogs`/`queuedItems`/`notes`/`standaloneNotes`/`settings` 六張表雙向同步到 Supabase 的 `kotoba_*` 表；`noteImages` 走 Storage bucket `kotoba-note-images`（上傳 C4a、下載 C4b，同樣雙向）；只有 `dailyMaterialCache`（可重新生成的快取）不同步。

**跨筆 invariant 檢查**（`pipeline/emit.ts` 寫檔後執行，非單筆 zod schema 能捕捉）：
- 文法 id 全域唯一（違反即中止管線）
- 單字 id 若跨檔重複，代表單字本身欄位（不含 `level`/`sentences`）須逐筆比對一致

**內容資料**（`public/data/*.json`，管線產物，已 commit）：`VocabEntry`/`GrammarEntry`/`GradedSentence` 型別定義於 `src/shared/contentTypes.ts`。粗略規模：vocab 每等級 700–2700 筆、grammar 每等級 136–245 筆，總計約 23MB。真實資料樣本：

```json
{
  "jp": "図書館にたくさんの本があります。",
  "en": "There are many books in the library.",
  "difficulty": 1,
  "jpSegments": [["図書館","としょかん"], ["にたくさんの"], ["本","ほん"], ["があります。"]]
}
```

`GradedSentence` **沒有**逐句繁中翻譯欄位（Phase 10.6 實查確認，只有 `en`）；繁中翻譯目前只到「單字釋義」（`meaningZh`）與「文法解說」（`zhShort`/`zhLong`）這兩個較粗的層級。

---

## 四、已知限制

完整內容見 [pipeline/KNOWN_ISSUES.md](pipeline/KNOWN_ISSUES.md)（8 條，含現象/影響/暫不處理理由），這裡只列標題：

1. 片假名外來語 fallback 一律估為 L3，可能高估一級
2. 形式名詞「の」等被當實詞計入
3. N2／N1 單字例句覆蓋率偏低（65.8%／68.9%）
4. 同一單字跨等級共用 id（29 筆，N3/N2，已稽核內容一致）
5. 新卡來源等級寫死 N5（`queue.ts`，Phase 4.5 後可用「目前主要學習等級」手動繞過但未整合進自動池）
6. kuroshiro 對特定句子轉換時 crash（單句 fallback 為無注音，不影響管線其餘部分）
7. 自動注音固有誤標限制（統計式形態素分析器的固有限制）
8. 每日教材 AI 短文的注音由模型直接輸出，偶有錯讀（已知並接受）

---

## 五、環境與部署

**正式站**：https://kotoba-delta.vercel.app（Vercel zero-config Vite preset，push `main` 自動重新部署）

**環境變數**（Vercel 專案設定：kotoba → Settings → Environment Variables）：

| 變數 | 用途 | 範圍 |
|---|---|---|
| `ANTHROPIC_API_KEY` | `api/daily-material.ts` 呼叫 Anthropic API | 僅 serverless function（後端），前端絕不可見 |
| `DAILY_SECRET` | 每日教材通行碼比對（`X-Daily-Passcode` header） | 同上 |
| `VITE_SUPABASE_URL` | Supabase 專案 URL（`src/db/supabase.ts` 建立 client 用） | 前端可見（Vite `VITE_` 前綴變數會被打包進前端 bundle，這是預期行為——Supabase anon key 本來就設計成可公開） |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | 同上 |

三環境驗收規則（完整版見 CLAUDE.md 累積規則，此為摘要）：
- **dev**（`npm run dev`）：本地 Vite dev server **無法執行 `api/*.ts`**（Vercel 專屬 serverless 環境），只能驗證離線可用的部分（本地組裝層、UI 狀態機、錯誤/降級路徑）
- **production**：唯一能真正驗證 `api/` serverless function 的環境；任何請使用者驗收的訊息，必須明確標示測試環境與網址，未部署的修復不得請使用者在正式站驗收
- 涉及捲動/觸控/版面的修改，自我驗證須包含 DevTools 響應式模式並在回報中註明實際驗證環境（桌面／DevTools 模擬／真機）

**IndexedDB 資料是網域鎖定的**——部署網域不得隨意更換，換網域等同使用者複習進度全部遺失（詳見 CLAUDE.md）。

**連主站 Supabase**（Phase C1 起，Phase C2 建表，Phase C5 收尾歸檔）：
- 專案 ref：`ltmrkdldmgysczfnidra`（主站專案，與 kotoba 共用）
- Auth 與主站共用同一個 Supabase 專案——同一組 email/password 在 kotoba 與主站都能登入
- **RLS 不依賴 `is_admin()`**——Phase C1 原文件推斷主站有現成的 `public.is_admin()` helper function 可用，Phase C2 實際操作時發現它不存在。所有表與 bucket 的 RLS 都改用 `auth.uid() = 固定 uid` 直接判斷，不依賴任何主站 helper function
- `supabase` client（`src/db/supabase.ts`）在 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` 任一缺漏時是 `null`（不會讓 app 崩潰），此時登入與同步功能不可用但其餘既有功能不受影響——這是 offline-first 承諾的直接延伸，不只涵蓋離線，也涵蓋「雲端服務尚未設定/連不上」

**雲端同步架構總覽**（C1–C4b 建立，C5 收尾確認）：
- **IndexedDB 為主儲存，雲端只是同步層**：app 全功能永遠以本地 IndexedDB 為準，雲端資料庫/Storage 純粹是「多裝置之間互相補齊」的媒介，任何時候拔網路、登出、Supabase 整個掛掉，app 既有功能都不受影響（只是不會再有新資料進來/出去）
- **最終一致（eventual consistency），非即時同步**：沒有 realtime 訂閱，全部靠「觸發時對帳」——app 啟動、登入、回到前景（`visibilitychange`/`focus`/`pageshow`）、恢復網路時觸發一次 `pull → push`，寫入後 debounce 5 秒觸發一次純 `push`。兩裝置間的資料一致，要等其中一方觸發同步才會發生，不是寫入當下就跨裝置可見
- **衝突解法是 last-write-wins**：每張表都有自己持久化的「最後修改時間」欄位（`cards`/`settings` 的 `updatedAt`、`queuedItems` 的 `addedAt`、`notes`/`standaloneNotes` 的 `updatedAt`），pull 時本地與遠端這個時間戳嚴格比較，遠端較新才覆蓋、本地較新或相等一律保留本地；`reviewLogs`（純新增歷史）與圖片（`noteImages`，全域 `remoteId` 去重）不比時間，只看本地是否已存在
- **pull 絕不刪除本地資料**——六張表 + 圖片下載，程式碼裡結構上不存在對它們呼叫 `.delete()`/`.clear()` 的路徑；雲端缺某筆本地有的資料，一律視為「還沒推上去」而非「該刪除」

**Supabase 資源清單**：

| 資源 | 類型 | 用途 | RLS |
|---|---|---|---|
| `kotoba_cards` | 表 | FSRS 卡片狀態 | `auth.uid() = 固定 uid`，SELECT/INSERT/UPDATE/DELETE 皆限本人 |
| `kotoba_review_logs` | 表 | 複習評分歷史（append-only） | 同上 |
| `kotoba_queued_items` | 表 | 已加入複習、尚未首評的項目 | 同上 |
| `kotoba_notes` | 表 | 單字/文法個人筆記文字 | 同上 |
| `kotoba_standalone_notes` | 表 | 獨立筆記本 | 同上 |
| `kotoba_settings` | 表 | 全域設定 | 同上 |
| `kotoba-note-images` | Storage bucket（私有） | 筆記圖片二進位內容 | 同上（bucket policy 綁同一組固定 uid，非公開 bucket） |

六張表皆為 Phase C2 所建；bucket 為 Phase C4a 所建。`kotoba_` 前綴與主站既有表完全隔離；連 SELECT 都不對外開放，學習資料視為純私人資料。

---

## 六、已知限制與待決事項

**同步本身的已知限制**（設計如此，非 bug）：
- **最終一致、非即時**：見上方「雲端同步架構總覽」——不要把「切到另一裝置沒有立刻看到剛剛的變更」誤判成同步壞了，等下一次觸發（回前景/重開）即可
- **離線佇列補推**：離線或推送失敗時，變更留在本地 `syncQueue`（文字）／`noteImages.storagePath === undefined`（圖片）佇列裡，UI 顯示「N 筆待同步」，下次任何觸發時機都會自動重試，不需要使用者手動介入

**待決事項**：
- **刪除同步（tombstone）尚未實作**：C3a/C3b 明確排除刪除同步——單一裝置刪除的資料（筆記、卡片等）不會傳播到其他裝置，且下次 pull 時會從雲端重新拉回本地（因為 pull 的規則是「本地沒有就新增」，無法區分「本地從未有過」與「本地曾經有、被使用者主動刪除」）。雙裝置驗證中已實際遇到一次（裝置刪除的筆記從雲端 pull 回來），確認是此限制的預期行為，非 bug。使用者評估中，尚未決定是否要做（若要做需另外設計 tombstone 機制，記錄「這筆已被誰在何時刪除」，不是本次 C3a/C3b 範圍）。

**雲端同步關鍵教訓**（已寫入 CLAUDE.md 累積規則，此處僅列標題並指向）：
- fetch 來的 Blob 存進 IndexedDB 前必須重新包裝（`arrayBuffer()`），否則無痕視窗等環境 structured clone 會失敗
- `itemId` 離開本地主鍵用途、進到 Storage 路徑等外部系統前必須先轉安全鍵（grammar id 含特殊字元，已踩過兩次）
- PWA 正式站 Service Worker 快取、本機 dev server process 存活時間，都是「改了沒生效」的常見成因，驗收前務必先排除
- 規劃跨專案共用資源（如 `is_admin()`）如果只憑文件推斷、沒有實際查證，必須在方案裡明確標示「未驗證」
- 測試全過但真機壞掉時，優先懷疑 mock 只驗到「呼叫了 API」、沒驗到「真正的副作用發生了沒有」

---

## 七、開始新任務的指令

給新的 Claude 對話：

「請先閱讀本專案根目錄的 CLAUDE.md 與 PROJECT_PROGRESS.md，了解專案規則、
架構決策與目前進度後，再開始執行任務。」
