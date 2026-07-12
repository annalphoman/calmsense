"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, KeyRound, User, AlertCircle, Palette, CheckCircle2 } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  
  // Form fields state
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [favoriteColor, setFavoriteColor] = useState("Sage");
  const [role, setRole] = useState<"client" | "therapist">("client");

  // Status state
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Frontend validations
    if (!name.trim() || !username.trim() || !pin || !confirmPin || !favoriteColor) {
      setError("Please fill in all fields");
      return;
    }

    if (pin.length !== 4 || !/^\d+$/.test(pin)) {
      setError("PIN must be exactly 4 digits");
      return;
    }

    if (pin !== confirmPin) {
      setError("PINs do not match");
      return;
    }

    setIsLoading(true);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      
      const response = await fetch(`${backendUrl}/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          username: username.trim(),
          pin,
          confirm_pin: confirmPin,
          favorite_color: favoriteColor,
          role,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        setSuccess("Account created successfully! Redirecting to login...");
        setTimeout(() => {
          router.push("/login");
        }, 1500);
      } else {
        setError(data.message || "Failed to create account. Please try again.");
      }
    } catch (err) {
      console.error("Signup request failed:", err);
      setError("Unable to connect to the server. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-clay-soft px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6 rounded-3xl bg-white p-8 shadow-sm border border-sage-soft/30">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sage-soft text-sage-dark">
            <Sparkles className="h-6 w-6 animate-soft-pulse" />
          </div>
          <h2 className="mt-6 text-3xl font-semibold tracking-tight text-slate-text">
            Create an Account
          </h2>
          <p className="mt-2 text-sm text-slate-text/70">
            Join CalmSense to start your well-being journey
          </p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSignup}>
          {/* Status Messages */}
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-alert/10 p-4 text-sm text-rose-alert border border-rose-alert/20 animate-fade-in">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-xl bg-sage-soft/30 p-4 text-sm text-sage-dark border border-sage-soft animate-fade-in">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-sage-dark" />
              <span>{success}</span>
            </div>
          )}

          {/* Role Toggle Selector */}
          <div>
            <label className="block text-sm font-medium text-slate-text/80 mb-2">
              Select Your Role
            </label>
            <div className="grid grid-cols-2 gap-3 p-1 bg-slate-50 border border-slate-text/10 rounded-2xl">
              <button
                type="button"
                onClick={() => setRole("client")}
                className={`py-2 px-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                  role === "client"
                    ? "bg-white text-sage-dark shadow-sm border border-sage-soft/30"
                    : "text-slate-text/60 hover:text-slate-text"
                }`}
              >
                Sign up as Client
              </button>
              <button
                type="button"
                onClick={() => setRole("therapist")}
                className={`py-2 px-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                  role === "therapist"
                    ? "bg-white text-sky-dark shadow-sm border border-sage-soft/30"
                    : "text-slate-text/60 hover:text-slate-text"
                }`}
              >
                Sign up as Therapist
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {/* Full Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-text/80 mb-1">
                Full Name
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <User className="h-5 w-5 text-slate-text/40" />
                </div>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="block w-full rounded-2xl border border-slate-text/10 bg-slate-50 py-3 pl-10 pr-3 text-slate-text placeholder-slate-text/40 focus:border-sage-dark focus:bg-white focus:outline-none focus:ring-2 focus:ring-sage-soft transition-all duration-200"
                  placeholder="e.g. Liam Smith"
                />
              </div>
            </div>

            {/* Username */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-text/80 mb-1">
                Username
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <User className="h-5 w-5 text-slate-text/40" />
                </div>
                <input
                  id="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full rounded-2xl border border-slate-text/10 bg-slate-50 py-3 pl-10 pr-3 text-slate-text placeholder-slate-text/40 focus:border-sage-dark focus:bg-white focus:outline-none focus:ring-2 focus:ring-sage-soft transition-all duration-200"
                  placeholder="e.g. liam_smith"
                />
              </div>
            </div>

            {/* PIN */}
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
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  required
                  value={pin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    if (val.length <= 4) setPin(val);
                  }}
                  className="block w-full rounded-2xl border border-slate-text/10 bg-slate-50 py-3 pl-10 pr-3 tracking-widest text-slate-text placeholder-slate-text/40 focus:border-sage-dark focus:bg-white focus:outline-none focus:ring-2 focus:ring-sage-soft transition-all duration-200"
                  placeholder="••••"
                />
              </div>
            </div>

            {/* Confirm PIN */}
            <div>
              <label htmlFor="confirmPin" className="block text-sm font-medium text-slate-text/80 mb-1">
                Confirm Security PIN
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <KeyRound className="h-5 w-5 text-slate-text/40" />
                </div>
                <input
                  id="confirmPin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  required
                  value={confirmPin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    if (val.length <= 4) setConfirmPin(val);
                  }}
                  className="block w-full rounded-2xl border border-slate-text/10 bg-slate-50 py-3 pl-10 pr-3 tracking-widest text-slate-text placeholder-slate-text/40 focus:border-sage-dark focus:bg-white focus:outline-none focus:ring-2 focus:ring-sage-soft transition-all duration-200"
                  placeholder="••••"
                />
              </div>
            </div>

            {/* Favorite Color Dropdown */}
            <div>
              <label htmlFor="favoriteColor" className="block text-sm font-medium text-slate-text/80 mb-1">
                Favorite Calming Color
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Palette className="h-5 w-5 text-slate-text/40" />
                </div>
                <select
                  id="favoriteColor"
                  value={favoriteColor}
                  onChange={(e) => setFavoriteColor(e.target.value)}
                  className="block w-full rounded-2xl border border-slate-text/10 bg-slate-50 py-3 pl-10 pr-3 text-slate-text focus:border-sage-dark focus:bg-white focus:outline-none focus:ring-2 focus:ring-sage-soft transition-all duration-200"
                >
                  <option value="Sage">Sage</option>
                  <option value="Lavender">Lavender</option>
                  <option value="Teal">Teal</option>
                  <option value="Sky Blue">Sky Blue</option>
                  <option value="Pink">Pink</option>
                  <option value="Peach">Peach</option>
                </select>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="group relative flex w-full justify-center rounded-2xl bg-sage-dark px-4 py-3 text-base font-medium text-white hover:bg-sage-dark/90 focus:outline-none focus:ring-2 focus:ring-sage-soft focus:ring-offset-2 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Creating Account..." : "Create Account"}
            </button>
          </div>
        </form>

        <div className="text-center mt-4">
          <p className="text-sm text-slate-text/70">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-sage-dark hover:underline transition-all duration-200"
            >
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
