from pydantic import BaseModel, Field, EmailStr
from typing import Annotated
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
import json
import re
from typing import Optional
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


logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


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


def extract_json(text: str) -> dict:
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        text = match.group(1).strip()
    else:
        match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", text)
        if match:
            text = match.group(1).strip()
    return json.loads(text)


def _get_or_fetch_transcript(video_url: str) -> str:
    if video_url not in video_transcripts:
        transcript = fetch_transcript(video_url)
        if not transcript:
            raise HTTPException(status_code=404, detail="No transcript found.")
        video_transcripts[video_url] = transcript
    return video_transcripts[video_url]


# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
def on_startup():
    create_db_and_tables()


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
    with Session(engine) as session:
        rows = session.exec(
            select(VideoHistory).where(VideoHistory.user_id == current_user["id"])
        ).all()
        return {
            "videos": [
                {"video_id": r.video_id, "url": r.video_url, "title": r.title}
                for r in rows
            ]
        }


# ── Video processing ──────────────────────────────────────────────────────────
@app.post("/process")
async def process_video(
    request: VideoProcessRequest,
    current_user: Optional[dict] = Depends(get_current_user),
):
    try:
        video_id = get_video_id(request.video_url)
        transcript = fetch_transcript(request.video_url)
        if not transcript:
            raise HTTPException(
                status_code=400, detail="No transcript found for this video."
            )
        video_transcripts[request.video_url] = transcript
        title = f"Video {video_id[:8]}..." if video_id else request.video_url[:40]
        video_meta[request.video_url] = {
            "video_id": video_id,
            "url": request.video_url,
            "title": title,
        }

        # Persist to user history if logged in
        if current_user:
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
async def list_videos():
    return {"videos": list(video_meta.values())}


# ── Query endpoints ───────────────────────────────────────────────────────────
@app.post("/query")
async def query_video(request: QueryRequest) -> dict[str, str]:
    try:
        agent = build_chatbot_chain(request.video_url)

        if not agent:
            raise HTTPException(
                status_code=400,
                detail="Failed to initialize the AI agent for this video. Ensure the index exists.",
            )

        inputs = {"messages": [("user", request.question)]}
        result = agent.invoke(inputs)

        final_answer = result["messages"][-1].content

        if isinstance(final_answer, list):
            final_answer = final_answer[0].get("text", str(final_answer))

        return {"answer": str(final_answer)}

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
async def cross_video_query(request: CrossVideoQueryRequest):
    if not video_transcripts:
        raise HTTPException(status_code=400, detail="No videos processed yet.")

    target_urls = (
        request.video_urls if request.video_urls else list(video_transcripts.keys())
    )

    video_contexts = []
    for url in target_urls:
        if url in video_transcripts:
            title = video_meta.get(url, {}).get("title", url)
            transcript = video_transcripts[url]
            video_contexts.append(f"[VIDEO: {title}]\n{transcript[:10000]}")

    if not video_contexts:
        raise HTTPException(
            status_code=400,
            detail="None of the selected videos have processed transcripts.",
        )

    combined = "\n\n---\n\n".join(video_contexts)
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
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
async def generate_quiz(request: QuizRequest):
    transcript = _get_or_fetch_transcript(request.video_url)
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
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
        return {"quiz": extract_json(response.text), "quiz_type": request.quiz_type}
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
async def perspective_summary(request: PerspectiveSummaryRequest):
    transcript = _get_or_fetch_transcript(request.video_url)
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
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
        return {"perspectives": extract_json(response.text)}
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
async def concept_graph(request: ConceptGraphRequest):
    transcript = _get_or_fetch_transcript(request.video_url)
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        prompt = f"""Extract a concept dependency graph from this transcript.
Transcript: {transcript[:28000]}
Return ONLY valid JSON, no markdown:
{{"nodes":[{{"id":"snake_id","label":"Short Label","level":0,"description":"One sentence."}}],"edges":[{{"from":"id1","to":"id2","label":"prerequisite for"}}]}}
Rules: 8-15 concepts, level 0=foundational, labels max 4 words, snake_case IDs."""
        response = model.generate_content(prompt)
        return {"graph": extract_json(response.text)}
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
    current_user: Optional[dict] = Depends(get_current_user),
):
    url = request.video_url
    if url in video_transcripts:
        del video_transcripts[url]
    if url in video_meta:
        del video_meta[url]

    if current_user:
        with Session(engine) as session:
            existing = session.exec(
                select(VideoHistory)
                .where(VideoHistory.user_id == current_user["id"])
                .where(VideoHistory.video_url == url)
            ).all()
            for item in existing:
                session.delete(item)
            session.commit()

    return {"message": f"Successfully removed {url} from memory"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
