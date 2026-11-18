// Reads a picture the visitor chose and shrinks it, so that saving it in the
// browser stays fast and does not fill up the storage space.
export function loadPhoto(
  file: File,
  maxPixels: number,
): Promise<{ href: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const shrink = Math.min(
        1,
        maxPixels / Math.max(image.naturalWidth, image.naturalHeight),
      );
      const width = Math.max(1, Math.round(image.naturalWidth * shrink));
      const height = Math.max(1, Math.round(image.naturalHeight * shrink));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return reject(new Error("no canvas"));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      resolve({ href: canvas.toDataURL("image/jpeg", 0.78), width, height });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("not an image"));
    };
    image.src = url;
  });
}
