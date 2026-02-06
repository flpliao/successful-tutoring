const express = require('express');
const { getPool } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const dayLabels = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '日' };
const periodLabels = { morning: '早', afternoon: '午', evening: '晚' };
const locationLabels = { headquarters: '總部', dachang: '大昌' };

// GET /api/admin/timeslots
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query("SELECT * FROM time_slots ORDER BY location, day_of_week, CASE period WHEN 'morning' THEN 1 WHEN 'afternoon' THEN 2 WHEN 'evening' THEN 3 END");

    const slots = result.rows.map(s => ({
      ...s,
      day_label: dayLabels[s.day_of_week],
      period_label: periodLabels[s.period],
      location_label: locationLabels[s.location]
    }));

    res.json({ slots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/timeslots/:id
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    const { computer_count, is_open } = req.body;

    const updates = [];
    const params = [];
    let paramIdx = 1;
    if (computer_count !== undefined) { updates.push(`computer_count = $${paramIdx++}`); params.push(computer_count); }
    if (is_open !== undefined) { updates.push(`is_open = $${paramIdx++}`); params.push(is_open ? 1 : 0); }

    if (updates.length > 0) {
      params.push(req.params.id);
      await pool.query(`UPDATE time_slots SET ${updates.join(', ')} WHERE id = $${paramIdx}`, params);
    }

    res.json({ message: '更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
