import express, { Request, Response } from 'express';
import { generateUUID } from '../utils/uuid.js';
import { getAsync, allAsync, runAsync } from '../database.js';

const router = express.Router();

interface ChatSession {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  session_id: string;
  role: string;
  content: string;
  image_url?: string;
  extracted_symptoms?: string;
  grounding_sources?: string;
  analysis_results?: string;
  timestamp: string;
}

interface SessionWithMessages extends ChatSession {
  messages: Message[];
}

// Get all sessions for a user
router.get('/sessions/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const sessions = await allAsync<ChatSession>(
      `SELECT * FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC`,
      [userId]
    );

    // Get messages for each session
    const sessionsWithMessages = await Promise.all(
      sessions.map(async (session) => {
        const messages = await allAsync<Message>(
          'SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC',
          [session.id]
        );
        
        const parsedMessages = messages.map(msg => ({
          ...msg,
          extracted_symptoms: msg.extracted_symptoms ? JSON.parse(msg.extracted_symptoms) : undefined,
          grounding_sources: msg.grounding_sources ? JSON.parse(msg.grounding_sources) : undefined,
          analysis_results: msg.analysis_results ? JSON.parse(msg.analysis_results) : undefined
        }));

        return { ...session, messages: parsedMessages };
      })
    );

    res.json({ sessions: sessionsWithMessages });
  } catch (error: any) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Get specific session with messages
router.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await getAsync<ChatSession>(
      'SELECT * FROM chat_sessions WHERE id = ?',
      [sessionId]
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const messages = await allAsync<Message>(
      'SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC',
      [sessionId]
    );

    // Parse JSON fields
    const parsedMessages = messages.map(msg => ({
      ...msg,
      extracted_symptoms: msg.extracted_symptoms ? JSON.parse(msg.extracted_symptoms) : undefined,
      grounding_sources: msg.grounding_sources ? JSON.parse(msg.grounding_sources) : undefined,
      analysis_results: msg.analysis_results ? JSON.parse(msg.analysis_results) : undefined
    }));

    res.json({ session, messages: parsedMessages });
  } catch (error: any) {
    console.error('Get session error:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// Create new session
router.post('/session', async (req: Request, res: Response) => {
  try {
    const { userId, title } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const sessionId = generateUUID();
    const now = new Date().toISOString();

    await runAsync(
      'INSERT INTO chat_sessions (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [sessionId, userId, title || 'New Consultation', now, now]
    );

    const newSession: SessionWithMessages = {
      id: sessionId,
      user_id: userId,
      title: title || 'New Consultation',
      created_at: now,
      updated_at: now,
      messages: []
    };

    res.status(201).json({ session: newSession });
  } catch (error: any) {
    console.error('Create session error:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Save message to session
router.post('/message', async (req: Request, res: Response) => {
  try {
    const { sessionId, role, content, imageUrl, extractedSymptoms, groundingSources, analysisResults, messageId } = req.body;

    if (!sessionId || !role || !content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Use provided messageId or generate a new one
    const id = messageId || generateUUID();
    const now = new Date().toISOString();

    // Try to insert, if it fails due to duplicate ID, update instead
    try {
      await runAsync(
        `INSERT INTO messages (id, session_id, role, content, image_url, extracted_symptoms, grounding_sources, analysis_results, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          sessionId,
          role,
          content,
          imageUrl || null,
          extractedSymptoms ? JSON.stringify(extractedSymptoms) : null,
          groundingSources ? JSON.stringify(groundingSources) : null,
          analysisResults ? JSON.stringify(analysisResults) : null,
          now
        ]
      );
    } catch (insertError: any) {
      // If unique constraint violation, update instead
      if (insertError.code === 'SQLITE_CONSTRAINT') {
        await runAsync(
          `UPDATE messages SET role = ?, content = ?, image_url = ?, extracted_symptoms = ?, grounding_sources = ?, analysis_results = ?, timestamp = ?
           WHERE id = ?`,
          [
            role,
            content,
            imageUrl || null,
            extractedSymptoms ? JSON.stringify(extractedSymptoms) : null,
            groundingSources ? JSON.stringify(groundingSources) : null,
            analysisResults ? JSON.stringify(analysisResults) : null,
            now,
            id
          ]
        );
      } else {
        throw insertError;
      }
    }

    // Update session's updated_at timestamp
    await runAsync(
      'UPDATE chat_sessions SET updated_at = ? WHERE id = ?',
      [now, sessionId]
    );

    const message: Message = {
      id,
      session_id: sessionId,
      role,
      content,
      image_url: imageUrl,
      extracted_symptoms: extractedSymptoms ? JSON.stringify(extractedSymptoms) : undefined,
      grounding_sources: groundingSources ? JSON.stringify(groundingSources) : undefined,
      analysis_results: analysisResults ? JSON.stringify(analysisResults) : undefined,
      timestamp: now
    };

    res.status(201).json({ message });
  } catch (error: any) {
    console.error('Save message error:', error);
    res.status(500).json({ error: 'Failed to save message' });
  }
});

// Update session title
router.put('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { title } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Missing title' });
    }

    await runAsync(
      'UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?',
      [title, new Date().toISOString(), sessionId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Update session error:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// Delete session
router.delete('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    await runAsync(
      'DELETE FROM chat_sessions WHERE id = ?',
      [sessionId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete session error:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// Clear all user data
router.delete('/user/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    await runAsync(
      'DELETE FROM chat_sessions WHERE user_id = ?',
      [userId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Clear user data error:', error);
    res.status(500).json({ error: 'Failed to clear user data' });
  }
});

export default router;
