# VidQuery

VidQuery is a full-stack YouTube learning assistant with a FastAPI backend and a Vite + React frontend. It lets you process YouTube videos, chat with their transcripts, compare ideas across multiple videos, generate quizzes, view perspective-based summaries, and explore concept graphs.

## Features

- FastAPI backend for transcript processing, querying, auth, and video history
- React frontend for an interactive chat-style experience
- YouTube transcript extraction and caching
- Single-video Q&A and cross-video querying
- Quiz generation in MCQ or short-answer format
- Perspective summaries for student, developer, business, and beginner/expert views
- Concept graph generation for key ideas and dependencies
- Modular LangChain-based backend components for retrieval and summarization
- Local FAISS index storage under `backend/local_indexes/`

## Requirements

- Python 3.13+
- Node.js 18+ and npm
- A Google AI API key

## Environment Variables

Create a `.env` file in `backend/` before starting the backend.

```env
GOOGLE_API_KEY=your_google_api_key
SECRET_KEY=your_secret_key_here
```

`SECRET_KEY` is optional in development. If omitted, the backend uses a default fallback value.

## Running the Project

### Backend

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

The backend starts on `http://localhost:8000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on Vite's default dev server and proxies `/api` requests to `http://localhost:8000`.

## Project Structure

```text
VidQuery/
├── package.json
├── README.md
├── .gitignore
├── backend/
│   ├── main.py
│   ├── pyproject.toml
│   ├── legacy/
│   │   ├── link.txt
│   │   └── main_legacy.py
│   ├── local_indexes/
│   │   ├── Gl7VxhxV9Dg_qa/
│   │   ├── Gl7VxhxV9Dg_summary/
│   │   └── ... (additional FAISS index folders)
│   ├── src/
│   │   ├── __init__.py
│   │   ├── utils.py
│   │   ├── youtube_chatbot.py
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
│   │   └── vector_stores/
│   │       ├── qa_vector_store.py
│   │       └── summary_vector_store.py
│   └── tests/
│       ├── test_fastapi.py
│       ├── test_gemini_api.py
│       ├── test_process.py
│       └── test_write.py
└── frontend/
    ├── index.html
    ├── package.json
    ├── postcss.config.js
    ├── tailwind.config.js
    ├── tsconfig.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx
        ├── index.css
        └── main.tsx
```

## Backend Overview

- `backend/main.py`: FastAPI app with auth, history, transcript processing, querying, quiz generation, summaries, and concept graph endpoints
- `backend/src/utils.py`: transcript fetching, video ID parsing, and transcript chunking helpers
- `backend/src/chain/`: modular LangChain orchestration for question answering and summarization
- `backend/src/vector_stores/`: FAISS index creation and loading for transcript and summary retrieval
- `backend/src/database/models.py`: SQLite models and persistence helpers
- `backend/local_indexes/`: generated local vector indexes for processed videos

## Frontend Overview

- `frontend/src/App.tsx`: main application UI, authentication flow, chat, quiz, perspectives, and concept graph views
- `frontend/src/main.tsx`: React entry point
- `frontend/src/index.css`: global styling
- `frontend/vite.config.ts`: Vite config with `/api` proxy to the backend

## API Highlights

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `GET /history`
- `POST /process`
- `GET /videos`
- `POST /query`
- `POST /query/cross`
- `POST /quiz`
- `POST /summary/perspectives`
- `POST /concept-graph`
- `POST /videos/delete`

## Notes

- `backend/local_indexes/` contains generated FAISS data and is ignored by git.
- The `backend/legacy/` directory keeps older entrypoint code for reference.
- The files in `backend/tests/` currently act more like smoke scripts than a full automated test suite.
