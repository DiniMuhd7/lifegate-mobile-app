/**
 * sanitize.ts — Output/input sanitization utilities
 *
 * STRIDE — Tampering & Information Disclosure:
 * User-generated content (chat messages, profile fields, notes) must be
 * sanitised before rendering or storing to prevent XSS, script injection, and
 * unintended data leakage.
 */

/**
 * Strip all HTML tags and dangerous patterns from a user-supplied string.
 * Use this before rendering any user-generated text in a UI component.
 */
export function sanitizeText(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return (
    input
      // Remove <script>…</script> blocks
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // Remove javascript: and vbscript: URIs
      .replace(/(?:javascript|vbscript|data)\s*:/gi, '')
      // Remove inline event handlers (onclick=, onerror=, …)
      .replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
      // Strip remaining HTML tags
      .replace(/<[^>]*>/g, '')
      .trim()
  );
}

/**
 * Validate and sanitize a URL.
 * Returns an empty string if the URL uses a dangerous scheme.
 *
 * STRIDE — Tampering: prevents javascript:/data: URI injection in links.
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:text/html')
  ) {
    return '';
  }
  return trimmed;
}

/**
 * Truncate a string to a maximum byte length.
 * Use before persisting or transmitting user input to prevent DoS via
 * oversized payloads at the application layer.
 */
export function truncate(input: string, maxLength = 1000): string {
  if (!input) return '';
  return input.length > maxLength ? input.slice(0, maxLength) : input;
}

/**
 * Sanitize and truncate in one step — the most common usage.
 */
export function sanitize(input: string, maxLength = 1000): string {
  return truncate(sanitizeText(input), maxLength);
}
