import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-[#f5f7f6] text-[#21332d]">
      <header className="flex h-[72px] items-center justify-between border-b border-[#e4ebe7] bg-white px-6 sm:px-10">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-[#e6f4ed] text-lg font-bold text-[#26714c]">L</span>
          <span className="text-sm font-semibold">Little Steps Nursery</span>
        </div>
        <Link href="/login" className="rounded-xl bg-[#26714c] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1c5f3d]">Sign in</Link>
      </header>
      <section className="mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-20">
        <div className="max-w-2xl">
          <span className="rounded-full bg-[#e6f4ed] px-3 py-1.5 text-xs font-medium text-[#26714c]">A closer connection, every day</span>
          <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">Small moments.<br /><span className="text-[#4c8967]">Meaningful conversations.</span></h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#718078]">A private place for nursery families, teachers, and administrators to stay connected with secure, real-time messaging.</p>
          <Link href="/login" className="mt-8 inline-flex rounded-xl bg-[#26714c] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1c5f3d]">Continue to messages <span aria-hidden="true" className="ml-2">→</span></Link>
        </div>
      </section>
      <footer className="border-t border-[#e4ebe7] bg-white px-6 py-5 text-center text-xs text-[#89958e]">Private conversations for your nursery community.</footer>
    </main>
  );
}
