import Link from "next/link";

// The header and footer of the public home page.

const navLinks = [
  { href: "/#flow", label: "Workflow" },
  { href: "/#studio-tools", label: "Tools" },
  { href: "/software", label: "Software" },
];

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-ink bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-stretch justify-between px-4 sm:px-8">
          <Link
            href="/"
            className="flex items-center py-3.5 font-mono text-lg font-semibold tracking-tight"
          >
            Arch<span className="text-accent">Hub</span>
          </Link>
          <nav className="hidden items-stretch text-[15px] sm:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center border-l border-line px-6 transition-colors hover:bg-ink hover:text-paper"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/dashboard"
              className="flex items-center gap-2 border-x border-ink bg-ink px-6 font-medium text-paper transition-colors hover:bg-accent hover:text-accent-ink"
            >
              Open workspace
              <span aria-hidden="true">→</span>
            </Link>
          </nav>
          <Link
            href="/dashboard"
            className="my-2.5 flex items-center bg-ink px-4 text-sm font-medium text-paper sm:hidden"
          >
            Open workspace →
          </Link>
        </div>
      </header>

      <main className="w-full flex-1">{children}</main>

      <footer className="border-t border-ink">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:grid-cols-[1.4fr_1fr_1fr] sm:px-8">
          <div>
            <p className="font-mono text-lg font-semibold tracking-tight">
              Arch<span className="text-accent">Hub</span>
            </p>
            <p className="mt-3 max-w-sm text-[15px] text-muted">
              One workspace for architects and students. Your work stays in
              your own browser until you save or share it.
            </p>
          </div>
          <div>
            <p className="annotation text-muted">Workspace</p>
            <ul className="mt-3 space-y-1.5 text-[15px]">
              <li>
                <Link href="/dashboard" className="hover:text-accent">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link href="/tools/concept-planner" className="hover:text-accent">
                  Concept Planner
                </Link>
              </li>
              <li>
                <Link href="/studio/plan" className="hover:text-accent">
                  Floor Plan Studio
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="annotation text-muted">Learn</p>
            <ul className="mt-3 space-y-1.5 text-[15px]">
              <li>
                <Link href="/software" className="hover:text-accent">
                  Software guides
                </Link>
              </li>
              <li>
                <Link href="/ai" className="hover:text-accent">
                  Prompt builder
                </Link>
              </li>
              <li>
                <Link href="/tools/scale-converter" className="hover:text-accent">
                  Scale Converter
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </footer>
    </>
  );
}
