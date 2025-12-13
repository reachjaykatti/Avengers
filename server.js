
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


// Capture previous URL (same-origin only) for Back link
app.use((req, res, next) => {
  const ref = req.get('Referer') || '';
  let sameOriginRef = '';
  try {
    const r = new URL(ref);
    if (r.origin === `${req.protocol}://${req.get('host')}`) {
      sameOriginRef = r.pathname + r.search + r.hash;
    }
  } catch (e) { /* ignore */ }
  res.locals.prevUrl = sameOriginRef;
  next();
});

// --- BEGIN: Session + No-Cache Setup (AFTER) ---
const SQLiteStore = SQLiteStoreFactory(session);

// Create a persistent SQLite session store that we can control here
const sessionStore = new SQLiteStore({
  // Store sessions under ./data/sessions.sqlite (create if not exists)
  dir: path.join(__dirname, 'data'),
  db: 'sessions.sqlite',
  table: 'sessions'
});


app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
  resave: false,
  saveUninitialized: false,

  // IMPORTANT: Make it a session-only cookie (deleted when browser closes).
  // Do NOT set maxAge. Let the browser treat it as a session cookie.
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    // set secure: true only when you serve via HTTPS
    secure: false
  }
}));


// OPTIONAL: Clear all sessions on server start so everyone must login again.
// Set RESET_SESSIONS_ON_START=true in your .env for this behavior.
if ((process.env.RESET_SESSIONS_ON_START || 'true').toLowerCase() === 'true') {
  sessionStore.clear(err => {
    if (err) {
      console.error('Failed to clear sessions at startup:', err);
    } else {
      console.log('All sessions cleared on server start (RESET_SESSIONS_ON_START=true).');
    }
  });
}

// DB init (and bootstrap admin if needed)
await initDb();

// No-cache headers to avoid stale pages showing up after restart
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});


// Inject user into views (compatible without nullish operator)
app.use((req, res, next) => {
  res.locals.currentUser = (req.session && req.session.user) ? req.session.user : null;
  next();
});

// Simple request logger to trace 404s and verify paths
app.use((req, res, next) => {
  console.log('[REQ]', req.method, req.path);
  next();
});
app.use((req, res, next) => { console.log('[REQ]', req.method, req.path); next(); });
// Routes
// Always show Login first when you hit the root.
// (Logged-in users can still go to /dashboard via nav)
app.get('/', (req, res) => {
  return res.redirect('/login');
});
// --- END: Session + No-Cache Setup (AFTER) ---

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
