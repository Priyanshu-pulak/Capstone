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
- `LangChain + LangGraph` power the single-video chat flow
- `Google Gemini` is used for chat, summarization, quiz generation, perspectives, and concept graphs
- `FAISS` stores per-video local indexes under `backend/local_indexes/`
- `SQLModel + SQLite` persist users, video history, and saved summary text
- `youtube-transcript-api` fetches transcripts directly from YouTube

### Frontend

- `React 18 + Vite + TypeScript`
- Component-based UI refactor with dedicated panels for chat, quiz, perspectives, and concept maps
- `Axios` API client with JWT token injection
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

- Backend: FastAPI, SQLModel, LangChain, LangGraph, FAISS, Google Generative AI, YouTube Transcript API
- Frontend: React, Vite, TypeScript, Axios, Framer Motion
- Persistence: SQLite, local FAISS index folders, browser `localStorage`

## Requirements

- Python `3.13+`
- Node.js `18+`
- npm
- A valid Google AI API key

## Environment Variables

Create `backend/.env`:

```env
GOOGLE_API_KEY=your_google_api_key
SECRET_KEY=your_secret_key_here
```

Notes:

- `GOOGLE_API_KEY` is required
- `SECRET_KEY` is optional for local development, but you should set it in any real deployment

## Getting Started

### 1. Start the backend

Using `uv`:

```bash
cd backend
uv sync
uv run uvicorn main:app --reload
```

Using `venv` + `pip`:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn main:app --reload
```

Backend runs at `http://127.0.0.1:8000`.

### 2. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on Vite's dev server, normally `http://127.0.0.1:5173`.

The frontend proxies `/api/*` requests to the FastAPI backend through `frontend/vite.config.ts`.

## Project Structure

```text
VidQuery/
├── README.md
├── package.json
├── backend/
│   ├── main.py
│   ├── pyproject.toml
│   ├── uv.lock
│   ├── vidquery.db
│   ├── legacy/
│   │   ├── link.txt
│   │   └── main_legacy.py
│   ├── local_indexes/
│   │   └── <video_id>_{qa,summary}/
│   ├── src/
│   │   ├── chain/
│   │   │   ├── agent.py
│   │   │   ├── chatbot_chain.py
│   │   │   ├── qa_chain.py
│   │   │   └── summary_chain.py
│   │   ├── database/
│   │   │   └── models.py
│   │   ├── prompt_templates/
│   │   │   └── prompt.py
│   │   ├── schema/
│   │   │   └── query_category.py
│   │   ├── vector_stores/
│   │   │   ├── qa_vector_store.py
│   │   │   └── summary_vector_store.py
│   │   ├── utils.py
│   │   └── youtube_chatbot.py
│   └── tests/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── src/
│       ├── App.tsx
│       ├── api.ts
│       ├── index.css
│       ├── main.tsx
│       └── components/
│           ├── AuthPage.tsx
│           ├── ChatPanel.tsx
│           ├── ConceptMapPanel.tsx
│           ├── PerspectivesPanel.tsx
│           ├── QuizPanel.tsx
│           └── Sidebar.tsx
└── .gitignore
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
- `frontend/src/api.ts`: Axios instance with JWT auth header injection
- `frontend/src/components/AuthPage.tsx`: login/signup screen
- `frontend/src/components/Sidebar.tsx`: video list and add/remove UI
- `frontend/src/components/ChatPanel.tsx`: reusable chat panel for single-video and cross-video modes
- `frontend/src/components/QuizPanel.tsx`: quiz generation UI
- `frontend/src/components/PerspectivesPanel.tsx`: multi-perspective summary UI
- `frontend/src/components/ConceptMapPanel.tsx`: concept dependency map UI

## API Overview

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`

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

- User accounts, video history, and saved summaries live in `backend/vidquery.db`
- Generated FAISS indexes are written to `backend/local_indexes/`
- JWT auth state is stored in browser `localStorage`
- The backend also keeps an in-memory transcript cache while the server is running

## Development Notes

- `backend/legacy/` keeps older prototype code for reference
- `backend/tests/` currently looks closer to smoke/integration scripts than a full automated test suite
- `backend/local_indexes/` is gitignored because it is generated locally

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

## Future Cleanup Opportunities

- move remaining mode-specific logic out of `App.tsx`
- improve error handling in the frontend for backend rate-limit responses
- add a more complete automated test suite
- replace older root-level helper scripts with scripts that match the current refactored layout
