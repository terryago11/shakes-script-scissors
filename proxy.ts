import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

// Paths that don't require auth
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/me",
  "/view",
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/favicon")) return true;
  // /view uses ?share= param — the page itself is public
  if (pathname.startsWith("/view")) return true;
  // Play data API — needed by the public /view page to render the script
  if (pathname.startsWith("/api/play/")) return true;
  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  // iron-session v8 in middleware: pass request + a mutable response
  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(request, res, {
    password: process.env.SESSION_SECRET!,
    cookieName: "sss_session",
  });

  if (!session.isLoggedIn) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files that Next.js handles itself.
     * We still want to check auth on pages and API routes.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
