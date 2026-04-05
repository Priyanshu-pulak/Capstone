from pathlib import Path
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings

# Get backend root directory
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
INDEX_DIR = BACKEND_DIR / "local_indexes"

def build_qa_vector_store(
    chunks: list[Document], 
    embedding_model: Embeddings, 
    video_id: str
) -> FAISS:
    # Use the centralized index directory
    save_path = INDEX_DIR / f"{video_id}_qa"
    
    # Check if the index already exists
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
    
    # Just ensure the base 'local_indexes' directory exists within backend/
    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    
    # Let FAISS handle creating the specific subfolder and saving the files
    qa_vector_store.save_local(str(save_path))
    
    return qa_vector_store