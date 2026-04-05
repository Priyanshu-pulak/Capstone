from typing import Annotated
from pydantic import Field

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.runnables import Runnable
from langchain_core.tools import Tool

from langchain.agents import create_agent


def build_agent(
    chat_model: BaseChatModel,
    qa_chain: Annotated[
        Runnable, Field(description="The QA chain for transcript search")
    ],
    summary_chain: Annotated[
        Runnable, Field(description="The chain for video summarization")
    ],
) -> Runnable:
    tools: list[Tool] = [
        Tool(
            name="SearchTranscript",
            func=qa_chain.invoke,
            description="Use this tool to answer specific questions about the video content. Input should be the user's exact question.",
        ),
        Tool(
            name="GetVideoSummary",
            func=summary_chain.invoke,
            description="Use this tool to get a general overview, summary, or key takeaways of the entire video. Input can be the user's request.",
        ),
    ]

    system_prompt: str = (
        "You are an intelligent YouTube Video Assistant. "
        "You have access to tools that can search the video's transcript or fetch a comprehensive summary. "
        "Analyze the user's input and dynamically choose the best tool to answer their query. "
        "If the user just says 'hello' or asks a general question, answer them directly without using a tool."
    )

    agent_executor = create_agent(
        model=chat_model,
        tools=tools,
        system_prompt=system_prompt,
    )

    return agent_executor
