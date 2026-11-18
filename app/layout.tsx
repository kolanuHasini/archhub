import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/80 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
            <Link
              href="/"
              className="font-mono text-lg font-semibold tracking-tight"
            >
              Arch<span className="text-accent">Hub</span>
            </Link>
            <nav className="hidden items-center gap-1 rounded-full border border-line bg-surface/70 p-1 text-sm sm:flex">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-full px-4 py-1.5 text-muted transition-colors hover:bg-ink hover:text-paper"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <Link
              href="/studio/plan"
              className="group flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-accent hover:text-accent-ink"
            >
              Open studio
              <span
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
          </div>
        </header>

        <main className="w-full flex-1">{children}</main>

        <footer className="border-t border-line">
          <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-8">
            <p
              aria-hidden="true"
              className="select-none font-mono text-[18vw] font-semibold leading-none tracking-tighter text-ink/[0.07] lg:text-[13rem]"
            >
              ArchHub
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-sm text-muted">
              <p>Free for every architect and student.</p>
              <nav className="flex flex-wrap gap-x-6 gap-y-1">
                <Link href="/tools/concept-planner" className="hover:text-accent">
                  Concept Planner
                </Link>
                <Link href="/studio/plan" className="hover:text-accent">
                  Floor Plan Studio
                </Link>
                <Link href="/tools/scale-converter" className="hover:text-accent">
                  Scale Converter
                </Link>
              </nav>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
