"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, KeyRound, User, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Clear previous session on load
  useEffect(() => {
    localStorage.removeItem("calmsense_user");
    localStorage.removeItem("calmsense_intake");
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim()) {
      setError("Please enter a username");
      return;
    }
    if (pin.length !== 4 || !/^\d+$/.test(pin)) {
      setError("PIN must be exactly 4 digits");
      return;
    }

    setIsLoading(true);

    try {
      // Attempt login by hitting backend first, fall back to mock successful login for testing
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      let success = false;
      let errorMessage = "Invalid username or PIN";

      try {
        const response = await fetch(`${backendUrl}/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ username, pin }),
        });

        if (response.ok) {
          success = true;
        } else {
          const data = await response.json().catch(() => ({}));
          errorMessage = data.detail || data.message || errorMessage;
        }
      } catch (err) {
        // Backend offline fallback - allow mock credentials for demo purposes
        console.warn("Backend offline, utilizing mock login fallback:", err);
        // Accept any username and any 4-digit PIN for mock demo
        if (pin === "1234" || pin.length === 4) {
          success = true;
        } else {
          errorMessage = "Incorrect PIN (Try '1234' for demo login)";
        }
      }

      if (success) {
        // Store session
        localStorage.setItem(
          "calmsense_user",
          JSON.stringify({ username, loggedInAt: new Date().toISOString() })
        );
        router.push("/");
      } else {
        setError(errorMessage);
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-clay-soft px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-3xl bg-white p-8 shadow-sm border border-sage-soft/30">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sage-soft text-sage-dark">
            <Sparkles className="h-6 w-6 animate-soft-pulse" />
          </div>
          <h2 className="mt-6 text-3xl font-semibold tracking-tight text-slate-text">
            Welcome to CalmSense
          </h2>
          <p className="mt-2 text-sm text-slate-text/70">
            Let's sign in to your relaxation companion
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-alert/10 p-4 text-sm text-rose-alert border border-rose-alert/20 animate-fade-in">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4 rounded-md">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-text/80 mb-1">
                Student Name / Username
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <User className="h-5 w-5 text-slate-text/40" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full rounded-2xl border border-slate-text/10 bg-slate-50 py-3 pl-10 pr-3 text-slate-text placeholder-slate-text/40 focus:border-sage-dark focus:bg-white focus:outline-none focus:ring-2 focus:ring-sage-soft transition-all duration-200"
                  placeholder="e.g. Liam"
                />
              </div>
            </div>

            <div>
              <label htmlFor="pin" className="block text-sm font-medium text-slate-text/80 mb-1">
                4-Digit Security PIN
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <KeyRound className="h-5 w-5 text-slate-text/40" />
                </div>
                <input
                  id="pin"
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  required
                  value={pin}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "");
                    if (value.length <= 4) setPin(value);
                  }}
                  className="block w-full rounded-2xl border border-slate-text/10 bg-slate-50 py-3 pl-10 pr-3 tracking-widest text-slate-text placeholder-slate-text/40 focus:border-sage-dark focus:bg-white focus:outline-none focus:ring-2 focus:ring-sage-soft transition-all duration-200"
                  placeholder="••••"
                />
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative flex w-full justify-center rounded-2xl bg-sage-dark px-4 py-3 text-base font-medium text-white hover:bg-sage-dark/90 focus:outline-none focus:ring-2 focus:ring-sage-soft focus:ring-offset-2 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Signing in..." : "Enter CalmSpace"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
