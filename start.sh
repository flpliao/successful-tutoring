#!/bin/bash
echo "🚀 啟動補課預約系統..."
echo ""
cd "$(dirname "$0")/server"
node index.js
