export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { status: "ok", service: "beeexy-frontend", timestamp: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
