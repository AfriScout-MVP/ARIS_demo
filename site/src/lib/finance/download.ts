/** Hands the browser a file built in the page (a CSV of what is on screen). */
export function downloadText(filename: string, text: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/[^\w.-]+/g, "-");
  document.body.appendChild(a);
  a.click();
  a.remove();
  // let the download start before the URL is released
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
