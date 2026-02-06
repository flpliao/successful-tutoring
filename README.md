# 補課預約系統 - Makeup Class Booking System

## 快速啟動

```bash
cd server
node index.js
```

然後開啟瀏覽器前往: http://localhost:3001

## 測試帳號

| 角色 | 帳號 | 密碼 |
|------|------|------|
| 管理員 | admin | admin123 |
| 學生 | A123456789 | student123 |
| 學生 | B234567890 | student123 |
| 學生 | C345678901 | student123 |

## 系統功能

### 學生端
- 預約線上補課
- 預約定點補課（總部/大昌）
- 查詢/取消預約

### 管理端
- 時段管理（設定開放時段與電腦數量）
- 預約管理（查詢/新增/修改/刪除）
- 剩餘電腦數量查詢
- 月份缺課統計
- 簽到管理

## 技術架構
- **後端**: Node.js + Express + sql.js (SQLite)
- **前端**: React 18 (CDN) + Vanilla CSS
- **認證**: JWT Token
