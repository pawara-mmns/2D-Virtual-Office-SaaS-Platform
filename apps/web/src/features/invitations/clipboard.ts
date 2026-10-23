export async function copyInvitationLink(url: string, clipboard: Pick<Clipboard, "writeText"> | undefined) {
  if (!clipboard) return false;
  try { await clipboard.writeText(url); return true; }
  catch { return false; }
}
