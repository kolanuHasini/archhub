import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";

// The outermost frame shared by every page: fonts, colours and the theme.
// The page furniture lives one level down:
//   app/(site)       the public home page, with its header and footer
//   app/(workspace)  the dashboard and tools, inside the sidebar shell
//   app/studio       the full-screen drawing studio

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
    default: "ArchHub — one workspace for architects",
    template: "%s — ArchHub",
  },
  description:
    "Plan a concept, draw accurate floor plans with layers, floors and curved walls, organise projects and learn your software. Free, in your browser.",
};

// Applies a saved light/dark choice before the page is painted, so there is
// no flash of the wrong theme.
const themeScript = `try{var t=localStorage.getItem("archhub.theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col font-sans text-[17px] leading-relaxed">
        {children}
      </body>
    </html>
  );
}
