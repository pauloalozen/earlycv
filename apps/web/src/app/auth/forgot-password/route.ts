import { forgotPassword } from "@/lib/auth-api";

export async function POST(request: Request) {
  try {
    const { email } = (await request.json()) as { email?: string };
    if (!email) {
      return Response.json({ error: "Email obrigatório." }, { status: 400 });
    }
    await forgotPassword(email);
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Não foi possível enviar o email. Tente novamente." },
      { status: 500 },
    );
  }
}
