from langchain_core.runnables import RunnableLambda, RunnableParallel, RunnablePassthrough
from src.prompt_templates import summary_transcript_prompt 
from src.utils import format_docs

def build_summary_chain(chat_model, str_parser, summary_vector_store, k):
    summary_retriever = summary_vector_store.as_retriever(
        search_type="similarity",
        search_kwargs={"k": k}
    )

    summary_prompt = summary_transcript_prompt()

    summary_parallel_chain = RunnableParallel({
        'context': summary_retriever | RunnableLambda(format_docs),
        'question': RunnablePassthrough()
    })

    summary_chain = summary_parallel_chain | summary_prompt | chat_model | str_parser

    return summary_chain
