const express = require('express');
const { getPool } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/admin/students
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      "SELECT id, account, name, class_name, is_suspended, suspended_until FROM users WHERE role = 'student' ORDER BY name"
    );

    res.json({ students: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
