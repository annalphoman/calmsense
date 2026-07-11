import os
import json
import time
import pytest
from fastapi.testclient import TestClient

# Adjust import path
import sys
sys.path.append(os.path.dirname(os.path.dirname(__abspath__ := os.path.abspath(__file__))))

from backend.main import app, SESSIONS_FILE, STUDENTS_FILE

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_teardown_files():
    # Make sure we back up existing session file if any, or start with clean files
    old_sessions = None
    if os.path.exists(SESSIONS_FILE):
        with open(SESSIONS_FILE, "r") as f:
            old_sessions = f.read()
    
    # Initialize clean files for testing
    os.makedirs(os.path.dirname(SESSIONS_FILE), exist_ok=True)
    with open(SESSIONS_FILE, "w") as f:
        f.write("{}")
        
    # Ensure students file exists
    if not os.path.exists(STUDENTS_FILE):
        with open(STUDENTS_FILE, "w") as f:
            json.dump([{"username": "test_student", "pin": "1234"}], f)
            
    yield
    
    # Restore sessions file
    if old_sessions is not None:
        with open(SESSIONS_FILE, "w") as f:
            f.write(old_sessions)
    elif os.path.exists(SESSIONS_FILE):
        os.remove(SESSIONS_FILE)


def test_login():
    # Test valid login
    response = client.post("/login", json={"username": "student_mode", "pin": "1234"})
    assert response.status_code == 200
    assert response.json() == {"success": True, "message": "Login successful"}

    # Test invalid username
    response = client.post("/login", json={"username": "wrong_student", "pin": "1234"})
    assert response.status_code == 200
    assert response.json()["success"] is False

    # Test invalid pin
    response = client.post("/login", json={"username": "student_mode", "pin": "9999"})
    assert response.status_code == 200
    assert response.json()["success"] is False


def test_distress_score():
    # Test Calm classification
    # 0.1 * 0.6 + 0.2 * 0.4 = 0.14 (< 0.35) -> calm
    response = client.post("/distress-score", json={"facial_score": 0.1, "vocal_score": 0.2})
    assert response.status_code == 200
    assert response.json()["distress_level"] == "calm"
    assert response.json()["combined_score"] == 0.14

    # Test Rising classification
    # 0.5 * 0.6 + 0.5 * 0.4 = 0.50 (0.35 <= 0.5 < 0.70) -> rising
    response = client.post("/distress-score", json={"facial_score": 0.5, "vocal_score": 0.5})
    assert response.status_code == 200
    assert response.json()["distress_level"] == "rising"
    assert response.json()["combined_score"] == 0.5

    # Test High classification
    # 0.8 * 0.6 + 0.9 * 0.4 = 0.84 (>= 0.70) -> high
    response = client.post("/distress-score", json={"facial_score": 0.8, "vocal_score": 0.9})
    assert response.status_code == 200
    assert response.json()["distress_level"] == "high"
    assert response.json()["combined_score"] == 0.84


def test_child_info_and_feedback():
    # 1. Post child info to create a session
    child_payload = {
        "name": "Jane Doe",
        "known_triggers": "loud noises, bright lights",
        "calming_preferences": {
            "colors": ["pastel blue", "soft teal"],
            "sounds": ["gentle rain", "lullaby"]
        },
        "content_type": "visual",
        "notes": "Jane settles down when looking at soft blues."
    }
    response = client.post("/child-info", json=child_payload)
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["success"] is True
    session_code = res_data["session_code"]
    assert len(session_code) == 4

    # Verify session is written to file
    with open(SESSIONS_FILE, "r") as f:
        saved_data = json.load(f)
    assert session_code in saved_data
    assert saved_data[session_code]["child_info"]["name"] == "Jane Doe"
    # Verify split list trigger format
    assert saved_data[session_code]["child_info"]["known_triggers"] == ["loud noises", "bright lights"]

    # 2. Add feedback to the session
    feedback_payload = {
        "session_code": session_code,
        "note": "Session was very calming, child slept.",
        "timestamp": "2026-07-11T12:00:00Z"
    }
    response = client.post("/feedback", json=feedback_payload)
    assert response.status_code == 200
    assert response.json() == {"success": True}

    # Verify feedback was appended
    with open(SESSIONS_FILE, "r") as f:
        saved_data = json.load(f)
    assert len(saved_data[session_code]["feedback"]) == 1
    assert saved_data[session_code]["feedback"][0]["note"] == "Session was very calming, child slept."

    # Test feedback for non-existent session
    bad_feedback = {
        "session_code": "9999",
        "note": "Does not exist",
        "timestamp": "now"
    }
    response = client.post("/feedback", json=bad_feedback)
    assert response.status_code == 200
    assert response.json()["success"] is False


def test_generate_calm():
    # 1. Rhythmic song - should return local path
    response = client.post("/generate-calm", json={
        "distress_level": "rising",
        "content_type": "rhythmic_song",
        "preferences": {"colors": ["blue"], "sounds": ["nature"]}
    })
    assert response.status_code == 200
    assert response.json()["content_type"] == "rhythmic_song"
    assert response.json()["content_url"].startswith("/static/audio/rhythmic_songs/")

    # 2. Visual content - should call Pollinations and return URL (either Pollinations or Fallback)
    response = client.post("/generate-calm", json={
        "distress_level": "high",
        "content_type": "visual",
        "preferences": {"colors": ["pink", "purple"], "sounds": ["ocean"]}
    })
    assert response.status_code == 200
    assert response.json()["content_type"] == "visual"
    url = response.json()["content_url"]
    # Check that it returned a valid url format
    assert url.startswith("https://")


def test_websockets_relay_and_alerting():
    # Connect patient ws
    with client.websocket_connect("/ws/patient") as patient_ws:
        # 1. Patient receives the generated code
        init_msg = patient_ws.receive_json()
        assert init_msg["type"] == "session_created"
        session_code = init_msg["session_code"]
        assert len(session_code) == 4
        
        # Connect companion ws using the session code
        with client.websocket_connect(f"/ws/companion/{session_code}") as companion_ws:
            # 2. Companion receives initial connection state (calm by default)
            init_companion_msg = companion_ws.receive_json()
            assert init_companion_msg["type"] == "distress_update"
            assert init_companion_msg["distress_level"] == "calm"
            assert init_companion_msg["alert"] is False

            # 3. Patient sends rising telemetry
            # combined: 0.5 * 0.6 + 0.5 * 0.4 = 0.5 -> rising
            patient_ws.send_json({"facial_score": 0.5, "vocal_score": 0.5})
            
            # Companion should receive the updated status
            update_msg = companion_ws.receive_json()
            assert update_msg["type"] == "distress_update"
            assert update_msg["distress_level"] == "rising"
            assert "Signs of tension building" in update_msg["description"]
            assert update_msg["alert"] is False

            # 4. Patient sends high distress
            patient_ws.send_json({"facial_score": 0.9, "vocal_score": 0.9})
            
            # First high reading should not trigger alert immediately (needs 5+ seconds consecutive)
            update_msg = companion_ws.receive_json()
            assert update_msg["distress_level"] == "high"
            assert update_msg["alert"] is False

            # Sleep 1.5 seconds and send high again (elapsed = 1.5s, no alert)
            time.sleep(1.5)
            patient_ws.send_json({"facial_score": 0.95, "vocal_score": 0.95})
            update_msg = companion_ws.receive_json()
            assert update_msg["distress_level"] == "high"
            assert update_msg["alert"] is False

            # Sleep 4.0 seconds (total elapsed since start of high is 5.5s, so alert should trigger)
            time.sleep(4.0)
            patient_ws.send_json({"facial_score": 0.95, "vocal_score": 0.95})
            update_msg = companion_ws.receive_json()
            assert update_msg["distress_level"] == "high"
            assert update_msg["alert"] is True

            # 5. Patient drops back to calm, alert should reset to False
            patient_ws.send_json({"facial_score": 0.1, "vocal_score": 0.1})
            update_msg = companion_ws.receive_json()
            assert update_msg["distress_level"] == "calm"
            assert update_msg["alert"] is False

def test_analyze_live():
    # Paths to the real samples
    workspace_root = os.path.abspath(os.path.dirname(os.path.dirname(__abspath__ := os.path.abspath(__file__))))
    image_path = os.path.join(workspace_root, "assets", "face.png")
    audio_path = os.path.join(workspace_root, "assets", "audio", "calm_voice.wav")
    
    assert os.path.exists(image_path), f"Test image not found at {image_path}"
    assert os.path.exists(audio_path), f"Test audio not found at {audio_path}"
    
    # 1. Test image file upload and audio file upload
    with open(image_path, "rb") as img_f, open(audio_path, "rb") as audio_f:
        files = {
            "image": ("face.png", img_f, "image/png"),
            "audio": ("calm_voice.wav", audio_f, "audio/wav")
        }
        response = client.post("/analyze-live", files=files)
        
    assert response.status_code == 200
    res_data = response.json()
    assert "distress_level" in res_data
    assert "combined_score" in res_data
    assert "facial_score" in res_data
    assert "vocal_score" in res_data
    assert res_data["distress_level"] in ["calm", "rising", "high"]
    
    # 2. Test base64 image and audio file upload
    import base64
    with open(image_path, "rb") as img_f:
        img_b64_str = base64.b64encode(img_f.read()).decode("utf-8")
        
    with open(audio_path, "rb") as audio_f:
        files = {
            "audio": ("calm_voice.wav", audio_f, "audio/wav")
        }
        data = {
            "image_b64": img_b64_str
        }
        response = client.post("/analyze-live", files=files, data=data)
        
    assert response.status_code == 200
    res_data = response.json()
    assert "distress_level" in res_data
    assert res_data["distress_level"] in ["calm", "rising", "high"]
