import time
from pathlib import Path
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from src.database.models import get_saved_summary, save_summary

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
INDEX_DIR = BACKEND_DIR / "local_indexes"

def summarize_chunks(chunks: list[Document], chat_model) -> list[Document]:
    prompt = ChatPromptTemplate.from_template("Summarize the following content concisely:\n\n{context}")
    summarize_chain = prompt | chat_model | StrOutputParser()
    
    final_summaries: list[Document] = []
    
    for i, chunk in enumerate(chunks):
        if i == 5:
            break
        print(f"Summarizing chunk {i + 1}/{len(chunks)}...")
        summary_text = summarize_chain.invoke({"context": chunk.page_content})
        final_summaries.append(Document(page_content=summary_text))
        
        if i != len(chunks) - 1:
            time.sleep(8) # Synchronous delay to prevent API rate limits (will be async in Phase 3)

    print("All chunks summarized successfully!")
    return final_summaries

def build_summary_vector_store(
    chunks: list[Document], 
    chat_model, 
    embedding_model,
    video_id: str
) -> FAISS:
    
    save_path = INDEX_DIR / f"{video_id}_summary"
    
    if save_path.exists():
        print(f"Loading existing Summary FAISS index for video {video_id}...")
        return FAISS.load_local(
            str(save_path), 
            embedding_model, 
            allow_dangerous_deserialization=True
        )

    existing_summary_text = get_saved_summary(video_id)
    
    if existing_summary_text:
        print("Found existing summary in database. Skipping LLM generation.")
        final_summaries = [Document(page_content=existing_summary_text)]
    else:
        print("No existing summary found. Generating new summaries via LLM...")
        final_summaries = summarize_chunks(chunks, chat_model)
        
        combined_text = "\n".join(doc.page_content for doc in final_summaries)
        save_summary(video_id, combined_text)

    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    
    summary_vector_store = FAISS.from_documents(
        documents=final_summaries, 
        embedding=embedding_model
    )
    
    summary_vector_store.save_local(str(save_path))
    
    return summary_vector_store