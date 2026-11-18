"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import software from "@/content/software.json";
import { useProjects } from "@/lib/projects";

// ---------------------------------------------------------------------------
// The workspace frame: a sidebar on the left, a slim bar across the top with
// search, quick create and the theme switch, and the page in the middle.
// ---------------------------------------------------------------------------

type NavItem = { href: string; label: string; icon: string };

const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: "Workspace",
    items: [
      { href: "/dashboard", label: "Home", icon: "home" },
      { href: "/projects", label: "Projects", icon: "folder" },
    ],
  },
  {
    title: "Design",
    items: [
      { href: "/tools/concept-planner", label: "Concept", icon: "bulb" },
      { href: "/studio/plan", label: "Floor plans", icon: "plan" },
      { href: "/elevations", label: "Elevations", icon: "elevation" },
      { href: "/sections", label: "Sections", icon: "section" },
      { href: "/ai", label: "AI Studio", icon: "spark" },
    ],
  },
  {
    title: "Reference",
    items: [
      { href: "/software", label: "Software", icon: "grid" },
      { href: "/tools/scale-converter", label: "Scale converter", icon: "ruler" },
    ],
  },
];

// Planned areas, listed so the direction is clear, but not yet built.
const PLANNED = ["3D views", "Portfolio", "Templates"];

// Simple line icons, drawn on a 20 x 20 grid.
const ICONS: Record<string, string> = {
  home: "M3 9.5 10 3l7 6.5V17h-4.5v-5h-5v5H3Z",
  folder: "M2.5 5.5h5l1.5 2h8.5v8.5h-15Z",
  bulb: "M7.5 14.5h5M8 17h4M10 3a4.5 4.5 0 0 0-2.5 8.2v1.3h5v-1.3A4.5 4.5 0 0 0 10 3Z",
  plan: "M3 3h14v14H3ZM3 9h6M9 3v8M13 17v-5h4",
  elevation: "M2.5 17h15M4.5 17V7l5.5-4 5.5 4v10M8.5 17v-4h3v4M7 9.5h2M11 9.5h2",
  section: "M2.5 16.5h15M4 16.5v-9h12v9M4 11.5h12M8 7.5v-4M2.5 3.5h11",
  spark: "M10 2.5l1.8 5.7 5.7 1.8-5.7 1.8L10 17.5l-1.8-5.7L2.5 10l5.7-1.8Z",
  grid: "M3 3h6v6H3ZM11 3h6v6h-6ZM3 11h6v6H3ZM11 11h6v6h-6Z",
  ruler: "M2.5 13.5 13.5 2.5l4 4-11 11ZM6 10l1.5 1.5M8.5 7.5 10 9M11 5l1.5 1.5",
  search: "M8.5 3a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM12.5 12.5 17 17",
  plus: "M10 4v12M4 10h12",
  theme: "M10 2.5a7.5 7.5 0 1 0 0 15ZM10 2.5a7.5 7.5 0 0 1 0 15",
  menu: "M3 6h14M3 10h14M3 14h14",
  side: "M3 3.5h14v13H3ZM8 3.5v13",
};

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`h-[18px] w-[18px] shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

// Everything the search can jump to.
const SEARCH_ITEMS = [
  ...NAV.flatMap((group) =>
    group.items.map((item) => ({ ...item, kind: group.title })),
  ),
  ...software.map((app) => ({
    href: `/software/${app.id}`,
    label: app.name,
    icon: "grid",
    kind: "Software guide",
  })),
];

function toggleTheme() {
  const root = document.documentElement;
  const current =
    root.getAttribute("data-theme") ??
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try {
    window.localStorage.setItem("archhub.theme", next);
  } catch {
    // The choice simply will not be remembered.
  }
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { active, create } = useProjects();
  const [collapsed, setCollapsed] = useState(false); // narrow sidebar on desktop
  const [drawer, setDrawer] = useState(false); // sidebar open on a phone
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(0);
  const [creating, setCreating] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const results = SEARCH_ITEMS.filter((item) =>
    `${item.label} ${item.kind}`.toLowerCase().includes(query.trim().toLowerCase()),
  ).slice(0, 8);

  function openSearch() {
    setQuery("");
    setPicked(0);
    setSearching(true);
  }

  function go(href: string) {
    setSearching(false);
    setCreating(false);
    setDrawer(false);
    router.push(href);
  }

  // Ctrl+K (Cmd+K on a Mac) opens search from anywhere; Esc closes things.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      } else if (event.key === "Escape") {
        setSearching(false);
        setCreating(false);
        setDrawer(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (searching) searchRef.current?.focus();
  }, [searching]);

  function newProject() {
    const name = window.prompt("Name of the new project:");
    if (name === null) return;
    create(name);
    go("/dashboard");
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
        <Link href="/" className="font-mono text-base font-semibold tracking-tight">
          {collapsed ? (
            <span className="text-accent">A</span>
          ) : (
            <>
              Arch<span className="text-accent">Hub</span>
            </>
          )}
        </Link>
      </div>

      {!collapsed && (
        <Link
          href="/projects"
          onClick={() => setDrawer(false)}
          className="mx-3 mt-3 block rounded-md border border-line bg-paper px-3 py-2 transition-colors hover:border-ink"
        >
          <span className="annotation block text-[10px] text-muted">Current project</span>
          <span className="block truncate text-[15px] font-medium">{active.name}</span>
        </Link>
      )}

      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Workspace">
        {NAV.map((group) => (
          <div key={group.title} className="mb-4">
            {!collapsed && (
              <p className="annotation px-2 pb-1.5 text-[10px] text-muted">{group.title}</p>
            )}
            {group.items.map((item) => {
              const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setDrawer(false)}
                  title={collapsed ? item.label : undefined}
                  aria-current={current ? "page" : undefined}
                  className={`group relative mb-0.5 flex h-9 items-center gap-3 rounded-md px-2.5 text-[15px] transition-colors ${
                    current ? "bg-ink text-paper" : "text-ink hover:bg-line/60"
                  } ${collapsed ? "justify-center" : ""}`}
                >
                  <Icon name={item.icon} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}

        {!collapsed && (
          <div className="mb-4">
            <p className="annotation px-2 pb-1.5 text-[10px] text-muted">In progress</p>
            {PLANNED.map((label) => (
              <p
                key={label}
                className="flex h-8 items-center gap-3 px-2.5 text-[15px] text-muted/70"
              >
                <span className="ml-1.5 h-1.5 w-1.5 rounded-full border border-muted/60" />
                {label}
              </p>
            ))}
          </div>
        )}
      </nav>

      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="hidden h-11 shrink-0 items-center gap-3 border-t border-line px-4 text-sm text-muted transition-colors hover:text-ink lg:flex"
      >
        <Icon name="side" />
        {!collapsed && "Collapse"}
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full bg-paper">
      {/* Sidebar: fixed on wide screens */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 border-r border-line bg-surface transition-[width] duration-300 ease-out lg:block ${
          collapsed ? "w-[60px]" : "w-[232px]"
        }`}
      >
        {sidebar}
      </aside>

      {/* Sidebar: slides in on phones and tablets */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${drawer ? "" : "pointer-events-none"}`}
        aria-hidden={!drawer}
      >
        <div
          onClick={() => setDrawer(false)}
          className={`absolute inset-0 bg-ink/40 transition-opacity duration-300 ${
            drawer ? "opacity-100" : "opacity-0"
          }`}
        />
        <aside
          className={`absolute inset-y-0 left-0 w-[260px] border-r border-line bg-surface transition-transform duration-300 ease-out ${
            drawer ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {sidebar}
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-paper/90 px-3 backdrop-blur-md sm:px-6">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface lg:hidden"
          >
            <Icon name="menu" />
          </button>

          <button
            type="button"
            onClick={openSearch}
            className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-md border border-line bg-surface px-3 text-left text-[15px] text-muted transition-colors hover:border-ink sm:max-w-md"
          >
            <Icon name="search" />
            <span className="truncate">Search tools and software</span>
            <kbd className="ml-auto hidden rounded border border-line bg-paper px-1.5 font-mono text-[11px] sm:block">
              Ctrl K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <div className="relative">
              <button
                type="button"
                onClick={() => setCreating(!creating)}
                aria-expanded={creating}
                className="flex h-9 items-center gap-2 rounded-md bg-ink px-3 text-[15px] font-medium text-paper transition-colors hover:bg-accent hover:text-accent-ink"
              >
                <Icon name="plus" />
                <span className="hidden sm:inline">New</span>
              </button>
              {creating && (
                <div className="absolute right-0 top-11 w-60 overflow-hidden rounded-md border border-ink bg-paper shadow-[6px_6px_0_0_var(--line)]">
                  {[
                    { label: "New project", hint: "A fresh concept and plans", run: newProject },
                    { label: "Floor plan", hint: "Open the drawing studio", run: () => go("/studio/plan") },
                    { label: "Concept", hint: "Brief, site and sketch", run: () => go("/tools/concept-planner") },
                    { label: "Image prompt", hint: "For Midjourney and others", run: () => go("/ai") },
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={option.run}
                      className="block w-full border-b border-line px-3.5 py-2.5 text-left last:border-b-0 hover:bg-surface"
                    >
                      <span className="block text-[15px] font-medium">{option.label}</span>
                      <span className="block text-[13px] text-muted">{option.hint}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Switch between light and dark"
              title="Light / dark"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-line transition-colors hover:border-ink"
            >
              <Icon name="theme" />
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/* Search */}
      {searching && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/40 px-4 pt-[14vh]"
          onClick={() => setSearching(false)}
        >
          <div
            role="dialog"
            aria-label="Search"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-md border border-ink bg-paper shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Icon name="search" className="text-muted" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPicked(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setPicked(Math.min(picked + 1, results.length - 1));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setPicked(Math.max(picked - 1, 0));
                  } else if (event.key === "Enter" && results[picked]) {
                    go(results[picked].href);
                  }
                }}
                placeholder="Where do you want to go?"
                aria-label="Search"
                className="h-13 w-full bg-transparent py-3.5 text-[17px] outline-none placeholder:text-muted"
              />
            </div>
            <ul className="max-h-[50vh] overflow-y-auto py-1.5">
              {results.length === 0 && (
                <li className="px-4 py-6 text-center text-[15px] text-muted">
                  Nothing matches &ldquo;{query}&rdquo;.
                </li>
              )}
              {results.map((item, index) => (
                <li key={item.href}>
                  <button
                    type="button"
                    onMouseEnter={() => setPicked(index)}
                    onClick={() => go(item.href)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${
                      index === picked ? "bg-surface" : ""
                    }`}
                  >
                    <Icon name={item.icon} className="text-muted" />
                    <span className="flex-1 text-[15px]">{item.label}</span>
                    <span className="annotation text-[10px] text-muted">{item.kind}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-4 py-2 font-mono text-[11px] text-muted">
              ↑ ↓ to move · Enter to open · Esc to close
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
