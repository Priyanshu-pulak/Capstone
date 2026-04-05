from langchain_core.runnables import RunnableLambda, RunnableParallel, RunnablePassthrough
from src.prompt_templates import question_answer_prompt
from src.utils import format_docs

def build_qa_chain(chat_model, qa_vector_store, str_parser = None, k = 4):
    qa_retriever = qa_vector_store.as_retriever(
        search_type = 'similarity',
        search_kwargs={'k': k}
    )

    qa_prompt = question_answer_prompt()

    qa_parallel_chain = RunnableParallel({
        'context': qa_retriever | RunnableLambda(format_docs),
        'question': RunnablePassthrough()
    })

    qa_chain = qa_parallel_chain | qa_prompt | chat_model | str_parser

    return qa_chain