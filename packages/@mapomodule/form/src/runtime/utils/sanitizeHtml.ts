// Protocol allowlist for user-entered links. Without this,
// `<a href="javascript:...">` would be accepted, leading to XSS when content is
// rendered elsewhere (preview, server-side, other editors).
export const ALLOWED_LINK_PROTOCOLS = ["http", "https", "mailto", "tel"];

/**
 * Whether a link or image URL is safe to keep: relative, or with a protocol in
 * {@link ALLOWED_LINK_PROTOCOLS}.
 */
export function isSafeUrl(url: string): boolean {
  try {
    // URL relativi (es. "/page") non hanno protocol — li accettiamo.
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return true;
    const proto = new URL(url, "https://placeholder.local").protocol
      .replace(":", "")
      .toLowerCase();
    return ALLOWED_LINK_PROTOCOLS.includes(proto);
  } catch {
    return false;
  }
}

/**
 * Sanitise incoming HTML from external sources (initial set, server sync, the
 * source view) by removing <script>, inline handlers (on*), and href:
 * javascript:. This is intentionally minimal (no DOMPurify) to avoid a heavy
 * dependency: it covers the most common vectors; for truly untrusted HTML the
 * consumer should use DOMPurify at the app level. Without a DOM (SSR) the HTML
 * is returned as it is.
 */
export function sanitizeHtml(html: string): string {
  if (typeof window === "undefined" || !html) return html;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const walker = document.createTreeWalker(
    tpl.content,
    NodeFilter.SHOW_ELEMENT,
  );
  const toRemove: Element[] = [];
  let node = walker.nextNode() as Element | null;
  while (node) {
    if (node.tagName === "SCRIPT" || node.tagName === "STYLE") {
      toRemove.push(node);
    } else {
      for (const attr of Array.from(node.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on")) node.removeAttribute(attr.name);
        if (
          (name === "href" || name === "src" || name === "xlink:href") &&
          !isSafeUrl(attr.value)
        ) {
          node.removeAttribute(attr.name);
        }
      }
    }
    node = walker.nextNode() as Element | null;
  }
  toRemove.forEach((el) => el.remove());
  return tpl.innerHTML;
}
