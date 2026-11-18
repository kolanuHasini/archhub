import { downloadBlob } from "@/lib/download";

/**
 * Saves a drawing that is on the page as an SVG file, or as a PNG picture.
 * `width` and `height` are the drawing's own size (its viewBox).
 */
export function exportSvgElement(
  svg: SVGSVGElement,
  width: number,
  height: number,
  name: string,
  kind: "png" | "svg",
) {
  const pixels = 2600 / Math.max(width, height);
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.querySelectorAll("[data-export='skip']").forEach((node) => node.remove());
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(Math.round(width * pixels)));
  copy.setAttribute("height", String(Math.round(height * pixels)));
  const source = new XMLSerializer().serializeToString(copy);
  if (kind === "svg") {
    downloadBlob(new Blob([source], { type: "image/svg+xml" }), `${name}.svg`);
    return;
  }
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * pixels);
    canvas.height = Math.round(height * pixels);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${name}.png`);
    }, "image/png");
  };
  image.onerror = () =>
    window.alert("Sorry, the image could not be created in this browser.");
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}
