import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

const programs = [
  {
    name: "Infant care",
    age: "0–18 months",
    description: "Gentle routines, close bonds, and a calm little world to explore.",
    image: "photo-1503454537195-1dcabb73ffb9",
    imageAlt: "A young child playing in a bright, welcoming space",
    tint: "bg-[#faeee8]",
    icon: "heart",
  },
  {
    name: "Toddler days",
    age: "18–36 months",
    description: "Big discoveries, new words, and room to try things all by themselves.",
    image: "photo-1502086223501-7ea6ecd79368",
    imageAlt: "Children exploring outdoors together",
    tint: "bg-[#edf2ea]",
    icon: "sprout",
  },
  {
    name: "Preschool",
    age: "3–4 years",
    description: "Creative projects and playful learning that make curiosity contagious.",
    image: "photo-1544776193-352d25ca82cd",
    imageAlt: "A child taking part in a creative activity",
    tint: "bg-[#f1edf8]",
    icon: "sparkle",
  },
  {
    name: "Early learning",
    age: "4–5 years",
    description: "Growing confidence, friendships, and skills for the next big step.",
    image: "photo-1537655780520-1e392ead81f2",
    imageAlt: "Young children learning and playing together",
    tint: "bg-[#eaf2f4]",
    icon: "book",
  },
];

const activities = [
  { title: "Little makers", category: "Art & creativity", image: "photo-1542810634-71277d95dcbb", alt: "A child creating and exploring with art materials", layout: "md:col-span-7 md:row-span-2", tint: "bg-[#faeee8]" },
  { title: "Outside, together", category: "Outdoor adventures", image: "photo-1502086223501-7ea6ecd79368", alt: "Children spending time exploring outdoors", layout: "md:col-span-5", tint: "bg-[#edf2ea]" },
  { title: "A story to share", category: "Reading", image: "photo-1484820540004-14229fe36ca4", alt: "A quiet moment with a book", layout: "md:col-span-5", tint: "bg-[#f1edf8]" },
  { title: "Curious minds", category: "Science", image: "photo-1544776193-352d25ca82cd", alt: "A child exploring an activity", layout: "md:col-span-4", tint: "bg-[#eaf2f4]" },
  { title: "Music in motion", category: "Music & movement", image: "photo-1537655780520-1e392ead81f2", alt: "Children sharing a playful learning moment", layout: "md:col-span-4", tint: "bg-[#f7f3e9]" },
  { title: "Move and play", category: "Movement", image: "photo-1503454537195-1dcabb73ffb9", alt: "A young child enjoying active play", layout: "md:col-span-4", tint: "bg-[#edf2ea]" },
];

const navLinks = [
  ["Our approach", "#approach"],
  ["Programs", "#programs"],
  ["A day with us", "#activities"],
];

type IconName = "heart" | "shield" | "sparkle" | "sprout" | "book" | "arrow" | "sun";

function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    sparkle: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14Z" /></>,
    sprout: <><path d="M12 22v-8" /><path d="M12 14c0-5-3-8-8-8 0 5 3 8 8 8Z" /><path d="M12 11c0-4 2.7-7 8-7 0 5-2.7 8-8 8" /><path d="M8 22h8" /></>,
    book: <><path d="M12 7v14" /><path d="M3 18V5a2 2 0 0 1 2-2h3a4 4 0 0 1 4 4 4 4 0 0 1 4-4h3a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-4a3 3 0 0 0-3 2 3 3 0 0 0-3-2H5a2 2 0 0 1-2-2Z" /></>,
    arrow: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>{paths[name]}</svg>;
}

function Photo({ id, alt, className = "", priority = false }: { id: string; alt: string; className?: string; priority?: boolean }) {
  return (
    <Image
      src={`https://images.unsplash.com/${id}?auto=format&fit=crop&w=1400&q=85`}
      alt={alt}
      fill
      unoptimized
      priority={priority}
      sizes="(max-width: 768px) 100vw, 55vw"
      className={`object-cover ${className}`}
    />
  );
}

export default function Home() {
  return (
    <main className="overflow-hidden bg-[#f7f3e9] text-[#293d35]">
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6">
        <div className="mx-auto flex max-w-[1380px] flex-wrap items-center justify-between gap-x-5 gap-y-3 rounded-[22px] border border-[#e8e6dc]/90 bg-[#fbf9f2]/95 px-4 py-3 shadow-[0_8px_30px_rgba(41,61,53,0.06)] backdrop-blur-xl sm:px-6">
          <Link href="/" aria-label="Little Steps Nursery home" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-[#293d35] text-sm font-semibold tracking-[-0.08em] text-white">ls.</span>
            <span className="leading-tight"><span className="block font-[family-name:var(--font-heading)] text-[15px] font-bold tracking-[-0.03em]">little steps</span><span className="text-[10px] font-semibold uppercase tracking-[0.19em] text-[#747c72]">Nursery & early years</span></span>
          </Link>

          <nav aria-label="Main navigation" className="order-3 flex w-full items-center gap-6 overflow-x-auto pb-1 text-[13px] font-medium text-[#747c72] md:order-none md:w-auto md:pb-0">
            {navLinks.map(([label, href]) => <a key={href} href={href} className="shrink-0 transition-colors hover:text-[#293d35] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#526b55]">{label}</a>)}
            <Link href="/about" className="shrink-0 transition-colors hover:text-[#293d35] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#526b55]">Our story</Link>
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="rounded-full px-3 py-2 text-xs font-semibold text-[#526b55] transition-colors hover:bg-[#edf2ea] sm:px-4 sm:text-sm">Parent login</Link>
            <Link href="/admissions#application" className="inline-flex items-center gap-2 rounded-full bg-[#293d35] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#526b55] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#293d35] sm:px-5 sm:text-sm">
              Book a visit <Icon name="arrow" className="size-4" />
            </Link>
          </div>
        </div>
      </header>

      <section className="relative mx-auto max-w-[1380px] px-5 pb-20 pt-10 sm:px-8 sm:pt-16 lg:px-12 lg:pb-28 lg:pt-20">
        <div aria-hidden="true" className="pointer-events-none absolute -left-36 top-20 size-[360px] rounded-full bg-[#e9a88e]/15 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute right-[39%] top-12 size-28 rounded-full border border-[#788f75]/30" />
        <div className="relative grid items-center gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16">
          <div className="relative z-10 max-w-[610px]">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#dfe2d4] bg-white/70 px-4 py-2 text-[11px] font-semibold tracking-[0.06em] text-[#526b55] shadow-sm">
              <span className="size-1.5 rounded-full bg-[#788f75]" />
              Welcome to a place of wonder
            </p>
            <h1 className="mt-7 max-w-[680px] font-[family-name:var(--font-heading)] text-[clamp(3.4rem,6.1vw,5.6rem)] font-medium leading-[0.96] tracking-[-0.075em] text-[#293d35]">
              Where little hearts grow into <span className="font-[family-name:var(--font-editorial)] font-normal italic text-[#788f75]">big dreams.</span>
            </h1>
            <p className="mt-7 max-w-[480px] text-[16px] leading-7 text-[#747c72] sm:text-[17px] sm:leading-8">
              A nurturing environment where curiosity, creativity, and confidence grow every single day.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/programs" className="inline-flex items-center justify-center gap-3 rounded-full bg-[#293d35] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_12px_25px_rgba(41,61,53,0.15)] transition hover:-translate-y-0.5 hover:bg-[#526b55] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#293d35]">
                Discover our programs <Icon name="arrow" className="size-4" />
              </Link>
              <Link href="/admissions#application" className="inline-flex items-center justify-center rounded-full border border-[#d7d9cd] bg-transparent px-6 py-3.5 text-sm font-semibold text-[#293d35] transition hover:border-[#788f75] hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#526b55]">
                Ask about a visit
              </Link>
            </div>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-[#e5e2d7] pt-5 text-xs font-medium text-[#747c72]">
              <span className="inline-flex items-center gap-2"><Icon name="heart" className="size-4 text-[#e09e82]" />Care that feels personal</span>
              <span className="inline-flex items-center gap-2"><Icon name="shield" className="size-4 text-[#788f75]" />A secure family portal</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[680px] lg:ml-auto">
            <div aria-hidden="true" className="absolute -right-7 top-2 size-28 rounded-full bg-[#e9a88e]/50 sm:-right-9 sm:top-8 sm:size-36" />
            <div aria-hidden="true" className="absolute -bottom-5 left-[10%] size-28 rounded-full bg-[#c8bce8]/50" />
            <div className="relative ml-auto aspect-[0.98] w-[88%] overflow-hidden rounded-[48%_48%_34px_34px] bg-[#dbe2d7] shadow-[0_28px_70px_rgba(41,61,53,0.14)] sm:aspect-[1.08] sm:w-[86%]">
              <Photo id="photo-1503454537195-1dcabb73ffb9" alt="A young child playing in a warm, sunlit early learning space" priority className="transition-transform duration-700 hover:scale-[1.025]" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#20342d]/25 via-transparent to-transparent" />
              <span className="absolute bottom-5 left-5 rounded-full border border-white/40 bg-white/85 px-4 py-2 text-[11px] font-semibold text-[#293d35] backdrop-blur-md sm:bottom-7 sm:left-7 sm:text-xs">
                A little room to wonder
              </span>
            </div>
            <div className="absolute -left-1 top-[16%] max-w-[180px] rounded-2xl border border-white/70 bg-white/90 p-4 shadow-[0_15px_40px_rgba(41,61,53,0.12)] backdrop-blur-md sm:-left-3 sm:max-w-[205px] sm:p-5">
              <span className="grid size-9 place-items-center rounded-full bg-[#faeee8] text-[#a96952]"><Icon name="sparkle" /></span>
              <p className="mt-3 font-[family-name:var(--font-heading)] text-sm font-bold text-[#293d35]">Happy little learners</p>
              <p className="mt-1 text-[11px] leading-5 text-[#747c72]">Curiosity has a place to bloom.</p>
            </div>
            <div className="absolute -right-2 bottom-[13%] max-w-[190px] rounded-2xl border border-white/70 bg-white/90 p-4 shadow-[0_15px_40px_rgba(41,61,53,0.12)] backdrop-blur-md sm:-right-1 sm:max-w-[220px] sm:p-5">
              <span className="grid size-9 place-items-center rounded-full bg-[#edf2ea] text-[#526b55]"><Icon name="shield" /></span>
              <p className="mt-3 font-[family-name:var(--font-heading)] text-sm font-bold text-[#293d35]">Safe, caring routines</p>
              <p className="mt-1 text-[11px] leading-5 text-[#747c72]">Thoughtful care, every step of the day.</p>
            </div>
            <span aria-hidden="true" className="absolute right-[9%] top-[2%] font-[family-name:var(--font-editorial)] text-5xl italic text-[#526b55]">✳</span>
          </div>
        </div>
      </section>

      <section aria-label="Our values" className="border-y border-[#e8e6dc] bg-[#fffdf8]">
        <div className="mx-auto grid max-w-[1380px] gap-1 px-5 py-5 sm:grid-cols-2 sm:px-8 lg:grid-cols-4 lg:px-12">
          {[
            ["heart", "Caring educators", "Warmth, attention, and encouragement."],
            ["shield", "A safe environment", "Carefully considered daily routines."],
            ["sparkle", "Creative learning", "Play and discovery, side by side."],
            ["sprout", "Growing together", "A close partnership with families."],
          ].map(([icon, title, text]) => (
            <div key={title} className="flex items-center gap-3 rounded-2xl px-3 py-3 sm:px-4 sm:py-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#edf2ea] text-[#526b55]"><Icon name={icon as IconName} /></span>
              <span><span className="block font-[family-name:var(--font-heading)] text-sm font-bold text-[#293d35]">{title}</span><span className="mt-0.5 block text-[11px] leading-4 text-[#747c72]">{text}</span></span>
            </div>
          ))}
        </div>
      </section>

      <section id="approach" className="scroll-mt-28 bg-white py-20 sm:py-24 lg:py-32">
        <div className="mx-auto grid max-w-[1380px] items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1.04fr_0.96fr] lg:gap-20 lg:px-12">
          <div className="relative mx-auto w-full max-w-[610px]">
            <div aria-hidden="true" className="absolute -left-4 -top-5 h-2/3 w-2/3 rounded-[45%_45%_24px_24px] bg-[#faeee8] sm:-left-7 sm:-top-7" />
            <div className="relative ml-auto aspect-[1.08] w-[88%] overflow-hidden rounded-[46%_46%_22px_22px] bg-[#e6e9df]">
              <Photo id="photo-1502086223501-7ea6ecd79368" alt="Children discovering the natural world through outdoor play" />
            </div>
            <div className="absolute -bottom-5 left-0 rounded-2xl bg-[#f1edf8] px-5 py-4 sm:left-4">
              <p className="font-[family-name:var(--font-editorial)] text-lg italic text-[#526b55]">Small steps, taken with confidence.</p>
            </div>
          </div>
          <div className="max-w-[550px]">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#788f75]">Our philosophy</p>
            <h2 className="mt-5 font-[family-name:var(--font-heading)] text-[clamp(2.6rem,5vw,4.7rem)] font-medium leading-[1.02] tracking-[-0.065em] text-[#293d35]">
              Every child deserves a <span className="font-[family-name:var(--font-editorial)] italic text-[#788f75]">beautiful beginning.</span>
            </h2>
            <p className="mt-6 text-[15px] leading-7 text-[#747c72]">
              The best learning starts with feeling safe, seen, and free to be curious. We make space for unhurried play, caring relationships, and the little everyday discoveries that help confidence take root.
            </p>
            <p className="mt-4 text-[15px] leading-7 text-[#747c72]">
              Every child grows in their own way. Our approach brings families and educators together around the person your child is becoming.
            </p>
            <Link href="/about" className="mt-8 inline-flex items-center gap-3 rounded-full bg-[#293d35] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#526b55]">
              Discover our approach <Icon name="arrow" className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      <section id="programs" className="scroll-mt-24 bg-[#f7f3e9] py-20 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-[1380px] px-5 sm:px-8 lg:px-12">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div className="max-w-[650px]">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#788f75]">A place for every little stage</p>
              <h2 className="mt-4 font-[family-name:var(--font-heading)] text-[clamp(2.5rem,5vw,4.5rem)] font-medium leading-[1.02] tracking-[-0.065em] text-[#293d35]">Room to grow, <span className="font-[family-name:var(--font-editorial)] italic text-[#788f75]">at their own pace.</span></h2>
            </div>
            <Link href="/programs" className="inline-flex w-fit items-center gap-2 pb-1 text-sm font-semibold text-[#526b55] transition hover:gap-3">
              Explore all programs <Icon name="arrow" className="size-4" />
            </Link>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {programs.map((program) => (
              <article key={program.name} className={`group overflow-hidden rounded-[24px] border border-[#e8e6dc] ${program.tint} transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(41,61,53,0.09)]`}>
                <Link href="/programs" aria-label={`Learn more about ${program.name}`} className="block focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#526b55]">
                  <div className="relative aspect-[1.45] overflow-hidden">
                    <Photo id={program.image} alt={program.imageAlt} className="transition-transform duration-500 group-hover:scale-[1.04]" />
                    <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-[#526b55] backdrop-blur-sm">{program.age}</span>
                  </div>
                  <div className="p-5 sm:p-6">
                    <div className="flex items-center justify-between">
                      <h3 className="font-[family-name:var(--font-heading)] text-xl font-bold tracking-[-0.03em] text-[#293d35]">{program.name}</h3>
                      <span className="grid size-9 place-items-center rounded-full bg-white/80 text-[#526b55]"><Icon name={program.icon as IconName} className="size-[18px]" /></span>
                    </div>
                    <p className="mt-3 min-h-[48px] text-sm leading-6 text-[#747c72]">{program.description}</p>
                    <span className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-[#526b55]">Learn more <Icon name="arrow" className="size-4 transition-transform group-hover:translate-x-1" /></span>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="activities" className="scroll-mt-24 bg-[#fffdf8] py-20 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-[1380px] px-5 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#788f75]">Little moments, every day</p>
            <h2 className="mt-4 font-[family-name:var(--font-heading)] text-[clamp(2.5rem,5vw,4.3rem)] font-medium leading-[1.04] tracking-[-0.065em] text-[#293d35]">A day full of <span className="font-[family-name:var(--font-editorial)] italic text-[#788f75]">possibility.</span></h2>
            <p className="mt-4 text-sm leading-6 text-[#747c72]">Stories, sounds, fresh air, and the freedom to find out what happens next.</p>
          </div>
          <div className="mt-10 grid auto-rows-[210px] gap-4 sm:grid-cols-2 md:auto-rows-[230px] md:grid-cols-12">
            {activities.map((activity) => (
              <article key={activity.title} className={`group relative isolate overflow-hidden rounded-[22px] ${activity.layout} ${activity.tint}`}>
                <Photo id={activity.image} alt={activity.alt} className="z-[-2] transition-transform duration-700 group-hover:scale-[1.04]" />
                <div aria-hidden="true" className="absolute inset-0 z-[-1] bg-gradient-to-t from-[#1f3029]/65 via-[#1f3029]/5 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5 sm:p-6">
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/80">{activity.category}</span>
                    <h3 className="mt-1 font-[family-name:var(--font-heading)] text-xl font-semibold text-white sm:text-2xl">{activity.title}</h3>
                  </div>
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/20 text-white backdrop-blur-sm"><Icon name="sparkle" className="size-4" /></span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#293d35] px-5 py-20 text-white sm:px-8 sm:py-24 lg:px-12">
        <div aria-hidden="true" className="absolute -right-20 -top-32 size-[360px] rounded-full border border-white/10" />
        <div aria-hidden="true" className="absolute -right-8 -top-20 size-[230px] rounded-full border border-white/10" />
        <div className="relative mx-auto flex max-w-[1140px] flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#c8bce8]">A lovely beginning starts here</p>
            <h2 className="mt-4 font-[family-name:var(--font-heading)] text-[clamp(2.6rem,5vw,4.5rem)] font-medium leading-[1.02] tracking-[-0.06em]">Come see where <span className="font-[family-name:var(--font-editorial)] italic text-[#e9c2ae]">they could grow.</span></h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/70">Tell us a little about your family and we’ll help you explore the next step.</p>
          </div>
          <Link href="/admissions#application" className="inline-flex shrink-0 items-center gap-3 rounded-full bg-[#f7f3e9] px-6 py-3.5 text-sm font-bold text-[#293d35] transition hover:-translate-y-0.5 hover:bg-white">
            Talk with admissions <Icon name="arrow" className="size-4" />
          </Link>
        </div>
      </section>

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
            <Link href="/about" className="hover:text-[#293d35]">Our story</Link>
            <Link href="/programs" className="hover:text-[#293d35]">Programs</Link>
            <Link href="/admissions" className="hover:text-[#293d35]">Admissions</Link>
            <Link href="/news" className="hover:text-[#293d35]">News</Link>
            <Link href="/contact" className="hover:text-[#293d35]">Contact</Link>
            <Link href="/login" className="hover:text-[#293d35]">Parent login</Link>
          </nav>
        </div>
        <div className="mx-auto flex max-w-[1380px] flex-col gap-2 pt-5 text-xs text-[#9a9d94] sm:flex-row sm:justify-between">
          <span>© 2026 Little Steps Nursery</span>
          <span>Made for little beginnings and the people who care for them.</span>
        </div>
      </footer>
    </main>
  );
}
