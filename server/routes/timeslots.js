const express = require('express');
const { getDb, saveDatabase } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const dayLabels = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '日' };
const periodLabels = { morning: '早', afternoon: '午', evening: '晚' };
const locationLabels = { headquarters: '總部', dachang: '大昌' };

// GET /api/admin/timeslots
router.get('/', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const result = db.exec("SELECT * FROM time_slots ORDER BY location, day_of_week, CASE period WHEN 'morning' THEN 1 WHEN 'afternoon' THEN 2 WHEN 'evening' THEN 3 END");

    const slots = [];
    if (result.length > 0) {
      const cols = result[0].columns;
      for (const row of result[0].values) {
        const s = {};
        cols.forEach((col, i) => s[col] = row[i]);
        s.day_label = dayLabels[s.day_of_week];
        s.period_label = periodLabels[s.period];
        s.location_label = locationLabels[s.location];
        slots.push(s);
      }
    }

    res.json({ slots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/timeslots/:id
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const { computer_count, is_open } = req.body;

    const updates = [];
    const params = [];
    if (computer_count !== undefined) { updates.push("computer_count = ?"); params.push(computer_count); }
    if (is_open !== undefined) { updates.push("is_open = ?"); params.push(is_open ? 1 : 0); }

    if (updates.length > 0) {
      params.push(req.params.id);
      db.run(`UPDATE time_slots SET ${updates.join(', ')} WHERE id = ?`, params);
      saveDatabase();
    }

    res.json({ message: '更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
