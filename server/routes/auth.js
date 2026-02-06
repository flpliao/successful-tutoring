const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const { account, password } = req.body;
    if (!account || !password) {
      return res.status(400).json({ error: '請輸入帳號和密碼' });
    }

    const db = getDb();
    const result = db.exec("SELECT * FROM users WHERE account = ?", [account]);

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(401).json({ error: '帳號或密碼錯誤' });
    }

    const row = result[0].values[0];
    const cols = result[0].columns;
    const user = {};
    cols.forEach((col, i) => user[col] = row[i]);

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: '帳號或密碼錯誤' });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });

    res.json({
      token,
      user: {
        id: user.id,
        account: user.account,
        name: user.name,
        role: user.role,
        class_name: user.class_name
      }
    });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤: ' + err.message });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
