from backend.src.chain import build_chatbot_chain
    
def youtube_chatbot(video_url: str = "https://www.youtube.com/watch?v=XmRrGzR6udg&list=PLgUwDviBIf0rAuz8tVcM0AymmhTRsfaLU&index=6"):
    
    agent = build_chatbot_chain(video_url)
    
    if not agent:
        return

    print("YouTube Video Q&A System")
    print("Ask questions about the video. Type 'quit' or 'exit' to stop.\n")
    print("-" * 63)

    while True:
        question = input("\nYour question: \n").strip()

        if question.lower() in ['quit', 'exit', 'q']:
            print("Goodbye!")
            break

        if not question:
            print("Please enter a valid question.")
            continue
        
        inputs = {"messages": [("user", question)]}
        result = agent.invoke(inputs)
        final_answer = result["messages"][-1].content

        if isinstance(final_answer, list):
            final_answer = final_answer[0].get("text", str(final_answer))
        
        print(f'\n{final_answer}')

if __name__ == "__main__":
    youtube_chatbot()