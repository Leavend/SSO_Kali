/**
 * Suppress the admin panel loading skeleton on this status page.
 * Error/denial status pages should NOT flash "Loading Admin Panel..."
 * before showing the real error content.
 */
export default function InvalidCredentialsLoading() {
  return null;
}
