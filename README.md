# Dr. Davinci Backend API

Medical AI chatbot backend service built with Express.js and SQLite.

## Features

- **Authentication**: Secure user registration and login with bcryptjs
- **Chat Sessions**: Full conversation history management
- **AI Integration**: Google Gemini API for clinical reasoning
- **Medical Database**: Comprehensive symptoms and diseases mapping
- **NLP Processing**: Local symptom extraction and disease inference
- **Grounding Sources**: Medical reference links from web search

## Quick Start

### Local Development

```bash
npm install
npm run dev
```

Server runs on `http://localhost:5000`

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
PORT=5000
NODE_ENV=production
GEMINI_API_KEY=your_key_here
DATABASE_PATH=./database/medical_db.sqlite
CORS_ORIGIN=https://your-frontend.vercel.app
```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/verify` - Verify user token

### Chat History
- `GET /api/history/sessions/:userId` - Get all sessions
- `GET /api/history/session/:sessionId` - Get single session
- `POST /api/history/session` - Create new session
- `PUT /api/history/session/:sessionId` - Update session
- `DELETE /api/history/session/:sessionId` - Delete session
- `POST /api/history/message` - Save message
- `DELETE /api/history/user/:userId` - Clear user data

## Deployment

### Deploy to Vercel

1. Push this repo to GitHub
2. Go to https://vercel.com/new
3. Import this repository
4. Add environment variables:
   - `GEMINI_API_KEY` - Your Gemini API key
   - `NODE_ENV` - Set to `production`
5. Deploy

Your backend URL will be: `https://your-project.vercel.app`

## Tech Stack

- **Express.js** - Web framework
- **SQLite3** - Database
- **TypeScript** - Language
- **bcryptjs** - Password hashing
- **Google Generative AI** - LLM integration

## Architecture

```
server/
├── index.ts           # Express server entry point
├── database.ts        # SQLite setup and schema
├── routes/
│   ├── auth.ts       # Authentication endpoints
│   └── history.ts    # Chat history endpoints
└── utils/
    └── uuid.ts       # Utility functions
```

## License

MIT
