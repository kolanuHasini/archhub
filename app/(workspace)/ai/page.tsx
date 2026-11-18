import type { Metadata } from "next";
import PromptBuilder from "@/components/ai/PromptBuilder";

export const metadata: Metadata = {
  title: "AI Studio",
  description:
    "Build clear, well-structured prompts for Midjourney, Stable Diffusion and other AI image tools.",
};

export default function AiStudioPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <p className="annotation text-accent">AI Studio</p>
      <h1 className="display mt-2 text-4xl sm:text-6xl">Prompt builder</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Choose what the image should show and the builder writes the prompt, in the format each
        tool expects. Copy it into Midjourney, Stable Diffusion or ChatGPT.
      </p>
      <div className="mt-8">
        <PromptBuilder />
      </div>
    </div>
  );
}
