import os
import sys

# Ensure backend directory is in the path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from main import app, STUDENTS_FILE, THERAPISTS_FILE, load_students, load_therapists, save_students, save_therapists

client = TestClient(app)

def run_tests():
    # Save original state to restore after test
    orig_students = load_students()
    orig_therapists = load_therapists()

    try:
        print("Starting signup flow validation tests...")

        # 1. Test missing fields
        payload_missing = {
            "username": "temp_user",
            "pin": "1234",
            "confirm_pin": "1234"
        }
        res = client.post("/signup", json=payload_missing)
        print("1. Missing fields response:", res.json())
        assert res.json()["success"] is False
        assert "Missing required fields" in res.json()["message"]

        # 2. Test pin mismatch
        payload_mismatch = {
            "name": "Test User",
            "username": "temp_user",
            "pin": "1234",
            "confirm_pin": "5678",
            "favorite_color": "blue",
            "role": "client"
        }
        res = client.post("/signup", json=payload_mismatch)
        print("2. Pin mismatch response:", res.json())
        assert res.json()["success"] is False
        assert "PINs do not match" in res.json()["message"]

        # 3. Test invalid role
        payload_role = {
            "name": "Test User",
            "username": "temp_user",
            "pin": "1234",
            "confirm_pin": "1234",
            "favorite_color": "blue",
            "role": "admin"
        }
        res = client.post("/signup", json=payload_role)
        print("3. Invalid role response:", res.json())
        assert res.json()["success"] is False
        assert "Invalid role" in res.json()["message"]

        # 4. Test client/student signup success
        payload_client = {
            "name": "Alice Student",
            "username": "alice_test",
            "pin": "9999",
            "confirm_pin": "9999",
            "favorite_color": "pink",
            "role": "client"
        }
        res = client.post("/signup", json=payload_client)
        print("4. Client signup response:", res.json())
        assert res.json()["success"] is True

        # 5. Test username already taken (client)
        res = client.post("/signup", json=payload_client)
        print("5. Duplicate username response:", res.json())
        assert res.json()["success"] is False
        assert "Username already taken" in res.json()["message"]

        # 6. Test therapist signup success
        payload_therapist = {
            "name": "Dr. Bob",
            "username": "bob_test",
            "pin": "7777",
            "confirm_pin": "7777",
            "favorite_color": "teal",
            "role": "therapist"
        }
        res = client.post("/signup", json=payload_therapist)
        print("6. Therapist signup response:", res.json())
        assert res.json()["success"] is True

        print("\nAll signup validation and storage tests passed successfully!")

    finally:
        # Restore original files
        save_students(orig_students)
        save_therapists(orig_therapists)

if __name__ == "__main__":
    run_tests()
