import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const SETTINGS_FILE = path.join(__dirname, 'data', 'site_settings.json');

// In-memory active session store (token -> { userId, email, role, expiresAt })
const sessions = new Map();

// Session validity: 7 days
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, storedHash) {
  try {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch (e) {
    return false;
  }
}

export function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error loading users.json:', err);
    return [];
  }
}

export function saveUsers(users) {
  try {
    const dir = path.dirname(USERS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error saving users.json:', err);
    return false;
  }
}

export function loadSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return { requireLogin: false };
    }
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return { requireLogin: false };
  }
}

export function saveSettings(settings) {
  try {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error saving site_settings.json:', err);
    return false;
  }
}

/**
 * Initializes the default admin user requested:
 * email: kulgenalp@gmail.com
 * password: AFPWGlacier65$
 * role: admin
 */
export function initDefaultAdmin() {
  const users = loadUsers();
  const defaultEmail = 'kulgenalp@gmail.com';
  const defaultPassword = 'AFPWGlacier65$';
  
  const existingIdx = users.findIndex(u => u.email.toLowerCase() === defaultEmail.toLowerCase());
  const { salt, hash } = hashPassword(defaultPassword);

  if (existingIdx === -1) {
    const newAdmin = {
      id: 'usr_' + crypto.randomUUID(),
      name: 'Alp Kulgen',
      email: defaultEmail,
      salt,
      passwordHash: hash,
      role: 'admin',
      status: 'active',
      createdAt: new Date().toISOString(),
      lastLogin: null
    };
    users.unshift(newAdmin);
    saveUsers(users);
    console.log(`Default admin account initialized for ${defaultEmail}`);
  } else {
    // Ensure credentials and admin status match
    const existing = users[existingIdx];
    existing.role = 'admin';
    existing.status = 'active';
    existing.salt = salt;
    existing.passwordHash = hash;
    saveUsers(users);
    console.log(`Admin account confirmed for ${defaultEmail}`);
  }
}

export function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const sessionData = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    expiresAt: Date.now() + SESSION_TTL_MS
  };
  sessions.set(token, sessionData);
  return token;
}

export function getSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session;
}

export function destroySession(token) {
  if (token) {
    sessions.delete(token);
  }
}

export function destroyUserSessions(userId) {
  for (const [token, session] of sessions.entries()) {
    if (session.userId === userId) {
      sessions.delete(token);
    }
  }
}

export function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, salt, ...safe } = user;
  return safe;
}

// Middleware to extract and verify session token
export function authMiddleware(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'].trim();
  } else if (req.query?.token) {
    token = req.query.token.trim();
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const session = getSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }

  const users = loadUsers();
  const user = users.find(u => u.id === session.userId);
  if (!user) {
    destroySession(token);
    return res.status(401).json({ error: 'User account no longer exists.' });
  }

  if (user.status !== 'active') {
    destroySession(token);
    return res.status(403).json({ error: 'Your account has been suspended. Please contact the administrator.' });
  }

  req.token = token;
  req.user = sanitizeUser(user);
  next();
}

// Middleware for optional auth (attaches req.user if present)
export function optionalAuthMiddleware(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'].trim();
  } else if (req.query?.token) {
    token = req.query.token.trim();
  }

  if (token) {
    const session = getSession(token);
    if (session && Date.now() <= session.expiresAt) {
      const users = loadUsers();
      const user = users.find(u => u.id === session.userId);
      if (user) {
        req.token = token;
        req.user = sanitizeUser(user);
      }
    }
  }
  next();
}

// Middleware to enforce admin role
export function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrative privileges required.' });
  }
  next();
}
