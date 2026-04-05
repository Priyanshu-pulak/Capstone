# YouTube Chatbot (Modular)

A conversational AI assistant that fetches YouTube video transcripts, builds vector stores for efficient retrieval, and uses LangChain + Google Generative AI to answer questions or generate summaries. The project features both a **CLI interface** and a **Streamlit web app** with a clean modular architecture.

## ✨ Features

- **Dual Interface**: CLI and Streamlit web app
- Fetches YouTube video transcripts automatically
- Query classification (summary vs. question-answering)
- RAG-based Q&A using FAISS vector stores
- Intelligent summarization with context-aware retrieval
- Modular codebase for easy testing and maintenance

## 📋 Requirements

- Python 3.11+
- Conda (recommended) or virtualenv
- Google API Key (for Generative AI)

## 📁 Project Structure

```
YouTube_chatbot/
├── .env                      # Environment variables (API keys)
├── .gitignore
├── environment.yml           # Conda environment spec
├── main.py                   # Smart entry point (CLI or Streamlit)
├── README.md
└── src/
    ├── __init__.py
    ├── app.py                # Streamlit web application
    ├── youtube_chatbot.py    # CLI chatbot interface
    ├── utils.py              # Core utilities (fetch_transcript, split_transcript, etc.)
    ├── chain/
    │   ├── __init__.py
    │   ├── chatbot_chain.py          # Main chain builder
    │   ├── classification_chain.py   # Query classification logic
    │   ├── main_chain.py             # Final routing chain
    │   ├── qa_chain.py               # Question-answering chain
    │   └── summary_chain.py          # Summarization chain
    ├── prompt_templates/
    │   ├── __init__.py
    │   └── prompt.py                 # All prompt templates
    ├── schema/
    │   ├── __init__.py
    │   └── query_category.py         # Pydantic models for validation
    └── vector_stores/
        ├── __init__.py
        ├── qa_vector_store.py        # QA FAISS store builder
        └── summary_vector_store.py   # Summary FAISS store builder
```

## 🚀 Setup

### 1. Clone the repository

```bash
git clone https://github.com/Priyanshu-pulak/YouTube_chatbot.git
cd YouTube_chatbot
```

### 2. Create the environment

Using conda (recommended):

```bash
conda env create -f environment.yml
conda activate youtube_chatbot
```

### 3. Configure API Keys

Create a `.env` file in the project root:

```env
GOOGLE_API_KEY="your-google-api-key-here"
```

Get your Google API key from: https://makersuite.google.com/app/apikey

## 💻 Usage

The project offers two interfaces: **CLI** for terminal usage and **Streamlit** for a web-based UI.

### Option 1: CLI Interface

Run the interactive command-line chatbot:

```bash
python main.py
```

### Option 2: Streamlit Web App

Launch the web interface:

```bash
python main.py app
```

### Component Details

1. **Transcript Fetching** (`src/utils.py`)

   - `get_video_id()`: Extracts video ID from YouTube URL
   - `fetch_transcript()`: Fetches transcript using `youtube-transcript-api`
   - `split_transcript()`: Splits into chunks (1000 chars, 200 overlap)
2. **Vector Stores** (`src/vector_stores/`)

   - **QA Store**: Stores transcript chunks for question answering
   - **Summary Store**: Stores generated summaries for each chunk
   - Uses FAISS for efficient similarity search
   - Embeddings via Google's `text-embedding-004`
3. **Chain Building** (`src/chain/`)

   - **chatbot_chain.py**: Main builder that orchestrates all chains
   - **classification_chain.py**: Classifies queries as summary or QA
   - **qa_chain.py**: Retrieves relevant chunks and answers questions
   - **summary_chain.py**: Retrieves and combines summaries
   - **main_chain.py**: Routes queries to appropriate chain using `RunnableBranch`
4. **Query Processing Flow**

5. **Interfaces**

   - **CLI** (`src/youtube_chatbot.py`): Terminal-based interactive interface
   - **Web** (`src/app.py`): Streamlit web application with session management

### Key Technologies

- **LangChain**: Orchestration framework for LLM chains
- **Google Generative AI**:
  - Model: `gemini-2.5-flash-lite` for chat/generation
  - Embeddings: `text-embedding-004` for vector search
- **FAISS**: Fast similarity search for retrieval
- **Streamlit**: Web UI framework
- **Pydantic**: Data validation for query categories

## 🛠️ Development

### Module Responsibilities

| Module                                        | Responsibility                                                  |
| --------------------------------------------- | --------------------------------------------------------------- |
| `src/utils.py`                              | Core utilities: transcript fetching, text splitting, formatting |
| `src/chain/chatbot_chain.py`                | Main chain builder, orchestrates all components                 |
| `src/chain/classification_chain.py`         | Query classification using Pydantic parser                      |
| `src/chain/qa_chain.py`                     | QA chain with retrieval and prompt composition                  |
| `src/chain/summary_chain.py`                | Summary chain with auto k-detection                             |
| `src/chain/main_chain.py`                   | Final routing chain using `RunnableBranch`                    |
| `src/prompt_templates/prompt.py`            | All prompt templates for QA and summarization                   |
| `src/schema/query_category.py`              | Pydantic models for validation                                  |
| `src/vector_stores/qa_vector_store.py`      | Builds FAISS store from transcript chunks                       |
| `src/vector_stores/summary_vector_store.py` | Generates summaries and builds FAISS store                      |
| `src/youtube_chatbot.py`                    | CLI interface with minimal result extraction                    |
| `src/app.py`                                | Streamlit web app with session management                       |
| `main.py`                                   | Smart entry point (auto-detects CLI vs Streamlit)               |

### Running as a Package

```bash
# From project root
python main.py              # CLI interface
python main.py app          # Streamlit web app

# Or run modules directly
python -m src.youtube_chatbot
streamlit run src/app.py
```

## ⚠️ Troubleshooting

### ModuleNotFoundError

**Issue:** `ModuleNotFoundError: No module named 'src'`

**Solutions:**

- Ensure you're running from the project root directory
- Use `python main.py` (not `python src/youtube_chatbot.py`)
- Check that all `src/` subdirectories have `__init__.py` files
- Verify conda environment is activated: `conda activate youtube_chatbot`

### API Authentication Errors

**Issue:** `Invalid API key` or authentication failures

**Solutions:**

- Verify `.env` file exists in project root
- Check API key format: `GOOGLE_API_KEY="your-key-here"`
- Test API key:
  ```bash
  python -c "import os; from dotenv import load_dotenv; load_dotenv(); print(os.getenv('GOOGLE_API_KEY'))"
  ```
- Get a new key from: https://makersuite.google.com/app/apikey

### Transcript Disabled Error

**Issue:** `TranscriptsDisabled` or no transcript found

**Solutions:**

- Video may have transcripts disabled by creator
- Try a different video with captions enabled
- Check video language (currently supports English)
- Verify video ID is correct

### Streamlit Import Error

**Issue:** `ModuleNotFoundError: No module named 'streamlit'`

**Solution:**

```bash
conda activate youtube_chatbot
pip install streamlit
```

### Rate Limiting

**Issue:** API rate limit exceeded during summary generation

**Solution:**

- The code includes 8-second delays between chunk summaries
- For videos with many chunks, processing may take time
- Consider using a different API tier or reducing chunk count

## 📊 Performance Notes

- **Video Processing Time**: Depends on transcript length

  - ~1-2 minutes for 10-minute videos
  - ~3-5 minutes for 30-minute videos
  - Summary generation is the longest step (8s per chunk)
- **Memory Usage**: Moderate (stores embeddings in memory)

  - ~200-500MB for typical videos
  - FAISS indexes are lightweight
- **Query Response Time**: Fast (<2 seconds)

  - Vector search is very efficient
  - Most time spent in LLM generation

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Follow the modular structure and coding conventions
4. Add tests for new features
5. Update documentation
6. Submit a pull request

**Coding Standards:**

- Use type hints for function parameters and returns
- Follow the builder pattern for chain construction
- Keep functions focused and single-purpose
- Add docstrings for public functions
- Use absolute imports from `src.*`

## 🔑 API Keys & Services

- **GOOGLE_API_KEY**: Required for Google Generative AI
  - Model: `gemini-2.5-flash-lite` (chat/generation)
  - Embeddings: `text-embedding-004` (vector search)
  - Get your key: https://makersuite.google.com/app/apikey

## 🙏 Acknowledgments

- Built with [LangChain](https://www.langchain.com/) - LLM orchestration framework
- Powered by [Google Generative AI](https://ai.google.dev/) - Gemini models
- Vector search via [FAISS](https://github.com/facebookresearch/faiss) - Facebook AI Similarity Search
- Web UI with [Streamlit](https://streamlit.io/) - Fast web apps for ML
- Transcripts from [youtube-transcript-api](https://github.com/jdepoix/youtube-transcript-api)

## 📚 Additional Resources

- [LangChain Documentation](https://python.langchain.com/)
- [Google AI Studio](https://makersuite.google.com/)
- [Streamlit Documentation](https://docs.streamlit.io/)
- [FAISS Documentation](https://faiss.ai/)
