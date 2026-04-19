from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_core.output_parsers import StrOutputParser

from src.config import settings
from src.utils import fetch_transcript, split_transcript, get_video_id
from src.vector_stores import build_qa_vector_store, build_summary_vector_store
from src.chain.qa_chain import build_qa_chain
from src.chain.summary_chain import build_summary_chain
from src.chain.agent import build_agent

def build_chatbot_chain(video_url: str, transcript: str | None = None):
    google_api_key = settings.require_google_api_key()

    chat_model = ChatGoogleGenerativeAI(
        model="gemma-4-31b-it",
        google_api_key=google_api_key,
    )
    embedding_model = GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001",
        google_api_key=google_api_key,
    )
    str_parser = StrOutputParser()

    video_id = get_video_id(video_url)
    if not video_id:
        print("Could not extract Video ID.")
        return None

    transcript = transcript or fetch_transcript(video_url)
    if not transcript:
        return None

    chunks = split_transcript(transcript)

    qa_store = build_qa_vector_store(chunks, embedding_model, video_id)
    qa_chain = build_qa_chain(chat_model, qa_store, str_parser, 4)

    summary_store = build_summary_vector_store(
        chunks, chat_model, embedding_model, video_id
    )
    summary_chain = build_summary_chain(
        chat_model, str_parser, summary_store, len(chunks)
    )

    agent_executor = build_agent(chat_model, qa_chain, summary_chain)

    return agent_executor
