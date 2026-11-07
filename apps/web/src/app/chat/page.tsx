"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { chatRequest } from "./chat-api";

const roleHome: Record<string, string> = {
  SUPER_ADMIN: "/admin/messages",
  ADMIN: "/admin/messages",
  DIRECTOR: "/admin/messages",
  TEACHER: "/teacher/messages",
  STAFF: "/teacher/messages",
  PARENT: "/parent/messages",
};

export default function ChatPage() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center bg-[#f5f7f6] px-6 text-sm font-medium text-[#21332d]"><p role="status">Loading your messages…</p></main>}>
      <ChatRedirect />
    </Suspense>
  );
}

function ChatRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let active = true;
    void chatRequest<{ role: string; mustChangePassword?: boolean }>("/auth/me")
      .then((user) => {
        if (!active) return;
        if (user.mustChangePassword) {
          router.replace("/change-password");
          return;
        }
        const target = roleHome[user.role] ?? "/login";
        const conversation = searchParams.get("conversation");
        router.replace(conversation ? `${target}?conversation=${encodeURIComponent(conversation)}` : target);
      })
      .catch(() => {
        if (active) router.replace("/login");
      });
    return () => {
      active = false;
    };
  }, [router, searchParams]);

  return <main className="grid min-h-screen place-items-center bg-[#f5f7f6] px-6 text-sm font-medium text-[#21332d]"><p role="status">Loading your messages…</p></main>;
}
