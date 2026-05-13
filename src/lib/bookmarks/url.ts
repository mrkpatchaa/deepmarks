/**
 * URL helpers shared across UI and tests (Task 3.1).
 *
 * SECURITY:
 *   - isSafeUrl ONLY allows http / https — no javascript:, data:, file:, etc.
 *   - domainInitial uses URL constructor for parsing — never string manipulation.
 */

/** Only http:// and https:// URLs are ever rendered as clickable links. */
export const SAFE_URL_RE = /^https?:\/\//i;

/**
 * Return the upper-cased first character of the URL's hostname.
 * Returns "?" for undefined / unparseable URLs.
 *
 * Example: `"https://github.com/..."` → `"G"`
 */
export function domainInitial(url: string | undefined): string {
    if (url === undefined || url === "") return "?";
    try {
        const hostname = new URL(url).hostname;
        const first = hostname.charAt(0);
        return first === "" ? "?" : first.toUpperCase();
    } catch {
        return "?";
    }
}

/**
 * Type-guard: true only when `url` is a non-empty http/https string.
 * Anything else (undefined, javascript:, data:, file:, ftp:, chrome:, …)
 * returns false and must never be rendered as an anchor href.
 */
export function isSafeUrl(url: string | undefined): url is string {
    return url !== undefined && SAFE_URL_RE.test(url);
}
