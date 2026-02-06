const express = require('express');
const { getPool } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Helper: get day of week (1=Mon, 7=Sun)
function getDayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

// Helper: add days to today
function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// Helper: format today
function today() {
  return new Date().toISOString().split('T')[0];
}

// GET /api/bookings/available-dates
router.get('/available-dates', authenticateToken, (req, res) => {
  try {
    const dates = [];
    for (let i = 5; i <= 7; i++) {
      dates.push(addDays(i));
    }
    res.json({ dates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bookings/available-slots?date=YYYY-MM-DD&location=xxx
router.get('/available-slots', authenticateToken, async (req, res) => {
  try {
    const { date, location } = req.query;
    if (!date || !location) {
      return res.status(400).json({ error: '請提供日期和地點' });
    }

    if (location === 'online') {
      return res.json({ slots: [{ period: 'online', period_label: '線上', is_open: true }] });
    }

    const dayOfWeek = getDayOfWeek(date);
    const pool = getPool();
    const result = await pool.query(
      "SELECT * FROM time_slots WHERE location = $1 AND day_of_week = $2 AND is_open = 1",
      [location, dayOfWeek]
    );

    const periodLabels = { morning: '早', afternoon: '午', evening: '晚' };
    const slots = result.rows.map(slot => ({
      ...slot,
      period_label: periodLabels[slot.period] || slot.period
    }));

    res.json({ slots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bookings/remaining-computers?date=YYYY-MM-DD&period=xxx&location=xxx
router.get('/remaining-computers', authenticateToken, async (req, res) => {
  try {
    const { date, period, location } = req.query;
    if (!date || !period || !location) {
      return res.status(400).json({ error: '缺少必要參數' });
    }

    if (location === 'online') {
      return res.json({ remaining: -1, total: -1 }); // unlimited for online
    }

    const dayOfWeek = getDayOfWeek(date);
    const pool = getPool();

    // Get total computers
    const slotResult = await pool.query(
      "SELECT computer_count FROM time_slots WHERE location = $1 AND day_of_week = $2 AND period = $3",
      [location, dayOfWeek, period]
    );
    const total = slotResult.rows.length > 0 ? slotResult.rows[0].computer_count : 0;

    // Count booked
    const bookedResult = await pool.query(
      "SELECT COUNT(*) as c FROM bookings WHERE location = $1 AND booking_date = $2 AND period = $3",
      [location, date, period]
    );
    const booked = parseInt(bookedResult.rows[0].c);

    res.json({ remaining: total - booked, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bookings - Student create booking
router.post('/', authenticateToken, async (req, res) => {
  try {
    const pool = getPool();
    const user = req.user;

    // Check suspension
    if (user.is_suspended) {
      return res.status(403).json({ error: '您的帳號已被停權，無法預約補課' });
    }

    const { location, booking_date, period, class_name, course, course_date, attachment_path } = req.body;

    if (!location || !booking_date || !period) {
      return res.status(400).json({ error: '缺少必要欄位' });
    }

    // Check date range (day+5 to day+7) - only for student
    if (req.body._byAdmin !== true) {
      const minDate = addDays(5);
      const maxDate = addDays(7);
      if (booking_date < minDate || booking_date > maxDate) {
        return res.status(400).json({ error: `只能預約 ${minDate} 到 ${maxDate} 的日期` });
      }
    }

    // Check duplicate (same user, same date, same period)
    const dupResult = await pool.query(
      "SELECT COUNT(*) as c FROM bookings WHERE user_id = $1 AND booking_date = $2 AND period = $3",
      [user.id, booking_date, period]
    );
    if (parseInt(dupResult.rows[0].c) > 0) {
      return res.status(400).json({ error: '同天同時段已有預約，無法重複預約' });
    }

    // Check computer availability for on-site
    if (location !== 'online') {
      const dayOfWeek = getDayOfWeek(booking_date);
      const slotResult = await pool.query(
        "SELECT computer_count FROM time_slots WHERE location = $1 AND day_of_week = $2 AND period = $3",
        [location, dayOfWeek, period]
      );
      const total = slotResult.rows.length > 0 ? slotResult.rows[0].computer_count : 0;

      const bookedResult = await pool.query(
        "SELECT COUNT(*) as c FROM bookings WHERE location = $1 AND booking_date = $2 AND period = $3",
        [location, booking_date, period]
      );
      const booked = parseInt(bookedResult.rows[0].c);

      if (booked >= total) {
        return res.status(400).json({ error: '該時段電腦已全部被預約' });
      }
    }

    await pool.query(
      `INSERT INTO bookings (user_id, location, booking_date, period, class_name, course, course_date, attachment_path, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [user.id, location, booking_date, period, class_name || user.class_name, course || '', course_date || '', attachment_path || '', 'student']
    );

    res.json({ message: '預約成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bookings/my - Student's future bookings
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const pool = getPool();
    const todayStr = today();
    const result = await pool.query(
      "SELECT * FROM bookings WHERE user_id = $1 AND booking_date >= $2 ORDER BY booking_date ASC",
      [req.user.id, todayStr]
    );

    res.json({ bookings: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/bookings/:id - Cancel booking (1 day before)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query("SELECT * FROM bookings WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '找不到此預約' });
    }

    const booking = result.rows[0];

    // Check: at least 1 day before
    const bookingDate = new Date(booking.booking_date + 'T00:00:00');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    if (bookingDate < tomorrow) {
      return res.status(400).json({ error: '最晚需於補課日1天前取消' });
    }

    await pool.query("DELETE FROM bookings WHERE id = $1", [req.params.id]);

    res.json({ message: '已取消預約' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====== Admin routes ======

// GET /api/admin/bookings?start_date=&end_date=
router.get('/admin', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const pool = getPool();
    let sql = `SELECT b.*, u.name as student_name, u.account as student_account, u.class_name as student_class
               FROM bookings b JOIN users u ON b.user_id = u.id`;
    const params = [];
    let paramIdx = 1;

    if (start_date && end_date) {
      sql += ` WHERE b.booking_date BETWEEN $${paramIdx} AND $${paramIdx + 1}`;
      params.push(start_date, end_date);
      paramIdx += 2;
    }
    sql += " ORDER BY b.booking_date ASC, b.period ASC";

    const result = await pool.query(sql, params);
    res.json({ bookings: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/bookings - Admin create booking (no date restriction)
router.post('/admin', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    const { user_id, location, booking_date, period, class_name, course, course_date, attachment_path } = req.body;

    if (!user_id || !location || !booking_date || !period) {
      return res.status(400).json({ error: '缺少必要欄位' });
    }

    // Check computer availability for on-site
    if (location !== 'online') {
      const dayOfWeek = getDayOfWeek(booking_date);
      const slotResult = await pool.query(
        "SELECT computer_count FROM time_slots WHERE location = $1 AND day_of_week = $2 AND period = $3",
        [location, dayOfWeek, period]
      );
      const total = slotResult.rows.length > 0 ? slotResult.rows[0].computer_count : 0;

      const bookedResult = await pool.query(
        "SELECT COUNT(*) as c FROM bookings WHERE location = $1 AND booking_date = $2 AND period = $3",
        [location, booking_date, period]
      );
      const booked = parseInt(bookedResult.rows[0].c);

      if (booked >= total) {
        return res.status(400).json({ error: '該時段電腦已全部被預約' });
      }
    }

    await pool.query(
      `INSERT INTO bookings (user_id, location, booking_date, period, class_name, course, course_date, attachment_path, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [user_id, location, booking_date, period, class_name || '', course || '', course_date || '', attachment_path || '', 'admin']
    );

    res.json({ message: '預約新增成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/bookings/:id
router.put('/admin/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    const { course, course_date, status, class_name } = req.body;

    const existing = await pool.query("SELECT id FROM bookings WHERE id = $1", [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: '找不到此預約' });
    }

    const updates = [];
    const params = [];
    let paramIdx = 1;
    if (course !== undefined) { updates.push(`course = $${paramIdx++}`); params.push(course); }
    if (course_date !== undefined) { updates.push(`course_date = $${paramIdx++}`); params.push(course_date); }
    if (status !== undefined) { updates.push(`status = $${paramIdx++}`); params.push(status); }
    if (class_name !== undefined) { updates.push(`class_name = $${paramIdx++}`); params.push(class_name); }

    if (updates.length > 0) {
      params.push(req.params.id);
      await pool.query(`UPDATE bookings SET ${updates.join(', ')} WHERE id = $${paramIdx}`, params);
    }

    res.json({ message: '更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/bookings/:id
router.delete('/admin/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    await pool.query("DELETE FROM bookings WHERE id = $1", [req.params.id]);
    res.json({ message: '刪除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
