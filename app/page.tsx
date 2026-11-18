import Link from "next/link";
import home from "@/content/home.json";

type Item = {
  title: string;
  description: string;
  href?: string;
  status: string;
};

function ItemCard({ item }: { item: Item }) {
  const isLive = item.status === "live" && item.href;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold">{item.title}</h3>
        <span
          className={`shrink-0 border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
            isLive
              ? "border-accent bg-accent text-accent-ink"
              : "border-line text-muted"
          }`}
        >
          {isLive ? "Open" : "Soon"}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {item.description}
      </p>
    </>
  );

  if (isLive) {
    return (
      <Link
        href={item.href!}
        className="block border border-ink bg-surface p-4 transition-colors hover:border-accent"
      >
        {body}
      </Link>
    );
  }

  return (
    <div className="border border-dashed border-line bg-surface/60 p-4">
      {body}
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <section className="py-16 sm:py-24">
        <p className="font-mono text-xs uppercase tracking-widest text-accent">
          {home.tagline}
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
          Everything you need for studio, in one place.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          {home.intro}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/tools/concept-planner"
            className="bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink hover:opacity-90"
          >
            Start a concept
          </Link>
          <Link
            href="/#studio-tools"
            className="border border-ink px-5 py-2.5 text-sm font-medium hover:border-accent hover:text-accent"
          >
            Browse sections
          </Link>
        </div>
      </section>

      {/* The design flow: one stage leads to the next */}
      <section className="border-t border-ink py-10">
        <p className="font-mono text-xs uppercase tracking-widest text-accent">
          The design flow
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Take a project from first idea to final sheets, one stage at a time.
        </p>
        <ol className="mt-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {home.flow.map((stage, index) => {
            const number = String(index + 1).padStart(2, "0");
            const isLive = stage.status === "live" && "href" in stage;
            const inner = (
              <>
                <span className="font-mono text-xs">{number}</span>
                <span className="mt-1 block font-semibold">{stage.title}</span>
                <span className="mt-1 block font-mono text-[10px] uppercase tracking-wider">
                  {isLive ? "Start here →" : "Coming soon"}
                </span>
              </>
            );
            return (
              <li key={stage.title}>
                {isLive ? (
                  <Link
                    href={(stage as { href: string }).href}
                    className="block h-full bg-accent p-3 text-accent-ink hover:opacity-90"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="h-full border border-dashed border-line bg-surface/60 p-3 text-muted">
                    {inner}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {home.sections.map((section) => (
        <section
          key={section.id}
          id={section.id}
          className="scroll-mt-6 border-t border-ink py-10 sm:py-14"
        >
          <div className="grid gap-6 sm:grid-cols-[14rem_1fr] sm:gap-10">
            <div>
              <p className="font-mono text-xs text-accent">{section.number}</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                {section.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {section.description}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map((item) => (
                <ItemCard key={item.title} item={item} />
              ))}
            </div>
          </div>
        </section>
      ))}
    </>
  );
}
