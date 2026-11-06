"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_BASE } from "../chat/chat-api";

type Session = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  mustChangePassword?: boolean;
};

const roleHome: Record<string, string> = {
  SUPER_ADMIN: "/admin",
  ADMIN: "/admin",
  DIRECTOR: "/admin",
  TEACHER: "/staff",
  STAFF: "/staff",
  PARENT: "/parent",
};

function policyError(value: string): string | null {
  if (value.length < 10) return "Your new password must be at least 10 characters.";
  if (value.length > 128) return "Your new password must be at most 128 characters.";
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(value)) {
    return "Your new password must contain upper and lower case letters and a number.";
  }
  return null;
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
        if (!response.ok) throw new Error("Authentication required");
        const user = (await response.json()) as Session;
        if (!active) return;
        if (!user.mustChangePassword) {
          router.replace(roleHome[user.role] ?? "/login");
          return;
        }
        setSession(user);
      } catch {
        if (active) router.replace("/login");
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const clientPolicyError = policyError(newPassword);
    if (clientPolicyError) {
      setError(clientPolicyError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Your new passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Your new password must differ from your current password.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/auth/change-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        message?: string | string[];
      };
      if (!response.ok) {
        throw new Error(
          Array.isArray(body.message) ? body.message.join(", ") : (body.message ?? "Unable to change your password."),
        );
      }
      setNotice("Password changed. Please sign in again with your new password.");
      // Backend revokes refresh tokens on password change, so a fresh
      // authenticated session is required before entering the portal.
      router.replace("/login");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof TypeError
          ? "Cannot reach the nursery API. Check that it is running, then try again."
          : cause instanceof Error
            ? cause.message
            : "Unable to change your password. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (checking || !session) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#F7F3E9] px-5 text-sm font-medium text-[#293D35]">
        <p role="status">Checking your secure session…</p>
      </main>
    );
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#F7F3E9] px-5 py-10 text-[#293D35]">
      <div aria-hidden="true" className="absolute -left-16 top-12 h-64 w-64 rounded-full bg-[#788F75]/15 blur-3xl" />
      <div aria-hidden="true" className="absolute -right-12 bottom-10 h-72 w-72 rounded-full bg-[#788F75]/10 blur-3xl" />

      <section aria-labelledby="change-password-title" className="relative z-10 w-full max-w-md rounded-[32px] border border-[#E8E6DC] bg-white p-6 shadow-[0_28px_80px_rgba(41,61,53,0.12)] sm:p-8">
        <Link href="/" className="inline-flex items-center gap-3 text-sm font-semibold text-[#293D35]">
          <span aria-hidden="true" className="grid size-10 place-items-center rounded-2xl bg-[#293D35] text-base font-black text-white">
            L
          </span>
          Little Steps Nursery
        </Link>

        <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-[#788F75]">Secure account setup</p>
        <h1 id="change-password-title" className="mt-3 font-[family-name:var(--font-heading)] text-3xl font-semibold tracking-[-0.04em]">
          Choose a new password
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#747C72]">
          Welcome, {session.firstName}. For your security, please set a personal password before using the portal.
        </p>

        <form onSubmit={(event) => void submit(event)} className="mt-7 space-y-5" noValidate={false}>
          <label className="block text-sm font-semibold text-[#293D35]">
            Current password
            <input
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              maxLength={128}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-[#D7D9CD] bg-[#F7F3E9]/50 px-4 py-3.5 text-base font-normal text-[#293D35] outline-none transition focus:border-[#788F75] focus:bg-white focus:ring-4 focus:ring-[#788F75]/15"
              placeholder="Enter your temporary password"
            />
          </label>

          <label className="block text-sm font-semibold text-[#293D35]">
            New password
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-[#D7D9CD] bg-[#F7F3E9]/50 px-4 py-3.5 text-base font-normal text-[#293D35] outline-none transition focus:border-[#788F75] focus:bg-white focus:ring-4 focus:ring-[#788F75]/15"
              placeholder="At least 10 characters"
            />
            <span className="mt-2 block text-xs font-normal leading-5 text-[#747C72]">
              Use at least 10 characters with upper case, lower case, and a number.
            </span>
          </label>

          <label className="block text-sm font-semibold text-[#293D35]">
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-[#D7D9CD] bg-[#F7F3E9]/50 px-4 py-3.5 text-base font-normal text-[#293D35] outline-none transition focus:border-[#788F75] focus:bg-white focus:ring-4 focus:ring-[#788F75]/15"
              placeholder="Re-enter your new password"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-2xl border border-[#F3C7C7] bg-[#FFF0F0] px-4 py-3 text-sm font-medium text-[#A14D4D]">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-2xl border border-[#D7E8D9] bg-[#F2F8F0] px-4 py-3 text-sm font-medium text-[#293D35]">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-2xl bg-[#293D35] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_16px_35px_rgba(41,61,53,0.18)] transition hover:-translate-y-0.5 hover:bg-[#204236] disabled:cursor-wait disabled:opacity-70"
          >
            {submitting ? "Saving…" : "Save new password"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs leading-5 text-[#747C72]">
          After saving you will sign in again with your new password.
        </p>
      </section>
    </main>
  );
}
