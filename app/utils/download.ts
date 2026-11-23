// Hand a generated text file to the user. Touch devices (incl. the iOS home-screen app, where
// download links are unreliable) get the share sheet → Save to Files / Calendar / Mail…;
// everything else gets a regular download.
export async function saveFile(name: string, text: string, mime: string): Promise<void> {
  const file = new File([text], name, { type: mime });
  const touch = matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return; // user closed the sheet
      // anything else (e.g. no user activation): fall back to a download
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
