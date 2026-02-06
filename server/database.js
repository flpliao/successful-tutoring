const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

let pool = null;

async function initDatabase() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com')
      ? { rejectUnauthorized: false }
      : false
  });

  // Create tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      account TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'student' CHECK(role IN ('student','admin')),
      class_name TEXT,
      is_suspended INTEGER DEFAULT 0,
      suspended_until TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS time_slots (
      id SERIAL PRIMARY KEY,
      location TEXT NOT NULL CHECK(location IN ('headquarters','dachang')),
      day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 1 AND 7),
      period TEXT NOT NULL CHECK(period IN ('morning','afternoon','evening')),
      computer_count INTEGER DEFAULT 8,
      is_open INTEGER DEFAULT 0,
      UNIQUE(location, day_of_week, period)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      location TEXT NOT NULL CHECK(location IN ('headquarters','dachang','online')),
      booking_date TEXT NOT NULL,
      period TEXT NOT NULL CHECK(period IN ('morning','afternoon','evening','online')),
      class_name TEXT,
      course TEXT,
      course_date TEXT,
      attachment_path TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','completed','unpaid')),
      points_added INTEGER DEFAULT 0,
      checked_in INTEGER DEFAULT 0,
      checked_in_at TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      created_by TEXT DEFAULT 'student' CHECK(created_by IN ('student','admin'))
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS no_show_records (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      year_month TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      UNIQUE(user_id, year_month)
    )
  `);

  // Seed data if empty
  const userCount = await pool.query("SELECT COUNT(*) as c FROM users");
  if (parseInt(userCount.rows[0].c) === 0) {
    await seedData();
  }

  return pool;
}

async function seedData() {
  const hash = bcrypt.hashSync('admin123', 10);
  const studentHash = bcrypt.hashSync('student123', 10);

  await pool.query("INSERT INTO users (account, password, name, role) VALUES ($1, $2, $3, $4)", ['admin', hash, '系統管理員', 'admin']);
  await pool.query("INSERT INTO users (account, password, name, role, class_name) VALUES ($1, $2, $3, $4, $5)", ['A123456789', studentHash, '王小明', 'student', 'A班']);
  await pool.query("INSERT INTO users (account, password, name, role, class_name) VALUES ($1, $2, $3, $4, $5)", ['B234567890', studentHash, '李小華', 'student', 'B班']);
  await pool.query("INSERT INTO users (account, password, name, role, class_name) VALUES ($1, $2, $3, $4, $5)", ['C345678901', studentHash, '陳大文', 'student', 'A班']);

  // Seed time_slots - headquarters
  const periods = ['morning', 'afternoon', 'evening'];
  for (let day = 1; day <= 7; day++) {
    for (const period of periods) {
      let isOpen = 0;
      if (period === 'evening') isOpen = 1;
      if (day === 6 && period === 'afternoon') isOpen = 1; // Saturday afternoon
      await pool.query(
        "INSERT INTO time_slots (location, day_of_week, period, computer_count, is_open) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
        ['headquarters', day, period, 8, isOpen]
      );
    }
  }

  // Seed time_slots - dachang
  for (let day = 1; day <= 7; day++) {
    for (const period of periods) {
      let isOpen = 0;
      if (day >= 1 && day <= 5 && period === 'evening') isOpen = 1; // Mon-Fri evening only
      await pool.query(
        "INSERT INTO time_slots (location, day_of_week, period, computer_count, is_open) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
        ['dachang', day, period, 8, isOpen]
      );
    }
  }
}

function getPool() {
  return pool;
}

module.exports = { initDatabase, getPool };
