# 提示詞機器人

提供工作人員教學、易學版圖卡選擇、讀物與影片提示詞產生，以及文件轉易讀指令的純前端系統。

## 開始使用

下載或 clone 整個倉庫，直接開啟 `index.html`；案主使用可開啟 `易學版.html`。請保留 `assets/` 的相對位置。

開發時可使用 Python 3 啟動本機服務：

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

開啟 <http://127.0.0.1:8765/>。不需要安裝 npm 套件或提供 API 金鑰。連線到外部 AI 服務時需網路及使用者自己的帳號。

## 功能

- 工作人員版：四大原則、指令產生器、教學資源、疑難排解與範例。
- 易學版：以圖片回答九個問題，再將選擇組成繪圖提示詞。
- 工程模式：易學版首頁下方進入，可更換圖片及新增自訂圖卡。
- 文件轉易讀：準備改寫指令，使用者再到 ChatGPT 附上文件並送出。
- AI 交接：複製提示詞並嘗試用網址帶入 ChatGPT；仍須由使用者確認與送出。

工程模式與進度保存在目前瀏覽器，不會同步到 GitHub 或其他裝置。網址帶入可能因外部服務登入、介面或網址長度而失效，可改用貼上。

## 專案結構

| 路徑 | 用途 |
| --- | --- |
| `index.html`、`易學版.html` | 系統入口與易學版捷徑 |
| `assets/app.js`、`assets/data.js` | 工作人員版邏輯與教學資料 |
| `assets/easy.js`、`assets/easy-data.js` | 易學版與工程模式 |
| `assets/read.js` | 文件轉易讀指令流程 |
| `assets/*.css` | 既有介面樣式 |
| `assets/easy/pics/` | 圖卡、人物照片及來源標示 |
| `assets/book/`、`assets/sample/` | 系統內建教學範例 |
| `assets/fonts/`、`assets/vendor/` | 離線字型與第三方程式 |
| `使用說明.txt`、`改版紀錄.md` | 操作說明與既有改版紀錄 |

## 資料範圍與授權

倉庫用途為 fjuaiteam 私有協作，owner 為 **fjuaiteam**，預設分支為 **main**，維護狀態為持續維護。

允許提交系統原始碼、文件、空白模板、必要的內建教學範例，以及附來源授權的執行素材。2026-10-16 使用者已確認內含業師講義提示詞可連同本系統上傳至此私有倉庫供團隊協作。

禁止提交帳密、金鑰、Cookie、使用者文件、個資、瀏覽器存檔、log/cache、測試截圖、任意生成成品與未授權來源附件。根目錄教學影片和簡報保留本機，不納入版本控制。

本專案未授予整體開源或商用授權。內建教材供團隊協作；公開或擴大散布須另確認權利。第三方素材依各自授權使用，詳見 [素材與授權說明](THIRD_PARTY_NOTICES.md)。其中 ARASAAC 圖卡限非商業用途，須保留來源與相同方式分享條件。

## 驗證

Node.js 可用時執行：

```powershell
node --check assets/app.js
node --check assets/data.js
node --check assets/easy.js
node --check assets/easy-data.js
node --check assets/read.js
node --check assets/orb.js
git diff --check
```

介面修改需檢查工作人員版、易學版九題、工程模式圖卡、重新整理後保存，以及窄螢幕有無溢出。現有驗證紀錄見 `改版紀錄.md`；外部 AI 的實際接收與登入結果須使用團隊帳號另行確認。

## 協作

遵循 [團隊 Git 手冊](https://github.com/fjuaiteam/team-git-handbook)、[本專案協作流程](CONTRIBUTING.md) 與 [AGENTS.md](AGENTS.md)。從最新 `main` 建立短期分支，推送工作分支後開 PR；至少一位非作者審查，不由 agent 自行核准或合併。

GitHub 建立時的初始 README 是 `main` 的起點；系統匯入使用 `feat/initial-system` 分支。2026-10-16 嘗試設定 main 保護時，GitHub 因組織方案限制回覆 HTTP 403，無法強制啟用。目前採人工 PR 審查流程，不設定不存在的 CI checks，並維持 Private。
