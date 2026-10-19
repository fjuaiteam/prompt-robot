# 提示詞機器人

供工作人員準備教材、帶領圖卡活動，以及產生讀物、影片與易讀改寫指令的純前端系統。Owner：**fjuaiteam**；Private；維護中。

## 資料夾

```text
提示詞機器人/
├─ index.html       版本選擇入口
├─ v1/              改版前的完整系統，原樣保存
├─ v2/              任務與活動流程新版，後續開發在這裡
└─ 資源/            本機影片、簡報、UX 報告與測試紀錄
```

Git 治理文件與 .git 保留在根目錄。資源內的影片、簡報與測試輸出不提交至 Git，只提交資源索引。

## 使用

直接開啟根目錄 `index.html` 選版本，或開啟 `v2/index.html`。易學版可直接開啟 `v2/易學版.html`。下載時請保留整個版本資料夾。

開發預覽可在根目錄執行：

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

v1：<http://127.0.0.1:8765/v1/>；v2：<http://127.0.0.1:8765/v2/>。

無 npm 安裝需求，不需要 API 金鑰；連接外部 AI 仍需網路與使用者帳號。AI 交接會複製指令並嘗試網址帶入，需使用者確認並送出。

## v2 的改變

- 任務首頁與多份作品清單，支援繼續、切換及匯出作品。
- 產生器分成設定對象、規劃內容、交給 AI、排版與交付檢查；交接與完成狀態由使用者自行確認，修改腳本後會重設。
- 易學版有常用人物卡，也保留逐題自行設定。
- 工作人員先準備活動包，指定人物、場景、畫風與是否保留提示詞教學。
- 圖卡管理支援搜尋、排序、隱藏、使用者預覽，以及整組圖卡／人物／活動匯出與匯入。
- 畫風選項改為同場景的四種成品示例。
- AI 交接後才出現「我看到圖片了」，附開啟／貼上困難的協助。
- 文件直接在 ChatGPT 附上；本站選檔改成選用的檔名辨認功能。

詳細操作見 [v2 說明](v2/README.md)。

## 存檔與資料範圍

v1 與 v2 使用不同的瀏覽器儲存前綴。圖卡、活動與作品存在當前瀏覽器，不會同步到 GitHub；換電腦前請分別匯出作品及圖卡活動備份。移動 file:// 檔案路徑可能影響瀏覽器如何取得舊版存檔；舊資料未刪除，需回原入口匯出後再匯入。

允許提交系統原始碼、文件、空白模板、必要的內建教學範例，以及附來源授權的執行素材。2026-10-16 使用者已確認業師講義提示詞可連同系統上傳至本私有倉庫供團隊協作。

禁止提交帳密、API 金鑰、Cookie、使用者文件、個資、瀏覽器存檔、log/cache、測試截圖、任意生成成品與未授權來源附件。v2 的畫風比較圖是本次功能所需的內建 UI 素材，生成來源記錄在 [素材清單](v2/design-assets-manifest.json)。

本專案未授予整體開源或商用授權。教材公開或擴大散布須另確認權利。第三方素材依 [授權說明](THIRD_PARTY_NOTICES.md) 使用，保留 ARASAAC 的來源、非商業與相同方式分享條件。

## 驗證

```powershell
node --test v2/tests/library.test.cjs
node --check v2/assets/v2.js
node --check v2/assets/app.js
node --check v2/assets/easy.js
node --check v2/assets/read.js
git diff --check
```

已安裝 Playwright CLI 時，可在啟動本機服務後執行 `playwright-cli -s=v2check open http://127.0.0.1:8765/v2/`，再執行 `playwright-cli -s=v2check run-code --filename=v2/tests/browser-check.js`。測試使用隔離分頁，並攔截外部 AI 開窗及複製，不向 AI 送出內容。測試截圖存於本機資源資料夾。

接著執行 `playwright-cli -s=v2check run-code --filename=v2/tests/studio-check.js`，驗證新版工程編輯器、模式入口、未儲存保護及各種字級／視窗尺寸。測試會重建隔離瀏覽器中的 v2 測試資料，不要對個人瀏覽器執行。

最後執行 `playwright-cli -s=v2check run-code --filename=v2/tests/ux-check.js`，覆蓋角色稽核發現的交錯填活動／新增人物、圖卡裁切、求助、同對話交接與作品備份還原。此腳本同樣會重建隔離資料，攔截外部 AI 與剪貼簿。

## 協作

遵循 [團隊 Git 手冊](https://github.com/fjuaiteam/team-git-handbook)、[CONTRIBUTING](CONTRIBUTING.md) 及 [AGENTS](AGENTS.md)。使用短期分支和 PR，由至少一位非作者審查後合併，agent 不自我核准或合併。

預設分支為 main；新系統匯入 PR #1 尚未合併時，v2 分支接續完整的 feat/initial-system，並以該分支為 PR 基底。PR #1 合併後可由維護者將 v2 PR 的基底改為 main。

2026-10-16 GitHub 因組織方案限制回覆 HTTP 403，無法啟用私有倉庫的 main 保護。目前採人工 PR 審查流程，維持 Private。
