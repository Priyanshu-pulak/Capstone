# VidQuery

VidQuery is a full-stack YouTube learning assistant. It combines a FastAPI backend, a React + Vite frontend, Gemini-powered analysis, LangChain retrieval chains, and local FAISS indexes so you can turn YouTube transcripts into a searchable study workspace.

## What It Does

- Process a YouTube video and fetch its transcript
- Ask questions about a single video through a LangChain agent
- Compare ideas across multiple processed videos
- Generate MCQ or short-answer quizzes
- Create multi-perspective summaries
- Visualize a concept dependency map
- Persist user accounts and per-user video history

## Current Architecture

### Backend

- `FastAPI` serves auth, video processing, querying, quiz, summary, and concept graph endpoints
- `LangChain` powers the single-video chat flow
- `Google Gen AI SDK` and `langchain-google-genai` power Gemini-backed chat, quiz, summary, and concept-map generation
- `FAISS` stores per-video local indexes under `backend/local_indexes/`
- `SQLModel + SQLite` persist users, video history, and saved summary text
- `youtube-transcript-api` fetches transcripts directly from YouTube
- `uv` is used for ultra-fast dependency management

### Frontend

- `React 18 + Vite + TypeScript`
- Component-based UI with dedicated panels for chat, quiz, perspectives, and concept maps
- `Axios` API client with cookie-backed auth and legacy bearer-token fallback
- `Framer Motion`, `lucide-react`, `clsx`, and `tailwind-merge` for UI behavior/styling

## How The App Works

### Single-video chat

1. The frontend sends `POST /process` with a YouTube URL.
2. The backend fetches the transcript, caches it in memory, and stores the video in user history.
3. On `POST /query`, the backend builds a LangChain chatbot flow:
   - transcript is split into chunks
   - QA and summary FAISS indexes are loaded or created
   - a Gemini-backed agent chooses between transcript search and summary tools
4. The final answer is returned to the chat UI.

### Cross-video and generation features

- `POST /query/cross` combines cached transcripts from selected videos and asks Gemini directly
- `POST /quiz` generates structured quiz JSON from the transcript
- `POST /summary/perspectives` generates student, developer, business, and beginner/expert views
- `POST /concept-graph` returns graph JSON for the concept map UI

## Tech Stack

- Backend: FastAPI, SQLModel, LangChain, FAISS, Google Gen AI SDK, YouTube Transcript API
- Frontend: React, Vite, TypeScript, Axios, Framer Motion
- Persistence: SQLite, local FAISS index folders, browser `localStorage` for per-user UI state

## Requirements

- Python `3.14`
- `uv` (Fast Python package and project manager)
- Node.js `18+`
- npm
- A valid Google AI API key

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in your values:

```bash
cp backend/.env.example backend/.env
```

Then set:

```env
VIDQUERY_ENV=development
GOOGLE_API_KEY=your_google_api_key
SECRET_KEY=your_secret_key_here
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Notes:

- `GOOGLE_API_KEY` is required
- `SECRET_KEY` should always be set to a long random value outside throwaway local testing
- `VIDQUERY_ENV=production` now requires a real `SECRET_KEY`; development falls back to an ephemeral secret only if you forget to set one
- `CORS_ORIGINS` should list the allowed frontend origins as a comma-separated string

## Getting Started

### 1. Install dependencies

From the project root:

```bash
npm install
npm run install:backend
npm run install:frontend
```

You can also use the combined command:

```bash
npm run install:all
```

### 2. Start the backend

We use `uv` for dependency management and the FastAPI CLI to run the development server:

```bash
cd backend
uv sync
uv run fastapi dev main.py
```

The backend runs at `http://127.0.0.1:8000`.

You can also start it from the project root with:

```bash
npm run dev:backend
```

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on Vite's dev server, normally `http://127.0.0.1:5173`.
All `/api/*` requests are proxied to the FastAPI backend through `frontend/vite.config.ts`.

You can also start it from the project root with:

```bash
npm run dev:frontend
```

### 4. Start both together

From the project root:

```bash
npm run dev
```

### 5. Quick verification

Run the static checks from the project root:

```bash
npm run check
```

This now includes an offline backend regression smoke suite for the core flows we have stabilized so far.

With the backend running, verify the health endpoint:

```bash
npm run smoke:backend
```

Expected result:

- a JSON response with `"status": "ok"`
- `"database": "ok"`

## Project Structure

```text
VidQuery/
├── README.md
├── package.json
├── backend/
│   ├── .env
│   ├── .python-version
│   ├── main.py
│   ├── pyproject.toml
│   ├── legacy/
│   │   └── link.txt
│   ├── local_indexes/
│   │   └── <video_id>_{qa,summary}/
│   └── src/
│       ├── __init__.py
│       ├── utils.py
│       ├── youtube_chatbot.py
│       ├── chain/
│       │   ├── __init__.py
│       │   ├── agent.py
│       │   ├── chatbot_chain.py
│       │   ├── qa_chain.py
│       │   └── summary_chain.py
│       ├── database/
│       │   ├── __init__.py
│       │   └── models.py
│       ├── prompt_templates/
│       │   ├── __init__.py
│       │   └── prompt.py
│       ├── schema/
│       │   ├── __init__.py
│       │   └── query_category.py
│       └── vector_stores/
│           ├── __init__.py
│           ├── qa_vector_store.py
│           └── summary_vector_store.py
└── frontend/
    ├── index.html
    ├── package.json
    ├── postcss.config.js
    ├── tailwind.config.js
    ├── tsconfig.json
    ├── tsconfig.node.json
    ├── vite.config.ts
    └── src/
        ├── api.ts
        ├── App.tsx
        ├── index.css
        ├── main.tsx
        └── components/
            ├── AuthPage.tsx
            ├── ChatPanel.tsx
            ├── ConceptMapPanel.tsx
            ├── PerspectivesPanel.tsx
            ├── QuizPanel.tsx
            └── SideBar.tsx
```

## Key Files

### Backend

- `backend/main.py`: FastAPI entrypoint, auth, history, processing, query, quiz, summary, concept map, and delete routes
- `backend/src/chain/chatbot_chain.py`: builds the Gemini + LangChain single-video chatbot flow
- `backend/src/chain/agent.py`: defines the tool-using agent for transcript search and summary retrieval
- `backend/src/vector_stores/qa_vector_store.py`: loads or builds QA FAISS indexes
- `backend/src/vector_stores/summary_vector_store.py`: loads or builds summary FAISS indexes and saves summary text
- `backend/src/database/models.py`: SQLModel tables and SQLite engine setup
- `backend/src/utils.py`: YouTube ID parsing, transcript fetching, and transcript chunking

### Frontend

- `frontend/src/App.tsx`: main app shell, auth gating, mode switching, selected-video state, and orchestration
- `frontend/src/api.ts`: Axios instance with cookie-backed auth and legacy bearer fallback
- `frontend/src/components/AuthPage.tsx`: login/signup screen
- `frontend/src/components/SideBar.tsx`: video list and add/remove UI
- `frontend/src/components/ChatPanel.tsx`: reusable chat panel for single-video and cross-video modes
- `frontend/src/components/QuizPanel.tsx`: quiz generation UI
- `frontend/src/components/PerspectivesPanel.tsx`: multi-perspective summary UI
- `frontend/src/components/ConceptMapPanel.tsx`: concept dependency map UI

## API Overview

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`

### Videos and history

- `GET /history`
- `POST /process`
- `GET /videos`
- `POST /videos/delete`

### Queries and analysis

- `POST /query`
- `POST /query/cross`
- `POST /quiz`
- `POST /summary/perspectives`
- `POST /concept-graph`

## Persistence and Generated Data

- User accounts, video history, and saved summaries live in the `vidquery.db` SQLite database
- Generated FAISS indexes are written to `backend/local_indexes/`
- Auth now uses an HttpOnly session cookie in the browser; `localStorage` is only used for lightweight UI state such as the saved username and per-user panel data
- The backend also keeps runtime transcript and agent caches in memory, but those caches are ephemeral and rebuilt on demand

## Development Notes

- `backend/legacy/` keeps older prototype code for reference
- `backend/local_indexes/` should remain gitignored because it is generated locally

## Troubleshooting

### Gemini 429 / rate limit errors

The app uses Gemini heavily, especially for chat, quizzes, perspectives, and concept maps. On free-tier quotas you may hit `429 RESOURCE_EXHAUSTED`.

What to do:

- wait and retry after the cooldown window
- reduce repeated requests while testing
- check your Google AI quota and billing setup

### Video has no transcript

If YouTube transcripts are disabled or unavailable, processing will fail because transcript retrieval is required for most features.

### Frontend cannot reach backend

Make sure:

- backend is running on `127.0.0.1:8000`
- frontend is running through Vite
- requests are going through `/api` so the proxy in `frontend/vite.config.ts` is used
