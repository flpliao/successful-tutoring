const jwt = require('jsonwebtoken');
const { getPool } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'makeup-class-booking-secret-key-2026';

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '未提供認證令牌' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const pool = getPool();
    const result = await pool.query(
      "SELECT id, account, name, role, class_name, is_suspended, suspended_until FROM users WHERE id = $1",
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: '使用者不存在' });
    }

    const user = result.rows[0];

    // Check suspension
    if (user.is_suspended && user.suspended_until) {
      const now = new Date().toISOString().split('T')[0];
      if (now >= user.suspended_until) {
        await pool.query("UPDATE users SET is_suspended = 0, suspended_until = NULL WHERE id = $1", [user.id]);
        user.is_suspended = 0;
        user.suspended_until = null;
      }
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: '無效的認證令牌' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理員權限' });
  }
  next();
}

module.exports = { authenticateToken, requireAdmin, JWT_SECRET };
