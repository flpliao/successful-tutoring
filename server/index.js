const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./database');

const authRoutes = require('./routes/auth');
const bookingRoutes = require('./routes/bookings');
const timeslotRoutes = require('./routes/timeslots');
const statisticsRoutes = require('./routes/statistics');
const studentRoutes = require('./routes/students');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin/timeslots', timeslotRoutes);
app.use('/api/admin/stats', statisticsRoutes);
app.use('/api/admin/students', studentRoutes);

// Serve frontend
app.use(express.static(path.join(__dirname, '../client')));

// Start server
async function start() {
  try {
    await initDatabase();
    console.log('Database initialized');

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();
