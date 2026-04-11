from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.utils import get_video_id


class TestYouTubeUrlParsing(unittest.TestCase):
    def test_accepts_common_youtube_formats(self) -> None:
        cases = {
            "dQw4w9WgXcQ": "dQw4w9WgXcQ",
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ": "dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ?t=43": "dQw4w9WgXcQ",
            "https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share": "dQw4w9WgXcQ",
            "https://www.youtube.com/shorts/dQw4w9WgXcQ": "dQw4w9WgXcQ",
            "https://www.youtube.com/embed/dQw4w9WgXcQ": "dQw4w9WgXcQ",
            "youtu.be/dQw4w9WgXcQ": "dQw4w9WgXcQ",
            "https://www.youtube.com/live/dQw4w9WgXcQ?feature=share": "dQw4w9WgXcQ",
            "www.youtube-nocookie.com/embed/dQw4w9WgXcQ": "dQw4w9WgXcQ",
        }

        for raw_url, expected_video_id in cases.items():
            with self.subTest(raw_url=raw_url):
                self.assertEqual(get_video_id(raw_url), expected_video_id)

    def test_rejects_non_youtube_or_invalid_ids(self) -> None:
        cases = [
            "",
            "https://example.com/watch?v=dQw4w9WgXcQ",
            "https://www.youtube.com/watch?v=short-id",
            "youtube.com/watch?v=short-id",
            "not a youtube url",
        ]

        for raw_url in cases:
            with self.subTest(raw_url=raw_url):
                self.assertIsNone(get_video_id(raw_url))


if __name__ == "__main__":
    unittest.main()
