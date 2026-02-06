const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'data.sqlite');

let db = null;

async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'student' CHECK(role IN ('student','admin')),
      class_name TEXT,
      is_suspended INTEGER DEFAULT 0,
      suspended_until TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS time_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location TEXT NOT NULL CHECK(location IN ('headquarters','dachang')),
      day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 1 AND 7),
      period TEXT NOT NULL CHECK(period IN ('morning','afternoon','evening')),
      computer_count INTEGER DEFAULT 8,
      is_open INTEGER DEFAULT 0,
      UNIQUE(location, day_of_week, period)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
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
      created_at TEXT DEFAULT (datetime('now','localtime')),
      created_by TEXT DEFAULT 'student' CHECK(created_by IN ('student','admin')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS no_show_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      year_month TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      UNIQUE(user_id, year_month),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Seed data if empty
  const userCount = db.exec("SELECT COUNT(*) as c FROM users");
  if (userCount[0].values[0][0] === 0) {
    seedData();
  }

  saveDatabase();
  return db;
}

function seedData() {
  const hash = bcrypt.hashSync('admin123', 10);
  const studentHash = bcrypt.hashSync('student123', 10);

  db.run("INSERT INTO users (account, password, name, role) VALUES (?, ?, ?, ?)", ['admin', hash, '系統管理員', 'admin']);
  db.run("INSERT INTO users (account, password, name, role, class_name) VALUES (?, ?, ?, ?, ?)", ['A123456789', studentHash, '王小明', 'student', 'A班']);
  db.run("INSERT INTO users (account, password, name, role, class_name) VALUES (?, ?, ?, ?, ?)", ['B234567890', studentHash, '李小華', 'student', 'B班']);
  db.run("INSERT INTO users (account, password, name, role, class_name) VALUES (?, ?, ?, ?, ?)", ['C345678901', studentHash, '陳大文', 'student', 'A班']);

  // Seed time_slots - headquarters
  const periods = ['morning', 'afternoon', 'evening'];
  for (let day = 1; day <= 7; day++) {
    for (const period of periods) {
      let isOpen = 0;
      if (period === 'evening') isOpen = 1;
      if (day === 6 && period === 'afternoon') isOpen = 1; // Saturday afternoon
      db.run("INSERT INTO time_slots (location, day_of_week, period, computer_count, is_open) VALUES (?, ?, ?, ?, ?)",
        ['headquarters', day, period, 8, isOpen]);
    }
  }

  // Seed time_slots - dachang
  for (let day = 1; day <= 7; day++) {
    for (const period of periods) {
      let isOpen = 0;
      if (day >= 1 && day <= 5 && period === 'evening') isOpen = 1; // Mon-Fri evening only
      db.run("INSERT INTO time_slots (location, day_of_week, period, computer_count, is_open) VALUES (?, ?, ?, ?, ?)",
        ['dachang', day, period, 8, isOpen]);
    }
  }
}

function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function getDb() {
  return db;
}

module.exports = { initDatabase, getDb, saveDatabase };
