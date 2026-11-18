import type { Metadata } from "next";
import Link from "next/link";
import software from "@/content/software.json";

export const metadata: Metadata = {
  title: "Software guides",
  description:
    "What each architecture program is best for, its key shortcuts, and how it works with ArchHub.",
};

// The list comes from content/software.json. Add a program there and it
// appears here, and gets its own page, automatically.

export default function SoftwarePage() {
  const groups = [...new Set(software.map((app) => app.group))];
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <p className="annotation text-accent">{software.length} programs</p>
      <h1 className="display mt-2 text-4xl sm:text-6xl">Software guides</h1>
      <p className="mt-3 max-w-2xl text-muted">
        A short, practical guide to each program architects use: what it is best for, the
        shortcuts worth learning first, and how it fits with your work here.
      </p>

      {groups.map((group) => (
        <section key={group} className="mt-12">
          <h2 className="annotation border-b border-ink pb-2 text-muted">{group}</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {software
              .filter((app) => app.group === group)
              .map((app) => (
                <Link
                  key={app.id}
                  href={`/software/${app.id}`}
                  className="crop group flex flex-col rounded-md border border-line bg-paper p-5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="display text-3xl">{app.name}</h3>
                    <span className="text-[13px] text-muted">{app.maker}</span>
                  </div>
                  <p className="mt-2 flex-1 text-[15px] leading-relaxed text-muted">
                    {app.summary}
                  </p>
                  <p className="mt-4 flex items-center justify-between text-[13px] text-muted">
                    <span>
                      {app.shortcuts.length > 0
                        ? `${app.shortcuts.length} shortcuts`
                        : `${app.tips.length} tips`}
                    </span>
                    <span className="transition-transform group-hover:translate-x-1">→</span>
                  </p>
                </Link>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
