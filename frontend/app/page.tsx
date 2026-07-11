"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, UserCheck, LogOut, ArrowRight, ShieldCheck } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const userSession = localStorage.getItem("calmsense_user");
    if (userSession) {
      try {
        const parsed = JSON.parse(userSession);
        setUsername(parsed.username);
      } catch (e) {
        // Ignore error
      }
    } else {
      // Gentle redirect if session is missing, but allow override for convenience
      router.push("/login");
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("calmsense_user");
    router.push("/login");
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-clay-soft px-6 py-12">
      <div className="w-full max-w-2xl space-y-8 text-center">
        {/* User Card */}
        {username && (
          <div className="mx-auto flex max-w-xs items-center justify-between gap-4 rounded-full bg-sage-soft/50 border border-sage-soft px-4 py-2 text-sm text-sage-dark animate-fade-in">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              <span>Signed in as <strong className="font-semibold">{username}</strong></span>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-full p-1 hover:bg-sage-soft text-slate-text/65 hover:text-rose-alert transition-all duration-200"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="space-y-3">
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-slate-text">
            Choose your path
          </h1>
          <p className="text-base sm:text-lg text-slate-text/75 max-w-md mx-auto">
            Select a mode below to start pairing or monitoring distress levels.
          </p>
        </div>

        {/* Large Buttons Container */}
        <div className="grid gap-6 md:grid-cols-2 mt-8">
          {/* Patient Mode Card */}
          <button
            onClick={() => router.push("/patient")}
            className="group flex flex-col items-center text-center p-8 rounded-3xl bg-white border border-sage-soft/30 hover:border-sage-dark/30 hover:shadow-md hover:scale-[1.02] active:scale-[0.99] transition-all duration-300 cursor-pointer"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sage-soft text-sage-dark group-hover:scale-110 transition-transform duration-300">
              <Heart className="h-8 w-8" />
            </div>
            <h2 className="mt-6 text-2xl font-semibold text-slate-text">
              Patient Mode
            </h2>
            <p className="mt-2 text-sm text-slate-text/70 leading-relaxed">
              Open your monitoring view, display your pairing code, and access calming interventions.
            </p>
            <div className="mt-6 flex items-center gap-1 text-sm font-medium text-sage-dark opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <span>Enter CalmSpace</span>
              <ArrowRight className="h-4 w-4" />
            </div>
          </button>

          {/* Therapist/Parent Mode Card */}
          <button
            onClick={() => router.push("/companion")}
            className="group flex flex-col items-center text-center p-8 rounded-3xl bg-white border border-sage-soft/30 hover:border-sage-dark/30 hover:shadow-md hover:scale-[1.02] active:scale-[0.99] transition-all duration-300 cursor-pointer"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-lavender-soft text-sky-dark group-hover:scale-110 transition-transform duration-300">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h2 className="mt-6 text-2xl font-semibold text-slate-text">
              Therapist / Parent
            </h2>
            <p className="mt-2 text-sm text-slate-text/70 leading-relaxed">
              Pair with a student session, customize intake profiles, track distress, and review notes.
            </p>
            <div className="mt-6 flex items-center gap-1 text-sm font-medium text-sky-dark opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <span>Enter Companion Hub</span>
              <ArrowRight className="h-4 w-4" />
            </div>
          </button>
        </div>
      </div>
    </main>
  );
}
