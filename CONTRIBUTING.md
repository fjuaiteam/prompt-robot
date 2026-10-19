# 協作流程

本倉庫採 [團隊 Git 手冊](https://github.com/fjuaiteam/team-git-handbook) 的 GitHub Flow。

1. 檢查工作樹、remote 與分支，從最新 `main` 開 `feat/`、`fix/`、`docs/` 或 `chore/` 短期分支。
2. 保持任務範圍，確認素材權利與資料範圍，執行 README 的相關驗證。
3. 逐檔 stage，檢查完整 staged diff 與 `git diff --check`。
4. 使用繁體中文提交標題，例如「新增(系統): 匯入提示詞教學平台與易學版」。
5. 核對目標為 `fjuaiteam/prompt-robot` 與自己的工作分支，再 push 並開 PR。
6. PR 說明目的、變更、實際驗證、未驗證部分、風險及回復方式。
7. 至少一位非作者審查且解決對話後，由人類維護者合併。agent 不自我核准或合併。

不得公開倉庫、擴大素材授權、調整團隊權限、force push 或改寫共用歷史。分支保護受方案限制時採人工審查，不假設平台已強制執行。
