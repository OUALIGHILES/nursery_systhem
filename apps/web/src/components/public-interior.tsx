import Image from "next/image";
import Link from "next/link";
import { AdmissionsForm } from "./admissions-form";

type PublicPageKey = "about" | "programs" | "admissions" | "contact" | "news";

type EditorialCard = {
  title: string;
  body: string;
  image: string;
  imageAlt: string;
  label: string;
  href?: string;
  tint: string;
};

const pageContent: Record<PublicPageKey, {
  eyebrow: string;
  title: string;
  emphasis: string;
  introduction: string;
  image: string;
  imageAlt: string;
  cards: EditorialCard[];
}> = {
  about: {
    eyebrow: "A little about us",
    title: "Growing curious minds",
    emphasis: "with care.",
    introduction: "Little Steps is built around the belief that children learn best when they feel safe, known, and free to explore. We make room for each little personality to find its own way to grow.",
    image: "photo-1502086223501-7ea6ecd79368",
    imageAlt: "Children exploring outdoors together",
    cards: [
      { title: "A place to belong", body: "A welcoming early-years community where families and educators work together through each important first.", image: "photo-1503454537195-1dcabb73ffb9", imageAlt: "A young child enjoying a creative moment", label: "Our story", tint: "bg-[#faeee8]" },
      { title: "Learning through wonder", body: "Play-led learning, caring routines, and thoughtful support tailored to every child’s stage of development.", image: "photo-1544776193-352d25ca82cd", imageAlt: "A child exploring an activity", label: "Our approach", tint: "bg-[#edf2ea]" },
      { title: "Care in every detail", body: "Clear safeguarding practices, trusted relationships, and careful attention to each child’s wellbeing.", image: "photo-1537655780520-1e392ead81f2", imageAlt: "Children sharing a playful learning moment", label: "Care & safety", tint: "bg-[#f1edf8]" },
    ],
  },
  programs: {
    eyebrow: "A place for every little stage",
    title: "Room to grow,",
    emphasis: "at their own pace.",
    introduction: "Our age-based programs balance familiar routines, joyful discovery, and the confidence children need for their next big step. Every day offers a new chance to explore.",
    image: "photo-1544776193-352d25ca82cd",
    imageAlt: "A child taking part in an early learning activity",
    cards: [
      { title: "Infant care", body: "Gentle routines, sensory play, secure bonds, and attentive care for the earliest discoveries.", image: "photo-1503454537195-1dcabb73ffb9", imageAlt: "A young child playing in a bright space", label: "0–18 months", tint: "bg-[#faeee8]" },
      { title: "Toddler days", body: "Language-rich play, movement, social confidence, and opportunities to explore independence.", image: "photo-1502086223501-7ea6ecd79368", imageAlt: "Children exploring the outdoors", label: "18–36 months", tint: "bg-[#edf2ea]" },
      { title: "Preschool", body: "Creative projects, early literacy and numeracy, collaboration, and problem-solving.", image: "photo-1542810634-71277d95dcbb", imageAlt: "A child creating with art materials", label: "3–4 years", tint: "bg-[#f1edf8]" },
      { title: "Early learning", body: "A confident transition toward school through curiosity, communication, and purposeful play.", image: "photo-1537655780520-1e392ead81f2", imageAlt: "Young children learning and playing together", label: "4–5 years", tint: "bg-[#eaf2f4]" },
    ],
  },
  admissions: {
    eyebrow: "Join our community",
    title: "Let’s find the",
    emphasis: "right next step.",
    introduction: "Tell us a little about your family and the program you are looking for. Our admissions team will review your application and contact you to discuss availability and arrange a visit.",
    image: "photo-1484820540004-14229fe36ca4",
    imageAlt: "A warm, welcoming early learning environment",
    cards: [
      { title: "Apply", body: "Share your family and program details through our secure enrollment inquiry.", image: "photo-1542810634-71277d95dcbb", imageAlt: "A child exploring a creative activity", label: "01", tint: "bg-[#faeee8]" },
      { title: "We review", body: "Our admissions team checks availability and follows up with your family.", image: "photo-1537655780520-1e392ead81f2", imageAlt: "A teacher supporting children as they learn", label: "02", tint: "bg-[#edf2ea]" },
      { title: "Visit & plan", body: "Meet our educators and get secure guidance on next steps and required documents.", image: "photo-1502086223501-7ea6ecd79368", imageAlt: "A child enjoying an outdoor activity", label: "03", tint: "bg-[#f1edf8]" },
    ],
  },
  contact: {
    eyebrow: "We’re here to help",
    title: "Come say",
    emphasis: "hello.",
    introduction: "Questions about programs, admissions, or the family portal? Choose the next step that works for you. We’ll be glad to help.",
    image: "photo-1484820540004-14229fe36ca4",
    imageAlt: "A calm and welcoming nursery environment",
    cards: [
      { title: "Ask about a visit", body: "Send an enrollment inquiry and our admissions team can follow up about arranging a nursery visit.", image: "photo-1502086223501-7ea6ecd79368", imageAlt: "Children spending time exploring outdoors", label: "Admissions", href: "/admissions#application", tint: "bg-[#faeee8]" },
      { title: "Explore programs", body: "Find the age group and learning approach that feels right for your child.", image: "photo-1544776193-352d25ca82cd", imageAlt: "A child involved in a learning activity", label: "Our programs", href: "/programs", tint: "bg-[#edf2ea]" },
      { title: "Family portal", body: "Already part of Little Steps? Sign in to your secure family account.", image: "photo-1537655780520-1e392ead81f2", imageAlt: "Children learning with a caring educator", label: "Parent login", href: "/login", tint: "bg-[#eaf2f4]" },
    ],
  },
  news: {
    eyebrow: "From our nursery",
    title: "Little moments,",
    emphasis: "shared.",
    introduction: "Ideas, seasonal activities, and helpful notes from our early-years community. A little inspiration for the everyday moments that matter.",
    image: "photo-1542810634-71277d95dcbb",
    imageAlt: "A child making art during a nursery activity",
    cards: [
      { title: "A gentle start to nursery", body: "Simple ways families and educators can work together to make the first days feel familiar and calm.", image: "photo-1484820540004-14229fe36ca4", imageAlt: "A calm moment in a welcoming nursery", label: "Family life · 4 min read", href: "/news/gentle-start", tint: "bg-[#faeee8]" },
      { title: "Learning through everyday play", body: "Why blocks, stories, music, and make-believe can grow big skills in little learners.", image: "photo-1544776193-352d25ca82cd", imageAlt: "A child exploring and learning through play", label: "Early learning · 5 min read", href: "/news/everyday-play", tint: "bg-[#edf2ea]" },
      { title: "Building healthy routines", body: "A few thoughtful habits that help young children feel ready for their day.", image: "photo-1503454537195-1dcabb73ffb9", imageAlt: "A young child in a bright and cheerful setting", label: "Wellbeing · 3 min read", href: "/news/healthy-routines", tint: "bg-[#f1edf8]" },
    ],
  },
};

const navigation = [
  ["Our story", "/about"],
  ["Programs", "/programs"],
  ["Admissions", "/admissions"],
  ["News", "/news"],
  ["Contact", "/contact"],
];

function Photo({ id, alt, className = "" }: { id: string; alt: string; className?: string }) {
  return (
    <Image
      src={`https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=85`}
      alt={alt}
      fill
      unoptimized
      sizes="(max-width: 768px) 100vw, 45vw"
      className={`object-cover ${className}`}
    />
  );
}

export function PublicHeader({ page }: { page: PublicPageKey }) {
  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6">
      <div className="mx-auto flex max-w-[1380px] flex-wrap items-center justify-between gap-x-5 gap-y-3 rounded-[22px] border border-[#e8e6dc]/90 bg-[#fbf9f2]/95 px-4 py-3 shadow-[0_8px_30px_rgba(41,61,53,0.06)] backdrop-blur-xl sm:px-6">
        <Link href="/" aria-label="Little Steps Nursery home" className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-[#293d35] text-sm font-semibold tracking-[-0.08em] text-white">ls.</span>
          <span className="leading-tight"><span className="block font-[family-name:var(--font-heading)] text-[15px] font-bold tracking-[-0.03em]">little steps</span><span className="text-[10px] font-semibold uppercase tracking-[0.19em] text-[#747c72]">Nursery & early years</span></span>
        </Link>
        <nav aria-label="Main navigation" className="order-3 flex w-full items-center gap-5 overflow-x-auto pb-1 text-[12px] font-medium text-[#747c72] md:order-none md:w-auto md:gap-6 md:pb-0 md:text-[13px]">
          {navigation.map(([label, href]) => <Link key={href} href={href} aria-current={page === href.slice(1) ? "page" : undefined} className={`shrink-0 transition-colors hover:text-[#293d35] ${page === href.slice(1) ? "text-[#526b55]" : ""}`}>{label}</Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
          <Link href="/login" className="rounded-full px-3 py-2 text-xs font-semibold text-[#526b55] transition-colors hover:bg-[#edf2ea] sm:px-4 sm:text-sm">Parent login</Link>
          <Link href="/admissions#application" className="inline-flex items-center gap-2 rounded-full bg-[#293d35] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#526b55] sm:px-5 sm:text-sm">Book a visit <span aria-hidden="true">→</span></Link>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="bg-[#f7f3e9] px-5 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-[1380px] flex-col gap-8 border-b border-[#e5e2d7] pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-[#293d35] text-sm font-semibold tracking-[-0.08em] text-white">ls.</span>
            <span><span className="block font-[family-name:var(--font-heading)] text-base font-bold tracking-[-0.03em]">little steps</span><span className="text-[10px] font-semibold uppercase tracking-[0.19em] text-[#747c72]">Nursery & early years</span></span>
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-6 text-[#747c72]">A caring place for little people to feel at home, explore, and grow.</p>
        </div>
        <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-[#526b55]">
          {navigation.map(([label, href]) => <Link key={href} href={href} className="hover:text-[#293d35]">{label}</Link>)}
          <Link href="/login" className="hover:text-[#293d35]">Parent login</Link>
        </nav>
      </div>
      <div className="mx-auto flex max-w-[1380px] flex-col gap-2 pt-5 text-xs text-[#9a9d94] sm:flex-row sm:justify-between">
        <span>© 2026 Little Steps Nursery</span>
        <span>Made for little beginnings and the people who care for them.</span>
      </div>
    </footer>
  );
}

export function PublicInterior({ page }: { page: PublicPageKey }) {
  const content = pageContent[page];
  const isAdmissions = page === "admissions";
  const isNews = page === "news";
  return (
    <main className="min-h-screen bg-[#f7f3e9] text-[#293d35]">
      <PublicHeader page={page} />

      <section className="mx-auto max-w-[1380px] px-5 pb-12 pt-12 sm:px-8 sm:pt-16 lg:px-12 lg:pb-20 lg:pt-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_0.88fr] lg:gap-16">
          <div className="max-w-[660px]">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#dfe2d4] bg-white/70 px-4 py-2 text-[11px] font-semibold tracking-[0.06em] text-[#526b55] shadow-sm">
              <span className="size-1.5 rounded-full bg-[#788f75]" />
              {content.eyebrow}
            </p>
            <h1 className="mt-6 font-[family-name:var(--font-heading)] text-[clamp(3rem,6.1vw,5.6rem)] font-medium leading-[0.98] tracking-[-0.075em] text-[#293d35]">
              {content.title} <span className="font-[family-name:var(--font-editorial)] font-normal italic text-[#788f75]">{content.emphasis}</span>
            </h1>
            <p className="mt-6 max-w-[570px] text-base leading-7 text-[#747c72] sm:text-[17px] sm:leading-8">{content.introduction}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              {isAdmissions ? (
                <a href="#application" className="inline-flex items-center gap-3 rounded-full bg-[#293d35] px-6 py-3.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#526b55]">Start an application <span aria-hidden="true">→</span></a>
              ) : page === "contact" ? (
                <Link href="/admissions#application" className="inline-flex items-center gap-3 rounded-full bg-[#293d35] px-6 py-3.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#526b55]">Talk with admissions <span aria-hidden="true">→</span></Link>
              ) : page === "programs" ? (
                <Link href="/admissions#application" className="inline-flex items-center gap-3 rounded-full bg-[#293d35] px-6 py-3.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#526b55]">Ask about a place <span aria-hidden="true">→</span></Link>
              ) : page === "news" ? (
                <a href="#stories" className="inline-flex items-center gap-3 rounded-full bg-[#293d35] px-6 py-3.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#526b55]">Explore the stories <span aria-hidden="true">→</span></a>
              ) : (
                <Link href="/programs" className="inline-flex items-center gap-3 rounded-full bg-[#293d35] px-6 py-3.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#526b55]">Meet our programs <span aria-hidden="true">→</span></Link>
              )}
              {page !== "contact" && <Link href="/contact" className="inline-flex items-center justify-center rounded-full border border-[#d7d9cd] px-6 py-3.5 text-sm font-semibold text-[#293d35] transition hover:bg-white/70">Get in touch</Link>}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[620px] lg:ml-auto">
            <div aria-hidden="true" className="absolute -right-3 top-3 size-24 rounded-full bg-[#e9a88e]/50 sm:-right-5 sm:size-32" />
            <div className="relative ml-auto aspect-[1.08] w-[88%] overflow-hidden rounded-[48%_48%_28px_28px] bg-[#e4e6dc] shadow-[0_24px_65px_rgba(41,61,53,0.13)]">
              <Photo id={content.image} alt={content.imageAlt} />
              <div className="absolute inset-0 bg-gradient-to-t from-[#20342d]/25 via-transparent to-transparent" />
              <span className="absolute bottom-5 left-5 rounded-full border border-white/40 bg-white/85 px-4 py-2 text-[11px] font-semibold text-[#293d35] backdrop-blur-md">{isNews ? "Notes from our community" : "A little room to wonder"}</span>
            </div>
            <span aria-hidden="true" className="absolute -bottom-4 left-[5%] size-20 rounded-full bg-[#c8bce8]/55" />
          </div>
        </div>
      </section>

      {isAdmissions && (
        <section id="application" className="scroll-mt-28 border-y border-[#e8e6dc] bg-[#fffdf8] px-5 py-12 sm:px-8 sm:py-16 lg:px-12">
          <div className="mx-auto max-w-[1160px]">
            <div className="mx-auto max-w-xl text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#788f75]">Your next little step</p>
              <h2 className="mt-3 font-[family-name:var(--font-heading)] text-3xl font-medium tracking-[-0.055em] sm:text-4xl">Tell us about your family.</h2>
              <p className="mt-3 text-sm leading-6 text-[#747c72]">Our admissions team will be in touch to help with availability and arrange a visit.</p>
            </div>
            <AdmissionsForm />
          </div>
        </section>
      )}

      <section id={isNews ? "stories" : "details"} className="scroll-mt-24 bg-[#fffdf8] px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
        <div className="mx-auto max-w-[1380px]">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#788f75]">
                {isNews ? "A little inspiration" : page === "programs" ? "Growing, one day at a time" : page === "contact" ? "Choose your next step" : isAdmissions ? "A thoughtful beginning" : "What matters to us"}
              </p>
              <h2 className="mt-3 font-[family-name:var(--font-heading)] text-[clamp(2rem,4.2vw,3.8rem)] font-medium leading-[1.04] tracking-[-0.065em] text-[#293d35]">
                {isNews ? <>Notes for the <span className="font-[family-name:var(--font-editorial)] italic text-[#788f75]">everyday.</span></>
                  : page === "programs" ? <>A little space for <span className="font-[family-name:var(--font-editorial)] italic text-[#788f75]">every kind of growing.</span></>
                    : page === "contact" ? <>We’ll help you find <span className="font-[family-name:var(--font-editorial)] italic text-[#788f75]">your way.</span></>
                      : isAdmissions ? <>A warm welcome, <span className="font-[family-name:var(--font-editorial)] italic text-[#788f75]">from the very first hello.</span></>
                        : <>Little things that make <span className="font-[family-name:var(--font-editorial)] italic text-[#788f75]">a big difference.</span></>}
              </h2>
            </div>
            {isNews && <span className="text-sm text-[#9a9d94]">A few reads to enjoy together</span>}
          </div>

          <div className={`mt-9 grid gap-5 ${content.cards.length === 4 ? "sm:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3"}`}>
            {content.cards.map((card, index) => {
              const articleCard = isNews;
              const cardContent = (
                <>
                  <div className="relative aspect-[1.48] overflow-hidden">
                    <Photo id={card.image} alt={card.imageAlt} className="transition-transform duration-700 group-hover:scale-[1.04]" />
                    <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#526b55] backdrop-blur-sm">{card.label}</span>
                  </div>
                  <div className={`flex h-full flex-col p-5 sm:p-6 ${card.tint}`}>
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#788f75]">{page === "programs" ? "Little steps" : page === "contact" ? "Here to help" : isNews ? "From Little Steps" : card.label}</span>
                    <h3 className="mt-2 font-[family-name:var(--font-heading)] text-xl font-bold tracking-[-0.035em] text-[#293d35]">{card.title}</h3>
                    <p className="mt-2 flex-1 text-sm leading-6 text-[#747c72]">{card.body}</p>
                    {articleCard ? <span className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-[#526b55]">Read story <span aria-hidden="true">→</span></span>
                      : card.href ? <span className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-[#526b55]">Take a look <span aria-hidden="true">→</span></span>
                        : <span className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-[#526b55]">A little more each day <span aria-hidden="true">↗</span></span>}
                  </div>
                </>
              );
              const className = "group flex h-full flex-col overflow-hidden rounded-[24px] border border-[#e8e6dc] bg-white shadow-[0_12px_35px_rgba(41,61,53,0.045)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(41,61,53,0.09)]";
              return card.href || articleCard
                ? <Link key={card.title} href={card.href ?? `/news/${["gentle-start", "everyday-play", "healthy-routines"][index]}`} className={className}>{cardContent}</Link>
                : <article key={card.title} className={className}>{cardContent}</article>;
            })}
          </div>
        </div>
      </section>

      {!isAdmissions && (
        <section className="bg-[#293d35] px-5 py-14 text-white sm:px-8 sm:py-16 lg:px-12">
          <div className="mx-auto flex max-w-[1160px] flex-col justify-between gap-6 sm:flex-row sm:items-center">
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#c8bce8]">A lovely beginning starts here</p>
              <h2 className="mt-3 font-[family-name:var(--font-heading)] text-3xl font-medium tracking-[-0.05em] sm:text-4xl">Come see where they could grow.</h2>
              <p className="mt-2 text-sm leading-6 text-white/70">We’d love to help your family take the next little step.</p>
            </div>
            <Link href="/admissions#application" className="inline-flex w-fit shrink-0 items-center gap-3 rounded-full bg-[#f7f3e9] px-6 py-3.5 text-sm font-bold text-[#293d35] transition hover:-translate-y-0.5 hover:bg-white">Ask about a visit <span aria-hidden="true">→</span></Link>
          </div>
        </section>
      )}

      <PublicFooter />
    </main>
  );
}
