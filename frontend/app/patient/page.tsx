"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Camera, Volume2, VolumeX, Sparkles, RefreshCw, AlertCircle, Heart } from "lucide-react";
import * as Tone from "tone";

export default function PatientPage() {
  const router = useRouter();
  
  // State
  const [sessionCode, setSessionCode] = useState("4829");
  const [username, setUsername] = useState("Student");
  const [distressLevel, setDistressLevel] = useState(25); // 0 to 100
  const [contentType, setContentType] = useState<"visual" | "ambient" | "song">("visual");
  const [isMuted, setIsMuted] = useState(false);
  const [webcamActive, setWebcamActive] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(true);

  // References
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasSpokenRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);

  // 1. Generate static session code & read username on mount
  useEffect(() => {
    // Generate a random 4-digit code and store it
    let code = localStorage.getItem("calmsense_session_code");
    if (!code) {
      code = Math.floor(1000 + Math.random() * 9000).toString();
      localStorage.setItem("calmsense_session_code", code);
    }
    setSessionCode(code);

    const userSession = localStorage.getItem("calmsense_user");
    if (userSession) {
      try {
        const parsed = JSON.parse(userSession);
        setUsername(parsed.username);
      } catch (e) {
        // Ignore
      }
    }

    // Set initial storage parameters if not present
    if (!localStorage.getItem("calmsense_distress")) {
      localStorage.setItem("calmsense_distress", "25");
    }
    if (!localStorage.getItem("calmsense_content_type")) {
      localStorage.setItem("calmsense_content_type", "visual");
    }
  }, []);

  // 2. LocalStorage Sync / Storage Event Listener (for interactive cross-tab simulation)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "calmsense_distress" && e.newValue !== null) {
        setDistressLevel(Number(e.newValue));
      }
      if (e.key === "calmsense_content_type" && e.newValue !== null) {
        setContentType(e.newValue as "visual" | "ambient" | "song");
      }
    };

    window.addEventListener("storage", handleStorageChange);
    
    // Quick polling interval as backup for local state sync
    const interval = setInterval(() => {
      const storedDistress = localStorage.getItem("calmsense_distress");
      if (storedDistress !== null) {
        setDistressLevel(Number(storedDistress));
      }
      const storedType = localStorage.getItem("calmsense_content_type");
      if (storedType !== null) {
        setContentType(storedType as "visual" | "ambient" | "song");
      }
    }, 1000);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // 3. WebSocket Connection
  useEffect(() => {
    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000"}/ws/patient/${sessionCode}`;
    let ws: WebSocket | null = null;

    const connectWebSocket = () => {
      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          setSocketConnected(true);
          console.log("WebSocket connected to patient channel");
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const valStr = data.distressLevel ?? data.distress_level;
            if (valStr !== undefined) {
              let val = 25;
              if (typeof valStr === "number") {
                val = valStr;
              } else if (valStr === "calm") {
                val = 25;
              } else if (valStr === "rising") {
                val = 55;
              } else if (valStr === "high") {
                val = 85;
              } else {
                const parsed = Number(valStr);
                if (!isNaN(parsed)) val = parsed;
              }
              setDistressLevel(val);
              localStorage.setItem("calmsense_distress", val.toString());
            }
            if (data.content_type !== undefined) {
              setContentType(data.content_type);
              localStorage.setItem("calmsense_content_type", data.content_type);
            }
          } catch (err) {
            console.error("Failed to parse WebSocket message:", err);
          }
        };

        ws.onclose = () => {
          setSocketConnected(false);
          console.log("WebSocket disconnected from patient channel");
          // Reconnect attempt after 5 seconds
          setTimeout(connectWebSocket, 5000);
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch (err) {
        setSocketConnected(false);
      }
    };

    connectWebSocket();

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [sessionCode]);

  // Helper to capture a frame from the webcam video element
  const captureWebcamFrame = (): string | null => {
    if (!videoRef.current) return null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.8);
    } catch (e) {
      console.error("Error capturing webcam frame:", e);
      return null;
    }
  };

  // Helper to send base64 frame and audio blob to the live analysis endpoint
  const sendAnalyzeLive = async (imageB64: string, audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("image_b64", imageB64);
      formData.append("audio", audioBlob, "audio.webm");
      if (sessionCode) {
        formData.append("session_code", sessionCode);
      }

      const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(`${backendUrl}/analyze-live`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Live distress analysis result:", data);

      setIsDemoMode(false); // Successfully receiving live scores, hide/disable demo warning/slider

      let val = 25;
      const rawLevel = data.distress_level;
      if (rawLevel === "calm") {
        val = 25;
      } else if (rawLevel === "rising") {
        val = 55;
      } else if (rawLevel === "high") {
        val = 85;
      } else if (typeof rawLevel === "number") {
        val = rawLevel;
      } else {
        const parsed = Number(rawLevel);
        if (!isNaN(parsed)) val = parsed;
      }

      setDistressLevel(val);
      localStorage.setItem("calmsense_distress", val.toString());
    } catch (err) {
      console.warn("Backend /analyze-live failed, using simulated/offline fallback:", err);
      setIsDemoMode(true); // Fallback to simulation/offline mode
    }
  };

  // 4. Webcam and Audio Stream Lifecycle
  useEffect(() => {
    const enableWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: true,
        });
        console.log("Webcam & Audio stream received:", stream);
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch((playErr) => {
            console.warn("Failed to play primary audio/video stream:", playErr);
          });
          setWebcamActive(true);
        }
      } catch (err) {
        console.warn("Webcam & Audio stream setup failed, trying video only:", err);
        try {
          const videoOnlyStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
            audio: false,
          });
          console.log("Video-only stream received:", videoOnlyStream);
          streamRef.current = videoOnlyStream;
          if (videoRef.current) {
            videoRef.current.srcObject = videoOnlyStream;
            videoRef.current.play().catch((playErr) => {
              console.warn("Failed to play video-only stream:", playErr);
            });
            setWebcamActive(true);
          }
        } catch (videoErr) {
          console.error("Webcam access denied completely:", videoErr);
          setWebcamActive(false);
        }
      }
    };

    enableWebcam();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // 4b. Live Distress Analysis Loop (run every 4 seconds)
  useEffect(() => {
    if (!webcamActive) return;

    const interval = setInterval(() => {
      const stream = streamRef.current;
      if (!stream) return;

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        // Fallback: send image frame and mock audio if audio is unavailable
        const imageB64 = captureWebcamFrame();
        if (imageB64) {
          const dummyAudio = new Blob([new Uint8Array(100)], { type: "audio/wav" });
          sendAnalyzeLive(imageB64, dummyAudio);
        }
        return;
      }

      // Record a 1.5 second clip
      try {
        const audioStream = new MediaStream(audioTracks);
        const mediaRecorder = new MediaRecorder(audioStream);
        const chunks: Blob[] = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunks.push(e.data);
          }
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(chunks, { type: "audio/webm" });
          const imageB64 = captureWebcamFrame();
          if (imageB64) {
            await sendAnalyzeLive(imageB64, audioBlob);
          }
        };

        mediaRecorder.start();
        setTimeout(() => {
          if (mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
          }
        }, 1500);
      } catch (e) {
        console.error("Error during MediaRecorder step:", e);
      }
    }, 4000);

    return () => {
      clearInterval(interval);
    };
  }, [webcamActive, sessionCode]);

  // 5. Soundscape / Song Audio Intervention Logic
  const isDistressed = distressLevel >= 70;

  useEffect(() => {
    // Handling Tone.js ambient soundscape
    if (isDistressed && contentType === "ambient" && !isMuted) {
      // Start Tone.js
      if (Tone.context.state !== "running") {
        Tone.start();
      }
      
      if (!synthRef.current) {
        synthRef.current = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "sine" },
          envelope: { attack: 1.5, decay: 1, sustain: 0.8, release: 2 }
        }).toDestination();
        synthRef.current.volume.value = -12; // Muted volume for soothing pad
      }

      // Schedule calming slow chords (C Major 7, F Major 7)
      const playChords = async () => {
        try {
          if (synthRef.current) {
            synthRef.current.triggerAttackRelease(["C3", "E3", "G3", "B3"], "4n");
            await new Promise(r => setTimeout(r, 3000));
            synthRef.current.triggerAttackRelease(["F3", "A3", "C4", "E4"], "4n");
          }
        } catch (e) {
          console.error(e);
        }
      };

      playChords();
      const interval = setInterval(playChords, 6000);

      return () => {
        clearInterval(interval);
        if (synthRef.current) {
          synthRef.current.releaseAll();
          synthRef.current.dispose();
          synthRef.current = null;
        }
      };
    }
  }, [isDistressed, contentType, isMuted]);

  // Handling Audio element for Rhythmic Song
  useEffect(() => {
    if (isDistressed && contentType === "song" && !isMuted) {
      if (audioRef.current) {
        audioRef.current.muted = false;
        audioRef.current.play().catch(err => {
          console.warn("Audio autoplay blocked, requires gesture:", err);
        });
      }
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [isDistressed, contentType, isMuted]);

  // 6. Voice Layer (Web Speech API)
  useEffect(() => {
    if (isDistressed) {
      if (hasSpokenRef.current) return; // Speak only once per distress event

      const phrases = [
        `Breathe in slowly, ${username}. You are safe.`,
        "Just follow the rhythm of the circle.",
        "You are doing wonderfully. Let it go."
      ];

      const speakCalmingPhrase = () => {
        if (isMuted || typeof window === "undefined" || !window.speechSynthesis) return;

        window.speechSynthesis.cancel(); // Cancel any ongoing speech
        
        const phrase = phrases[Math.floor(Math.random() * phrases.length)];
        const utterance = new SpeechSynthesisUtterance(phrase);
        utterance.rate = 0.8;
        utterance.pitch = 0.95;
        
        // Find a soothing/soft voice if available
        const voices = window.speechSynthesis.getVoices();
        const gentleVoice = voices.find(v => v.name.includes("Google US English") || v.name.includes("Natural"));
        if (gentleVoice) {
          utterance.voice = gentleVoice;
        }

        window.speechSynthesis.speak(utterance);
        hasSpokenRef.current = true;
      };

      // Trigger voice layer 1.5 seconds after intervention view fades in
      const timer = setTimeout(speakCalmingPhrase, 1500);

      return () => {
        clearTimeout(timer);
      };
    } else {
      // Reset spoken state when distress subsides
      hasSpokenRef.current = false;
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }
  }, [isDistressed, username, isMuted]);

  // Determine soft status bg color shifts (calm blue to amber, transition managed by Tailwind)
  const statusColorClass = distressLevel < 40 
    ? "bg-sky-calm text-sky-dark border-sky-dark/20" 
    : distressLevel < 70 
      ? "bg-amber-alert/40 text-amber-alert border-amber-alert/20" 
      : "bg-rose-alert/20 text-rose-alert border-rose-alert/20";

  const statusText = distressLevel < 40 
    ? "Calm & Stable" 
    : distressLevel < 70 
      ? "Pacing / Mild Tension" 
      : "Distress Alert - Calming Active";

  return (
    <div className="flex min-h-screen flex-col bg-clay-soft text-slate-text p-6 transition-colors duration-1000">
      
      {/* Hidden audio element for rhythmic song */}
      <audio
        ref={audioRef}
        src="https://assets.mixkit.co/music/preview/mixkit-dreaming-big-31.mp3"
        loop
        className="hidden"
      />

      {/* Top Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-sage-soft pb-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sage-soft text-sage-dark">
            <Heart className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">CalmSpace Monitoring</h1>
            <p className="text-xs text-slate-text/60">
              {socketConnected ? "Connected to Companion" : `Simulation Mode • Sharing via storage code ${sessionCode}`}
            </p>
          </div>
        </div>

        {/* Pairing Code Card */}
        <div className="flex items-center gap-4 bg-white px-5 py-2.5 rounded-2xl border border-sage-soft/30 shadow-sm">
          <span className="text-xs font-medium text-slate-text/50 uppercase tracking-wider">Pairing Code:</span>
          <span className="text-xl font-bold tracking-widest text-sage-dark">{sessionCode}</span>
        </div>
      </header>

      {/* Main Monitoring Screen */}
      <div className="flex-1 grid md:grid-cols-2 gap-6 max-w-5xl mx-auto w-full items-center">
        
        {/* Webcam Card */}
        <div className="flex flex-col items-center bg-white p-6 rounded-3xl border border-sage-soft/30 shadow-sm space-y-4">
          <div className="relative w-full aspect-video rounded-2xl bg-slate-100 overflow-hidden border border-slate-200">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover scale-x-[-1] ${webcamActive ? "block" : "hidden"}`}
            />
            {!webcamActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-text/40">
                <Camera className="h-12 w-12 mb-2 animate-soft-pulse" />
                <span className="text-sm">Webcam preview offline or permission denied</span>
              </div>
            )}
          </div>
          <div className="text-center">
            <h3 className="font-medium text-lg">Webcam Preview</h3>
            <p className="text-xs text-slate-text/50">Used locally for motion and breathing analysis</p>
          </div>
        </div>

        {/* Live Status Indicator Card */}
        <div className="flex flex-col items-center bg-white p-8 rounded-3xl border border-sage-soft/30 shadow-sm space-y-6 text-center">
          <h3 className="font-semibold text-lg text-slate-text/80">Current Calming Status</h3>
          
          {/* Pulsing indicator with soft colors */}
          <div className={`w-48 h-48 rounded-full flex items-center justify-center border-4 shadow-inner transition-all duration-1000 ${statusColorClass}`}>
            <div className="flex flex-col items-center p-4">
              <Sparkles className="h-8 w-8 mb-2 animate-soft-pulse" />
              <span className="font-medium text-sm text-center">{statusText}</span>
            </div>
          </div>

          {/* Mute Button (Always Visible) */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full border transition-all duration-300 ${
              isMuted 
                ? "bg-rose-alert/10 text-rose-alert border-rose-alert/20 hover:bg-rose-alert/20" 
                : "bg-sage-soft text-sage-dark border-sage-soft hover:bg-sage-soft/80"
            }`}
          >
            {isMuted ? (
              <>
                <VolumeX className="h-5 w-5" />
                <span>Voice Layer Muted</span>
              </>
            ) : (
              <>
                <Volume2 className="h-5 w-5 animate-bounce" />
                <span>Voice Layer Active</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Developer Demo Controller (Simulate Distress level when backend is offline) */}
      {isDemoMode && (
        <div className="mt-8 mx-auto max-w-md w-full bg-white p-4 rounded-2xl border border-dashed border-slate-300 text-center space-y-2 text-xs">
          <p className="font-semibold text-slate-text/70 flex items-center justify-center gap-1.5">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Developer Simulation Control
          </p>
          <p className="text-slate-text/50">Move the slider to simulate changing stress levels locally.</p>
          <div className="flex items-center gap-4 px-2">
            <span>Calm</span>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={distressLevel}
              onChange={(e) => {
                const val = Number(e.target.value);
                setDistressLevel(val);
                localStorage.setItem("calmsense_distress", val.toString());
              }}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            />
            <span>Distressed</span>
          </div>
          <div className="flex justify-center gap-4 pt-1">
            <button
              onClick={() => {
                setDistressLevel(25);
                localStorage.setItem("calmsense_distress", "25");
              }}
              className="px-2.5 py-1 bg-sky-calm text-sky-dark rounded-md hover:opacity-80"
            >
              Reset to Calm
            </button>
            <button
              onClick={() => {
                setDistressLevel(85);
                localStorage.setItem("calmsense_distress", "85");
              }}
              className="px-2.5 py-1 bg-rose-alert/20 text-rose-alert rounded-md hover:opacity-80"
            >
              Trigger Distress (85)
            </button>
          </div>
        </div>
      )}

      {/* FULL-SCREEN CALMING INTERVENTION VIEW (fades in when distressLevel >= 70) */}
      <div 
        className={`fixed inset-0 z-50 bg-[#FAF7F2] flex flex-col items-center justify-center transition-all duration-1000 ease-in-out p-6 ${
          isDistressed 
            ? "opacity-100 pointer-events-auto" 
            : "opacity-0 pointer-events-none translate-y-4"
        }`}
      >
        {/* Floating Header */}
        <div className="absolute top-6 left-6 right-6 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-sage-dark animate-pulse" />
            <span className="font-semibold text-slate-text text-sm">Calming Space Active</span>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-3 rounded-full bg-white border border-sage-soft text-slate-text shadow-sm hover:bg-slate-50 transition-all duration-200"
              title={isMuted ? "Unmute Calming Voice" : "Mute Calming Voice"}
            >
              {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            
            {/* Dev override button to close intervention manually */}
            <button
              onClick={() => {
                setDistressLevel(30);
                localStorage.setItem("calmsense_distress", "30");
              }}
              className="px-4 py-2 text-xs rounded-xl bg-white border border-sage-soft text-slate-text hover:bg-slate-50 transition-all duration-200"
            >
              Dismiss
            </button>
          </div>
        </div>

        {/* Dynamic Intervention Content */}
        {contentType === "visual" && (
          <div className="flex flex-col items-center space-y-12">
            {/* Breathing Guide Animation */}
            <div className="relative flex items-center justify-center w-72 h-72">
              {/* Outer soft glowing rings */}
              <div className="absolute inset-0 rounded-full bg-sage-soft/30 animate-breath" style={{ animationDelay: "0s" }} />
              <div className="absolute w-56 h-56 rounded-full bg-sage-soft/60 animate-breath" style={{ animationDelay: "1s" }} />
              <div className="absolute w-40 h-40 rounded-full bg-sage-dark flex items-center justify-center shadow-lg animate-breath" style={{ animationDelay: "2s" }}>
                <span className="text-white font-semibold text-lg tracking-wider">Breathe</span>
              </div>
            </div>
            
            <div className="text-center space-y-3">
              <h2 className="text-2xl font-medium text-slate-text">Inhale. Exhale.</h2>
              <p className="text-sm text-slate-text/60 max-w-xs">Match your breathing to the expanding and contracting circle.</p>
            </div>
          </div>
        )}

        {contentType === "ambient" && (
          <div className="flex flex-col items-center space-y-8 text-center max-w-md">
            <div className="w-24 h-24 rounded-3xl bg-sage-soft text-sage-dark flex items-center justify-center animate-soft-pulse">
              <Volume2 className="h-10 w-10" />
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl font-medium text-slate-text">Listening to Soundscape</h2>
              <p className="text-sm text-slate-text/60 leading-relaxed">
                Enjoy a gentle synthesizer pad designed to lower heart rate and soothe the nervous system.
              </p>
            </div>
            {/* Soft breathing helper */}
            <div className="w-12 h-12 rounded-full border-2 border-sage-soft animate-breath" />
          </div>
        )}

        {contentType === "song" && (
          <div className="flex flex-col items-center space-y-8 text-center max-w-md">
            <div className="w-24 h-24 rounded-3xl bg-lavender-soft text-sky-dark flex items-center justify-center animate-soft-pulse">
              <Sparkles className="h-10 w-10" />
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl font-medium text-slate-text">Rhythmic Song Active</h2>
              <p className="text-sm text-slate-text/60 leading-relaxed">
                Playing a calming harmonic track with a gentle tempo to guide you back to focus.
              </p>
            </div>
            {/* Audio volume check */}
            {isMuted && (
              <div className="flex items-center gap-1.5 text-xs text-rose-alert bg-rose-alert/10 px-3 py-1.5 rounded-full border border-rose-alert/20">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>Intervention sound is muted</span>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Dev-only floating distress test trigger */}
      <div className="fixed bottom-4 right-4 z-40">
        <button
          onClick={() => {
            const nextLevel = distressLevel >= 70 ? 25 : 85;
            setDistressLevel(nextLevel);
            localStorage.setItem("calmsense_distress", nextLevel.toString());
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg border text-xs font-semibold uppercase tracking-wider transition-all duration-300 ${
            distressLevel >= 70
              ? "bg-sky-calm hover:bg-sky-calm/80 text-sky-dark border-sky-dark/20"
              : "bg-rose-alert hover:bg-rose-alert/90 text-white border-rose-alert/20"
          }`}
        >
          <Sparkles className="h-4 w-4" />
          <span>{distressLevel >= 70 ? "Force Calm" : "Force Distress"}</span>
        </button>
      </div>

    </div>
  );
}
