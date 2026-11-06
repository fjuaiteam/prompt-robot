# 教育訓練網站與圖片交件

沿用原生前端，Cloudflare Worker 負責登入、收件與權限；D1 保存活動、帳號、工作階段、交件 metadata 和 JPEG BLOB。未啟用 R2、圖片 AI API、付費網域或任何付費訂閱。

## 網址與日常操作

- 正式網站：<https://prompt-robot-training.ooo-training.workers.dev>
- 學員交件：正式網站 `/v2/submit.html`；講師管理：`/v2/admin.html`。
- 隔離預覽：<https://prompt-robot-training-preview.ooo-training.workers.dev>，使用不同 D1 和 secrets。
- 學員帳密由講師產生；首次登入填姓名、組別及活動代碼，確認後由講師更正。學員使用自己的 AI 帳號產圖，下載後回站交件。
- 一人每場一張，重交以最新版本取代。先保存成功才更換，重送同一 request id 不重複計數；舊分頁衝突須重新確認。
- 管理頁可開放／截止活動、建立帳號、重設密碼、停用帳號、搜尋、查看與下載作品。帳密 CSV 僅在產生／重設時提供，請立即保存。
- 學員登入時會看到使用時長記錄告知；頁面每分鐘回報，講師帳號頁可查看每人累計分鐘、登入次數、最近登入，並下載使用時長 CSV。時長依瀏覽器回報估算，離線、瀏覽器關閉或頁面長時間未回報會少計；不記錄逐項操作內容。
- 批次 ZIP 含全部圖片和 CSV，與搜尋條件無關；在講師瀏覽器產生，不向第三方傳送作品。檔名保留唯一帳號，避免同名作品互相覆蓋。
- 作品不自動刪除。先匯出、截止活動，再輸入完整活動代碼確認清空該活動作品；帳號和其他活動保留。

## 資料保護與額度

網站登入頁及其新元件公開；原有教材 HTML／JavaScript／PDF／素材也須登入才能讀取，避免把原本僅授權團隊使用的內容直接公開。Wrangler `assets.run_worker_first` 必須維持 `true`，不可改成只有 `/api/*`。所有受保護回應禁止共用快取。v1 執行檔未修改，離線教材流程保留。

正式與預覽密碼和資料完全分開。Cookie 為 HttpOnly、SameSite=Strict；HTTPS 加 Secure 和 `__Host-` 前綴。密碼為高熵隨機值，以秘密金鑰 HMAC 驗證；登入有 IP 和帳號限流。帳號停用／重設密碼會撤銷其 sessions。提交 API 檢查同源、身分、JPEG 結構／尺寸、大小和活動狀態，禁止跨帳號讀圖。管理密碼僅放 Cloudflare Secrets。

接受原圖 JPEG／PNG／WebP，最多 20 MiB；在瀏覽器轉為長邊最多 2,048 px、最多 1,000,000 bytes JPEG，透明背景白底。應用層所有活動的圖片容量合計上限為 200,000,000 bytes（約 200 MB），由資料庫 trigger 原子檢查；每位學員每場活動限一張、單張最多 1 MB，50 位各交一張最多約 50 MB，重交會替換原圖、不累加容量。此應用層上限不是 Cloudflare 免費方案的 D1 總額度；免費方案額度由同帳號服務共用，超額時請保留圖片稍後重試，不能保證免費服務沒有中斷。

本機 `.deploy/` 內的 secrets、帳密、教學交接、測試報告與截圖，以及 `.dev.vars`、`.wrangler/`、`node_modules/` 都不進 Git。建置僅複製 Git 追蹤的 runtime 白名單及列明的新交件元件，排除本機媒體、使用者資料、tests、docs 和 secrets。

## 本機開發

使用 Node.js 24；已有鎖定的 Wrangler 與 fflate（MIT）。

```powershell
npm ci
npm run build
npm run dev
```

SQLite 開發預覽只監聽 `127.0.0.1:8787`，首次建立 `.deploy/local-secrets.json`（不會輸出密碼）。本機 SQLite 只作開發／測試，不是正式 D1。`npm run dev:cloudflare` 使用 workerd 和獨立本機 D1；須先把本機測試 secrets 寫入忽略的 `.dev.vars`。不得把 production secrets 複製到預覽或本機。

## 部署與 GitHub 自動發布

設定檔已有兩個實際 D1 ID；production 使用頂層設定，preview 使用 `--env preview`。D1 migration 不應隨每個預覽版本指向正式資料庫。既有 migration 不改寫；後續新增編號 migration。

```powershell
npx wrangler d1 migrations apply DB --remote --env preview
npm run deploy:preview
npx wrangler secret bulk .deploy/preview-secrets.json --env preview
```

正式發布須先通過隔離驗收，再對 production 套 migration、設定 secrets 並執行 `npm run deploy`。正式帳號初始化由 `node scripts/prepare-training-event.mjs` 完成，預設活動 `TRAIN1118`；重跑不應重設已發放密碼。新增 `0002_usage_tracking.sql` 時，須先套用 production D1 migration 再部署引用使用時長資料表的 Worker。

Cloudflare Workers Builds 應連接 `fjuaiteam/prompt-robot` 的 `main`：build=`npm run check && npm test && npm run build`，deploy=`npx wrangler deploy`，Node=`24.12.0`。關閉自動分支 Previews，以免複製正式 DB binding；隔離 preview 使用獨立環境手動發布。維持短期分支＋非作者 PR 審查，agent 不自我合併。實際連線證據見本機 `.deploy/github-build-connection.json`；沒有該證據不能聲稱已連接。

2026/11/06 已合併功能 PR #3。使用者在正式 Worker 的 Settings → Builds 連接 `fjuaiteam/prompt-robot`／`main`，並於 GitHub App 的選定倉庫授權加入本倉庫；原有 `pageoutput-web` 授權保留，斷線警告已消失。建置與部署指令如上；須確認 Enable Preview builds 已取消勾選。

連接完成時尚無首次自動建置紀錄，Deployments 仍為先前 Wrangler 手動部署。下一個文件 PR 合併至 `main` 後，應檢查該提交的 Cloudflare check run／建置記錄及實際部署版本，成功後再確認正式網站登入與資料保護。GitHub 授權完成不等於自動部署已驗證；既有 CLI 的 Builds API HTTP 403 也不代表瀏覽器設定的連線失效。

`scripts/connect-cloudflare-git.mjs` 預設僅讀取指定 Worker 與既有 build token metadata，帶 `--connect` 才連接固定倉庫。不會列印 OAuth／build token。若 Cloudflare 回應缺少 Workers Builds 權限，需由帳號擁有者在 Worker 的 Settings → Builds 連接 GitHub；不可把秘密硬寫進 workflow。

## 驗證與課前演練

```powershell
npm run check
npm test
node --test v2/tests/library.test.cjs
```

瀏覽器驗收使用已安裝的 Playwright，設定 `PLAYWRIGHT_PACKAGE` 與需要時的 `PLAYWRIGHT_EXECUTABLE_PATH`，執行 `node v2/tests/training-browser.mjs`。可用 `TRAINING_TEST_URL` 與 `TRAINING_TEST_SECRETS` 指向指定 preview。測試僅允許 localhost／獨立 preview，以免污染正式學員資料。

`scripts/verify-training-service.mjs --url URL --secrets 忽略的JSON檔` 只允許 localhost 或獨立 preview；建立自己的合成活動，50 人同時登入、上傳每張 950 KB、重交，核對 50 張圖片 SHA-256 與權限；結束清除合成圖片並停用測試帳號。不接受正式網址。

可加 `--keep-for-export`，把關閉的合成活動留給瀏覽器測試；再設定 `TRAINING_VERIFY_LARGE_EXPORT=1` 執行瀏覽器驗收，核對 50 張 ZIP／CSV、圖片雜湊，以及相同長姓名的檔名唯一性，結束清空該批圖片。`node scripts/cleanup-preview-tests.mjs` 只會清理這套測試產生的指定名稱／代碼活動，保持正式環境不變。

11/18 前由講師在實際教室電腦、網路演練登入、AI 產圖、下載及交件。雲端負載驗證不能代替現場 AI 帳號可用性與網路演練。

官方依據：[Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)、[D1 限制](https://developers.cloudflare.com/d1/platform/limits/)、[免費查詢額度](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/)。
