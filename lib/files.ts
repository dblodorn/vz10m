// Saving bytes as a file from the page. Browser-only.

export function download(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A .syx file name from a voice or bank name. */
export const fileName = (name: string): string => (name.trim() || "VZ").replace(/[^\w -]/g, "").replace(/\s+/g, "-") + ".syx";
