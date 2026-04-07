from pathlib import Path
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
INDEX_DIR = BACKEND_DIR / "local_indexes"

def build_qa_vector_store(
    chunks: list[Document], 
    embedding_model: Embeddings, 
    video_id: str
) -> FAISS:
    save_path = INDEX_DIR / f"{video_id}_qa"
    
    if save_path.exists():
        print(f"Loading existing QA FAISS index for video {video_id}...")
        return FAISS.load_local(
            str(save_path), 
            embedding_model, 
            allow_dangerous_deserialization=True
        )

    print(f"Building new QA FAISS index for video {video_id}...")
    qa_vector_store = FAISS.from_documents(
        documents=chunks,
        embedding=embedding_model
    )
    
    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    
    qa_vector_store.save_local(str(save_path))
    
    return qa_vector_store