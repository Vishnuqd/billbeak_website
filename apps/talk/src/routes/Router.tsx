/**
 * Minimal URL router.
 *
 * The island is served under /talk, and the *in-app* navigation is driven by the
 * engine's state machine (see TalkPage) rather than the URL. This router only
 * decides entry: the conversation for /talk (and its resume deep-links), a 404
 * otherwise. Kept dependency-free on purpose — the routing surface is tiny.
 */

import { TalkPage } from "@/pages/TalkPage.tsx";
import { NotFoundPage } from "@/pages/NotFoundPage.tsx";

function normalize(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export function Router() {
  const path = normalize(window.location.pathname);
  // Everything under /talk (and the dev root) is the conversation.
  if (path === "/" || path === "/talk" || path.startsWith("/talk/")) {
    return <TalkPage />;
  }
  return <NotFoundPage />;
}
