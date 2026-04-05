import requests

url = "http://localhost:8000/process"
data = {"video_url": "https://www.youtube.com/watch?v=Gfr50f6ZBvo"}

try:
    response = requests.post(url, json=data)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Connection Error: {e}")
