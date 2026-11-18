import Link from "next/link";
import HeroPlan from "@/components/site/HeroPlan";
import Reveal from "@/components/site/Reveal";
import home from "@/content/home.json";

// The home page. Its words come from content/home.json, so they can be edited
// there without touching this file.

type Item = {
  title: string;
  description: string;
  href?: string;
  status: string;
};

const container = "mx-auto w-full max-w-7xl px-4 sm:px-8";
const eyebrow = "font-mono text-xs uppercase tracking-[0.2em] text-accent";

function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-5 w-5 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}

function ToolCard({ item, index }: { item: Item; index: number }) {
  const live = item.status === "live" && item.href;
  const body = (
    <>
      <div className="flex items-start justify-between gap-4">
        <span className="font-mono text-xs text-muted">
          {String(index + 1).padStart(2, "0")}
        </span>
        {live ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line transition-all duration-300 group-hover:rotate-45 group-hover:border-accent group-hover:bg-accent group-hover:text-accent-ink">
            <Arrow className="h-4 w-4" />
          </span>
        ) : (
          <span className="rounded-full border border-line px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted">
            Soon
          </span>
        )}
      </div>
      <h3 className="mt-10 text-2xl font-semibold tracking-tight">
        {item.title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {item.description}
      </p>
    </>
  );
  const shell =
    "group block h-full rounded-2xl border border-line bg-surface p-6 transition-all duration-300";
  return live ? (
    <Link
      href={item.href!}
      className={`${shell} hover:-translate-y-1 hover:border-ink hover:shadow-[0_24px_50px_-24px_rgba(0,0,0,0.35)]`}
    >
      {body}
    </Link>
  ) : (
    <div className={`${shell} opacity-70`}>{body}</div>
  );
}

export default function HomePage() {
  const [tools, ...library] = home.sections;
  const words = [...home.marquee, ...home.marquee];

  return (
    <>
      {/* Hero */}
      <section className="drafting-grid border-b border-line">
        <div
          className={`${container} grid items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24`}
        >
          <div>
            <p className={`${eyebrow} fade-in`}>{home.tagline}</p>
            <h1 className="mt-6 text-[clamp(2.5rem,5.3vw,5.5rem)] font-semibold leading-[0.95] tracking-[-0.04em]">
              {home.headline.map((line, index) => (
                <span key={line} className="rise">
                  <span style={{ animationDelay: `${0.1 + index * 0.12}s` }}>
                    {index === home.headline.length - 1 ? (
                      <>
                        {line.replace(/\.$/, "")}
                        <span className="text-accent">.</span>
                      </>
                    ) : (
                      line
                    )}
                  </span>
                </span>
              ))}
            </h1>
            <p
              className="fade-in mt-7 max-w-xl text-lg leading-relaxed text-muted"
              style={{ animationDelay: "0.5s" }}
            >
              {home.intro}
            </p>
            <div
              className="fade-in mt-9 flex flex-wrap gap-3"
              style={{ animationDelay: "0.7s" }}
            >
              <Link
                href="/studio/plan"
                className="group flex items-center gap-2 rounded-full bg-accent px-6 py-3.5 text-sm font-medium text-accent-ink transition-transform hover:-translate-y-0.5"
              >
                Open the Floor Plan Studio
                <Arrow className="h-4 w-4 transition-transform group-hover:rotate-45" />
              </Link>
              <Link
                href="/tools/concept-planner"
                className="rounded-full border border-ink px-6 py-3.5 text-sm font-medium transition-colors hover:bg-ink hover:text-paper"
              >
                Start with a concept
              </Link>
            </div>
          </div>

          <div className="fade-in" style={{ animationDelay: "0.4s" }}>
            <HeroPlan />
          </div>
        </div>

        {/* Key facts */}
        <div className={`${container} pb-12`}>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
            {home.stats.map((stat) => (
              <div key={stat.label} className="bg-surface p-5">
                <dt className="sr-only">{stat.label}</dt>
                <dd className="text-3xl font-semibold tracking-tight">
                  {stat.value}
                </dd>
                <dd className="mt-1 text-sm text-muted">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Scrolling strip */}
      <div
        className="overflow-hidden border-b border-line bg-ink py-4 text-paper"
        aria-hidden="true"
      >
        <div className="marquee flex w-max gap-10 whitespace-nowrap font-mono text-sm uppercase tracking-[0.18em]">
          {words.map((word, index) => (
            <span key={index} className="flex items-center gap-10">
              {word}
              <span className="text-accent">✦</span>
            </span>
          ))}
        </div>
      </div>

      {/* Workflow */}
      <section id="flow" className={`${container} scroll-mt-20 py-20 lg:py-28`}>
        <Reveal>
          <p className={eyebrow}>The workflow</p>
          <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.03em] sm:text-6xl">
            One project. Six stages. Nothing to install.
          </h2>
        </Reveal>

        <ol className="mt-12 border-t border-ink">
          {home.flow.map((stage, index) => {
            const live = stage.status === "live" && "href" in stage;
            const row = (
              <>
                <span className="w-10 shrink-0 font-mono text-sm text-muted transition-colors group-hover:text-current">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-2xl font-semibold tracking-tight sm:text-4xl">
                    {stage.title}
                  </span>
                  <span className="mt-1 block text-sm text-muted transition-colors group-hover:text-current sm:text-base">
                    {stage.description}
                  </span>
                </span>
                {live ? (
                  <span className="flex shrink-0 items-center gap-2 font-mono text-xs uppercase tracking-wider">
                    <span className="hidden sm:inline">Open</span>
                    <Arrow className="transition-transform duration-300 group-hover:rotate-45" />
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full border border-line px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted">
                    Soon
                  </span>
                )}
              </>
            );
            const base =
              "group flex items-center gap-4 border-b border-line px-2 py-6 transition-all duration-300 sm:gap-8 sm:px-4 sm:py-8";
            return (
              <li key={stage.title}>
                <Reveal delay={index * 60}>
                  {live ? (
                    <Link
                      href={(stage as { href: string }).href}
                      className={`${base} hover:bg-ink hover:pl-6 hover:text-paper sm:hover:pl-10`}
                    >
                      {row}
                    </Link>
                  ) : (
                    <div className={`${base} opacity-60`}>{row}</div>
                  )}
                </Reveal>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Tools */}
      <section
        id={tools.id}
        className="scroll-mt-20 border-y border-line bg-surface/50"
      >
        <div className={`${container} py-20 lg:py-28`}>
          <Reveal>
            <p className={eyebrow}>{tools.title}</p>
            <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.03em] sm:text-6xl">
              Tools that do the careful work for you.
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tools.items.map((item, index) => (
              <Reveal key={item.title} delay={index * 70} className="h-full">
                <ToolCard item={item} index={index} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Library */}
      <section id="library" className={`${container} scroll-mt-20 py-20 lg:py-28`}>
        <Reveal>
          <p className={eyebrow}>The library</p>
          <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.03em] sm:text-6xl">
            Learn from what already works.
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-10 lg:grid-cols-3">
          {library.map((section, index) => (
            <Reveal key={section.id} delay={index * 90}>
              <div id={section.id} className="scroll-mt-24">
                <p className="font-mono text-xs text-muted">{section.number}</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                  {section.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {section.description}
                </p>
                <ul className="mt-5 border-t border-line">
                  {section.items.map((item) => (
                    <li
                      key={item.title}
                      className="flex items-center justify-between gap-4 border-b border-line py-3.5"
                    >
                      <span>
                        <span className="block font-medium">{item.title}</span>
                        <span className="block text-sm text-muted">
                          {item.description}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full border border-line px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted">
                        Soon
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Closing call */}
      <section className={`${container} pb-20`}>
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-ink px-6 py-16 text-paper sm:px-14 sm:py-24">
            <div className="drafting-grid absolute inset-0 opacity-40" aria-hidden="true" />
            <div className="relative">
              <h2 className="max-w-3xl text-4xl font-semibold tracking-[-0.03em] sm:text-7xl">
                Draw the building you actually have in mind
                <span className="text-accent">.</span>
              </h2>
              <div className="mt-10 flex flex-wrap gap-3">
                <Link
                  href="/studio/plan"
                  className="group flex items-center gap-2 rounded-full bg-paper px-6 py-3.5 text-sm font-medium text-ink transition-transform hover:-translate-y-0.5"
                >
                  Open the studio
                  <Arrow className="h-4 w-4 transition-transform group-hover:rotate-45" />
                </Link>
                <Link
                  href="/tools/concept-planner"
                  className="rounded-full border border-paper/40 px-6 py-3.5 text-sm font-medium transition-colors hover:bg-paper hover:text-ink"
                >
                  Plan a concept first
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
