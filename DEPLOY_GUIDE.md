# 補課預約系統 - 雲端部署教學

## 方案一：Render（推薦，最簡單）

### 步驟

1. **上傳到 GitHub**
   - 到 https://github.com/new 建立新 repo（例如 `makeup-class-booking`）
   - 把整個專案資料夾上傳（可以直接拖拉上傳或用 git）
   - 專案結構應為：
     ```
     /client/index.html
     /server/index.js
     /server/package.json
     /server/database.js
     /server/middleware/auth.js
     /server/routes/auth.js
     /server/routes/bookings.js
     /server/routes/timeslots.js
     /server/routes/statistics.js
     /server/routes/students.js
     ```

2. **到 Render 部署**
   - 到 https://render.com 註冊/登入（可用 GitHub 帳號）
   - 點 "New" → "Web Service"
   - 連結你的 GitHub repo
   - 設定：
     - **Name**: `makeup-class-booking`（你想取什麼都可以）
     - **Root Directory**: `server`
     - **Runtime**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Instance Type**: `Free`
   - 點 "Create Web Service"

3. **等待部署完成**（約 1-3 分鐘）
   - 完成後會得到一個網址，例如：
   - `https://makeup-class-booking.onrender.com`
   - 把這個網址分享給客戶即可

### 注意事項
- Render 免費方案 15 分鐘沒人用會休眠，重新訪問時需等 30 秒左右啟動
- SQLite 資料在每次重啟後會重置（免費方案不保留磁碟），適合展示用
- 如需持久資料，可升級付費方案或改用 PostgreSQL

---

## 方案二：Railway

1. 到 https://railway.app 用 GitHub 登入
2. "New Project" → "Deploy from GitHub repo"
3. 選擇你的 repo
4. 設定 Root Directory 為 `server`
5. 自動偵測 Node.js，點 Deploy
6. 完成後到 Settings → Networking → "Generate Domain"

---

## 方案三：在自己電腦上跑 + ngrok

1. 安裝 Node.js (https://nodejs.org)
2. 安裝 ngrok (https://ngrok.com/download)
3. 在終端機執行：
   ```bash
   cd server
   npm install
   node index.js
   ```
4. 另開一個終端機：
   ```bash
   ngrok http 3001
   ```
5. ngrok 會給你一個 `https://xxxx.ngrok-free.app` 的網址
6. 把這個網址分享給客戶

---

## 測試帳號

| 角色 | 帳號 | 密碼 |
|------|------|------|
| 管理員 | admin | admin123 |
| 學生 | A123456789 | student123 |
| 學生 | B234567890 | student123 |
| 學生 | C345678901 | student123 |
