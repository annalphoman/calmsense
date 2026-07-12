"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  ShieldAlert, Sparkles, Activity, FileText, Send, 
  Settings, CheckCircle2, UserCheck, AlertTriangle, ArrowLeft 
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";

interface IntakeData {
  childName: string;
  triggers: string;
  preferences: string;
  contentType: "visual" | "ambient" | "song";
  notes: string;
}

interface DistressDataPoint {
  time: string;
  value: number;
}

export default function CompanionPage() {
  const router = useRouter();

  // Route state
  const [step, setStep] = useState<"intake" | "pair" | "dashboard">("intake");
  const [intake, setIntake] = useState<IntakeData>({
    childName: "",
    triggers: "",
    preferences: "",
    contentType: "visual",
    notes: "",
  });
  const [sessionCode, setSessionCode] = useState("");
  const [distressHistory, setDistressHistory] = useState<DistressDataPoint[]>([]);
  const [currentDistress, setCurrentDistress] = useState(25);
  const [noteText, setNoteText] = useState("");
  const [savedNotes, setSavedNotes] = useState<{ id: string; timestamp: string; note: string }[]>([]);
  
  // Connection and system status
  const [notificationPermission, setNotificationPermission] = useState("default");
  const [socketConnected, setSocketConnected] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);

  // 1. Initial configuration
  useEffect(() => {
    setIsMounted(true);
    
    // Request notification permission
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(Notification.permission);
      if (Notification.permission === "default") {
        Notification.requestPermission().then((perm) => {
          setNotificationPermission(perm);
        });
      }
    }

    // Load intake if exists
    const storedIntake = localStorage.getItem("calmsense_intake");
    if (storedIntake) {
      try {
        const parsed = JSON.parse(storedIntake);
        setIntake(parsed);
        setStep("pair"); // If intake is already filled, proceed to pairing
      } catch (e) {
        // Ignore
      }
    }

    // Load saved notes
    const storedNotes = localStorage.getItem("calmsense_feedback_notes");
    if (storedNotes) {
      try {
        setSavedNotes(JSON.parse(storedNotes));
      } catch (e) {
        // Ignore
      }
    }
  }, []);

  // 2. LocalStorage sync interval (allows cross-tab simulation when WebSocket is offline)
  useEffect(() => {
    if (step !== "dashboard") return;

    const interval = setInterval(() => {
      // Sync distress level from patient page
      const storedDistress = localStorage.getItem("calmsense_distress");
      if (storedDistress !== null) {
        const val = Number(storedDistress);
        setCurrentDistress(val);

        // Add to historical timeline chart
        setDistressHistory((prev) => {
          const now = new Date();
          const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          
          // Limit to last 15 seconds / 15 ticks
          const updated = [...prev, { time: timeStr, value: val }];
          if (updated.length > 15) {
            updated.shift();
          }
          return updated;
        });

        // Trigger Notification if stress rises above 70
        if (val >= 70 && localStorage.getItem("calmsense_last_notified_state") !== "alert") {
          triggerBrowserNotification();
          localStorage.setItem("calmsense_last_notified_state", "alert");
        } else if (val < 70) {
          localStorage.removeItem("calmsense_last_notified_state");
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [step, intake.childName]);

  // 3. Setup WebSocket client
  const connectWebSocket = (code: string) => {
    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000"}/ws/companion/${code}`;
    
    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        setSocketConnected(true);
        setIsDemoMode(false);
        console.log("WebSocket connected to companion channel");
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          const rawLevel = data.distressLevel ?? data.distress_level;
          if (rawLevel !== undefined) {
            let val = 25;
            if (typeof rawLevel === "number") {
              val = rawLevel;
            } else if (rawLevel === "calm") {
              val = 25;
            } else if (rawLevel === "rising") {
              val = 55;
            } else if (rawLevel === "high") {
              val = 85;
            } else {
              const parsed = Number(rawLevel);
              if (!isNaN(parsed)) val = parsed;
            }
            setCurrentDistress(val);
            localStorage.setItem("calmsense_distress", val.toString());
          }

          if (data.alert === true) {
            triggerBrowserNotification();
          }
        } catch (err) {
          console.error("Error parsing socket message:", err);
        }
      };

      wsRef.current.onclose = () => {
        setSocketConnected(false);
        setIsDemoMode(true);
        console.log("WebSocket connection closed, running in simulated storage sync mode");
      };

      wsRef.current.onerror = () => {
        wsRef.current?.close();
      };
    } catch (err) {
      setSocketConnected(false);
      setIsDemoMode(true);
    }
  };

  // 4. Send desktop notification
  const triggerBrowserNotification = () => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      new Notification("CalmSense Alert", {
        body: `Distress rising - check in with ${intake.childName || "child"}`,
        icon: "/favicon.ico",
      });
    }
  };

  // 5. Handlers
  const handleIntakeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!intake.childName.trim()) return;

    localStorage.setItem("calmsense_intake", JSON.stringify(intake));
    localStorage.setItem("calmsense_content_type", intake.contentType);
    setStep("pair");
  };

  const handlePairSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sessionCode.length !== 4) return;

    // Save active session code locally
    localStorage.setItem("calmsense_session_code", sessionCode);
    connectWebSocket(sessionCode);
    setStep("dashboard");
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;

    const timestamp = new Date().toISOString();
    const newNote = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      note: noteText
    };

    // Save locally
    const updatedNotes = [newNote, ...savedNotes];
    setSavedNotes(updatedNotes);
    localStorage.setItem("calmsense_feedback_notes", JSON.stringify(updatedNotes));

    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${backendUrl}/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_code: sessionCode,
          child_name: intake.childName,
          timestamp,
          note: noteText,
        }),
      });

      if (!response.ok) {
        console.warn("Feedback endpoint failed, note saved locally");
      }
    } catch (err) {
      console.warn("Feedback POST failed, falling back to local list:", err);
    }

    setNoteText("");
  };

  // 6. UI Helpers
  const getPlainLanguageStatus = () => {
    if (currentDistress < 40) {
      return `${intake.childName} is currently calm, relaxed, and stable.`;
    } else if (currentDistress < 70) {
      return `Mild tension observed. ${intake.childName}'s breathing or movements might be increasing.`;
    } else {
      return `Elevated distress detected. Calming intervention (${intake.contentType}) is active. Voice assistance is running.`;
    }
  };

  if (!isMounted) return null;

  return (
    <div className="flex min-h-screen flex-col bg-clay-soft text-slate-text p-6">
      
      {/* Header */}
      <header className="flex items-center justify-between border-b border-sage-soft pb-4 mb-6 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              if (step === "dashboard") setStep("pair");
              else if (step === "pair") setStep("intake");
              else router.push("/");
            }}
            className="p-2 rounded-full hover:bg-sage-soft text-slate-text transition-all duration-200"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold">Companion Hub</h1>
            <p className="text-xs text-slate-text/60">Therapist & Parent Dashboard</p>
          </div>
        </div>

        {step === "dashboard" && (
          <div className="flex items-center gap-2 rounded-full bg-white px-4 py-1.5 border border-sage-soft text-xs">
            <span className={`h-2.5 w-2.5 rounded-full ${socketConnected ? "bg-green-500 animate-pulse" : "bg-amber-400"}`} />
            <span>{socketConnected ? "Connected to Backend" : "Demo Mode Syncing"}</span>
          </div>
        )}
      </header>

      <main className="flex-1 flex items-center justify-center max-w-5xl mx-auto w-full">
        
        {/* STEP 1: ONE-TIME INTAKE FORM */}
        {step === "intake" && (
          <div className="w-full max-w-xl bg-white p-8 rounded-3xl border border-sage-soft/30 shadow-sm space-y-6">
            <div className="text-center space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-lavender-soft text-sky-dark">
                <FileText className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-semibold">Child Intake Form</h2>
              <p className="text-sm text-slate-text/60">Configure preferences and details before monitoring.</p>
            </div>

            <form onSubmit={handleIntakeSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-text/80 mb-1">Child's Name</label>
                <input 
                  type="text"
                  required
                  value={intake.childName}
                  onChange={(e) => setIntake({...intake, childName: e.target.value})}
                  className="block w-full rounded-2xl border border-slate-text/10 bg-slate-50 py-3 px-4 text-slate-text focus:outline-none focus:ring-2 focus:ring-sage-soft transition-all duration-200"
                  placeholder="e.g. Liam"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-text/80 mb-1">Known Triggers</label>
                <textarea 
                  value={intake.triggers}
                  onChange={(e) => setIntake({...intake, triggers: e.target.value})}
                  className="block w-full rounded-2xl border border-slate-text/10 bg-slate-50 py-2.5 px-4 text-slate-text focus:outline-none focus:ring-2 focus:ring-sage-soft transition-all duration-200"
                  placeholder="e.g. Loud noises, sudden light changes"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-text/80 mb-1">Calming Intervention Preference</label>
                <select
                  value={intake.contentType}
                  onChange={(e) => {
                    const val = e.target.value as "visual" | "ambient" | "song";
                    setIntake({...intake, contentType: val});
                  }}
                  className="block w-full rounded-2xl border border-slate-text/10 bg-slate-50 py-3 px-4 text-slate-text focus:outline-none focus:ring-2 focus:ring-sage-soft transition-all duration-200"
                >
                  <option value="visual">Visual (Breathing Circle)</option>
                  <option value="ambient">Ambient Soundscape (Tone.js synthesizer)</option>
                  <option value="song">Rhythmic Song (Soothing melody)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-text/80 mb-1">General Notes</label>
                <textarea 
                  value={intake.notes}
                  onChange={(e) => setIntake({...intake, notes: e.target.value})}
                  className="block w-full rounded-2xl border border-slate-text/10 bg-slate-50 py-2.5 px-4 text-slate-text focus:outline-none focus:ring-2 focus:ring-sage-soft transition-all duration-200"
                  placeholder="Any additional notes..."
                  rows={3}
                />
              </div>

              <button 
                type="submit"
                className="w-full bg-sage-dark text-white rounded-2xl py-3.5 font-medium hover:bg-sage-dark/95 active:scale-[0.98] transition-all duration-200"
              >
                Save & Continue to Pairing
              </button>
            </form>
          </div>
        )}

        {/* STEP 2: PAIRING CODE INPUT */}
        {step === "pair" && (
          <div className="w-full max-w-md bg-white p-8 rounded-3xl border border-sage-soft/30 shadow-sm space-y-6">
            <div className="text-center space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sage-soft text-sage-dark">
                <Sparkles className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-semibold">Pair with Session</h2>
              <p className="text-sm text-slate-text/60">Enter the 4-digit code displayed on the child's screen.</p>
            </div>

            <form onSubmit={handlePairSubmit} className="space-y-4">
              <input 
                type="text"
                maxLength={4}
                required
                value={sessionCode}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  if (val.length <= 4) setSessionCode(val);
                }}
                className="block w-full text-center text-3xl font-bold tracking-widest rounded-2xl border border-slate-text/10 bg-slate-50 py-4 text-slate-text focus:outline-none focus:ring-2 focus:ring-sage-soft transition-all duration-200"
                placeholder="0000"
              />

              <button 
                type="submit"
                className="w-full bg-sage-dark text-white rounded-2xl py-3.5 font-medium hover:bg-sage-dark/95 active:scale-[0.98] transition-all duration-200"
              >
                Connect to Calming Stream
              </button>

              <button 
                type="button"
                onClick={() => setStep("intake")}
                className="w-full text-slate-text/60 hover:text-slate-text text-sm transition-colors"
              >
                Edit Intake Information
              </button>
            </form>
          </div>
        )}

        {/* STEP 3: THERAPIST DASHBOARD */}
        {step === "dashboard" && (
          <div className="w-full grid md:grid-cols-3 gap-6 items-start">
            
            {/* Left side: Distress Gauge & Chart */}
            <div className="md:col-span-2 space-y-6">
              
              {/* Gauges & Info card */}
              <div className="bg-white p-6 rounded-3xl border border-sage-soft/30 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-sage-soft/30 pb-3">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Activity className="h-5 w-5 text-sage-dark" />
                    <span>Real-time Monitoring: {intake.childName}</span>
                  </h3>
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                    currentDistress >= 70 ? "bg-rose-alert/15 text-rose-alert" : "bg-sage-soft text-sage-dark"
                  }`}>
                    Score: {currentDistress}
                  </span>
                </div>

                <p className="text-sm text-slate-text/80 bg-clay-soft/40 p-4 rounded-2xl border border-sage-soft/10">
                  {getPlainLanguageStatus()}
                </p>

                {/* Recharts Area Chart */}
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={distressHistory}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorDistress" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={currentDistress >= 70 ? "#E76F51" : "#2C4A3E"} stopOpacity={0.4}/>
                          <stop offset="95%" stopColor={currentDistress >= 70 ? "#E76F51" : "#2C4A3E"} stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Area 
                        type="monotone" 
                        dataKey="value" 
                        stroke={currentDistress >= 70 ? "#E76F51" : "#2C4A3E"} 
                        fillOpacity={1} 
                        fill="url(#colorDistress)" 
                        strokeWidth={2.5}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Developer Demo Controller (Simulate Distress level to sync with client tab) */}
              {isDemoMode && (
                <div className="bg-white p-6 rounded-3xl border border-dashed border-slate-300 space-y-3">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-text/70">
                    <Settings className="h-4 w-4" />
                    <span>Demo Calibration Slider</span>
                  </div>
                  <p className="text-xs text-slate-text/50">Adjust distress level to synchronize with Client Mode tab.</p>
                  <div className="flex items-center gap-4">
                    <span>Calm</span>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={currentDistress}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setCurrentDistress(val);
                        localStorage.setItem("calmsense_distress", val.toString());
                      }}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <span>Distressed</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-text/50">
                    <span>0 (Sleep/Rest)</span>
                    <span>100 (Peak Distress)</span>
                  </div>
                </div>
              )}

            </div>

            {/* Right side: Intake Summary & Feedback Notes */}
            <div className="space-y-6">
              
              {/* Intake Info summary card */}
              <div className="bg-white p-6 rounded-3xl border border-sage-soft/30 shadow-sm space-y-4">
                <h3 className="font-semibold text-lg border-b border-sage-soft/30 pb-3 flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-sky-dark" />
                  <span>Session Profile</span>
                </h3>
                
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-xs text-slate-text/50 block">Child's Name</span>
                    <span className="font-semibold">{intake.childName}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-text/50 block">Preferences</span>
                    <span className="capitalize">{intake.contentType} Calming Route</span>
                  </div>
                  {intake.triggers && (
                    <div>
                      <span className="text-xs text-slate-text/50 block">Triggers</span>
                      <span className="text-slate-text/80">{intake.triggers}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Feedback Form and notes timeline */}
              <div className="bg-white p-6 rounded-3xl border border-sage-soft/30 shadow-sm space-y-4">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-rose-alert" />
                  <span>Session Notes & Logs</span>
                </h3>

                <form onSubmit={handleFeedbackSubmit} className="space-y-2">
                  <div className="relative">
                    <input 
                      type="text"
                      required
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Type a clinical note or feedback..."
                      className="w-full text-sm rounded-2xl border border-slate-text/10 bg-slate-50 py-3 pl-4 pr-10 text-slate-text focus:outline-none focus:ring-2 focus:ring-sage-soft transition-all duration-200"
                    />
                    <button 
                      type="submit" 
                      className="absolute right-2.5 top-2.5 text-sage-dark hover:scale-105 active:scale-95 transition-transform"
                    >
                      <Send className="h-5 w-5" />
                    </button>
                  </div>
                </form>

                {/* Notes History list */}
                <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                  {savedNotes.length === 0 ? (
                    <p className="text-xs text-slate-text/40 text-center py-4">No session notes recorded yet.</p>
                  ) : (
                    savedNotes.map((item) => (
                      <div key={item.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-slate-text/55">
                          <span className="font-medium">{intake.childName}'s session</span>
                          <span>{item.timestamp}</span>
                        </div>
                        <p className="text-xs text-slate-text/85">{item.note}</p>
                      </div>
                    ))
                  )}
                </div>

              </div>

            </div>

          </div>
        )}

      </main>
    </div>
  );
}
