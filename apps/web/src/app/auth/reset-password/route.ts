import { resetPassword } from "@/lib/auth-api";
import { validateSignupPassword } from "@/lib/password-rules";

export async function POST(request: Request) {
  try {
    const { token, newPassword } = (await request.json()) as {
      token?: string;
      newPassword?: string;
    };

    if (!token || !newPassword) {
      return Response.json(
        { error: "Token e nova senha são obrigatórios." },
        { status: 400 },
      );
    }

    if (!validateSignupPassword(newPassword)) {
      return Response.json(
        {
          error:
            "A senha precisa ter no mínimo 8 caracteres, uma letra maiúscula e um número.",
        },
        { status: 400 },
      );
    }

    await resetPassword(token, newPassword);
    return Response.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Link inválido ou expirado.";
    return Response.json({ error: message }, { status: 400 });
  }
}
