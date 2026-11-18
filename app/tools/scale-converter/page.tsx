import type { Metadata } from "next";
import Link from "next/link";
import ScaleConverter from "@/components/ScaleConverter";
import scales from "@/content/scales.json";

export const metadata: Metadata = {
  title: "Scale Converter",
  description:
    "Convert between real size and drawing size at 1:50, 1:100, 1:200, 1:500 or any custom scale, in mm, m or ft.",
};

export default function ScaleConverterPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-8 sm:py-14">
      <Link
        href="/#studio-tools"
        className="font-mono text-xs text-muted hover:text-accent"
      >
        ← Studio Tools
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
        Scale Converter
      </h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-muted">
        Type a real size to see how long to draw it, or type a drawing size to
        see how big it is in real life.
      </p>
      <div className="mt-8">
        <ScaleConverter presets={scales.presets} />
      </div>
    </div>
  );
}
