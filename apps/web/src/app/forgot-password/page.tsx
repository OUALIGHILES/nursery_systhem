"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { API_BASE } from "../chat/chat-api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string | string[] };
        // Never leak enumeration via different error payloads: fall back to generic message.
        throw new Error(Array.isArray(body.message) ? body.message.join(", ") : body.message ?? "Unable to send reset email.");
      }
      // Backend always returns generic success — show it whether or not account exists.
      setSent(true);
    } catch (cause) {
      setError(
        cause instanceof TypeError
          ? `Cannot reach the nursery API at ${API_BASE}. Check that the API is running, then try again.`
          : cause instanceof Error
            ? cause.message
            : "Unable to send reset email. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(160,219,176,0.35),_transparent_35%),linear-gradient(135deg,#f4faf5_0%,#eef7f2_30%,#f8f7f3_100%)] px-5 py-10 text-[#17342d]">
      <div className="absolute -left-16 top-12 h-64 w-64 rounded-full bg-[#d9f0df] blur-3xl" />
      <div className="absolute -right-12 bottom-10 h-72 w-72 rounded-full bg-[#f8e7d2] blur-3xl" />

      <section aria-labelledby="forgot-password-title" className="relative z-10 w-full max-w-md rounded-[32px] border border-[#e2ece6] bg-white/90 p-6 shadow-[0_40px_120px_rgba(23,52,45,0.12)] backdrop-blur-xl sm:p-8">
        <Link href="/" className="inline-flex items-center gap-3 text-sm font-medium text-[#3d5a50]">
          <span className="grid size-10 place-items-center rounded-2xl bg-[#e4f5ea] text-base font-black text-[#1d4d3b]">L</span>
          Little Steps Nursery
        </Link>

        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-[#5c8677]">Account recovery</p>
        <h1 id="forgot-password-title" className="mt-3 text-3xl font-black tracking-[-0.05em] text-[#17342d]">
          Forgot your password?
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#49705d]">
          Enter the email you use to sign in and we will send you a link to reset your password. The link is valid for 30 minutes.
        </p>

        {sent ? (
          <div role="status" className="mt-7 rounded-2xl border border-[#d7e8d9] bg-[#f2f8f0] px-4 py-4 text-sm leading-6 text-[#17342d]">
            <p className="font-semibold">Check your inbox</p>
            <p className="mt-2">If an account exists for that email, a reset link has been sent. Did not receive it? Check your spam folder or try again in a few minutes.</p>
            <Link href="/login" className="mt-4 inline-block font-semibold text-[#1f4a38] underline underline-offset-4">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="mt-8 space-y-5">
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

            {error && (
              <p role="alert" className="rounded-2xl border border-[#f3c7c7] bg-[#fff0f0] px-3.5 py-3 text-sm font-medium text-[#a14d4d]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-2xl bg-[linear-gradient(135deg,#17342d_0%,#285a46_100%)] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(23,52,45,0.18)] transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70"
            >
              {submitting ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-[#73847d]">
          <Link href="/login" className="font-semibold text-[#1f4a38] transition hover:text-[#14372d]">
            Back to sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
