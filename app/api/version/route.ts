export const dynamic = "force-dynamic";

/** the version this deployment serves; open tabs compare it with the version they were loaded with */
export function GET() {
  return Response.json(
    { version: process.env.NEXT_PUBLIC_APP_VERSION, build: process.env.NEXT_PUBLIC_BUILD_ID },
    { headers: { "Cache-Control": "no-store" } },
  );
}
