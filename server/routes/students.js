const express = require('express');
const { getDb } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/admin/students
router.get('/', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const result = db.exec(
      "SELECT id, account, name, class_name, is_suspended, suspended_until FROM users WHERE role = 'student' ORDER BY name"
    );

    const students = [];
    if (result.length > 0) {
      const cols = result[0].columns;
      for (const row of result[0].values) {
        const s = {};
        cols.forEach((col, i) => s[col] = row[i]);
        students.push(s);
      }
    }

    res.json({ students });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
