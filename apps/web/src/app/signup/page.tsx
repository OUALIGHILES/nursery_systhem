import Link from "next/link";

export default function SignupPage() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(160,219,176,0.32),_transparent_30%),linear-gradient(135deg,#f3faf5_0%,#eef6f2_30%,#fbfaf8_100%)] px-5 py-10 text-[#17342d]">
      <div className="absolute -left-8 top-10 h-64 w-64 rounded-full bg-[#d9f0df] blur-3xl" />
      <div className="absolute -right-10 bottom-4 h-72 w-72 rounded-full bg-[#f9e6cb] blur-3xl" />
      <section className="relative z-10 w-full max-w-xl rounded-[32px] border border-[#e2ece6] bg-white/90 p-7 shadow-[0_32px_90px_rgba(23,52,45,0.12)] backdrop-blur-xl sm:p-10">
        <Link href="/" className="inline-flex items-center gap-3 text-sm font-bold text-[#264c3c]">
          <span className="grid size-10 place-items-center rounded-2xl bg-[#e6f4ed] font-black text-[#26714c]">L</span>
          Little Steps Nursery
        </Link>
        <p className="mt-9 text-xs font-bold uppercase tracking-[0.18em] text-[#5d8678]">Account access</p>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.05em]">Your nursery team will help you get started.</h1>
        <p className="mt-4 text-base leading-7 text-[#5c7067]">
          To protect children’s information, accounts are created by an authorized nursery administrator. Public self-registration is not enabled, so this page will not collect or pretend to submit your personal details.
        </p>
        <div className="mt-7 rounded-2xl border border-[#e3eee7] bg-[#f7faf8] p-5">
          <h2 className="font-bold">Already have an account?</h2>
          <p className="mt-1 text-sm leading-6 text-[#687c73]">Sign in with the email and temporary password provided by your nursery. You will be asked to change a temporary password after signing in.</p>
          <Link href="/login" className="mt-4 inline-flex rounded-full bg-[#17342d] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#245a42]">Go to sign in</Link>
        </div>
        <p className="mt-6 text-sm text-[#73847b]">Need an account? Please contact the nursery administration team directly.</p>
      </section>
    </main>
  );
}
