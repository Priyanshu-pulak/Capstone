from pydantic import BaseModel, Field, EmailStr
from typing import Annotated
from fastapi import FastAPI, HTTPException, Depends, Request, Response
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
import json
import re
import secrets
from typing import Optional
from copy import deepcopy
from dotenv import load_dotenv
import logging
from datetime import datetime, timedelta, UTC
from src.chain import build_chatbot_chain

from google import genai
from src.utils import fetch_transcript, get_video_id
from src.database.models import (
    create_db_and_tables,
    User,
    VideoHistory,
    engine,
    Session,
    select,
)
from passlib.context import CryptContext
from jose import JWTError, jwt

from typing import Any


logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

def extract_clean_answer(content: str | list[dict[str, Any]]) -> str:
    """Safely extracts the final text from model output, filtering out thinking blocks."""
    # If the model didn't use a thinking block and just returned a string
    if isinstance(content, str):
        return content
        
    # If the model returned a structured list of blocks
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                return block.get("text", "")
                
    # Fallback just in case the format is completely unexpected
    return str(content)

load_dotenv()

APP_ENV = os.getenv("VIDQUERY_ENV", "development").strip().lower() or "development"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 72
SESSION_COOKIE_NAME = "vq_access_token"
DEFAULT_DEV_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]
WEAK_SECRET_KEY_VALUES = {
    "",
    "replace-this-with-a-long-random-secret",
    "vidquery-secret-key-change-in-production",
    "your_secret_key_here",
}


def _parse_cors_origins(raw_origins: str | None) -> list[str]:
    if not raw_origins:
        return DEFAULT_DEV_CORS_ORIGINS.copy()

    parsed_origins = [
        origin.strip().rstrip("/")
        for origin in raw_origins.split(",")
        if origin.strip()
    ]
    return parsed_origins or DEFAULT_DEV_CORS_ORIGINS.copy()


def _resolve_secret_key() -> str:
    configured_secret = os.getenv("SECRET_KEY", "").strip()
    if configured_secret and configured_secret not in WEAK_SECRET_KEY_VALUES:
        return configured_secret

    if APP_ENV == "production":
        raise RuntimeError(
            "SECRET_KEY must be set to a strong value when VIDQUERY_ENV=production."
        )

    logger.warning(
        "Using an ephemeral development SECRET_KEY. "
        "Set SECRET_KEY in backend/.env to keep sessions stable across restarts."
    )
    return secrets.token_urlsafe(32)


SECRET_KEY = _resolve_secret_key()
COOKIE_SECURE = APP_ENV == "production"
COOKIE_MAX_AGE_SECONDS = ACCESS_TOKEN_EXPIRE_HOURS * 60 * 60
CORS_ORIGINS = _parse_cors_origins(os.getenv("CORS_ORIGINS"))

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)

app = FastAPI(title="VidQuery API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# In-memory transcript cache
video_transcripts: dict[str, str] = {}
video_meta: dict[str, dict] = {}
video_agents: dict[str, Any] = {}
feature_results_cache: dict[str, dict[tuple[Any, ...], dict[str, Any]]] = {
    "quiz": {},
    "perspectives": {},
    "concept_graph": {},
}
model_cache: dict[str, Any] = {}
genai_client_cache: dict[str, Any] = {}

INVALID_YOUTUBE_URL_DETAIL = (
    "Invalid YouTube URL. Please provide a valid video link or 11-character video ID."
)
INVALID_MODEL_RESPONSE_DETAIL = (
    "The AI returned an unreadable response. Please try again."
)
CONTEXT_SELECTION_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "give",
    "how",
    "in",
    "is",
    "it",
    "me",
    "of",
    "on",
    "or",
    "please",
    "summarize",
    "summary",
    "tell",
    "that",
    "the",
    "these",
    "this",
    "to",
    "video",
    "videos",
    "what",
    "with",
}


def _database_is_available() -> bool:
    try:
        with Session(engine) as session:
            session.exec(select(User).limit(1)).first()
        return True
    except Exception:
        logger.exception("Database health check failed.")
        return False


class VideoProcessRequest(BaseModel):
    video_url: Annotated[str, Field(..., description="Full URL of the YouTube video")]


class QueryRequest(BaseModel):
    video_url: Annotated[str, Field(..., description="Full URL of the YouTube video")]
    question: Annotated[
        str,
        Field(..., min_length=2, description="The user's query regarding the video"),
    ]


class CrossVideoQueryRequest(BaseModel):
    question: Annotated[str, Field(..., min_length=2)]
    video_urls: Annotated[
        list[str] | None,
        Field(
            default=None, description="Specific videos to query. If None, queries all."
        ),
    ]


class QuizRequest(BaseModel):
    video_url: Annotated[str, Field(...)]
    num_questions: Annotated[
        int,
        Field(default=5, ge=1, le=20, description="Number of questions to generate"),
    ]
    quiz_type: Annotated[str, Field(default="mcq", pattern="^(mcq|short)$")]
    force_new: Annotated[
        bool,
        Field(default=False, description="Bypass quiz cache and generate a fresh quiz."),
    ]
    generation_id: Annotated[
        str | None,
        Field(default=None, max_length=80, description="Optional client generation nonce."),
    ]


class PerspectiveSummaryRequest(BaseModel):
    video_url: Annotated[str, Field(...)]


class ConceptGraphRequest(BaseModel):
    video_url: Annotated[str, Field(...)]


class RegisterRequest(BaseModel):
    username: Annotated[str, Field(..., min_length=3, max_length=50)]
    email: Annotated[EmailStr, Field(...)]
    password: Annotated[
        str, Field(..., min_length=6, description="User's plain text password")
    ]


class LoginRequest(BaseModel):
    email: Annotated[EmailStr, Field(...)]
    password: Annotated[str, Field(...)]


class PasswordUpdateRequest(BaseModel):
    current_password: Annotated[str, Field(..., min_length=1)]
    new_password: Annotated[
        str, Field(..., min_length=6, description="User's new plain text password")
    ]


class UsernameUpdateRequest(BaseModel):
    username: Annotated[str, Field(..., min_length=3, max_length=50)]


class DeleteAccountRequest(BaseModel):
    current_password: Annotated[str, Field(..., min_length=1)]


'''
Authentication system using JWT tokens, with password hashing via Argon2. The /auth/register and /auth/login endpoints allow users to create accounts and log in, returning a JWT token for authenticated requests. The get_current_user dependency decodes the token to identify the user for protected routes. Passwords are securely hashed before storage, and verified during login.
'''

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_token(user_id: int, username: str) -> str:
    payload = {
        "sub": str(user_id),
        "username": username,
        # Using modern timezone-aware datetime
        "exp": datetime.now(UTC) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=COOKIE_MAX_AGE_SECONDS,
        expires=COOKIE_MAX_AGE_SECONDS,
        path="/",
    )


def _clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
    )


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict | None:
    token_candidates: list[str] = []

    if credentials and credentials.credentials:
        token_candidates.append(credentials.credentials)

    cookie_token = request.cookies.get(SESSION_COOKIE_NAME)
    if cookie_token and cookie_token not in token_candidates:
        token_candidates.append(cookie_token)

    for token in token_candidates:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = int(payload["sub"])
        except (JWTError, TypeError, ValueError):
            continue

        with Session(engine) as session:
            user = session.get(User, user_id)
            if user:
                return {"id": user.id, "username": user.username}

    return None


def require_current_user(
    current_user: Optional[dict] = Depends(get_current_user),
) -> dict:
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    return current_user


def extract_json(text: str) -> dict:
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        text = match.group(1).strip()
    else:
        match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", text)
        if match:
            text = match.group(1).strip()
    return json.loads(text)


def parse_model_json(text: str) -> dict:
    try:
        return extract_json(text)
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        logger.warning("Model returned invalid JSON output.", exc_info=True)
        raise HTTPException(
            status_code=502,
            detail=INVALID_MODEL_RESPONSE_DETAIL,
        ) from exc


def _get_saved_video_title(video_url: str) -> str | None:
    with Session(engine) as session:
        row = session.exec(
            select(VideoHistory).where(VideoHistory.video_url == video_url)
        ).first()
        return row.title if row else None


def _get_user_videos(user_id: int) -> list[dict[str, str]]:
    with Session(engine) as session:
        rows = session.exec(
            select(VideoHistory).where(VideoHistory.user_id == user_id)
        ).all()
        return [
            {"video_id": row.video_id, "url": row.video_url, "title": row.title}
            for row in rows
        ]


def _get_user_video_urls(user_id: int) -> set[str]:
    return {video["url"] for video in _get_user_videos(user_id)}


def _require_user_video_access(user_id: int, video_url: str) -> None:
    if video_url not in _get_user_video_urls(user_id):
        raise HTTPException(
            status_code=403,
            detail="This video is not available in your history.",
        )


def _has_video_history_references(video_url: str) -> bool:
    with Session(engine) as session:
        row = session.exec(
            select(VideoHistory).where(VideoHistory.video_url == video_url)
        ).first()
        return row is not None


def _ensure_video_meta(video_url: str) -> dict[str, str]:
    if video_url in video_meta:
        return video_meta[video_url]

    video_id = get_video_id(video_url) or ""
    saved_title = _get_saved_video_title(video_url)
    title = saved_title or (f"Video {video_id[:8]}..." if video_id else video_url[:40])
    metadata = {"video_id": video_id, "url": video_url, "title": title}
    video_meta[video_url] = metadata
    return metadata


def _get_or_fetch_transcript(video_url: str) -> str:
    if not get_video_id(video_url):
        raise HTTPException(
            status_code=400,
            detail=INVALID_YOUTUBE_URL_DETAIL,
        )
    if video_url not in video_transcripts:
        transcript = fetch_transcript(video_url)
        if not transcript:
            raise HTTPException(status_code=404, detail="No transcript found.")
        video_transcripts[video_url] = transcript
    _ensure_video_meta(video_url)
    return video_transcripts[video_url]


def _chunk_text(text: str, chunk_chars: int, overlap_chars: int) -> list[str]:
    if not text:
        return []

    chunks: list[str] = []
    start = 0
    text_length = len(text)
    step = max(1, chunk_chars - overlap_chars)

    while start < text_length:
        end = min(text_length, start + chunk_chars)
        chunks.append(text[start:end].strip())
        if end >= text_length:
            break
        start += step

    return [chunk for chunk in chunks if chunk]


def _sample_evenly(total_items: int, sample_count: int) -> list[int]:
    if total_items <= 0 or sample_count <= 0:
        return []
    if sample_count >= total_items:
        return list(range(total_items))
    if sample_count == 1:
        return [0]

    return sorted(
        {
            round(index * (total_items - 1) / (sample_count - 1))
            for index in range(sample_count)
        }
    )


def _context_query_terms(focus_query: str | None) -> set[str]:
    if not focus_query:
        return set()

    return {
        token
        for token in re.findall(r"[A-Za-z0-9_]{3,}", focus_query.lower())
        if token not in CONTEXT_SELECTION_STOPWORDS
    }


def _score_context_chunk(chunk: str, query_terms: set[str]) -> int:
    if not query_terms:
        return 0

    chunk_terms = re.findall(r"[A-Za-z0-9_]{3,}", chunk.lower())
    return sum(1 for term in chunk_terms if term in query_terms)


def _select_transcript_context(
    transcript: str,
    max_chars: int,
    focus_query: str | None = None,
) -> str:
    """Select transcript context across the whole video while preserving a fixed budget."""
    if len(transcript) <= max_chars:
        return transcript

    chunk_chars = min(2200, max(500, max_chars // 4))
    overlap_chars = min(250, max(80, chunk_chars // 8))
    chunks = _chunk_text(transcript, chunk_chars, overlap_chars)
    if not chunks:
        return transcript[:max_chars]

    chunk_budget = max(1, max_chars // (chunk_chars + 80))
    query_terms = _context_query_terms(focus_query)
    selected_indices: list[int] = []

    if query_terms:
        scored_indices = sorted(
            (
                (_score_context_chunk(chunk, query_terms), index)
                for index, chunk in enumerate(chunks)
            ),
            key=lambda item: (-item[0], item[1]),
        )
        selected_indices = [
            index for score, index in scored_indices if score > 0
        ][:chunk_budget]

    if len(selected_indices) < chunk_budget:
        for index in _sample_evenly(len(chunks), chunk_budget):
            if index not in selected_indices:
                selected_indices.append(index)
            if len(selected_indices) >= chunk_budget:
                break

    selected_indices = sorted(selected_indices)
    selected_chunks = [
        f"[Transcript segment {index + 1}/{len(chunks)}]\n{chunks[index]}"
        for index in selected_indices
    ]
    selected_context = "\n\n".join(selected_chunks)
    return selected_context[:max_chars]


def _get_or_build_chatbot_agent(video_url: str):
    if video_url in video_agents:
        return video_agents[video_url]

    transcript = _get_or_fetch_transcript(video_url)
    agent = build_chatbot_chain(video_url, transcript=transcript)
    if not agent:
        raise HTTPException(
            status_code=400,
            detail="Failed to initialize the AI agent for this video.",
        )

    video_agents[video_url] = agent
    return agent


def _get_google_api_key() -> str:
    api_key = (os.getenv("GOOGLE_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError(
            "GOOGLE_API_KEY is not configured. Set GOOGLE_API_KEY in backend/.env."
        )
    return api_key


def _get_genai_client():
    if "default" not in genai_client_cache:
        genai_client_cache["default"] = genai.Client(api_key=_get_google_api_key())
    return genai_client_cache["default"]


class _GenAIModelAdapter:
    def __init__(self, client, model_name: str):
        self._client = client
        self._model_name = model_name

    def generate_content(self, prompt: str):
        return self._client.models.generate_content(
            model=self._model_name,
            contents=prompt,
        )


def _create_generative_model(model_name: str):
    return _GenAIModelAdapter(_get_genai_client(), model_name)


def _get_generative_model(model_name: str = "gemini-2.5-flash"):
    if model_name not in model_cache:
        model_cache[model_name] = _create_generative_model(model_name)
    return model_cache[model_name]


def _get_cached_feature_result(
    scope: str, cache_key: tuple[Any, ...]
) -> dict[str, Any] | None:
    cached = feature_results_cache[scope].get(cache_key)
    return deepcopy(cached) if cached is not None else None


def _cache_feature_result(
    scope: str, cache_key: tuple[Any, ...], result: dict[str, Any]
) -> dict[str, Any]:
    feature_results_cache[scope][cache_key] = deepcopy(result)
    return result


def _clear_video_feature_results(video_url: str) -> None:
    for cache in feature_results_cache.values():
        keys_to_delete = [key for key in cache if key and key[0] == video_url]
        for key in keys_to_delete:
            del cache[key]


# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
def on_startup():
    create_db_and_tables()


# ── Health endpoint ───────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    db_ok = _database_is_available()
    return JSONResponse(
        status_code=200 if db_ok else 503,
        content={
            "status": "ok" if db_ok else "degraded",
            "service": "VidQuery API",
            "database": "ok" if db_ok else "error",
            "google_api_key_configured": bool(os.getenv("GOOGLE_API_KEY")),
        },
    )


# ── Auth endpoints ────────────────────────────────────────────────────────────
@app.post("/auth/register")
async def register(req: RegisterRequest, response: Response):
    with Session(engine) as session:
        if session.exec(select(User).where(User.email == req.email)).first():
            raise HTTPException(status_code=400, detail="Email already registered.")
        if session.exec(select(User).where(User.username == req.username)).first():
            raise HTTPException(status_code=400, detail="Username already taken.")
        user = User(
            username=req.username,
            email=req.email,
            hashed_password=hash_password(req.password),
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        token = create_token(user.id, user.username)
        _set_auth_cookie(response, token)
        return {"token": token, "username": user.username, "email": user.email}


@app.post("/auth/login")
async def login(req: LoginRequest, response: Response):
    with Session(engine) as session:
        user = session.exec(select(User).where(User.email == req.email)).first()
        if not user or not verify_password(req.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        token = create_token(user.id, user.username)
        _set_auth_cookie(response, token)
        return {"token": token, "username": user.username, "email": user.email}


@app.get("/auth/me")
async def me(
    response: Response,
    current_user: Optional[dict] = Depends(get_current_user),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    refreshed_token = create_token(current_user["id"], current_user["username"])
    _set_auth_cookie(response, refreshed_token)
    return current_user


@app.post("/auth/profile/password")
async def update_password(
    req: PasswordUpdateRequest,
    response: Response,
    current_user: dict = Depends(require_current_user),
):
    if req.current_password == req.new_password:
        raise HTTPException(
            status_code=400,
            detail="New password must be different from your current password.",
        )

    with Session(engine) as session:
        user = session.get(User, current_user["id"])
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated.")

        if not verify_password(req.current_password, user.hashed_password):
            raise HTTPException(
                status_code=401,
                detail="Current password is incorrect.",
            )

        user.hashed_password = hash_password(req.new_password)
        session.add(user)
        session.commit()

    refreshed_token = create_token(current_user["id"], current_user["username"])
    _set_auth_cookie(response, refreshed_token)
    return {"message": "Password updated successfully."}


@app.post("/auth/profile/username")
async def update_username(
    req: UsernameUpdateRequest,
    response: Response,
    current_user: dict = Depends(require_current_user),
):
    normalized_username = req.username.strip()
    if not 3 <= len(normalized_username) <= 50:
        raise HTTPException(
            status_code=400,
            detail="Username must be between 3 and 50 characters.",
        )

    if normalized_username == current_user["username"]:
        raise HTTPException(
            status_code=400,
            detail="New username must be different from your current username.",
        )

    with Session(engine) as session:
        user = session.get(User, current_user["id"])
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated.")

        existing_user = session.exec(
            select(User)
            .where(User.username == normalized_username)
            .where(User.id != current_user["id"])
        ).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="Username already taken.")

        user.username = normalized_username
        session.add(user)
        session.commit()
        session.refresh(user)

    refreshed_token = create_token(current_user["id"], normalized_username)
    _set_auth_cookie(response, refreshed_token)
    return {
        "message": "Username updated successfully.",
        "username": normalized_username,
    }


@app.post("/auth/profile/delete")
async def delete_account(
    req: DeleteAccountRequest,
    response: Response,
    current_user: dict = Depends(require_current_user),
):
    with Session(engine) as session:
        user = session.get(User, current_user["id"])
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated.")

        if not verify_password(req.current_password, user.hashed_password):
            raise HTTPException(
                status_code=401,
                detail="Current password is incorrect.",
            )

        history_rows = session.exec(
            select(VideoHistory).where(VideoHistory.user_id == current_user["id"])
        ).all()
        affected_video_urls = {row.video_url for row in history_rows}

        for row in history_rows:
            session.delete(row)

        session.delete(user)
        session.commit()

    for video_url in affected_video_urls:
        if _has_video_history_references(video_url):
            continue
        video_transcripts.pop(video_url, None)
        video_meta.pop(video_url, None)
        video_agents.pop(video_url, None)
        _clear_video_feature_results(video_url)

    _clear_auth_cookie(response)
    return {"message": "Account deleted successfully."}


@app.post("/auth/logout")
async def logout(response: Response):
    _clear_auth_cookie(response)
    return {"message": "Logged out successfully."}


@app.get("/history")
async def get_history(current_user: Optional[dict] = Depends(get_current_user)):
    if not current_user:
        return {"videos": []}
    return {"videos": _get_user_videos(current_user["id"])}


# ── Video processing ──────────────────────────────────────────────────────────
@app.post("/process")
async def process_video(
    request: VideoProcessRequest,
    current_user: dict = Depends(require_current_user),
):
    try:
        if not get_video_id(request.video_url):
            raise HTTPException(
                status_code=400,
                detail=INVALID_YOUTUBE_URL_DETAIL,
            )
        transcript = fetch_transcript(request.video_url)
        if not transcript:
            raise HTTPException(
                status_code=400, detail="No transcript found for this video."
            )
        video_transcripts[request.video_url] = transcript
        metadata = _ensure_video_meta(request.video_url)
        video_id = metadata["video_id"] or None
        title = metadata["title"]
        video_agents.pop(request.video_url, None)
        _clear_video_feature_results(request.video_url)

        with Session(engine) as session:
            existing = session.exec(
                select(VideoHistory)
                .where(VideoHistory.user_id == current_user["id"])
                .where(VideoHistory.video_url == request.video_url)
            ).first()
            if not existing:
                session.add(
                    VideoHistory(
                        user_id=current_user["id"],
                        video_url=request.video_url,
                        video_id=video_id or "",
                        title=title,
                    )
                )
                session.commit()

        return {
            "message": "Video processed successfully",
            "video_url": request.video_url,
            "video_id": video_id,
            "title": title,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/videos")
async def list_videos(current_user: Optional[dict] = Depends(get_current_user)):
    if not current_user:
        return {"videos": []}
    return {"videos": _get_user_videos(current_user["id"])}


# ── Query endpoints ───────────────────────────────────────────────────────────
@app.post("/query")
async def query_video(
    request: QueryRequest,
    current_user: dict = Depends(require_current_user),
) -> dict[str, str]:
    try:
        _require_user_video_access(current_user["id"], request.video_url)
        agent = _get_or_build_chatbot_agent(request.video_url)

        inputs = {"messages": [("user", request.question)]}
        result = agent.invoke(inputs)

        raw_content = result["messages"][-1].content
        final_answer = extract_clean_answer(raw_content)

        return {"answer": str(final_answer)}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}", exc_info=True)

        if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
            raise HTTPException(
                status_code=429,
                detail="Google API rate limit exceeded. Please wait about 60 seconds and try again.",
            )

        raise HTTPException(
            status_code=500, detail="An internal server error occurred."
        )


@app.post("/query/cross")
async def cross_video_query(
    request: CrossVideoQueryRequest,
    current_user: dict = Depends(require_current_user),
):
    available_urls = _get_user_video_urls(current_user["id"])
    target_urls = request.video_urls if request.video_urls else list(available_urls)
    if not target_urls:
        raise HTTPException(
            status_code=400, detail="No videos selected for cross-video analysis."
        )
    unauthorized_urls = [url for url in target_urls if url not in available_urls]
    if unauthorized_urls:
        raise HTTPException(
            status_code=403,
            detail="One or more selected videos are not available in your history.",
        )

    video_contexts = []
    for url in target_urls:
        try:
            transcript = _get_or_fetch_transcript(url)
        except HTTPException:
            continue

        title = _ensure_video_meta(url)["title"]
        selected_context = _select_transcript_context(
            transcript,
            max_chars=10000,
            focus_query=request.question,
        )
        video_contexts.append(f"[VIDEO: {title}]\n{selected_context}")

    if not video_contexts:
        raise HTTPException(
            status_code=400,
            detail="None of the selected videos have available transcripts.",
        )

    combined = "\n\n---\n\n".join(video_contexts)
    try:
        model = _get_generative_model()
        response = model.generate_content(f"""You have access to MULTIPLE video transcripts:
{combined}
---
Answer across all videos, citing [VIDEO: ...] labels:
{request.question}""")
        return {"answer": response.text}
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}", exc_info=True)
        if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
            raise HTTPException(
                status_code=429,
                detail="Google API rate limit exceeded. Please wait about 60 seconds and try again.",
            )
        raise HTTPException(
            status_code=500, detail="An internal server error occurred."
        )


@app.post("/quiz")
async def generate_quiz(
    request: QuizRequest,
    current_user: dict = Depends(require_current_user),
):
    _require_user_video_access(current_user["id"], request.video_url)
    transcript = _get_or_fetch_transcript(request.video_url)
    cache_key = (request.video_url, request.num_questions, request.quiz_type)
    if not request.force_new:
        cached_result = _get_cached_feature_result("quiz", cache_key)
        if cached_result is not None:
            return cached_result
    try:
        model = _get_generative_model()
        selected_context = _select_transcript_context(transcript, max_chars=25000)
        freshness_instruction = (
            "\nCreate a fresh set of questions with varied wording and examples. "
            f"Generation id: {request.generation_id or 'fresh'}."
            if request.force_new
            else ""
        )
        if request.quiz_type == "mcq":
            prompt = f"""Generate exactly {request.num_questions} MCQs from this transcript.{freshness_instruction}
Transcript: {selected_context}
Return ONLY valid JSON, no markdown:
{{"questions":[{{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"answer":"A) ...","explanation":"..."}}]}}"""
        else:
            prompt = f"""Generate exactly {request.num_questions} short-answer questions from this transcript.{freshness_instruction}
Transcript: {selected_context}
Return ONLY valid JSON, no markdown:
{{"questions":[{{"question":"...","answer":"...","explanation":"..."}}]}}"""
        response = model.generate_content(prompt)
        result = {"quiz": parse_model_json(response.text), "quiz_type": request.quiz_type}
        if request.force_new:
            return result
        return _cache_feature_result("quiz", cache_key, result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}", exc_info=True)
        if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
            raise HTTPException(
                status_code=429,
                detail="Google API rate limit exceeded. Please wait about 60 seconds and try again.",
            )
        raise HTTPException(
            status_code=500, detail="An internal server error occurred."
        )


@app.post("/summary/perspectives")
async def perspective_summary(
    request: PerspectiveSummaryRequest,
    current_user: dict = Depends(require_current_user),
):
    _require_user_video_access(current_user["id"], request.video_url)
    transcript = _get_or_fetch_transcript(request.video_url)
    cache_key = (request.video_url,)
    cached_result = _get_cached_feature_result("perspectives", cache_key)
    if cached_result is not None:
        return cached_result
    try:
        model = _get_generative_model()
        selected_context = _select_transcript_context(transcript, max_chars=28000)
        prompt = f"""Analyze this transcript from 4 perspectives.
Transcript: {selected_context}
Return ONLY valid JSON, no markdown:
{{
  "student": {{"emoji":"🎓","title":"Student Perspective","summary":"3-5 bullet points","key_concepts":["c1","c2","c3"],"study_tip":"..."}},
  "developer": {{"emoji":"👨‍💻","title":"Developer Perspective","summary":"3-5 bullet points","key_concepts":["c1","c2","c3"],"action_item":"..."}},
  "business": {{"emoji":"📈","title":"Business Perspective","summary":"3-5 bullet points","key_concepts":["c1","c2","c3"],"decision":"..."}},
  "beginner_expert": {{"emoji":"🧠","title":"Beginner vs Expert","beginner":"2-3 sentences","expert":"2-3 sentences","bridge":"..."}}
}}"""
        response = model.generate_content(prompt)
        result = {"perspectives": parse_model_json(response.text)}
        return _cache_feature_result("perspectives", cache_key, result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}", exc_info=True)

        if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
            raise HTTPException(
                status_code=429,
                detail="Google API rate limit exceeded. Please wait about 60 seconds and try again.",
            )

        raise HTTPException(
            status_code=500, detail="An internal server error occurred."
        )


@app.post("/concept-graph")
async def concept_graph(
    request: ConceptGraphRequest,
    current_user: dict = Depends(require_current_user),
):
    _require_user_video_access(current_user["id"], request.video_url)
    transcript = _get_or_fetch_transcript(request.video_url)
    cache_key = (request.video_url,)
    cached_result = _get_cached_feature_result("concept_graph", cache_key)
    if cached_result is not None:
        return cached_result
    try:
        model = _get_generative_model()
        selected_context = _select_transcript_context(transcript, max_chars=28000)
        prompt = f"""Extract a concept dependency graph from this transcript.
Transcript: {selected_context}
Return ONLY valid JSON, no markdown:
{{"nodes":[{{"id":"snake_id","label":"Short Label","level":0,"description":"One sentence."}}],"edges":[{{"from":"id1","to":"id2","label":"prerequisite for"}}]}}
Rules: 8-15 concepts, level 0=foundational, labels max 4 words, snake_case IDs."""
        response = model.generate_content(prompt)
        result = {"graph": parse_model_json(response.text)}
        return _cache_feature_result("concept_graph", cache_key, result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}", exc_info=True)

        if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
            raise HTTPException(
                status_code=429,
                detail="Google API rate limit exceeded. Please wait about 60 seconds and try again.",
            )

        raise HTTPException(
            status_code=500, detail="An internal server error occurred."
        )


@app.post("/videos/delete")
async def delete_video(
    request: VideoProcessRequest,
    current_user: dict = Depends(require_current_user),
):
    url = request.video_url

    with Session(engine) as session:
        existing = session.exec(
            select(VideoHistory)
            .where(VideoHistory.user_id == current_user["id"])
            .where(VideoHistory.video_url == url)
        ).all()
        for item in existing:
            session.delete(item)
        session.commit()

    if _has_video_history_references(url):
        return {"message": f"Removed {url} from your history."}

    if url in video_transcripts:
        del video_transcripts[url]
    if url in video_meta:
        del video_meta[url]
    if url in video_agents:
        del video_agents[url]
    _clear_video_feature_results(url)

    return {"message": f"Removed {url} and cleared runtime cache."}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
