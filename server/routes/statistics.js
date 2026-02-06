const express = require('express');
const { getPool } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/admin/remaining-computers?start_date=&end_date=
router.get('/remaining-computers', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ error: '請提供日期範圍' });
    }

    const pool = getPool();
    const results = [];
    const locations = ['headquarters', 'dachang'];
    const periods = ['morning', 'afternoon', 'evening'];
    const locationLabels = { headquarters: '總部', dachang: '大昌' };
    const periodLabels = { morning: '早', afternoon: '午', evening: '晚' };

    // Iterate each date in range
    const start = new Date(start_date + 'T00:00:00');
    const end = new Date(end_date + 'T00:00:00');

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay();

      for (const loc of locations) {
        for (const per of periods) {
          const slotResult = await pool.query(
            "SELECT computer_count, is_open FROM time_slots WHERE location = $1 AND day_of_week = $2 AND period = $3",
            [loc, dayOfWeek, per]
          );

          if (slotResult.rows.length > 0 && slotResult.rows[0].is_open === 1) {
            const total = slotResult.rows[0].computer_count;
            const bookedResult = await pool.query(
              "SELECT COUNT(*) as c FROM bookings WHERE location = $1 AND booking_date = $2 AND period = $3",
              [loc, dateStr, per]
            );
            const booked = parseInt(bookedResult.rows[0].c);

            results.push({
              date: dateStr,
              location: loc,
              location_label: locationLabels[loc],
              period: per,
              period_label: periodLabels[per],
              total,
              booked,
              remaining: total - booked
            });
          }
        }
      }
    }

    res.json({ data: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/no-show-stats?month=YYYY-MM
router.get('/no-show-stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) return res.status(400).json({ error: '請提供月份' });

    const pool = getPool();
    const result = await pool.query(
      `SELECT n.*, u.name, u.account FROM no_show_records n
       JOIN users u ON n.user_id = u.id
       WHERE n.year_month = $1 ORDER BY n.count DESC`,
      [month]
    );

    res.json({ records: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/no-show/:userId/increment?month=YYYY-MM
router.post('/no-show/:userId/increment', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { month } = req.query;
    if (!month) return res.status(400).json({ error: '請提供月份' });

    const pool = getPool();

    // Upsert no-show record using PostgreSQL ON CONFLICT
    await pool.query(
      `INSERT INTO no_show_records (user_id, year_month, count) VALUES ($1, $2, 1)
       ON CONFLICT (user_id, year_month) DO UPDATE SET count = no_show_records.count + 1`,
      [userId, month]
    );

    // Get current count
    const countResult = await pool.query(
      "SELECT count FROM no_show_records WHERE user_id = $1 AND year_month = $2",
      [userId, month]
    );
    const count = countResult.rows[0].count;

    if (count >= 3) {
      // Suspend for 1 month
      const suspendUntil = new Date();
      suspendUntil.setMonth(suspendUntil.getMonth() + 1);
      const suspendDate = suspendUntil.toISOString().split('T')[0];

      await pool.query("UPDATE users SET is_suspended = 1, suspended_until = $1 WHERE id = $2", [suspendDate, userId]);
    }

    res.json({ message: '已記錄缺課', count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/no-show/:userId/suspend
router.delete('/no-show/:userId/suspend', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    await pool.query("UPDATE users SET is_suspended = 0, suspended_until = NULL WHERE id = $1", [req.params.userId]);
    res.json({ message: '已移除停權' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/checkin?date=YYYY-MM-DD&period=
router.get('/checkin', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { date, period } = req.query;
    if (!date) return res.status(400).json({ error: '請提供日期' });

    const pool = getPool();
    let sql = `SELECT b.*, u.name as student_name, u.account as student_account
               FROM bookings b JOIN users u ON b.user_id = u.id
               WHERE b.booking_date = $1`;
    const params = [date];
    let paramIdx = 2;

    if (period && period !== 'all') {
      sql += ` AND b.period = $${paramIdx}`;
      params.push(period);
      paramIdx++;
    }

    sql += " ORDER BY b.location, b.period";

    const result = await pool.query(sql, params);
    res.json({ bookings: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/checkin/:bookingId
router.post('/checkin/:bookingId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { account } = req.body;
    if (!account) return res.status(400).json({ error: '請提供學生帳號' });

    const pool = getPool();

    // Get booking with user info
    const result = await pool.query(
      `SELECT b.*, u.account as student_account, u.name as student_name
       FROM bookings b JOIN users u ON b.user_id = u.id
       WHERE b.id = $1`,
      [req.params.bookingId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '找不到此預約' });
    }

    const booking = result.rows[0];

    // Validate account matches
    if (booking.student_account !== account) {
      return res.status(400).json({ error: '帳號與預約學生不符' });
    }

    if (booking.checked_in) {
      return res.status(400).json({ error: '已完成簽到' });
    }

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    await pool.query("UPDATE bookings SET checked_in = 1, checked_in_at = $1 WHERE id = $2", [now, req.params.bookingId]);

    res.json({ message: `${booking.student_name} 簽到成功` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/bookings/:id/status
router.put('/bookings/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: '請提供狀態' });

    const pool = getPool();
    await pool.query("UPDATE bookings SET status = $1 WHERE id = $2", [status, req.params.id]);
    res.json({ message: '狀態更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/bookings/:id/add-points
router.post('/bookings/:id/add-points', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query("SELECT location FROM bookings WHERE id = $1", [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '找不到此預約' });
    }

    if (result.rows[0].location !== 'online') {
      return res.status(400).json({ error: '只有線上補課可以加點' });
    }

    await pool.query("UPDATE bookings SET points_added = 1 WHERE id = $1", [req.params.id]);
    res.json({ message: '加點成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
