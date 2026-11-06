import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicFooter, PublicHeader } from "../../../components/public-interior";

const articles: Record<string, { title: string; category: string; intro: string; paragraphs: string[] }> = {
  "gentle-start": {
    title: "A gentle start to nursery",
    category: "Family life",
    intro: "The first days in a new setting are a big transition for children and families. Familiar routines and warm relationships make a difference.",
    paragraphs: [
      "A short visit before the first full day can help a child recognize the room, meet an educator, and begin to feel that this new place is safe. Keep goodbyes calm, warm, and predictable.",
      "Share the little things that comfort your child: a favourite story, the words you use for rest time, or a small routine that helps them feel settled. Families and educators can use those details to build a bridge between home and nursery.",
      "Every child settles at a different pace. Our team partners with families, shares updates, and adjusts support to help each child feel known and secure.",
    ],
  },
  "everyday-play": {
    title: "Learning through everyday play",
    category: "Early learning",
    intro: "Blocks, stories, music, and make-believe are more than fun. They give children natural ways to explore language, movement, and ideas.",
    paragraphs: [
      "When children stack blocks, they experiment with balance, space, and cause and effect. A simple conversation about what they are building can add new words and invite problem-solving.",
      "Stories and pretend play help children practice listening, imagination, and social communication. There is no single right way to play; following a child’s curiosity makes room for meaningful discovery.",
      "At nursery, educators provide a safe environment, offer interesting materials, and observe each child’s interests so that play can grow into new learning.",
    ],
  },
  "healthy-routines": {
    title: "Building healthy routines",
    category: "Wellbeing",
    intro: "Predictable routines can help young children feel secure and ready to take part in the day.",
    paragraphs: [
      "A familiar rhythm around waking, meals, rest, and getting ready can make transitions easier. Consistency matters more than a perfect schedule.",
      "Children benefit when adults explain what comes next in simple, reassuring language. Small choices, such as selecting a book or putting away a toy, can help them feel involved.",
      "Families and educators can compare notes and gradually align routines where it helps the child. Every family is different, and support should fit the child’s needs.",
    ],
  },
};

const articleImages: Record<string, { src: string; alt: string }> = {
  "gentle-start": {
    src: "photo-1484820540004-14229fe36ca4",
    alt: "A calm moment in a welcoming nursery",
  },
  "everyday-play": {
    src: "photo-1544776193-352d25ca82cd",
    alt: "A child exploring and learning through play",
  },
  "healthy-routines": {
    src: "photo-1503454537195-1dcabb73ffb9",
    alt: "A young child enjoying a bright and cheerful setting",
  },
};

export function generateStaticParams() {
  return Object.keys(articles).map((slug) => ({ slug }));
}

export default async function NewsArticlePage({
  params,
}: PageProps<"/news/[slug]">) {
  const { slug } = await params;
  const article = articles[slug];
  if (!article) notFound();
  const image = articleImages[slug];

  return (
    <main className="min-h-screen bg-[#f7f3e9] text-[#293d35]">
      <PublicHeader page="news" />
      <article className="mx-auto max-w-[1120px] px-5 pb-16 pt-10 sm:px-8 sm:pt-14 lg:px-12 lg:pb-24">
        <Link href="/news" className="inline-flex items-center gap-2 text-sm font-semibold text-[#526b55] transition hover:text-[#293d35]">← All stories</Link>
        <div className="mt-8 grid items-center gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
          <div className="max-w-[550px]">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#dfe2d4] bg-white/70 px-4 py-2 text-[11px] font-semibold tracking-[0.06em] text-[#526b55] shadow-sm"><span className="size-1.5 rounded-full bg-[#788f75]" />{article.category}</p>
            <h1 className="mt-6 font-[family-name:var(--font-heading)] text-[clamp(2.8rem,5.6vw,5.3rem)] font-medium leading-[0.99] tracking-[-0.07em]">{article.title}</h1>
            <p className="mt-6 text-lg leading-8 text-[#747c72]">{article.intro}</p>
          </div>
          <div className="relative mx-auto w-full max-w-[570px]">
            <span aria-hidden="true" className="absolute -right-4 -top-4 size-28 rounded-full bg-[#e9a88e]/50" />
            <div className="relative aspect-[1.12] overflow-hidden rounded-[48%_48%_26px_26px] bg-[#e4e6dc] shadow-[0_24px_65px_rgba(41,61,53,0.13)]">
              <Image src={`https://images.unsplash.com/${image.src}?auto=format&fit=crop&w=1400&q=85`} alt={image.alt} fill unoptimized sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
              <span className="absolute bottom-5 left-5 rounded-full border border-white/40 bg-white/85 px-4 py-2 text-[11px] font-semibold text-[#293d35] backdrop-blur-md">Notes from our community</span>
            </div>
            <span aria-hidden="true" className="absolute -bottom-4 left-[5%] size-20 rounded-full bg-[#c8bce8]/55" />
          </div>
        </div>
        <div className="mx-auto mt-14 grid max-w-[780px] gap-10 lg:mt-20 lg:grid-cols-[120px_1fr] lg:gap-16">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#788f75]">Little thoughts<br />for everyday</p>
          <div className="space-y-6 text-[16px] leading-8 text-[#52605a]">
            {article.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            <div className="rounded-[24px] border border-[#e8e6dc] bg-white p-6 sm:p-8">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#788f75]">Keep exploring</p>
              <h2 className="mt-3 font-[family-name:var(--font-heading)] text-2xl font-semibold tracking-[-0.04em] text-[#293d35]">A little more room to grow.</h2>
              <p className="mt-2 text-sm leading-6 text-[#747c72]">Explore our age groups and the playful learning approach at Little Steps Nursery.</p>
              <Link href="/programs" className="mt-5 inline-flex items-center gap-3 rounded-full bg-[#293d35] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#526b55]">Explore our programs <span aria-hidden="true">→</span></Link>
            </div>
          </div>
        </div>
      </article>
      <PublicFooter />
    </main>
  );
}
