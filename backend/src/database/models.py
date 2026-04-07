from sqlmodel import SQLModel, Field, Session, create_engine, select
from datetime import datetime, UTC
from pathlib import Path
from typing import Annotated

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
DB_PATH = BACKEND_DIR / "vidquery.db"

class VideoSummary(SQLModel, table=True):
    id: Annotated[int | None, Field(default=None, primary_key=True)]
    video_id: Annotated[str, Field(index=True, description="The unique YouTube video identifier")]
    summary_text: Annotated[str, Field(description="The generated summary of the video")]

class User(SQLModel, table=True):
    id: Annotated[int | None, Field(default=None, primary_key=True)]
    username: Annotated[str, Field(index=True, unique=True, min_length=3, max_length=50)]
    email: Annotated[str, Field(index=True, unique=True)]
    hashed_password: Annotated[str, Field()]

class VideoHistory(SQLModel, table=True):
    id: Annotated[int | None, Field(default=None, primary_key=True)]
    user_id: Annotated[int, Field(index=True, foreign_key="user.id")]
    video_url: Annotated[str, Field()]
    video_id: Annotated[str, Field()]
    title: Annotated[str, Field()]
    created_at: Annotated[str, Field(default_factory=lambda: datetime.now(UTC).isoformat())]

sqlite_url = f"sqlite:///{DB_PATH}"
engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})

def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)

def get_saved_summary(video_id: str) -> str | None:
    with Session(engine) as session:
        result = session.exec(select(VideoSummary).where(VideoSummary.video_id == video_id)).first()
        return result.summary_text if result else None

def save_summary(video_id: str, summary_text: str) -> None:
    with Session(engine) as session:
        session.add(VideoSummary(video_id=video_id, summary_text=summary_text))
        session.commit()