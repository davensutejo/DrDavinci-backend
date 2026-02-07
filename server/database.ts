import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve to parent directory (server/) if in dist folder
const baseDir = __dirname.includes('dist') ? path.dirname(__dirname) : __dirname;

// Use in-memory database on Vercel, file-based otherwise
const isVercel = process.env.VERCEL === '1';
const dbPath = isVercel 
  ? ':memory:' 
  : process.env.DATABASE_PATH 
    ? path.resolve(baseDir, process.env.DATABASE_PATH) 
    : path.join(baseDir, 'data', 'app.db');

// Ensure data directory exists (only for local development)
if (!isVercel && dbPath !== ':memory:') {
  const dataDir = path.dirname(dbPath);
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  } catch (err) {
    console.error('Error creating data directory:', err);
  }
}

const db = new sqlite3.Database(dbPath, (err: any) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

db.configure('busyTimeout', 30000);

export function initializeDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Users table with enhanced security fields
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          auth_token TEXT,
          token_expiry DATETIME,
          last_login DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err: any) => {
        if (err) console.error('Error creating users table:', err);
      });

      // Add columns to existing users table if they don't exist (for backwards compatibility)
      // Note: For existing databases, email may need manual migration to ensure NOT NULL and UNIQUE constraints
      db.run(`ALTER TABLE users ADD COLUMN email TEXT UNIQUE`, (err: any) => {
        // Ignore error if column already exists
      });
      
      db.run(`ALTER TABLE users ADD COLUMN auth_token TEXT`, (err: any) => {
        // Ignore error if column already exists
      });
      
      db.run(`ALTER TABLE users ADD COLUMN token_expiry DATETIME`, (err: any) => {
        // Ignore error if column already exists
      });
      
      db.run(`ALTER TABLE users ADD COLUMN last_login DATETIME`, (err: any) => {
        // Ignore error if column already exists
      });
      
      db.run(`ALTER TABLE users ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`, (err: any) => {
        // Ignore error if column already exists
      });

      // Chat sessions table
      db.run(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `, (err: any) => {
        if (err) console.error('Error creating chat_sessions table:', err);
      });

      // Messages table
      db.run(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          image_url TEXT,
          extracted_symptoms TEXT,
          grounding_sources TEXT,
          analysis_results TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
        )
      `, (err: any) => {
        if (err) {
          console.error('Error creating messages table:', err);
          reject(err);
        } else {
          console.log('Database initialized successfully');
          resolve();
        }
      });
    });
  });
}

export function runAsync<T>(sql: string, params: any[] = []): Promise<T> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(this: any, err: any) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes } as T);
      }
    });
  });
}

export function getAsync<T>(sql: string, params: any[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err: any, row: any) => {
      if (err) {
        reject(err);
      } else {
        resolve(row as T | undefined);
      }
    });
  });
}

export function allAsync<T>(sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err: any, rows: any) => {
      if (err) {
        reject(err);
      } else {
        resolve((rows || []) as T[]);
      }
    });
  });
}

export { db };
