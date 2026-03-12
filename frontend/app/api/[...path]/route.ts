const BACKEND = "http://localhost:8000";
const TIMEOUT_MS = 120_000; // 2 min for timeline generation

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path.join("/");
  const url = `${BACKEND}/api/${pathStr}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path.join("/");
  const url = `${BACKEND}/api/${pathStr}`;
  const body = await request.text();
  const res = await fetch(url, {
    method: "POST",
    headers: request.headers.get("Content-Type")
      ? { "Content-Type": request.headers.get("Content-Type")! }
      : undefined,
    body: body || undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const resText = await res.text();
  return new Response(resText, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
  });
}
