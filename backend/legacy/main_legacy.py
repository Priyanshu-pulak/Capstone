import sys
import streamlit.web.cli as stcli

def run_cli():
    from backend.src.youtube_chatbot import youtube_chatbot
    youtube_chatbot()

def run_streamlit():
    sys.argv = ["streamlit", "run", "src/app.py", "--server.port=8501"]
    sys.exit(stcli.main())

if __name__ == "__main__":
    print("Tip: Run 'python main.py app' to start the Streamlit web interface\n")

    if len(sys.argv) > 1:
        print("Starting Streamlit app...")
        run_streamlit()
    else:
        print("Starting CLI chatbot...")
        run_cli()