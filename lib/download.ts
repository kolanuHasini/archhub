// Hands a file to the visitor's browser to save.
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Turns "Riverside Library!" into "riverside-library" for file names.
export function safeFileName(name: string, fallback = "project"): string {
  const cleaned = name
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return cleaned || fallback;
}
