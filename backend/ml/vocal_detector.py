import io
import librosa
import numpy as np
import soundfile as sf

def get_vocal_distress_score(audio_bytes: bytes) -> float:
    """
    Computes a vocal distress score (0.0 = calm, 1.0 = high distress) 
    from raw audio bytes based on acoustic features.
    
    Acoustic features analyzed:
    - Pitch (F0) variance (higher standard deviation indicates higher distress/jitter)
    - Speaking rate/tempo estimate (higher tempo indicates higher distress/urgency)
    - RMS energy (higher loudness indicates higher distress)
    
    No speech content or transcription is used.
    """
    if not audio_bytes:
        return 0.0

    try:
        # Load audio from bytes
        audio_file = io.BytesIO(audio_bytes)
        data, sr = sf.read(audio_file)
        
        # Convert to mono if multi-channel
        if len(data.shape) > 1:
            data = np.mean(data, axis=1)
            
        # Ensure we have data to process
        if len(data) == 0:
            return 0.0
            
        # Standardize amplitude to make pitch and tempo extraction invariant to global volume
        peak = np.max(np.abs(data))
        if peak > 0:
            y = data / peak
        else:
            y = data
            
        # 1. Pitch (F0) Standard Deviation (variance metric)
        # Estimate fundamental frequency (F0) using YIN algorithm
        # Voice pitch bounds (80Hz to 400Hz)
        try:
            f0 = librosa.yin(y=y, sr=sr, fmin=80, fmax=400)
            f0_std = np.std(f0)
            # Map standard deviation: std of ~10Hz -> 0.0 score, std of ~75Hz -> 1.0 score
            pitch_score = np.clip((f0_std - 10.0) / 65.0, 0.0, 1.0)
        except Exception:
            pitch_score = 0.0
            
        # 2. Speaking Rate / Tempo Estimate
        try:
            # Estimate tempo
            tempo = librosa.feature.tempo(y=y, sr=sr)[0]
            # Map tempo: 80 BPM -> 0.0, 160 BPM -> 1.0
            tempo_score = np.clip((tempo - 80.0) / 80.0, 0.0, 1.0)
        except Exception:
            tempo_score = 0.5  # Neutral fallback
            
        # 3. RMS Energy
        # Use the mean RMS energy of the original signal to represent loudness
        try:
            rms_frames = librosa.feature.rms(y=data)
            mean_rms = np.mean(rms_frames)
            # Map mean RMS: 0.01 -> 0.0, 0.15 -> 1.0
            rms_score = np.clip((mean_rms - 0.01) / 0.14, 0.0, 1.0)
        except Exception:
            rms_score = 0.0
            
        # Combine features with weighted thresholds
        # Weights: Pitch Variance (40%), Tempo (30%), RMS Energy (30%)
        score = 0.4 * pitch_score + 0.3 * tempo_score + 0.3 * rms_score
        
        return float(np.clip(score, 0.0, 1.0))
        
    except Exception as e:
        print(f"Error processing audio bytes: {e}")
        return 0.0
