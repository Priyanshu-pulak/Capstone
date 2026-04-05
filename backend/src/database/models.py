import os
from sqlmodel import SQLModel, Field, Session, create_engine, select
from typing import Annotated, Optional
from datetime import datetime
from pathlib import Path

# Get backend root directory (one level up from src)
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
DB_PATH = BACKEND_DIR / "vidquery.db"

class VideoSummary(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    video_id: str = Field(index=True)
    summary_text: str = Field()

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    email: str = Field(index=True, unique=True)
    hashed_password: str = Field()

class VideoHistory(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    video_url: str = Field()
    video_id: str = Field()
    title: str = Field()
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

sqlite_url = f"sqlite:///{DB_PATH}"
engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})

def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)

def get_saved_summary(video_id: str) -> Optional[str]:
    with Session(engine) as session:
        result = session.exec(select(VideoSummary).where(VideoSummary.video_id == video_id)).first()
        return result.summary_text if result else None

def save_summary(video_id: str, summary_text: str) -> None:
    with Session(engine) as session:
        session.add(VideoSummary(video_id=video_id, summary_text=summary_text))
        session.commit()