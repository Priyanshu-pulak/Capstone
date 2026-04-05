from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled
from langchain_text_splitters import RecursiveCharacterTextSplitter

def format_docs(retrieved_docs):
    return "\n".join(doc.page_content for doc in retrieved_docs)

def get_video_id(url: str) -> str:
    """Extract video ID from various YouTube URL formats."""
    url = url.strip()
    if "v=" in url:
        part = url.split("v=")[1]
        return part.split("&")[0]
    if "youtu.be/" in url:
        part = url.split("youtu.be/")[1]
        return part.split("?")[0].split("&")[0]
    if len(url) == 11 and "/" not in url:
        return url
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