# 推送到 GitHub 教學

## 前置條件
- 已安裝 Git（https://git-scm.com/downloads）
- 已安裝 Node.js（https://nodejs.org）

## 步驟（在終端機/命令提示字元中執行）

### 1. 打開終端機，進入專案資料夾
```bash
cd "Successful Tutoring Class"
```

### 2. 初始化 Git 並推送
複製以下整段指令，貼上到終端機中執行：

```bash
git init
git checkout -b main

echo "node_modules/" > .gitignore
echo "data.sqlite" >> .gitignore
echo ".env" >> .gitignore

git add .
git commit -m "初始版本：補課預約系統"
git remote add origin https://github.com/flpliao/successful-tutoring.git
git push -u origin main
```

如果出現登入提示，輸入你的 GitHub 帳號和 Personal Access Token（不是密碼）。

### 3. 取得 Personal Access Token（如果需要）
1. 到 https://github.com/settings/tokens
2. 點 "Generate new token (classic)"
3. 勾選 "repo" 權限
4. 點 "Generate token"
5. 複製 token，在 push 時當作密碼輸入

## 推送成功後
到 https://github.com/flpliao/successful-tutoring 確認檔案都在。
接著就可以到 Render 部署了（見 DEPLOY_GUIDE.md）。
