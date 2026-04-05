from pydantic import BaseModel, Field
from typing import Literal, Annotated

class QueryCategory(BaseModel):
    category: Annotated[
        Literal['summary', 'question_answer'],
        Field(description = "The category of the query, either 'summary' or 'question_answer'.")
    ]