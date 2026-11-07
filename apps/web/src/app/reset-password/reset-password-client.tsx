"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { API_BASE } from "../chat/chat-api";
import { passwordsMatch, policyError } from "../../lib/password-policy";

export default function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError("Reset link is missing or invalid. Please request a new link from the forgot password page.");
      return;
    }
    const clientPolicyError = policyError(newPassword);
    if (clientPolicyError) {
      setError(clientPolicyError);
      return;
    }
    if (!passwordsMatch(newPassword, confirmPassword)) {
      setError("Your new passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword, confirmPassword }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string | string[] };
        const msg = Array.isArray(body.message) ? body.message.join(", ") : body.message ?? "Invalid or expired reset token";
        throw new Error(msg);
      }
      setSuccess(true);
    } catch (cause) {
      const message =
        cause instanceof TypeError
          ? "Cannot reach the nursery API. Check that it is running, then try again."
          : cause instanceof Error
            ? cause.message
            : "Unable to reset your password. Please try again.";
      // Map backend generic token errors to expired-link guidance.
      if (/invalid or expired reset token/i.test(message)) {
        setError("This reset link is invalid, expired, or has already been used. Please request a new one from the forgot password page.");
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#F7F3E9] px-5 py-10 text-[#293D35]">
      <div aria-hidden="true" className="absolute -left-16 top-12 h-64 w-64 rounded-full bg-[#788F75]/15 blur-3xl" />
      <div aria-hidden="true" className="absolute -right-12 bottom-10 h-72 w-72 rounded-full bg-[#788F75]/10 blur-3xl" />

      <section aria-labelledby="reset-password-title" className="relative z-10 w-full max-w-md rounded-[32px] border border-[#E8E6DC] bg-white p-6 shadow-[0_28px_80px_rgba(41,61,53,0.12)] sm:p-8">
        <Link href="/" className="inline-flex items-center gap-3 text-sm font-semibold text-[#293D35]">
          <span aria-hidden="true" className="grid size-10 place-items-center rounded-2xl bg-[#293D35] text-base font-black text-white">
            L
          </span>
          Little Steps Nursery
        </Link>

        <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-[#788F75]">Secure password reset</p>
        <h1 id="reset-password-title" className="mt-3 font-[family-name:var(--font-heading)] text-3xl font-semibold tracking-[-0.04em]">
          Choose a new password
        </h1>

        {!token ? (
          <div role="alert" className="mt-6 rounded-2xl border border-[#f3c7c7] bg-[#fff0f0] px-4 py-3 text-sm font-medium text-[#a14d4d]">
            <p>Reset link is missing or invalid. Please request a new link.</p>
            <Link href="/forgot-password" className="mt-2 inline-block font-semibold underline underline-offset-4">
              Request a new link
            </Link>
          </div>
        ) : success ? (
          <div role="status" className="mt-6 rounded-2xl border border-[#d7e8d9] bg-[#f2f8f0] px-4 py-4 text-sm leading-6 text-[#293D35]">
            <p className="font-semibold">Password updated</p>
            <p className="mt-2">Your password has been reset. Please sign in with your new password.</p>
            <button
              type="button"
              onClick={() => {
                router.replace("/login");
                router.refresh();
              }}
              className="mt-4 w-full rounded-2xl bg-[#293D35] px-4 py-3.5 text-sm font-semibold text-white"
            >
              Sign in
            </button>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="mt-7 space-y-5">
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
                {error}{" "}
                {/expired|already been used/i.test(error) && (
                  <Link href="/forgot-password" className="font-semibold underline underline-offset-4">
                    Request a new link
                  </Link>
                )}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-2xl bg-[#293D35] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_16px_35px_rgba(41,61,53,0.18)] transition hover:-translate-y-0.5 hover:bg-[#204236] disabled:cursor-wait disabled:opacity-70"
            >
              {submitting ? "Saving…" : "Reset password"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs leading-5 text-[#747C72]">
          After resetting, all existing sessions will be signed out.{" "}
          <Link href="/login" className="font-semibold underline underline-offset-4">
            Back to sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
