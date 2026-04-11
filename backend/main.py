from pydantic import BaseModel, Field, EmailStr
from typing import Annotated
from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
import json
import re
from typing import Optional
from copy import deepcopy
from dotenv import load_dotenv
import logging
from datetime import datetime, timedelta, UTC
from src.chain import build_chatbot_chain

import google.generativeai as genai
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

genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

SECRET_KEY = os.getenv("SECRET_KEY", "vidquery-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 72

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)

app = FastAPI(title="VidQuery API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)
INVALID_YOUTUBE_URL_DETAIL = (
    "Invalid YouTube URL. Please provide a valid video link or 11-character video ID."
)
INVALID_MODEL_RESPONSE_DETAIL = (
    "The AI returned an unreadable response. Please try again."
)


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


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict | None:
    if not credentials:
        return None
    try:
        payload = jwt.decode(
            credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM]
        )
        return {"id": int(payload["sub"]), "username": payload["username"]}
    except JWTError:
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


def _get_generative_model(model_name: str = "gemini-2.5-flash"):
    if model_name not in model_cache:
        model_cache[model_name] = genai.GenerativeModel(model_name)
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
async def register(req: RegisterRequest):
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
        return {"token": token, "username": user.username, "email": user.email}


@app.post("/auth/login")
async def login(req: LoginRequest):
    with Session(engine) as session:
        user = session.exec(select(User).where(User.email == req.email)).first()
        if not user or not verify_password(req.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        token = create_token(user.id, user.username)
        return {"token": token, "username": user.username, "email": user.email}


@app.get("/auth/me")
async def me(current_user: Optional[dict] = Depends(get_current_user)):
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    return current_user


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
        video_contexts.append(f"[VIDEO: {title}]\n{transcript[:10000]}")

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
    cached_result = _get_cached_feature_result("quiz", cache_key)
    if cached_result is not None:
        return cached_result
    try:
        model = _get_generative_model()
        if request.quiz_type == "mcq":
            prompt = f"""Generate exactly {request.num_questions} MCQs from this transcript.
Transcript: {transcript[:25000]}
Return ONLY valid JSON, no markdown:
{{"questions":[{{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"answer":"A) ...","explanation":"..."}}]}}"""
        else:
            prompt = f"""Generate exactly {request.num_questions} short-answer questions from this transcript.
Transcript: {transcript[:25000]}
Return ONLY valid JSON, no markdown:
{{"questions":[{{"question":"...","answer":"...","explanation":"..."}}]}}"""
        response = model.generate_content(prompt)
        result = {"quiz": parse_model_json(response.text), "quiz_type": request.quiz_type}
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
        prompt = f"""Analyze this transcript from 4 perspectives.
Transcript: {transcript[:28000]}
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
        prompt = f"""Extract a concept dependency graph from this transcript.
Transcript: {transcript[:28000]}
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
