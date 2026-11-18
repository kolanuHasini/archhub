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
    default: "ArchHub — a free toolkit for architecture students",
    template: "%s — ArchHub",
  },
  description:
    "Free studio tools, precedents, jury and portfolio help, and resources for architecture students.",
};

const navLinks = [
  { href: "/#studio-tools", label: "Tools" },
  { href: "/#precedents", label: "Precedents" },
  { href: "/#jury-portfolio", label: "Jury & Portfolio" },
  { href: "/#resources", label: "Resources" },
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
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-line bg-paper">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 sm:px-6">
            <Link
              href="/"
              className="font-mono text-lg font-semibold tracking-tight"
            >
              Arch<span className="text-accent">Hub</span>
            </Link>
            <nav className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="hover:text-accent"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6">
          {children}
        </main>

        <footer className="border-t border-line bg-paper">
          <div className="mx-auto w-full max-w-5xl px-4 py-6 font-mono text-xs text-muted sm:px-6">
            ArchHub · Free for every architecture student
          </div>
        </footer>
      </body>
    </html>
  );
}
