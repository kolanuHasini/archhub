import Link from "next/link";
import HeroPlan from "@/components/site/HeroPlan";
import Reveal from "@/components/site/Reveal";
import home from "@/content/home.json";

// The home page, laid out like a set of architectural drawings: a title
// block, numbered sheets, section markers and dimension lines.
// Its words come from content/home.json, so they can be edited there.

type Item = {
  title: string;
  description: string;
  href?: string;
  status: string;
};

const container = "mx-auto w-full max-w-7xl px-4 sm:px-8";

function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-5 w-5 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}

/** The round marker that names a section on a drawing: number over sheet. */
function Marker({ number, sheet }: { number: string; sheet: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-[1.5px] border-ink font-mono leading-none"
    >
      <span className="text-lg font-semibold">{number}</span>
      <span className="my-1 h-px w-10 bg-ink" />
      <span className="text-[10px]">{sheet}</span>
    </div>
  );
}

function SheetTitle({
  number,
  sheet,
  label,
  title,
}: {
  number: string;
  sheet: string;
  label: string;
  title: string;
}) {
  return (
    <Reveal>
      <div className="flex items-start gap-5">
        <Marker number={number} sheet={sheet} />
        <div>
          <p className="annotation text-muted">{label}</p>
          <h2 className="display mt-2 max-w-3xl text-4xl sm:text-6xl">{title}</h2>
        </div>
      </div>
    </Reveal>
  );
}

/** A divider drawn as a dimension line, with tick marks and a label. */
function DimensionRule({ label }: { label: string }) {
  const tick = "h-3 w-px rotate-45 bg-ink";
  return (
    <div className={`${container} flex items-center gap-3`} aria-hidden="true">
      <span className={tick} />
      <span className="h-px flex-1 bg-ink" />
      <span className="annotation text-muted">{label}</span>
      <span className="h-px flex-1 bg-ink" />
      <span className={tick} />
    </div>
  );
}

function ToolCard({ item, index }: { item: Item; index: number }) {
  const live = item.status === "live" && item.href;
  const body = (
    <>
      <div className="flex items-center justify-between gap-4">
        <span className="annotation text-muted">
          Tool {String(index + 1).padStart(2, "0")}
        </span>
        {live ? (
          <Arrow className="transition-transform duration-300 group-hover:rotate-45 group-hover:text-accent" />
        ) : (
          <span className="annotation text-muted">In progress</span>
        )}
      </div>
      <h3 className="display mt-12 text-3xl">{item.title}</h3>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        {item.description}
      </p>
    </>
  );
  const shell = "group block h-full border border-line bg-surface p-6";
  return live ? (
    <Link href={item.href!} className={`${shell} crop`}>
      {body}
    </Link>
  ) : (
    <div className={`${shell} border-dashed bg-transparent`}>{body}</div>
  );
}

export default function HomePage() {
  const [tools, ...library] = home.sections;
  const liveStages = home.flow.filter((stage) => stage.status === "live").length;

  // The strip under the hero, set out like a drawing's title block.
  const titleBlock = [
    { label: "Project", value: "Yours" },
    { label: "Stages ready", value: `${liveStages} of ${home.flow.length}` },
    { label: "Cost", value: "Free, no sign-up" },
    { label: "Files", value: "PNG · SVG · DXF" },
  ];

  return (
    <>
      {/* Sheet 000: the cover */}
      <section className="drafting-grid">
        <div
          className={`${container} grid items-center gap-12 py-14 lg:grid-cols-[1fr_1fr] lg:py-20`}
        >
          <div>
            <p className="annotation text-accent">{home.tagline}</p>
            <h1 className="display mt-6 text-[clamp(2.9rem,6.4vw,6.5rem)]">
              {home.headline.map((line, index) => (
                <span key={line} className="block">
                  <span>
                    {index === home.headline.length - 1 ? <em>{line}</em> : line}
                  </span>
                </span>
              ))}
            </h1>
            <p
              className="mt-7 max-w-xl text-lg leading-relaxed text-muted"
            >
              {home.intro}
            </p>
            <div
              className="mt-9 flex flex-wrap gap-3"
            >
              <Link
                href="/studio/plan"
                className="group flex items-center gap-3 bg-ink px-6 py-3.5 text-[15px] font-medium text-paper transition-colors hover:bg-accent hover:text-accent-ink"
              >
                Open the Floor Plan Studio
                <Arrow className="h-4 w-4 transition-transform group-hover:rotate-45" />
              </Link>
              <Link
                href="/tools/concept-planner"
                className="border border-ink px-6 py-3.5 text-[15px] font-medium transition-colors hover:bg-ink hover:text-paper"
              >
                Start with a concept
              </Link>
            </div>
          </div>

          <div>
            <HeroPlan />
          </div>
        </div>

        {/* Title block */}
        <div className={container}>
          <dl className="grid grid-cols-2 border border-ink bg-surface lg:grid-cols-4">
            {titleBlock.map((cell, index) => (
              <div
                key={cell.label}
                className={`p-4 sm:p-5 ${index % 2 === 1 ? "border-l border-ink" : ""} ${
                  index >= 2 ? "border-t border-ink lg:border-t-0" : ""
                } ${index === 2 ? "lg:border-l" : ""}`}
              >
                <dt className="annotation text-muted">{cell.label}</dt>
                <dd className="mt-1.5 text-xl font-medium tracking-tight">
                  {cell.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="h-14" />
      </section>

      <DimensionRule label="Sheet 01 · Workflow" />

      {/* Sheet 01: workflow */}
      <section id="flow" className={`${container} scroll-mt-20 py-16 lg:py-24`}>
        <SheetTitle
          number="01"
          sheet="A-101"
          label="The workflow"
          title="One project, taken from a first thought to a finished sheet."
        />

        <ol className="mt-12 border-t border-ink">
          {home.flow.map((stage, index) => {
            const live = stage.status === "live" && "href" in stage;
            const row = (
              <>
                <span className="w-10 shrink-0 font-mono text-sm text-muted transition-colors group-hover:text-current">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-8">
                  <span className="display block text-3xl sm:w-64 sm:shrink-0 sm:text-4xl">
                    {stage.title}
                  </span>
                  <span className="mt-1 block text-[15px] text-muted transition-colors group-hover:text-current sm:mt-0 sm:text-base">
                    {stage.description}
                  </span>
                </span>
                {live ? (
                  <span className="annotation flex shrink-0 items-center gap-2">
                    <span className="hidden sm:inline">Open</span>
                    <Arrow className="transition-transform duration-300 group-hover:rotate-45" />
                  </span>
                ) : (
                  <span className="annotation shrink-0 text-muted">In progress</span>
                )}
              </>
            );
            const base =
              "group flex items-center gap-4 border-b border-line px-2 py-6 transition-all duration-300 sm:gap-8 sm:px-4 sm:py-7";
            return (
              <li key={stage.title}>
                <Reveal delay={index * 50}>
                  {live ? (
                    <Link
                      href={(stage as { href: string }).href}
                      className={`${base} hover:bg-ink hover:pl-6 hover:text-paper sm:hover:pl-8`}
                    >
                      {row}
                    </Link>
                  ) : (
                    <div className={base}>{row}</div>
                  )}
                </Reveal>
              </li>
            );
          })}
        </ol>
      </section>

      <DimensionRule label="Sheet 02 · Tools" />

      {/* Sheet 02: tools */}
      <section
        id={tools.id}
        className={`${container} scroll-mt-20 py-16 lg:py-24`}
      >
        <SheetTitle
          number="02"
          sheet="A-201"
          label={tools.title}
          title="Tools that do the careful work, so you can do the thinking."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {tools.items.map((item, index) => (
            <Reveal key={item.title} delay={index * 60} className="h-full">
              <ToolCard item={item} index={index} />
            </Reveal>
          ))}
        </div>
      </section>

      <DimensionRule label="Sheet 03 · Library" />

      {/* Sheet 03: library */}
      <section id="library" className={`${container} scroll-mt-20 py-16 lg:py-24`}>
        <SheetTitle
          number="03"
          sheet="A-301"
          label="The library"
          title="Learn from buildings and drawings that already work."
        />
        <div className="mt-12 grid gap-10 lg:grid-cols-3">
          {library.map((section, index) => (
            <Reveal key={section.id} delay={index * 80}>
              <div id={section.id} className="scroll-mt-24">
                <h3 className="display text-3xl">{section.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">
                  {section.description}
                </p>
                <ul className="mt-5 border-t border-ink">
                  {section.items.map((item) => (
                    <li key={item.title} className="border-b border-line py-3.5">
                      <span className="flex items-baseline justify-between gap-4">
                        <span className="font-medium">{item.title}</span>
                        <span className="annotation shrink-0 text-muted">
                          In progress
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[15px] text-muted">
                        {item.description}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Closing note */}
      <section className={`${container} pb-20`}>
        <Reveal>
          <div className="drafting-grid border border-ink bg-surface px-6 py-14 sm:px-14 sm:py-20">
            <p className="annotation text-accent">General note</p>
            <h2 className="display mt-4 max-w-4xl text-4xl sm:text-7xl">
              Draw the building you <em>actually</em> have in mind.
            </h2>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                href="/studio/plan"
                className="group flex items-center gap-3 bg-ink px-6 py-3.5 text-[15px] font-medium text-paper transition-colors hover:bg-accent hover:text-accent-ink"
              >
                Open the studio
                <Arrow className="h-4 w-4 transition-transform group-hover:rotate-45" />
              </Link>
              <Link
                href="/tools/concept-planner"
                className="border border-ink px-6 py-3.5 text-[15px] font-medium transition-colors hover:bg-ink hover:text-paper"
              >
                Plan a concept first
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
