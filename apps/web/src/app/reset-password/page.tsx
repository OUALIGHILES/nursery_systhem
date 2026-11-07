import { Suspense } from "react";
import ResetPasswordClient from "./reset-password-client";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center bg-[#F7F3E9] px-5 text-sm font-medium text-[#293D35]"><p role="status">Loading secure reset form…</p></main>}>
      <ResetPasswordClient />
    </Suspense>
  );
}
