const express = require('express');
const { getDb, saveDatabase } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/admin/remaining-computers?start_date=&end_date=
router.get('/remaining-computers', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ error: '請提供日期範圍' });
    }

    const db = getDb();
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
          const slotResult = db.exec(
            "SELECT computer_count, is_open FROM time_slots WHERE location = ? AND day_of_week = ? AND period = ?",
            [loc, dayOfWeek, per]
          );

          if (slotResult.length > 0 && slotResult[0].values[0][1] === 1) {
            const total = slotResult[0].values[0][0];
            const bookedResult = db.exec(
              "SELECT COUNT(*) FROM bookings WHERE location = ? AND booking_date = ? AND period = ?",
              [loc, dateStr, per]
            );
            const booked = bookedResult.length > 0 ? bookedResult[0].values[0][0] : 0;

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
router.get('/no-show-stats', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { month } = req.query;
    if (!month) return res.status(400).json({ error: '請提供月份' });

    const db = getDb();
    const result = db.exec(
      `SELECT n.*, u.name, u.account FROM no_show_records n
       JOIN users u ON n.user_id = u.id
       WHERE n.year_month = ? ORDER BY n.count DESC`,
      [month]
    );

    const records = [];
    if (result.length > 0) {
      const cols = result[0].columns;
      for (const row of result[0].values) {
        const r = {};
        cols.forEach((col, i) => r[col] = row[i]);
        records.push(r);
      }
    }

    res.json({ records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/no-show/:userId/increment?month=YYYY-MM
router.post('/no-show/:userId/increment', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { userId } = req.params;
    const { month } = req.query;
    if (!month) return res.status(400).json({ error: '請提供月份' });

    const db = getDb();

    // Upsert no-show record
    const existing = db.exec("SELECT * FROM no_show_records WHERE user_id = ? AND year_month = ?", [userId, month]);

    if (existing.length > 0 && existing[0].values.length > 0) {
      db.run("UPDATE no_show_records SET count = count + 1 WHERE user_id = ? AND year_month = ?", [userId, month]);
    } else {
      db.run("INSERT INTO no_show_records (user_id, year_month, count) VALUES (?, ?, 1)", [userId, month]);
    }

    // Check if count >= 3 -> suspend
    const countResult = db.exec("SELECT count FROM no_show_records WHERE user_id = ? AND year_month = ?", [userId, month]);
    const count = countResult[0].values[0][0];

    if (count >= 3) {
      // Suspend for 1 month
      const suspendUntil = new Date();
      suspendUntil.setMonth(suspendUntil.getMonth() + 1);
      const suspendDate = suspendUntil.toISOString().split('T')[0];

      db.run("UPDATE users SET is_suspended = 1, suspended_until = ? WHERE id = ?", [suspendDate, userId]);
    }

    saveDatabase();
    res.json({ message: '已記錄缺課', count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/no-show/:userId/suspend
router.delete('/no-show/:userId/suspend', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    db.run("UPDATE users SET is_suspended = 0, suspended_until = NULL WHERE id = ?", [req.params.userId]);
    saveDatabase();
    res.json({ message: '已移除停權' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/checkin?date=YYYY-MM-DD&period=
router.get('/checkin', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { date, period } = req.query;
    if (!date) return res.status(400).json({ error: '請提供日期' });

    const db = getDb();
    let sql = `SELECT b.*, u.name as student_name, u.account as student_account
               FROM bookings b JOIN users u ON b.user_id = u.id
               WHERE b.booking_date = ?`;
    const params = [date];

    if (period && period !== 'all') {
      sql += " AND b.period = ?";
      params.push(period);
    }

    sql += " ORDER BY b.location, b.period";

    const result = db.exec(sql, params);
    const bookings = [];
    if (result.length > 0) {
      const cols = result[0].columns;
      for (const row of result[0].values) {
        const b = {};
        cols.forEach((col, i) => b[col] = row[i]);
        bookings.push(b);
      }
    }

    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/checkin/:bookingId
router.post('/checkin/:bookingId', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { account } = req.body;
    if (!account) return res.status(400).json({ error: '請提供學生帳號' });

    const db = getDb();

    // Get booking with user info
    const result = db.exec(
      `SELECT b.*, u.account as student_account, u.name as student_name
       FROM bookings b JOIN users u ON b.user_id = u.id
       WHERE b.id = ?`,
      [req.params.bookingId]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(404).json({ error: '找不到此預約' });
    }

    const cols = result[0].columns;
    const row = result[0].values[0];
    const booking = {};
    cols.forEach((col, i) => booking[col] = row[i]);

    // Validate account matches - check against bookings for same date/period to avoid name collision
    if (booking.student_account !== account) {
      return res.status(400).json({ error: '帳號與預約學生不符' });
    }

    if (booking.checked_in) {
      return res.status(400).json({ error: '已完成簽到' });
    }

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    db.run("UPDATE bookings SET checked_in = 1, checked_in_at = ? WHERE id = ?", [now, req.params.bookingId]);
    saveDatabase();

    res.json({ message: `${booking.student_name} 簽到成功` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/bookings/:id/status
router.put('/bookings/:id/status', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: '請提供狀態' });

    const db = getDb();
    db.run("UPDATE bookings SET status = ? WHERE id = ?", [status, req.params.id]);
    saveDatabase();
    res.json({ message: '狀態更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/bookings/:id/add-points
router.post('/bookings/:id/add-points', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const result = db.exec("SELECT location FROM bookings WHERE id = ?", [req.params.id]);

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(404).json({ error: '找不到此預約' });
    }

    if (result[0].values[0][0] !== 'online') {
      return res.status(400).json({ error: '只有線上補課可以加點' });
    }

    db.run("UPDATE bookings SET points_added = 1 WHERE id = ?", [req.params.id]);
    saveDatabase();
    res.json({ message: '加點成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
