/**
 * Small helpers for reading received email, shared by every inbound email adapter
 * (SendGrid Inbound Parse, Gmail polling).
 */

/** "<a@b> <c@d>" -> ["a@b", "c@d"]. */
export function idsIn(value: string): string[] {
  return [...value.matchAll(/<([^<>\s]+)>/g)].map((m) => m[1] ?? '').filter((id) => id !== '');
}

/** Plain addresses in a header like `"Name" <a@b.com>, c@d.com`, lower-cased. */
export function addressesIn(value: string): string[] {
  return [...value.matchAll(/[^\s<>,;"']+@[^\s<>,;"']+/g)].map((m) => m[0].toLowerCase());
}

/** Rough HTML to plain text, for emails that have no text part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
