// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTagMock = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

import { POST } from "./route";

function call(body: unknown, secret: string | null = "s3cret") {
  return POST(
    new Request("http://localhost/api/revalidate/job", {
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-revalidate-secret": secret } : {}),
      },
      method: "POST",
    }),
  );
}

describe("POST /api/revalidate/job", () => {
  beforeEach(() => {
    process.env.RADAR_REVALIDATE_SECRET = "s3cret";
    revalidateTagMock.mockReset();
  });
  afterEach(() => {
    delete process.env.RADAR_REVALIDATE_SECRET;
  });

  it("fica desligado (503) sem segredo configurado", async () => {
    delete process.env.RADAR_REVALIDATE_SECRET;
    expect((await call({ slug: "a", reason: "updated" })).status).toBe(503);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it("recusa segredo ausente ou errado (401)", async () => {
    expect((await call({ slug: "a", reason: "updated" }, null)).status).toBe(
      401,
    );
    expect(
      (await call({ slug: "a", reason: "updated" }, "errado")).status,
    ).toBe(401);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it("valida corpo, slug e motivo (400)", async () => {
    expect((await call("{nao-json")).status).toBe(400);
    expect((await call({ slug: "../x", reason: "updated" })).status).toBe(400);
    expect((await call({ slug: "a", reason: "outro" })).status).toBe(400);
    expect((await call({ reason: "updated" })).status).toBe(400);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it("atualização comum usa stale-while-revalidate ('max')", async () => {
    const response = await call({ slug: "vaga-x", reason: "updated" });

    expect(response.status).toBe(200);
    expect(revalidateTagMock).toHaveBeenCalledWith("job:vaga-x", "max");
  });

  it("inativação e publicação expiram imediatamente ({ expire: 0 }), nunca 'max'", async () => {
    await call({ slug: "vaga-x", reason: "inactivated" });
    await call({ slug: "vaga-y", reason: "published" });

    expect(revalidateTagMock).toHaveBeenNthCalledWith(1, "job:vaga-x", {
      expire: 0,
    });
    expect(revalidateTagMock).toHaveBeenNthCalledWith(2, "job:vaga-y", {
      expire: 0,
    });
  });
});
