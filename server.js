
import express from 'express';
import session from 'express-session';
import SQLiteStoreFactory from 'connect-sqlite3';
import dotenv from 'dotenv';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

import { initDb } from './src/config/db.js';
import { sessionConfig } from './src/config/session.js';
import authRoutes from './src/routes/auth.js';
import adminRoutes from './src/routes/admin.js';
import seriesRoutes from './src/routes/series.js';
import dashboardRoutes from './src/routes/dashboard.js';
import { ensureAuthenticated } from './src/middleware/auth.js';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(helmet());

// Views (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static
app.use('/public', express.static(path.join(__dirname, 'public')));

// Body parsing
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));

// Capture previous URL (for Back link)
app.use((req, res, next) => {
  res.locals.prevUrl = req.get('Referer') || '';
  next();
});

// Sessions
const SQLiteStore = SQLiteStoreFactory(session);
app.use(session(sessionConfig(SQLiteStore)));

// DB init (and bootstrap admin if needed)
await initDb();

// Inject user into views
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

// Routes
app.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  return res.redirect('/dashboard');
});
app.use('/', authRoutes);
app.use('/admin', ensureAuthenticated, adminRoutes);
app.use('/series', ensureAuthenticated, seriesRoutes);
app.use('/dashboard', ensureAuthenticated, dashboardRoutes);

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: 'Not Found' });
});

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Fun Declaration Game running on http://localhost:${PORT}`);
});
