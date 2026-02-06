const express = require('express');
const { getDb, saveDatabase } = require('../database');
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
router.get('/available-slots', authenticateToken, (req, res) => {
  try {
    const { date, location } = req.query;
    if (!date || !location) {
      return res.status(400).json({ error: '請提供日期和地點' });
    }

    if (location === 'online') {
      return res.json({ slots: [{ period: 'online', period_label: '線上', is_open: true }] });
    }

    const dayOfWeek = getDayOfWeek(date);
    const db = getDb();
    const result = db.exec(
      "SELECT * FROM time_slots WHERE location = ? AND day_of_week = ? AND is_open = 1",
      [location, dayOfWeek]
    );

    const periodLabels = { morning: '早', afternoon: '午', evening: '晚' };
    const slots = [];
    if (result.length > 0) {
      const cols = result[0].columns;
      for (const row of result[0].values) {
        const slot = {};
        cols.forEach((col, i) => slot[col] = row[i]);
        slots.push({
          ...slot,
          period_label: periodLabels[slot.period] || slot.period
        });
      }
    }

    res.json({ slots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bookings/remaining-computers?date=YYYY-MM-DD&period=xxx&location=xxx
router.get('/remaining-computers', authenticateToken, (req, res) => {
  try {
    const { date, period, location } = req.query;
    if (!date || !period || !location) {
      return res.status(400).json({ error: '缺少必要參數' });
    }

    if (location === 'online') {
      return res.json({ remaining: -1, total: -1 }); // unlimited for online
    }

    const dayOfWeek = getDayOfWeek(date);
    const db = getDb();

    // Get total computers
    const slotResult = db.exec(
      "SELECT computer_count FROM time_slots WHERE location = ? AND day_of_week = ? AND period = ?",
      [location, dayOfWeek, period]
    );
    const total = slotResult.length > 0 ? slotResult[0].values[0][0] : 0;

    // Count booked
    const bookedResult = db.exec(
      "SELECT COUNT(*) FROM bookings WHERE location = ? AND booking_date = ? AND period = ?",
      [location, date, period]
    );
    const booked = bookedResult.length > 0 ? bookedResult[0].values[0][0] : 0;

    res.json({ remaining: total - booked, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bookings - Student create booking
router.post('/', authenticateToken, (req, res) => {
  try {
    const db = getDb();
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
    const dupResult = db.exec(
      "SELECT COUNT(*) FROM bookings WHERE user_id = ? AND booking_date = ? AND period = ?",
      [user.id, booking_date, period]
    );
    if (dupResult.length > 0 && dupResult[0].values[0][0] > 0) {
      return res.status(400).json({ error: '同天同時段已有預約，無法重複預約' });
    }

    // Check computer availability for on-site
    if (location !== 'online') {
      const dayOfWeek = getDayOfWeek(booking_date);
      const slotResult = db.exec(
        "SELECT computer_count FROM time_slots WHERE location = ? AND day_of_week = ? AND period = ?",
        [location, dayOfWeek, period]
      );
      const total = slotResult.length > 0 ? slotResult[0].values[0][0] : 0;

      const bookedResult = db.exec(
        "SELECT COUNT(*) FROM bookings WHERE location = ? AND booking_date = ? AND period = ?",
        [location, booking_date, period]
      );
      const booked = bookedResult.length > 0 ? bookedResult[0].values[0][0] : 0;

      if (booked >= total) {
        return res.status(400).json({ error: '該時段電腦已全部被預約' });
      }
    }

    db.run(
      `INSERT INTO bookings (user_id, location, booking_date, period, class_name, course, course_date, attachment_path, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.id, location, booking_date, period, class_name || user.class_name, course || '', course_date || '', attachment_path || '', 'student']
    );
    saveDatabase();

    res.json({ message: '預約成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bookings/my - Student's future bookings
router.get('/my', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const todayStr = today();
    const result = db.exec(
      "SELECT * FROM bookings WHERE user_id = ? AND booking_date >= ? ORDER BY booking_date ASC",
      [req.user.id, todayStr]
    );

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

// DELETE /api/bookings/:id - Cancel booking (1 day before)
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const result = db.exec("SELECT * FROM bookings WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(404).json({ error: '找不到此預約' });
    }

    const cols = result[0].columns;
    const row = result[0].values[0];
    const booking = {};
    cols.forEach((col, i) => booking[col] = row[i]);

    // Check: at least 1 day before
    const bookingDate = new Date(booking.booking_date + 'T00:00:00');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    if (bookingDate < tomorrow) {
      return res.status(400).json({ error: '最晚需於補課日1天前取消' });
    }

    db.run("DELETE FROM bookings WHERE id = ?", [req.params.id]);
    saveDatabase();

    res.json({ message: '已取消預約' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====== Admin routes ======

// GET /api/admin/bookings?start_date=&end_date=
router.get('/admin', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const db = getDb();
    let sql = `SELECT b.*, u.name as student_name, u.account as student_account, u.class_name as student_class
               FROM bookings b JOIN users u ON b.user_id = u.id`;
    const params = [];

    if (start_date && end_date) {
      sql += " WHERE b.booking_date BETWEEN ? AND ?";
      params.push(start_date, end_date);
    }
    sql += " ORDER BY b.booking_date ASC, b.period ASC";

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

// POST /api/admin/bookings - Admin create booking (no date restriction)
router.post('/admin', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const { user_id, location, booking_date, period, class_name, course, course_date, attachment_path } = req.body;

    if (!user_id || !location || !booking_date || !period) {
      return res.status(400).json({ error: '缺少必要欄位' });
    }

    // Check computer availability for on-site
    if (location !== 'online') {
      const dayOfWeek = getDayOfWeek(booking_date);
      const slotResult = db.exec(
        "SELECT computer_count FROM time_slots WHERE location = ? AND day_of_week = ? AND period = ?",
        [location, dayOfWeek, period]
      );
      const total = slotResult.length > 0 ? slotResult[0].values[0][0] : 0;

      const bookedResult = db.exec(
        "SELECT COUNT(*) FROM bookings WHERE location = ? AND booking_date = ? AND period = ?",
        [location, booking_date, period]
      );
      const booked = bookedResult.length > 0 ? bookedResult[0].values[0][0] : 0;

      if (booked >= total) {
        return res.status(400).json({ error: '該時段電腦已全部被預約' });
      }
    }

    db.run(
      `INSERT INTO bookings (user_id, location, booking_date, period, class_name, course, course_date, attachment_path, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, location, booking_date, period, class_name || '', course || '', course_date || '', attachment_path || '', 'admin']
    );
    saveDatabase();

    res.json({ message: '預約新增成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/bookings/:id
router.put('/admin/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const { course, course_date, status, class_name } = req.body;

    const existing = db.exec("SELECT id FROM bookings WHERE id = ?", [req.params.id]);
    if (existing.length === 0 || existing[0].values.length === 0) {
      return res.status(404).json({ error: '找不到此預約' });
    }

    const updates = [];
    const params = [];
    if (course !== undefined) { updates.push("course = ?"); params.push(course); }
    if (course_date !== undefined) { updates.push("course_date = ?"); params.push(course_date); }
    if (status !== undefined) { updates.push("status = ?"); params.push(status); }
    if (class_name !== undefined) { updates.push("class_name = ?"); params.push(class_name); }

    if (updates.length > 0) {
      params.push(req.params.id);
      db.run(`UPDATE bookings SET ${updates.join(', ')} WHERE id = ?`, params);
      saveDatabase();
    }

    res.json({ message: '更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/bookings/:id
router.delete('/admin/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    db.run("DELETE FROM bookings WHERE id = ?", [req.params.id]);
    saveDatabase();
    res.json({ message: '刪除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
