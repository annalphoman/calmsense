import os
import sys
import time
import cv2
try:
    from facial_detector import get_facial_distress_score, get_detector_details, reset_detector
except ModuleNotFoundError:
    try:
        from backend.ml.facial_detector import get_facial_distress_score, get_detector_details, reset_detector
    except ModuleNotFoundError:
        from ml.facial_detector import get_facial_distress_score, get_detector_details, reset_detector

def run_detection_on_image(image_path: str, timestamp: float = None):
    """Loads an image, processes it, and prints the detailed scores."""
    if not os.path.exists(image_path):
        print(f"Error: File not found at {image_path}")
        return False
        
    image = cv2.imread(image_path)
    if image is None:
        print(f"Error: Could not read image at {image_path}")
        return False
        
    print("-" * 60)
    print(f"Processing: {os.path.basename(image_path)}")
    if timestamp is not None:
        print(f"Simulated Timestamp: {timestamp:.2f}s")
        
    start_time = time.time()
    score = get_facial_distress_score(image, timestamp=timestamp)
    elapsed = (time.time() - start_time) * 1000.0
    
    details = get_detector_details()
    
    print(f"Execution Time: {elapsed:.1f}ms")
    print(f"Final Distress Score: {score:.4f} (0.0 = Calm, 1.0 = High Distress)")
    print("\nIndividual Feature Sub-scores & Metrics:")
    if details:
        print(f"  - Eyebrows Furrow Score : {details['brow_score']:.4f} (Norm Distance: {details['brow_dist_norm']:.4f})")
        print(f"  - Mouth Tension Score   : {details['mouth_score']:.4f} (Norm Height: {details['mouth_height_norm']:.4f}, Norm Width: {details['mouth_width_norm']:.4f})")
        print(f"  - Eye Distress Score     : {details['eye_score']:.4f} (EAR: {details['ear']:.4f}, Blinks in last 5s: {details['num_blinks']})")
        print(f"  - Restlessness Score    : {details['restlessness_score']:.4f} (Velocity Score: {details['velocity_score']:.4f}, Position Std Score: {details['std_score']:.4f})")
    else:
        print("  [No facial landmarks detected in this frame]")
    print("-" * 60)
    return True

def main():
    print("=" * 60)
    print("CalmSense Facial Distress Detection Test Script")
    print("=" * 60)
    
    # 1. Check if specific files were provided in command-line arguments
    if len(sys.argv) > 1:
        image_paths = sys.argv[1:]
        print(f"Running detection on {len(image_paths)} user-provided frame(s)...")
        reset_detector()
        for idx, path in enumerate(image_paths):
            # Simulate a 10 FPS stream (0.1s step)
            sim_time = idx * 0.1
            run_detection_on_image(path, timestamp=sim_time)
        return

    # 2. Check if a local sample_frames directory has any images
    sample_dir = os.path.join(os.path.dirname(__file__), "sample_frames")
    if os.path.exists(sample_dir):
        valid_extensions = (".jpg", ".jpeg", ".png")
        sample_files = [
            os.path.join(sample_dir, f)
            for f in sorted(os.listdir(sample_dir))
            if f.lower().endswith(valid_extensions)
        ]
        if sample_files:
            print(f"Found {len(sample_files)} image(s) in {sample_dir}. Processing...")
            reset_detector()
            for idx, path in enumerate(sample_files):
                sim_time = idx * 0.1
                run_detection_on_image(path, timestamp=sim_time)
            return

    # 3. Fallback: Check for matplotlib's grace_hopper.jpg to run a self-test
    print("No input files or 'sample_frames/' directory found.")
    print("Attempting to run self-test with matplotlib's Grace Hopper sample image...")
    
    workspace_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    grace_hopper_path = os.path.join(
        workspace_root, "venv", "lib", "python3.11", "site-packages", "matplotlib", "mpl-data", "sample_data", "grace_hopper.jpg"
    )
    
    if os.path.exists(grace_hopper_path):
        reset_detector()
        success = run_detection_on_image(grace_hopper_path, timestamp=0.0)
        if success:
            print("\nSelf-test PASSED successfully!")
            print(f"Note: Grace Hopper should show a calm score (0.0 or low).")
    else:
        print(f"Could not locate fallback image at {grace_hopper_path}.")
        
    print("\nHow to test with your own frames:")
    print("1. Create a directory: backend/ml/sample_frames/")
    print("2. Put 2-3 chronological webcam frames (e.g. frame_0.jpg, frame_1.jpg, frame_2.jpg) inside.")
    print("3. Run this script again: python backend/ml/test_facial_detector.py")
    print("   Or specify the file paths directly:")
    print("   python backend/ml/test_facial_detector.py path/to/frame1.jpg path/to/frame2.jpg")
    print("=" * 60)

if __name__ == "__main__":
    main()
