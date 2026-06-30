import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return base.endsWith("/api") ? base : `${base}/api`;
}

export async function POST(req: Request) {
  const token = await getBackofficeSessionToken();
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as Blob | null;
  const fileName = (formData.get("fileName") as string | null) ?? "cv.pdf";

  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.append("file", file, fileName);

  const res = await fetch(`${getApiBaseUrl()}/admin/cv-benchmark/parse`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: upstream,
  });

  const data = await res.json();
  return Response.json(data, { status: res.status });
}
