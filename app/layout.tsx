import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The serif used for headlines.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: {
    default: "ArchHub — a free design studio for architects and students",
    template: "%s — ArchHub",
  },
  description:
    "Plan a concept, draw accurate floor plans with layers, floors and curved walls, and build towards a portfolio. Free, in your browser.",
};

const navLinks = [
  { href: "/#flow", label: "Workflow" },
  { href: "/#studio-tools", label: "Tools" },
  { href: "/#library", label: "Library" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans text-[17px] leading-relaxed">
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
                href="/studio/plan"
                className="flex items-center gap-2 border-x border-ink bg-ink px-6 font-medium text-paper transition-colors hover:bg-accent hover:text-accent-ink"
              >
                Open studio
                <span aria-hidden="true">→</span>
              </Link>
            </nav>
            <Link
              href="/studio/plan"
              className="my-2.5 flex items-center bg-ink px-4 text-sm font-medium text-paper sm:hidden"
            >
              Open studio →
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
                A free design studio for architects and students. Your work
                stays in your own browser until you save or share it.
              </p>
            </div>
            <div>
              <p className="annotation text-muted">Studio</p>
              <ul className="mt-3 space-y-1.5 text-[15px]">
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
                <li>
                  <Link href="/tools/scale-converter" className="hover:text-accent">
                    Scale Converter
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="annotation text-muted">On this site</p>
              <ul className="mt-3 space-y-1.5 text-[15px]">
                {navLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="hover:text-accent">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
