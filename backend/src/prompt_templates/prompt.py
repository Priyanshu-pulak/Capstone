from langchain_core.prompts import PromptTemplate

def question_answer_prompt():
    qa_prompt = PromptTemplate(
        template="""
            You are a helpful assistant.
            Answer only from the provided transcript context.
            If you don't know the answer, just say that you don't know. DO NOT try to make up an answer.
            Context: {context}
            Question: {question}
        """,
        input_variables=["context", "question"]
    )
    return qa_prompt

def summary_transcript_prompt():
    summary_prompt = PromptTemplate(
        template="""
            You are a helpful assistant.
            Summarize the following transcript into the manner user specified otherwise in a paragraph.
            Keep only the main points and avoid adding extra information.

            Summary : {context}
            Question : {question}
        """,
        input_variables=['context', 'question']
    )
    return summary_prompt

def classification_prompt_template(pydantic_parser):
    query_classification_prompt = PromptTemplate(
        template = "Classify the user query into either 'summary' or 'question_answer'.\n User query : {user_query} \n {format_instructions}",
        input_variables = ['user_query'],
        partial_variables = {'format_instructions': pydantic_parser.get_format_instructions()}
    )

    return query_classification_prompt