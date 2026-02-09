import { NextResponse, type NextRequest } from "next/server";

// rotte che NON devono essere protette
const PUBLIC_PATHS = ["/login", "/_next", "/favicon.ico", "/logo.svg", "/plans"];

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p))) return true;
  // file statici (png, jpg, svg, css, js...)
  if (/\.(.*)$/.test(pathname)) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // lascia passare roba pubblica
  if (isPublic(pathname)) return NextResponse.next();

  // Supabase auth cookie: sb-<project-ref>-auth-token (varia, ma comincia con "sb-")
  const hasAuthCookie = req.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));

  // Se apre home "/" e non è loggato => login
  if (pathname === "/" && !hasAuthCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Se non è loggato e prova ad aprire pagine protette => login
  if (!hasAuthCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    // opzionale: tieni traccia dove voleva andare
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Se è loggato e apre "/" => events
  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/events";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
