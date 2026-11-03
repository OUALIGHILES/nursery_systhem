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
      router.replace("/chat");
      router.refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f7f6] px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-[#e4ebe7] bg-white p-7 shadow-[0_12px_48px_rgba(27,52,40,0.07)] sm:p-9">
        <Link href="/" className="grid size-12 place-items-center rounded-2xl bg-[#e6f4ed] text-lg font-bold text-[#26714c]">L</Link>
        <p className="mt-7 text-xs font-semibold uppercase tracking-[0.16em] text-[#598168]">Little Steps Nursery</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#21332d]">Welcome back</h1>
        <p className="mt-2 text-sm leading-6 text-[#829189]">Sign in to continue to your secure nursery messages.</p>
        <form onSubmit={(event) => void submit(event)} className="mt-7 space-y-4">
          <label className="block text-sm font-medium text-[#53645a]">
            Email address
            <input
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#e3eae5] bg-[#fbfcfb] px-3.5 py-3 text-sm outline-none transition focus:border-[#8db69a]"
            />
          </label>
          <label className="block text-sm font-medium text-[#53645a]">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#e3eae5] bg-[#fbfcfb] px-3.5 py-3 text-sm outline-none transition focus:border-[#8db69a]"
            />
          </label>
          {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-[#26714c] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1c5f3d] disabled:cursor-wait disabled:opacity-70"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-5 text-center text-xs text-[#8a9890]">Your session is stored in secure HTTP-only cookies.</p>
      </section>
    </main>
  );
}
