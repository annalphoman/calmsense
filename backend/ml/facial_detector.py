import os
# pyrefly: ignore [missing-import]
import cv2
# pyrefly: ignore [missing-import]
import numpy as np
# pyrefly: ignore [missing-import]
import mediapipe as mp
import time
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

class FacialDistressDetector:
    def __init__(self):
        # Resolve the absolute path to the face_landmarker.task model file, allowing override via env var
        env_path = os.environ.get("CALMSENSE_MODEL_PATH")
        if env_path:
            self.model_path = os.path.abspath(env_path)
        else:
            current_dir = os.path.dirname(os.path.abspath(__file__))
            self.model_path = os.path.join(current_dir, 'face_landmarker.task')
        
        # Detector initialized lazily on the first frame to prevent import crashes
        self.detector = None
        
        # State history for sequential features (rolling 5.0 second window)
        self.nose_history = []  # List of tuples: (normalized_nose_coords_np, timestamp)
        self.blink_timestamps = []  # List of timestamps when a blink occurred
        self.in_blink = False
        self.blink_start_time = 0.0
        
        # Last calculated score and details to return if face detection fails temporarily
        self.last_score = 0.0
        self.last_sub_scores = {}

        # =====================================================================
        # TUNABLE RULE-BASED THRESHOLDS & PARAMETERS
        # =====================================================================
        
        # 1. Brow Furrow (Distance between inner eyebrows 107 and 336 / face_width)
        # Calm: eyebrows are relaxed. Distressed: eyebrows are furrowed (closer).
        self.param_brow_calm = 0.23
        self.param_brow_distressed = 0.17
        
        # 2. Mouth Tension
        # - Vertical open (indices 13 and 14): Screaming/Gasping.
        self.param_mouth_height_calm = 0.03
        self.param_mouth_height_distressed = 0.13
        
        # - Horizontal width (indices 61 and 291): Grimace (stretch) or pursing (tight).
        self.param_mouth_width_calm_min = 0.40
        self.param_mouth_width_calm_max = 0.55
        self.param_mouth_width_stretch_distressed = 0.65
        self.param_mouth_width_purse_distressed = 0.34
        
        # 3. Eye Openness & Blinking (EAR)
        # - Squinting (tension/crying)
        self.param_ear_calm_min = 0.25
        self.param_ear_squint_distressed = 0.19
        
        # - Wide eyes (fear/surprise)
        self.param_ear_calm_max = 0.33
        self.param_ear_wide_distressed = 0.39
        
        # - Blink detection threshold (EAR drop to detect blink start)
        self.param_blink_threshold = 0.18
        
        # - Blink rate scoring: target is count in a rolling 5-second window.
        # 0 or 1 blink is calm (0.0 distress), 4 or more is high distress (1.0).
        self.param_blinks_calm = 1
        self.param_blinks_distressed = 4
        
        # 4. Head Movement / Restlessness (Rolling 5s window)
        # - Frame-to-frame velocity (displacement per second)
        self.param_vel_calm = 0.05
        self.param_vel_distressed = 0.30
        
        # - Standard deviation of nose position (overall range of motion/fidgeting)
        self.param_std_calm = 0.015
        self.param_std_distressed = 0.07
        
        # 5. Combined Weights
        self.weights = {
            'brow': 0.30,
            'mouth': 0.30,
            'eye': 0.20,
            'restlessness': 0.20
        }

    def _ensure_model_exists(self):
        """Ensures the MediaPipe FaceLandmarker model file is present, downloading it if necessary."""
        if not os.path.exists(self.model_path):
            print(f"MediaPipe FaceLandmarker model file not found at {self.model_path}.")
            print("Attempting to download it automatically from Google APIs...")
            import urllib.request
            url = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
            temp_path = self.model_path + ".tmp"
            try:
                os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
                urllib.request.urlretrieve(url, temp_path)
                os.rename(temp_path, self.model_path)
                print(f"Successfully downloaded model file to {self.model_path}")
            except Exception as e:
                if os.path.exists(temp_path):
                    try:
                        os.remove(temp_path)
                    except:
                        pass
                err_msg = str(e)
                if "Permission" in err_msg or "Read-only" in err_msg:
                    raise PermissionError(
                        f"Could not write model file to {self.model_path} due to permission error: {e}. "
                        f"Please set the CALMSENSE_MODEL_PATH environment variable to a writable path."
                    ) from e
                raise FileNotFoundError(
                    f"Could not download model from {url}. Error: {e}. "
                    f"Please download it manually and place it at {self.model_path}."
                ) from e

    def _init_detector(self):
        """Initializes the MediaPipe FaceLandmarker detector if not already done."""
        if self.detector is not None:
            return
            
        self._ensure_model_exists()
        
        base_options = python.BaseOptions(model_asset_path=self.model_path)
        options = vision.FaceLandmarkerOptions(
            base_options=base_options,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
            num_faces=1
        )
        self.detector = vision.FaceLandmarker.create_from_options(options)

    def reset(self):
        """Resets the history tracking buffers."""
        self.nose_history.clear()
        self.blink_timestamps.clear()
        self.in_blink = False
        self.last_score = 0.0

    def _get_coords(self, lm, width: int, height: int) -> np.ndarray:
        """Converts normalized landmarks to pixel-scaled coordinates."""
        # Scale z by width, which is a common practice since z is scaled relative to the face size
        return np.array([lm.x * width, lm.y * height, lm.z * width])

    def _dist(self, lm1, lm2, width: int, height: int) -> float:
        """Calculates 3D Euclidean distance between two landmarks in pixel-scale."""
        c1 = self._get_coords(lm1, width, height)
        c2 = self._get_coords(lm2, width, height)
        return float(np.linalg.norm(c1 - c2))

    def process_frame(self, image: np.ndarray | str, timestamp: float | None = None) -> float:
        """
        Processes a single BGR image frame and returns a distress score [0.0, 1.0].
        
        Args:
            image: OpenCV BGR image or path to image.
            timestamp: Optional mock timestamp (in seconds) for frame sequence playback. 
                       If None, time.time() is used.
        """
        if isinstance(image, str):
            loaded = cv2.imread(image)
            if loaded is None:
                return self.last_score
            img_array = loaded
        else:
            img_array = image
            
        if not isinstance(img_array, np.ndarray) or len(img_array.shape) < 2:
            return self.last_score
            
        if timestamp is None:
            timestamp = time.time()
            
        self._init_detector()
        if self.detector is None:
            return self.last_score
            
        height, width = img_array.shape[:2]
        
        # Convert BGR/Grayscale/BGRA to RGB
        if len(img_array.shape) == 2:  # Grayscale
            rgb_image = cv2.cvtColor(img_array, cv2.COLOR_GRAY2RGB)
        elif img_array.shape[2] == 4:  # BGRA
            rgb_image = cv2.cvtColor(img_array, cv2.COLOR_BGRA2RGB)
        else:  # BGR (standard 3 channels)
            rgb_image = cv2.cvtColor(img_array, cv2.COLOR_BGR2RGB)
            
        # Create MediaPipe Image object
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_image)
        
        # Process image using Face Landmarker
        results = self.detector.detect(mp_image)
        
        if not results.face_landmarks:
            # Face not detected, return the last calculated score to prevent sudden drops
            return self.last_score
            
        landmarks = results.face_landmarks[0]
        
        # 0. Normalizing Scale (Face Width: distance between left & right outer eye corners)
        # Left eye outer: 33, Right eye outer: 263
        face_width = self._dist(landmarks[33], landmarks[263], width, height)
        if face_width < 1e-5:
            face_width = 1.0
            
        # 1. BROW FURROW SCORE
        # Left eyebrow inner: 107, Right eyebrow inner: 336
        brow_dist = self._dist(landmarks[107], landmarks[336], width, height)
        brow_dist_norm = brow_dist / face_width
        
        if brow_dist_norm <= self.param_brow_distressed:
            brow_score = 1.0
        elif brow_dist_norm >= self.param_brow_calm:
            brow_score = 0.0
        else:
            brow_score = (self.param_brow_calm - brow_dist_norm) / (self.param_brow_calm - self.param_brow_distressed)
            
        # 2. MOUTH TENSION SCORE
        # Vertical Height (Upper lip center: 13, Lower lip center: 14)
        mouth_height = self._dist(landmarks[13], landmarks[14], width, height)
        mouth_height_norm = mouth_height / face_width
        
        # Open mouth distress (gasping/shouting)
        if mouth_height_norm >= self.param_mouth_height_distressed:
            mouth_open_score = 1.0
        elif mouth_height_norm <= self.param_mouth_height_calm:
            mouth_open_score = 0.0
        else:
            mouth_open_score = (mouth_height_norm - self.param_mouth_height_calm) / (self.param_mouth_height_distressed - self.param_mouth_height_calm)
            
        # Horizontal Width (Mouth corner left: 61, Mouth corner right: 291)
        mouth_width = self._dist(landmarks[61], landmarks[291], width, height)
        mouth_width_norm = mouth_width / face_width
        
        # Horizontal stretch (fear/grimacing)
        if mouth_width_norm >= self.param_mouth_width_stretch_distressed:
            mouth_stretch_score = 1.0
        elif mouth_width_norm <= self.param_mouth_width_calm_max:
            mouth_stretch_score = 0.0
        else:
            mouth_stretch_score = (mouth_width_norm - self.param_mouth_width_calm_max) / (self.param_mouth_width_stretch_distressed - self.param_mouth_width_calm_max)
            
        # Horizontal compression (pursed lips/tightening)
        if mouth_width_norm <= self.param_mouth_width_purse_distressed:
            mouth_purse_score = 1.0
        elif mouth_width_norm >= self.param_mouth_width_calm_min:
            mouth_purse_score = 0.0
        else:
            mouth_purse_score = (self.param_mouth_width_calm_min - mouth_width_norm) / (self.param_mouth_width_calm_min - self.param_mouth_width_purse_distressed)
            
        mouth_score = max(mouth_open_score, mouth_stretch_score, mouth_purse_score)
        
        # 3. EYE OPENNESS & BLINK RATE SCORE
        # EAR calculation
        # Left eye: corners 33, 133; eyelids 160-144, 158-153
        ear_l = (self._dist(landmarks[160], landmarks[144], width, height) + 
                 self._dist(landmarks[158], landmarks[153], width, height)) / (2.0 * self._dist(landmarks[33], landmarks[133], width, height))
        # Right eye: corners 263, 362; eyelids 387-373, 385-380
        ear_r = (self._dist(landmarks[387], landmarks[373], width, height) + 
                 self._dist(landmarks[385], landmarks[380], width, height)) / (2.0 * self._dist(landmarks[263], landmarks[362], width, height))
        ear = (ear_l + ear_r) / 2.0
        
        # Squinting score
        if ear <= self.param_ear_squint_distressed:
            squint_score = 1.0
        elif ear >= self.param_ear_calm_min:
            squint_score = 0.0
        else:
            squint_score = (self.param_ear_calm_min - ear) / (self.param_ear_calm_min - self.param_ear_squint_distressed)
            
        # Wide eyes score
        if ear >= self.param_ear_wide_distressed:
            wide_score = 1.0
        elif ear <= self.param_ear_calm_max:
            wide_score = 0.0
        else:
            wide_score = (ear - self.param_ear_calm_max) / (self.param_ear_wide_distressed - self.param_ear_calm_max)
            
        # Blink state tracking
        if ear < self.param_blink_threshold:
            if not self.in_blink:
                self.in_blink = True
                self.blink_start_time = timestamp
        else:
            if self.in_blink:
                self.in_blink = False
                duration = timestamp - self.blink_start_time
                # Only count rapid/normal blinks (50ms - 800ms) to filter out long eye closures (drowsiness/crying)
                if 0.05 <= duration <= 0.8:
                    self.blink_timestamps.append(timestamp)
                    
        # Filter blink history to a rolling 5.0 second window
        self.blink_timestamps = [t for t in self.blink_timestamps if timestamp - t <= 5.0]
        num_blinks = len(self.blink_timestamps)
        
        # Blink rate score mapping
        if num_blinks <= self.param_blinks_calm:
            blink_score = 0.0
        elif num_blinks >= self.param_blinks_distressed:
            blink_score = 1.0
        else:
            blink_score = (num_blinks - self.param_blinks_calm) / (self.param_blinks_distressed - self.param_blinks_calm)
            
        eye_score = max(squint_score, wide_score, blink_score)
        
        # 4. HEAD MOVEMENT / RESTLESSNESS SCORE
        # Nose tip coordinates normalized by face width
        nose_coords = self._get_coords(landmarks[4], width, height)
        nose_coords_norm = nose_coords / face_width
        
        # Store in rolling buffer
        self.nose_history.append((nose_coords_norm, timestamp))
        self.nose_history = [(p, t) for p, t in self.nose_history if timestamp - t <= 5.0]
        
        # Calculate velocity and standard deviation
        velocity_score = 0.0
        std_score = 0.0
        
        if len(self.nose_history) >= 2:
            # 4a. Frame-to-frame velocity
            velocities = []
            for i in range(1, len(self.nose_history)):
                p1, t1 = self.nose_history[i - 1]
                p2, t2 = self.nose_history[i]
                dt = t2 - t1
                if dt > 1e-5:
                    dist_moved = np.linalg.norm(p2 - p1)
                    velocities.append(dist_moved / dt)
            
            if velocities:
                mean_vel = float(np.mean(velocities))
                if mean_vel >= self.param_vel_distressed:
                    velocity_score = 1.0
                elif mean_vel <= self.param_vel_calm:
                    velocity_score = 0.0
                else:
                    velocity_score = (mean_vel - self.param_vel_calm) / (self.param_vel_distressed - self.param_vel_calm)
                    
            # 4b. Standard deviation (Fidgeting / overall range of motion)
            positions = np.array([p for p, t in self.nose_history])
            stds = np.std(positions, axis=0)
            overall_std = float(np.sqrt(np.sum(stds ** 2)))
            
            if overall_std >= self.param_std_distressed:
                std_score = 1.0
            elif overall_std <= self.param_std_calm:
                std_score = 0.0
            else:
                std_score = (overall_std - self.param_std_calm) / (self.param_std_distressed - self.param_std_calm)
                
        restlessness_score = max(velocity_score, std_score)
        
        # 5. SYNTHESIS (Weighted Sum of Sub-Scores)
        total_score = (
            self.weights['brow'] * brow_score +
            self.weights['mouth'] * mouth_score +
            self.weights['eye'] * eye_score +
            self.weights['restlessness'] * restlessness_score
        )
        
        # Ensure final score is clamped between 0.0 and 1.0
        total_score = max(0.0, min(1.0, total_score))
        
        # Keep track of sub-scores for logging/debugging
        self.last_sub_scores = {
            'brow_score': brow_score,
            'brow_dist_norm': brow_dist_norm,
            'mouth_score': mouth_score,
            'mouth_height_norm': mouth_height_norm,
            'mouth_width_norm': mouth_width_norm,
            'eye_score': eye_score,
            'ear': ear,
            'num_blinks': num_blinks,
            'restlessness_score': restlessness_score,
            'velocity_score': velocity_score,
            'std_score': std_score
        }
        
        self.last_score = total_score
        return total_score

# Global stateful detector instance for simple function-based usage
_detector = FacialDistressDetector()

def get_facial_distress_score(image: np.ndarray | str, timestamp: float | None = None) -> float:
    """
    Analyzes a single frame image using MediaPipe FaceMesh and returns a distress score [0.0, 1.0].
    Maintains internal history for sequence-based features (blink rate, head movement).
    
    Args:
        image: OpenCV BGR image or path to image.
        timestamp: Optional mock timestamp (in seconds) for frame sequence playback.
    """
    return _detector.process_frame(image, timestamp)

def reset_detector():
    """Resets the global detector's history."""
    _detector.reset()

def get_detector_details() -> dict:
    """Returns the detailed sub-scores from the last processed frame."""
    if hasattr(_detector, 'last_sub_scores'):
        return _detector.last_sub_scores
    return {}
