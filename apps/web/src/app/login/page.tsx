"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_BASE } from "../chat/chat-api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string | string[] };
        throw new Error(Array.isArray(body.message) ? body.message.join(", ") : body.message ?? "Sign in failed.");
      }
      const body = (await response.json()) as { user?: { role?: string } };
      const destination = body.user?.role
        ? {
            SUPER_ADMIN: "/admin",
            ADMIN: "/admin",
            DIRECTOR: "/admin",
            TEACHER: "/staff",
            STAFF: "/staff",
            PARENT: "/parent",
          }[body.user.role] ?? "/chat"
        : "/chat";
      router.replace(destination);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof TypeError
          ? `Cannot reach the nursery API at ${API_BASE}. Check that the API is running, then reload this page. If you opened the site using 127.0.0.1 or a different port, use the same localhost address configured in the API's CORS settings.`
          : cause instanceof Error
            ? cause.message
            : "Sign in could not be completed. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(160,219,176,0.35),_transparent_35%),linear-gradient(135deg,#f4faf5_0%,#eef7f2_30%,#f8f7f3_100%)] px-5 py-10 text-[#17342d]">
      <div className="absolute -left-16 top-12 h-64 w-64 rounded-full bg-[#d9f0df] blur-3xl" />
      <div className="absolute -right-12 bottom-10 h-72 w-72 rounded-full bg-[#f8e7d2] blur-3xl" />

      <div className="relative z-10 grid w-full max-w-6xl overflow-hidden rounded-[32px] border border-[#e2ece6] bg-white/80 shadow-[0_40px_120px_rgba(23,52,45,0.12)] backdrop-blur-xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden flex-col justify-between bg-[linear-gradient(135deg,#17342d_0%,#255a46_100%)] p-10 text-white lg:flex">
          <div>
            <Link href="/" className="inline-flex items-center gap-3 text-sm font-medium text-white/90">
              <span className="grid size-10 place-items-center rounded-2xl bg-white/10 text-base font-black text-[#dff5ea] backdrop-blur-sm">
                L
              </span>
              Little Steps Nursery
            </Link>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#bfe4d0]">Welcome back</p>
            <h1 className="mt-4 max-w-sm text-4xl font-black leading-tight tracking-[-0.06em]">
              The calmest way to stay connected.
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-[#dfeee7]">
              Keep families informed, teachers aligned, and daily nursery life beautifully organized.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="text-2xl font-black">2.4k+</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[#dfeee7]">Parents</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="text-2xl font-black">96%</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[#dfeee7]">Daily updates</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="text-2xl font-black">4 min</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[#dfeee7]">Response</div>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center bg-white p-6 sm:p-8 lg:p-10">
          <div className="w-full max-w-md">
            <Link href="/" className="mb-8 inline-flex items-center gap-3 text-sm font-medium text-[#3d5a50] lg:hidden">
              <span className="grid size-10 place-items-center rounded-2xl bg-[#e4f5ea] text-base font-black text-[#1d4d3b]">
                L
              </span>
              Little Steps Nursery
            </Link>

            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5c8677]">Secure sign in</p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-[#17342d]">Welcome back</h2>
            </div>

            <div className="mb-6 flex items-center justify-between rounded-2xl border border-[#e4efe7] bg-[#f6faf7] px-3.5 py-2.5 text-sm text-[#49705d]">
              <span>Need an account?</span>
              <Link href="/signup" className="font-semibold text-[#1f4a38] transition hover:text-[#14372d]">
                Create one
              </Link>
            </div>

            <form onSubmit={(event) => void submit(event)} className="space-y-5">
              <label className="block text-sm font-semibold text-[#355249]">
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#dfece5] bg-[#f8fbf9] px-4 py-3.5 text-base text-[#17342d] outline-none transition focus:border-[#89c1a4] focus:bg-white focus:ring-4 focus:ring-[#dff4e8]"
                  placeholder="name@example.com"
                />
              </label>

              <label className="block text-sm font-semibold text-[#355249]">
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#dfece5] bg-[#f8fbf9] px-4 py-3.5 text-base text-[#17342d] outline-none transition focus:border-[#89c1a4] focus:bg-white focus:ring-4 focus:ring-[#dff4e8]"
                  placeholder="Enter your password"
                />
              </label>

              {error && (
                <p role="alert" className="rounded-2xl border border-[#f3c7c7] bg-[#fff0f0] px-3.5 py-3 text-sm font-medium text-[#a14d4d]">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl bg-[linear-gradient(135deg,#17342d_0%,#285a46_100%)] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(23,52,45,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_55px_rgba(23,52,45,0.22)] disabled:cursor-wait disabled:opacity-70"
              >
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <div className="mt-6 flex items-center justify-center gap-3 text-xs text-[#73847d]">
              <span className="h-px flex-1 bg-[#e4ece7]" />
              <span>Secure HTTP-only session</span>
              <span className="h-px flex-1 bg-[#e4ece7]" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
