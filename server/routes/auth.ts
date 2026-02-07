import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { generateUUID } from '../utils/uuid.js';
import { getAsync, allAsync, runAsync } from '../database.js';

const router = express.Router();

// Simple token generation
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

interface UserRecord {
  id: string;
  username: string;
  password_hash: string;
  name: string;
  email: string;
  created_at: string;
  last_login: string;
  login_attempts: number;
}

interface UserResponse {
  id: string;
  username: string;
  name: string;
  email?: string;
}

// Rate limiting helper (basic in-memory implementation)
const loginAttempts = new Map<string, { count: number; timestamp: number }>();
const RATE_LIMIT_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const attempt = loginAttempts.get(identifier);
  
  if (!attempt) {
    loginAttempts.set(identifier, { count: 1, timestamp: now });
    return true;
  }

  if (now - attempt.timestamp > RATE_LIMIT_WINDOW) {
    loginAttempts.set(identifier, { count: 1, timestamp: now });
    return true;
  }

  if (attempt.count >= RATE_LIMIT_ATTEMPTS) {
    return false;
  }

  attempt.count++;
  return true;
}

// Signup
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { username, password, name, email } = req.body;

    if (!username || !password || !name || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate username
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, underscores, and hyphens' });
    }

    // Validate password
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain uppercase and lowercase letters' });
    }

    if (!/\d/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one number' });
    }

    // Check if username already exists
    const existingUser = await getAsync<UserRecord>(
      'SELECT id FROM users WHERE LOWER(username) = LOWER(?)',
      [username]
    );

    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    // Check if email already exists
    const existingEmail = await getAsync<UserRecord>(
      'SELECT id FROM users WHERE LOWER(email) = LOWER(?)',
      [email]
    );

    if (existingEmail) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password with stronger salt
    const passwordHash = await bcrypt.hash(password, 12);
    const userId = generateUUID();
    const token = generateToken();

    // Insert user
    await runAsync(
      'INSERT INTO users (id, username, password_hash, name, email, auth_token, token_expiry) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, username, passwordHash, name, email || null, token, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()]
    );

    const user: UserResponse = {
      id: userId,
      username,
      name,
      email: email || undefined
    };

    res.status(201).json({ 
      user,
      token,
      expiresIn: 30 * 24 * 60 * 60 * 1000 // 30 days in milliseconds
    });
  } catch (error: any) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password' });
    }

    // Check rate limiting
    if (!checkRateLimit(username)) {
      return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
    }

    // Find user
    const user = await getAsync<UserRecord>(
      'SELECT * FROM users WHERE LOWER(username) = LOWER(?)',
      [username]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate new token
    const token = generateToken();
    const tokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Update user with new token and last login
    await runAsync(
      'UPDATE users SET auth_token = ?, token_expiry = ?, last_login = CURRENT_TIMESTAMP WHERE id = ?',
      [token, tokenExpiry, user.id]
    );

    const userResponse: UserResponse = {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email || undefined
    };

    res.json({ 
      user: userResponse,
      token,
      expiresIn: 30 * 24 * 60 * 60 * 1000
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user (verify session)
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    const authHeader = req.headers.authorization;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const user = await getAsync<UserRecord>(
      'SELECT id, username, name, email FROM users WHERE id = ?',
      [userId]
    );

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const userResponse: UserResponse = {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email || undefined
    };

    res.json({ user: userResponse });
  } catch (error: any) {
    console.error('Verify error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Logout (optional - backend can invalidate tokens)
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    // Invalidate token
    await runAsync(
      'UPDATE users SET auth_token = NULL, token_expiry = NULL WHERE id = ?',
      [userId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

export default router;
