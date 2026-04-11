import re
from urllib.parse import parse_qs, urlparse

from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled
from langchain_text_splitters import RecursiveCharacterTextSplitter

YOUTUBE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{11}$")
YOUTUBE_DOMAINS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
}
YOUTU_BE_DOMAINS = {"youtu.be", "www.youtu.be"}

def format_docs(retrieved_docs):
    return "\n".join(doc.page_content for doc in retrieved_docs)

def _normalize_youtube_input(url: str) -> str:
    normalized = url.strip()
    lowered = normalized.lower()
    if "://" not in normalized and (
        lowered.startswith("youtu.be/")
        or lowered.startswith("www.youtu.be/")
        or lowered.startswith("youtube.com/")
        or lowered.startswith("www.youtube.com/")
        or lowered.startswith("m.youtube.com/")
        or lowered.startswith("music.youtube.com/")
        or lowered.startswith("youtube-nocookie.com/")
        or lowered.startswith("www.youtube-nocookie.com/")
    ):
        return f"https://{normalized}"
    return normalized

def _extract_candidate_video_id(url: str) -> str | None:
    normalized_url = _normalize_youtube_input(url)
    if YOUTUBE_ID_PATTERN.fullmatch(normalized_url):
        return normalized_url

    parsed = urlparse(normalized_url)
    host = parsed.netloc.lower()
    path_parts = [part for part in parsed.path.split("/") if part]

    if host in YOUTU_BE_DOMAINS and path_parts:
        return path_parts[0]

    if host in YOUTUBE_DOMAINS:
        query_video_id = parse_qs(parsed.query).get("v", [None])[0]
        if query_video_id:
            return query_video_id

        if path_parts and path_parts[0] in {"shorts", "embed", "live", "v"} and len(path_parts) > 1:
            return path_parts[1]

    return None

def get_video_id(url: str) -> str | None:
    """Extract a valid YouTube video ID from common YouTube URL formats."""
    candidate = _extract_candidate_video_id(url)
    if candidate and YOUTUBE_ID_PATTERN.fullmatch(candidate):
        return candidate
    return None

def fetch_transcript(video_url: str) -> str:
    video_id = get_video_id(video_url)
    if not video_id:
        print(f"Could not extract video ID from URL: {video_url}")
        return ""
    try:
        api = YouTubeTranscriptApi()
        try:
            transcript_list = api.fetch(video_id, languages=['en'])
        except Exception:
            # Fallback: try any available language
            available = list(api.list(video_id))
            if not available:
                return ""
            transcript_list = api.fetch(video_id, languages=[available[0].language_code])
        transcript = " ".join(chunk.text for chunk in transcript_list)
        print(f"Transcript fetched! ({len(transcript)} chars)")
        return transcript
    except TranscriptsDisabled:
        print("Transcripts disabled for this video.")
        return ""
    except Exception as e:
        print(f"Error fetching transcript: {e}")
        return ""

def split_transcript(transcript):
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
    )
    return splitter.create_documents([transcript])
