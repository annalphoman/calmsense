import os
import json
import time
import random
import logging
from typing import Dict, Optional, List, Union
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, status, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.generation.content_mapper import generate_calming_content

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("calmsense_backend")

app = FastAPI(title="CalmSense Backend API", version="1.0.0")

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# File Paths
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
SESSIONS_FILE = os.path.join(DATA_DIR, "sessions.json")
STUDENTS_FILE = os.path.join(DATA_DIR, "students.json")
AUDIO_DIR = os.path.join(os.path.dirname(__file__), "audio")

# Mount Static Files for rhythmic songs
if os.path.exists(AUDIO_DIR):
    app.mount("/static/audio", StaticFiles(directory=AUDIO_DIR), name="audio")
    logger.info(f"Mounted static audio directory at /static/audio from {AUDIO_DIR}")
else:
    logger.warning(f"Audio directory not found at {AUDIO_DIR}. Static files not mounted.")

# Plain-language descriptions for distress levels
DESCRIPTIONS = {
    "calm": "Signs of tranquility - relaxed facial features, steady and calm speech",
    "rising": "Signs of tension building - tighter facial expression, faster speech",
    "high": "Significant distress detected - highly tense facial expression, rapid or agitated speech"
}

# --- Connection Manager for WebSockets ---
class ConnectionManager:
    def __init__(self):
        # Maps session_code -> dict
        # {
        #   "patient_ws": WebSocket,
        #   "companion_ws": WebSocket,
        #   "high_start_time": float (timestamp),
        #   "distress_level": str,
        #   "last_alert": bool
        # }
        self.active_sessions: Dict[str, dict] = {}

    def create_session(self, code: str, patient_ws: WebSocket):
        self.active_sessions[code] = {
            "patient_ws": patient_ws,
            "companion_ws": None,
            "high_start_time": None,
            "distress_level": "calm",
            "last_alert": False
        }
        logger.info(f"Created Patient WebSocket session: {code}")

    def register_companion(self, code: str, companion_ws: WebSocket) -> bool:
        if code in self.active_sessions:
            self.active_sessions[code]["companion_ws"] = companion_ws
            logger.info(f"Registered Companion WebSocket for session: {code}")
            return True
        else:
            # If patient is not connected via WS, we can still create an entry so companion can connect
            self.active_sessions[code] = {
                "patient_ws": None,
                "companion_ws": companion_ws,
                "high_start_time": None,
                "distress_level": "calm",
                "last_alert": False
            }
            logger.info(f"Registered Companion WebSocket for new/HTTP-based session: {code}")
            return True

    def remove_patient(self, code: str):
        if code in self.active_sessions:
            self.active_sessions[code]["patient_ws"] = None
            logger.info(f"Removed Patient WebSocket from session: {code}")
            # If both are disconnected, clean it up
            if self.active_sessions[code]["companion_ws"] is None:
                self.cleanup_session(code)

    def remove_companion(self, code: str):
        if code in self.active_sessions:
            self.active_sessions[code]["companion_ws"] = None
            logger.info(f"Removed Companion WebSocket from session: {code}")
            # If both are disconnected, clean it up
            if self.active_sessions[code]["patient_ws"] is None:
                self.cleanup_session(code)

    def cleanup_session(self, code: str):
        if code in self.active_sessions:
            del self.active_sessions[code]
            logger.info(f"Cleaned up session {code} from memory")

manager = ConnectionManager()

# --- Helper Functions ---
def load_sessions() -> dict:
    if not os.path.exists(SESSIONS_FILE):
        return {}
    try:
        with open(SESSIONS_FILE, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading sessions: {e}")
        return {}

def save_sessions(sessions: dict):
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(SESSIONS_FILE, "w") as f:
            json.dump(sessions, f, indent=2)
    except Exception as e:
        logger.error(f"Error saving sessions: {e}")

def load_students() -> list:
    if not os.path.exists(STUDENTS_FILE):
        return []
    try:
        with open(STUDENTS_FILE, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading students: {e}")
        return []

def compute_distress_level(facial_score: float, vocal_score: float) -> tuple:
    combined_score = (facial_score * 0.6) + (vocal_score * 0.4)
    if combined_score < 0.35:
        level = "calm"
    elif combined_score < 0.70:
        level = "rising"
    else:
        level = "high"
    return combined_score, level

async def update_and_relay_distress(code: str, distress_level: str):
    if code not in manager.active_sessions:
        manager.active_sessions[code] = {
            "patient_ws": None,
            "companion_ws": None,
            "high_start_time": None,
            "distress_level": "calm",
            "last_alert": False
        }

    session = manager.active_sessions[code]
    session["distress_level"] = distress_level

    # Alert Tracking
    alert = False
    if distress_level == "high":
        if session["high_start_time"] is None:
            session["high_start_time"] = time.time()
        else:
            elapsed = time.time() - session["high_start_time"]
            if elapsed > 5.0:
                alert = True
    else:
        session["high_start_time"] = None

    session["last_alert"] = alert
    description = DESCRIPTIONS.get(distress_level, "Unknown distress status")

    companion_ws = session["companion_ws"]
    if companion_ws:
        try:
            await companion_ws.send_json({
                "type": "distress_update",
                "distress_level": distress_level,
                "description": description,
                "alert": alert
            })
            logger.info(f"Relayed distress score to Companion ({code}): level={distress_level}, alert={alert}")
        except Exception as e:
            logger.error(f"Failed to send to Companion WebSocket on session {code}: {e}")
            session["companion_ws"] = None

# --- Models ---
class DistressScoreInput(BaseModel):
    facial_score: float = Field(..., description="Facial distress score between 0 and 1", ge=0.0, le=1.0)
    vocal_score: float = Field(..., description="Vocal distress score between 0 and 1", ge=0.0, le=1.0)
    session_code: Optional[str] = Field(None, description="Optional active session code to relay real-time update")

class DistressScoreResponse(BaseModel):
    distress_level: str
    combined_score: float

class CalmPreferences(BaseModel):
    colors: List[str] = []
    sounds: List[str] = []

class GenerateCalmInput(BaseModel):
    distress_level: str
    content_type: str = Field(..., description="Type of content: visual, soundscape, or rhythmic_song")
    preferences: CalmPreferences

class GenerateCalmResponse(BaseModel):
    content_type: str
    content_url: str

class LoginInput(BaseModel):
    username: str
    pin: str

class ChildInfoInput(BaseModel):
    session_code: Optional[str] = None
    name: str
    known_triggers: Union[List[str], str] = []
    calming_preferences: CalmPreferences
    content_type: str
    notes: str = ""

class FeedbackInput(BaseModel):
    session_code: str
    note: str
    timestamp: str

# --- Endpoints ---

@app.post("/distress-score", response_model=DistressScoreResponse)
async def distress_score(payload: DistressScoreInput):
    combined_score, distress_level = compute_distress_level(payload.facial_score, payload.vocal_score)
    
    # If session code is provided, update WebSocket state and notify companions
    if payload.session_code:
        await update_and_relay_distress(payload.session_code, distress_level)
        
    return DistressScoreResponse(
        distress_level=distress_level,
        combined_score=round(combined_score, 4)
    )

@app.post("/generate-calm", response_model=GenerateCalmResponse)
async def generate_calm(payload: GenerateCalmInput):
    if payload.content_type not in ["visual", "soundscape", "rhythmic_song"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid content_type. Must be 'visual', 'soundscape', or 'rhythmic_song'"
        )

    # Call content mapper to get URL (with fallback inside)
    url = generate_calming_content(
        distress_level=payload.distress_level,
        content_type=payload.content_type,
        preferences=payload.preferences.model_dump()
    )

    return GenerateCalmResponse(
        content_type=payload.content_type,
        content_url=url
    )

@app.post("/login")
async def login(payload: LoginInput):
    students = load_students()
    for student in students:
        if student.get("username") == payload.username and student.get("pin") == payload.pin:
            return {"success": True, "message": "Login successful"}
    return {"success": False, "message": "Invalid username or PIN"}

@app.post("/child-info")
async def child_info(payload: ChildInfoInput):
    sessions = load_sessions()
    
    session_code = payload.session_code
    if not session_code:
        # Generate new session code if not provided
        session_code = f"{random.randint(1000, 9999)}"
        while session_code in sessions:
            session_code = f"{random.randint(1000, 9999)}"

    # Normalize known triggers to list
    triggers = payload.known_triggers
    if isinstance(triggers, str):
        triggers = [t.strip() for t in triggers.split(",") if t.strip()]

    sessions[session_code] = {
        "child_info": {
            "name": payload.name,
            "known_triggers": triggers,
            "calming_preferences": payload.calming_preferences.model_dump(),
            "content_type": payload.content_type,
            "notes": payload.notes
        },
        "feedback": sessions.get(session_code, {}).get("feedback", [])
    }
    
    save_sessions(sessions)
    return {"success": True, "session_code": session_code}

@app.post("/feedback")
async def feedback(payload: FeedbackInput):
    sessions = load_sessions()
    if payload.session_code not in sessions:
        return {"success": False, "message": "Session not found"}

    session_entry = sessions[payload.session_code]
    if "feedback" not in session_entry:
        session_entry["feedback"] = []

    session_entry["feedback"].append({
        "note": payload.note,
        "timestamp": payload.timestamp
    })

    save_sessions(sessions)
    return {"success": True}

# --- WebSocket Endpoints ---

@app.websocket("/ws/patient")
async def websocket_patient(websocket: WebSocket):
    await websocket.accept()
    
    # Generate unique 4-digit code
    code = f"{random.randint(1000, 9999)}"
    while code in manager.active_sessions:
        code = f"{random.randint(1000, 9999)}"
        
    manager.create_session(code, websocket)
    
    try:
        # Send initial confirmation message with code
        await websocket.send_json({
            "type": "session_created",
            "session_code": code
        })
        
        while True:
            # Expect telemetry scores from patient device
            data = await websocket.receive_json()
            
            # Extract scores or direct distress level
            facial = data.get("facial_score")
            vocal = data.get("vocal_score")
            distress_level = data.get("distress_level")
            
            if facial is not None and vocal is not None:
                _, distress_level = compute_distress_level(float(facial), float(vocal))
            
            if distress_level:
                await update_and_relay_distress(code, distress_level)
            else:
                logger.warning(f"WebSocket patient session {code} sent invalid data schema: {data}")
                
    except WebSocketDisconnect:
        manager.remove_patient(code)
    except Exception as e:
        logger.error(f"Error in patient websocket connection for {code}: {e}")
        manager.remove_patient(code)

@app.websocket("/ws/companion/{session_code}")
async def websocket_companion(websocket: WebSocket, session_code: str):
    # Register the companion connection
    manager.register_companion(session_code, websocket)
    await websocket.accept()

    try:
        # Send current status immediately on connect
        session = manager.active_sessions.get(session_code)
        if session:
            current_level = session["distress_level"]
            alert = session["last_alert"]
            description = DESCRIPTIONS.get(current_level, "Unknown distress status")
            await websocket.send_json({
                "type": "distress_update",
                "distress_level": current_level,
                "description": description,
                "alert": alert
            })

        while True:
            # We keep the companion connection open.
            # Companions are primarily receivers of information.
            # But they might send client pings or feedback messages.
            data = await websocket.receive_text()
            logger.info(f"Received message from Companion {session_code}: {data}")

    except WebSocketDisconnect:
        manager.remove_companion(session_code)
    except Exception as e:
        logger.error(f"Error in companion websocket connection for {session_code}: {e}")
        manager.remove_companion(session_code)
