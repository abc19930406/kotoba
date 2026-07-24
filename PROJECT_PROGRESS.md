# PROJECT_PROGRESS.md
# kotoba — 日文學習 PWA 進度總覽

> 每次開始新任務前，請先閱讀 CLAUDE.md（專案規則、開發規範、累積規則）
> 與本文件（進度、架構決策、資料層現況），了解目前狀態後再開始執行。

---

## 一、已完成階段（Phase 0–10.6）

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

---

## 三、資料層現況

**Dexie（IndexedDB）**：`DB_SCHEMA_VERSION = 6`（見 `src/db/schema.ts`），7 張表：

| 表 | 用途 |
|---|---|
| `cards` | FSRS 卡片狀態（含 suspended flag），複合主鍵 `[itemType+itemId]` |
| `reviewLogs` | 每次複習的評分紀錄 |
| `settings` | 全域設定（等級、假名開關、主題、語速、每日新卡上限） |
| `queuedItems` | 已加入複習但尚未首次評分的項目 |
| `notes` / `noteImages` | 單字/文法個人筆記 + 圖片 Blob |
| `standaloneNotes` | 獨立筆記本 |
| `dailyMaterialCache` | AI 短文快取，主鍵 `dateLevel`（含版本號後綴），**排除於備份之外**（可重新生成，非珍貴資料） |

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

三環境驗收規則（完整版見 CLAUDE.md 累積規則，此為摘要）：
- **dev**（`npm run dev`）：本地 Vite dev server **無法執行 `api/*.ts`**（Vercel 專屬 serverless 環境），只能驗證離線可用的部分（本地組裝層、UI 狀態機、錯誤/降級路徑）
- **production**：唯一能真正驗證 `api/` serverless function 的環境；任何請使用者驗收的訊息，必須明確標示測試環境與網址，未部署的修復不得請使用者在正式站驗收
- 涉及捲動/觸控/版面的修改，自我驗證須包含 DevTools 響應式模式並在回報中註明實際驗證環境（桌面／DevTools 模擬／真機）

**IndexedDB 資料是網域鎖定的**——部署網域不得隨意更換，換網域等同使用者複習進度全部遺失（詳見 CLAUDE.md）。

---

## 六、開始新任務的指令

給新的 Claude 對話：

「請先閱讀本專案根目錄的 CLAUDE.md 與 PROJECT_PROGRESS.md，了解專案規則、
架構決策與目前進度後，再開始執行任務。」
