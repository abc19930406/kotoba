# kotoba — 日文學習 PWA

個人使用的日文單字與文法學習 PWA。以 JLPT N5–N1 分級單字為主軸，搭配自動分級的例句與文法點，使用 FSRS 間隔重複演算法排程複習。純前端、無後端、部署於 GitHub Pages，主要於手機瀏覽器使用。

## 技術棧

- Vite + React 18 + TypeScript（strict mode）
- SRS：`ts-fsrs`（不得自行實作排程演算法）
- 使用者資料：IndexedDB via `dexie`
- 內容資料：建置期產出的靜態 JSON，位於 `public/data/`，按等級分塊
- PWA：`vite-plugin-pwa`（Workbox）
- 測試：Vitest + @testing-library/react
- 資料管線：Node.js scripts（`pipeline/`），形態素分析用 `kuromoji`
- 部署：GitHub Pages（GitHub Actions）

## 常用指令

```bash
npm run dev          # 開發伺服器
npm test             # Vitest 單元測試
npm run build        # 產出 dist/
npm run pipeline     # 執行完整資料管線（fetch → grade → link → emit）
npm run pipeline -- --translate   # 含繁中釋義生成（需 ANTHROPIC_API_KEY）
```

## 目錄結構

```
pipeline/            # 資料管線（僅建置期執行，不打包進前端）
  fetch.ts           # 下載原始資料至 pipeline/raw/（raw/ 加入 .gitignore）
  grade.ts           # 例句難度自動分級
  link.ts            # 單字↔例句、文法↔例句 對應
  translate.ts       # （可選）呼叫 Anthropic API 生成繁中釋義
  emit.ts            # 輸出 public/data/*.json
src/
  db/                # Dexie schema、FSRS 卡片狀態、review log
  features/
    review/          # SRS 複習流程（核心功能）
    vocab/           # 單字瀏覽：等級/詞性篩選、搜尋、加入複習佇列
    grammar/         # 文法點列表、解說頁、分級例句
    stats/           # 學習統計
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
