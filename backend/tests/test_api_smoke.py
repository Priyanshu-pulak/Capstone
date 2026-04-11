from __future__ import annotations

import json
import re
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import main as app_module
from src.database import models


class FakeAgent:
    def __init__(self, video_url: str):
        self.video_url = video_url

    def invoke(self, inputs: dict) -> dict:
        question = inputs["messages"][-1][1]
        return {
            "messages": [
                SimpleNamespace(
                    content=f"Answer for {self.video_url}: {question}",
                )
            ]
        }


class FakeGenerativeResponse:
    def __init__(self, text: str):
        self.text = text


class FakeGenerativeModel:
    def __init__(self, *_args, **_kwargs):
        pass

    def generate_content(self, prompt: str) -> FakeGenerativeResponse:
        if "Generate exactly" in prompt and "MCQs" in prompt:
            match = re.search(r"Generate exactly (\d+)", prompt)
            count = int(match.group(1)) if match else 1
            return FakeGenerativeResponse(
                json.dumps(
                    {
                        "questions": [
                            {
                                "question": f"Question {index + 1}?",
                                "options": [
                                    "A) One",
                                    "B) Two",
                                    "C) Three",
                                    "D) Four",
                                ],
                                "answer": "A) One",
                                "explanation": "Because the mocked quiz says so.",
                            }
                            for index in range(count)
                        ]
                    }
                )
            )

        if "Generate exactly" in prompt and "short-answer" in prompt:
            return FakeGenerativeResponse(
                json.dumps(
                    {
                        "questions": [
                            {
                                "question": "What is the main takeaway?",
                                "answer": "A mocked short answer.",
                                "explanation": "This comes from the fake model.",
                            }
                        ]
                    }
                )
            )

        if "Analyze this transcript from 4 perspectives." in prompt:
            return FakeGenerativeResponse(
                json.dumps(
                    {
                        "student": {
                            "summary": "Student summary",
                            "key_concepts": ["concept-a", "concept-b"],
                            "study_tip": "Review the examples first.",
                        },
                        "developer": {
                            "summary": "Developer summary",
                            "key_concepts": ["api", "cache"],
                            "action_item": "Build a small prototype.",
                        },
                        "business": {
                            "summary": "Business summary",
                            "key_concepts": ["value", "cost"],
                            "decision": "Pilot this with one team.",
                        },
                        "beginner_expert": {
                            "beginner": "Beginner explanation",
                            "expert": "Expert explanation",
                            "bridge": "Connect the basics to the system view.",
                        },
                    }
                )
            )

        if "Extract a concept dependency graph" in prompt:
            return FakeGenerativeResponse(
                json.dumps(
                    {
                        "nodes": [
                            {
                                "id": "foundations",
                                "label": "Foundations",
                                "level": 0,
                                "description": "Start here.",
                            },
                            {
                                "id": "advanced_topic",
                                "label": "Advanced Topic",
                                "level": 1,
                                "description": "Builds on the basics.",
                            },
                        ],
                        "edges": [
                            {
                                "from": "foundations",
                                "to": "advanced_topic",
                                "label": "prerequisite for",
                            }
                        ],
                    }
                )
            )

        return FakeGenerativeResponse("Cross-video answer covering selected videos.")


class TestApiSmoke(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.test_db_path = Path(self.temp_dir.name) / "vidquery-test.db"
        self.test_engine = create_engine(
            f"sqlite:///{self.test_db_path}",
            connect_args={"check_same_thread": False},
        )

        self._clear_runtime_caches()

        self.engine_patch = patch.object(app_module, "engine", self.test_engine)
        self.models_engine_patch = patch.object(models, "engine", self.test_engine)
        self.fetch_patch = patch.object(
            app_module,
            "fetch_transcript",
            side_effect=self.fake_fetch_transcript,
        )
        self.video_id_patch = patch.object(
            app_module,
            "get_video_id",
            side_effect=self.fake_get_video_id,
        )
        self.build_chain_patch = patch.object(
            app_module,
            "build_chatbot_chain",
            side_effect=self.fake_build_chatbot_chain,
        )
        self.generative_model_patch = patch.object(
            app_module.genai,
            "GenerativeModel",
            FakeGenerativeModel,
        )

        self.engine_patch.start()
        self.models_engine_patch.start()
        self.mock_fetch_transcript = self.fetch_patch.start()
        self.mock_get_video_id = self.video_id_patch.start()
        self.mock_build_chatbot_chain = self.build_chain_patch.start()
        self.generative_model_patch.start()

        SQLModel.metadata.create_all(self.test_engine)

        self.client_manager = TestClient(app_module.app)
        self.client = self.client_manager.__enter__()

    def tearDown(self) -> None:
        self.client_manager.__exit__(None, None, None)
        self.generative_model_patch.stop()
        self.build_chain_patch.stop()
        self.video_id_patch.stop()
        self.fetch_patch.stop()
        self.models_engine_patch.stop()
        self.engine_patch.stop()
        self._clear_runtime_caches()
        self.temp_dir.cleanup()

    def fake_fetch_transcript(self, video_url: str) -> str:
        return f"Transcript for {video_url}. " * 40

    def fake_get_video_id(self, video_url: str) -> str:
        if "v=" in video_url:
            return video_url.split("v=", 1)[1].split("&", 1)[0]
        return video_url.rstrip("/").rsplit("/", 1)[-1]

    def fake_build_chatbot_chain(self, video_url: str, transcript: str | None = None) -> FakeAgent:
        self.assertIsNotNone(transcript)
        return FakeAgent(video_url)

    def _clear_runtime_caches(self) -> None:
        app_module.video_transcripts.clear()
        app_module.video_meta.clear()
        app_module.video_agents.clear()

    def register_user(self, username: str, email: str) -> dict[str, str]:
        response = self.client.post(
            "/auth/register",
            json={
                "username": username,
                "email": email,
                "password": "password123",
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}

    def process_video(self, video_url: str, headers: dict[str, str]) -> None:
        response = self.client.post(
            "/process",
            json={"video_url": video_url},
            headers=headers,
        )
        self.assertEqual(response.status_code, 200, response.text)

    def test_process_history_and_delete_are_user_scoped(self) -> None:
        video_url = "https://youtube.com/watch?v=video-one"
        user_one_headers = self.register_user("alice", "alice@example.com")
        user_two_headers = self.register_user("bob", "bob@example.com")

        self.process_video(video_url, user_one_headers)
        self.process_video(video_url, user_two_headers)

        user_one_history = self.client.get("/history", headers=user_one_headers)
        user_two_history = self.client.get("/history", headers=user_two_headers)
        self.assertEqual(len(user_one_history.json()["videos"]), 1)
        self.assertEqual(len(user_two_history.json()["videos"]), 1)

        delete_response = self.client.post(
            "/videos/delete",
            json={"video_url": video_url},
            headers=user_one_headers,
        )
        self.assertEqual(delete_response.status_code, 200, delete_response.text)

        user_one_history_after_delete = self.client.get("/history", headers=user_one_headers)
        user_two_history_after_delete = self.client.get("/history", headers=user_two_headers)
        self.assertEqual(user_one_history_after_delete.json()["videos"], [])
        self.assertEqual(len(user_two_history_after_delete.json()["videos"]), 1)
        self.assertIn(video_url, app_module.video_transcripts)

    def test_query_reuses_cached_agent_for_same_video(self) -> None:
        video_url = "https://youtube.com/watch?v=video-two"
        headers = self.register_user("carol", "carol@example.com")
        self.process_video(video_url, headers)

        first_response = self.client.post(
            "/query",
            json={"video_url": video_url, "question": "What is this about?"},
            headers=headers,
        )
        second_response = self.client.post(
            "/query",
            json={"video_url": video_url, "question": "Give me the summary."},
            headers=headers,
        )

        self.assertEqual(first_response.status_code, 200, first_response.text)
        self.assertEqual(second_response.status_code, 200, second_response.text)
        self.assertEqual(self.mock_build_chatbot_chain.call_count, 1)
        self.assertIn("What is this about?", first_response.json()["answer"])
        self.assertIn("Give me the summary.", second_response.json()["answer"])

    def test_cross_video_query_refetches_transcripts_after_cache_clear(self) -> None:
        headers = self.register_user("dave", "dave@example.com")
        video_urls = [
            "https://youtube.com/watch?v=video-three",
            "https://youtube.com/watch?v=video-four",
        ]

        for video_url in video_urls:
            self.process_video(video_url, headers)

        self._clear_runtime_caches()
        self.mock_fetch_transcript.reset_mock()

        response = self.client.post(
            "/query/cross",
            json={
                "question": "Summarize both videos together.",
                "video_urls": video_urls,
            },
            headers=headers,
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            response.json()["answer"],
            "Cross-video answer covering selected videos.",
        )
        self.assertCountEqual(
            [call.args[0] for call in self.mock_fetch_transcript.call_args_list],
            video_urls,
        )

    def test_quiz_perspectives_and_concept_graph_routes_return_structured_data(self) -> None:
        video_url = "https://youtube.com/watch?v=video-five"
        headers = self.register_user("erin", "erin@example.com")
        self.process_video(video_url, headers)

        quiz_response = self.client.post(
            "/quiz",
            json={
                "video_url": video_url,
                "num_questions": 3,
                "quiz_type": "mcq",
            },
            headers=headers,
        )
        perspectives_response = self.client.post(
            "/summary/perspectives",
            json={"video_url": video_url},
            headers=headers,
        )
        concept_graph_response = self.client.post(
            "/concept-graph",
            json={"video_url": video_url},
            headers=headers,
        )

        self.assertEqual(quiz_response.status_code, 200, quiz_response.text)
        self.assertEqual(perspectives_response.status_code, 200, perspectives_response.text)
        self.assertEqual(concept_graph_response.status_code, 200, concept_graph_response.text)

        quiz_json = quiz_response.json()
        perspectives_json = perspectives_response.json()
        concept_graph_json = concept_graph_response.json()

        self.assertEqual(quiz_json["quiz_type"], "mcq")
        self.assertEqual(len(quiz_json["quiz"]["questions"]), 3)
        self.assertIn("student", perspectives_json["perspectives"])
        self.assertIn("developer", perspectives_json["perspectives"])
        self.assertIn("business", perspectives_json["perspectives"])
        self.assertIn("beginner_expert", perspectives_json["perspectives"])
        self.assertGreaterEqual(len(concept_graph_json["graph"]["nodes"]), 2)
        self.assertEqual(len(concept_graph_json["graph"]["edges"]), 1)

    def test_video_routes_require_auth_and_history_access(self) -> None:
        video_url = "https://youtube.com/watch?v=video-six"
        owner_headers = self.register_user("frank", "frank@example.com")
        other_user_headers = self.register_user("grace", "grace@example.com")
        self.process_video(video_url, owner_headers)

        unauthenticated_query = self.client.post(
            "/query",
            json={"video_url": video_url, "question": "Can I access this?"},
        )
        self.assertEqual(unauthenticated_query.status_code, 401, unauthenticated_query.text)

        unauthorized_query = self.client.post(
            "/query",
            json={"video_url": video_url, "question": "Can I access this?"},
            headers=other_user_headers,
        )
        self.assertEqual(unauthorized_query.status_code, 403, unauthorized_query.text)

        unauthorized_cross_query = self.client.post(
            "/query/cross",
            json={"question": "Summarize this.", "video_urls": [video_url]},
            headers=other_user_headers,
        )
        self.assertEqual(unauthorized_cross_query.status_code, 403, unauthorized_cross_query.text)

        unauthorized_quiz = self.client.post(
            "/quiz",
            json={"video_url": video_url, "num_questions": 2, "quiz_type": "mcq"},
            headers=other_user_headers,
        )
        self.assertEqual(unauthorized_quiz.status_code, 403, unauthorized_quiz.text)


if __name__ == "__main__":
    unittest.main()
