import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import software from "@/content/software.json";

// One page per program, built from content/software.json.

type Params = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return software.map((app) => ({ id: app.id }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const app = software.find((item) => item.id === id);
  return app
    ? { title: `${app.name} guide`, description: app.summary }
    : { title: "Software guide" };
}

export default async function SoftwareGuidePage({ params }: Params) {
  const { id } = await params;
  const app = software.find((item) => item.id === id);
  if (!app) notFound();

  const related = software.filter((item) => item.group === app.group && item.id !== app.id);
  const isPromptTool = app.group === "AI image tools";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <Link href="/software" className="annotation text-accent hover:underline">
        ← Software guides
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-5xl sm:text-7xl">{app.name}</h1>
          <p className="mt-2 text-muted">
            {app.maker} · {app.group}
          </p>
        </div>
        <a
          href={app.site}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-ink px-4 py-2.5 text-[15px] font-medium transition-colors hover:bg-ink hover:text-paper"
        >
          Official site ↗
        </a>
      </div>
      <p className="mt-6 max-w-3xl text-xl leading-relaxed">{app.summary}</p>

      <div className="mt-10 grid gap-5 lg:grid-cols-12">
        {/* Shortcuts */}
        {app.shortcuts.length > 0 && (
          <section className="rounded-md border border-line bg-paper lg:col-span-7">
            <h2 className="annotation border-b border-line px-5 py-3 text-muted">
              {isPromptTool ? "Settings worth knowing" : "Shortcuts to learn first"}
            </h2>
            <dl>
              {app.shortcuts.map((shortcut) => (
                <div
                  key={shortcut.keys}
                  className="flex items-center justify-between gap-4 border-b border-line px-5 py-2.5 last:border-b-0"
                >
                  <dd className="text-[15px]">{shortcut.action}</dd>
                  <dt className="shrink-0 rounded border border-line bg-surface px-2 py-0.5 font-mono text-[13px]">
                    {shortcut.keys}
                  </dt>
                </div>
              ))}
            </dl>
            {!isPromptTool && (
              <p className="border-t border-line px-5 py-3 text-[13px] text-muted">
                These are the default Windows shortcuts. On a Mac, Ctrl is usually Cmd. Programs
                let you change them, so yours may differ.
              </p>
            )}
          </section>
        )}

        <div
          className={`space-y-5 ${app.shortcuts.length > 0 ? "lg:col-span-5" : "lg:col-span-12"}`}
        >
          <section className="rounded-md border border-line bg-paper">
            <h2 className="annotation border-b border-line px-5 py-3 text-muted">Best for</h2>
            <ul className="px-5 py-3">
              {app.bestFor.map((use) => (
                <li key={use} className="flex gap-3 py-1 text-[15px]">
                  <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {use}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-md border border-line bg-paper">
            <h2 className="annotation border-b border-line px-5 py-3 text-muted">
              Good habits
            </h2>
            <ol className="px-5 py-3">
              {app.tips.map((tip, index) => (
                <li key={tip} className="flex gap-3 py-1.5 text-[15px] leading-relaxed">
                  <span className="font-mono text-[13px] text-muted">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {tip}
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-md border border-ink bg-surface">
            <h2 className="annotation border-b border-line px-5 py-3 text-accent">
              With ArchHub
            </h2>
            <p className="px-5 py-4 text-[15px] leading-relaxed">{app.withArchHub}</p>
          </section>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="annotation border-b border-ink pb-2 text-muted">
            Also in {app.group.toLowerCase()}
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {related.map((item) => (
              <Link
                key={item.id}
                href={`/software/${item.id}`}
                className="rounded-md border border-line px-3.5 py-2 text-[15px] transition-colors hover:border-ink"
              >
                {item.name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
