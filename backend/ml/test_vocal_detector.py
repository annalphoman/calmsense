import io
import os
import numpy as np
import soundfile as sf
from vocal_detector import get_vocal_distress_score

def generate_synthetic_audio(duration=5.0, sr=22050, voice_type="calm"):
    """
    Generates synthetic voice-like audio clips modeling acoustic stress parameters.
    
    - Calm: Low pitch (120 Hz), low variance, slow speaking tempo (~90 BPM), low volume.
    - Stressed: Higher pitch (240 Hz), high jitter/variance (erratic sweep), fast speaking tempo (~150 BPM), high volume.
    """
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    
    if voice_type == "calm":
        # 90 BPM tempo pulse
        bpm = 90.0
        period = 60.0 / bpm
        envelope = np.exp(-3.0 * ((t % period) / period))
        
        # Stable pitch around 120 Hz with very small fluctuation
        freq = 120.0 + 3.0 * np.sin(2.0 * np.pi * 0.5 * t)
        phase = 2.0 * np.pi * np.cumsum(freq) / sr
        carrier = np.sin(phase)
        
        # Low volume
        audio = carrier * envelope * 0.03
        
    else:  # stressed
        # 150 BPM tempo pulse
        bpm = 150.0
        period = 60.0 / bpm
        envelope = np.exp(-3.0 * ((t % period) / period))
        
        # High pitch around 240 Hz with high frequency variation (jitter)
        freq = 240.0 + 50.0 * np.sin(2.0 * np.pi * 5.0 * t) + 15.0 * np.random.normal(0, 1, len(t))
        phase = 2.0 * np.pi * np.cumsum(freq) / sr
        carrier = np.sin(phase)
        
        # High volume and adding some high frequency tension noise
        noise = np.random.normal(0, 0.05, len(t))
        audio = (carrier * envelope + noise) * 0.15
        
    return audio, sr

def main():
    print("Generating synthetic audio files...")
    
    # Paths for output files
    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "assets", "audio"))
    os.makedirs(output_dir, exist_ok=True)
    
    calm_path = os.path.join(output_dir, "calm_voice.wav")
    stressed_path = os.path.join(output_dir, "stressed_voice.wav")
    
    # Generate audio
    calm_audio, sr_calm = generate_synthetic_audio(voice_type="calm")
    stressed_audio, sr_stressed = generate_synthetic_audio(voice_type="stressed")
    
    # Save to assets directory
    sf.write(calm_path, calm_audio, sr_calm)
    sf.write(stressed_path, stressed_audio, sr_stressed)
    
    print(f"Saved calm audio to: {calm_path}")
    print(f"Saved stressed audio to: {stressed_path}")
    
    # Load as bytes and test
    print("\nEvaluating audio files with get_vocal_distress_score:")
    
    with open(calm_path, "rb") as f:
        calm_bytes = f.read()
        
    with open(stressed_path, "rb") as f:
        stressed_bytes = f.read()
        
    print("-" * 50)
    calm_score = get_vocal_distress_score(calm_bytes)
    print(f"Calm Voice Score: {calm_score:.4f} (Expected: Low)")
    
    stressed_score = get_vocal_distress_score(stressed_bytes)
    print(f"Stressed Voice Score: {stressed_score:.4f} (Expected: High)")
    print("-" * 50)
    
    assert calm_score < stressed_score, f"Validation failed: Calm score ({calm_score}) should be lower than Stressed score ({stressed_score})"
    print("Assertion Passed! Vocal distress module is functioning as expected.")

if __name__ == "__main__":
    main()
