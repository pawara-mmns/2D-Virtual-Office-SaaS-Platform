import type { NextRequest } from "next/server";
import { NextResponse } from 'next/server';
import { updateSession } from "@/lib/supabase/proxy";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/superadmin') || request.nextUrl.pathname.startsWith('/api/superadmin')) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    "/login", "/register", "/forgot-password", "/reset-password",
    "/auth/:path*", "/dashboard/:path*",
    "/organizations/:path*", "/workspace/:path*",
    "/invite/:path*",
    "/api/v1/voice/:path*",
    '/superadmin/:path*', '/api/superadmin/:path*',
  ],
};
