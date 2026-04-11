import type { AppSessionUser } from "./app-session";

export type AuthApiSession = {
  accessToken: string;
  refreshToken: string;
  user: AppSessionUser;
};

export function getAuthApiBaseUrl(baseUrl?: string) {
  const configuredBaseUrl =
    baseUrl ??
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";

  return configuredBaseUrl.endsWith("/api")
    ? configuredBaseUrl
    : `${configuredBaseUrl}/api`;
}

export function getAuthErrorMessage(status: number, message: string) {
  if (status === 401 && message.includes("invalid credentials")) {
    return "Email ou senha invalidos.";
  }

  if (status === 400 && message.includes("email must be an email")) {
    return "Informe um email valido.";
  }

  if (status === 409 && message.includes("email is already registered")) {
    return "Ja existe uma conta com esse email.";
  }

  if (
    status === 400 &&
    message.includes("verification code is invalid or expired")
  ) {
    return "Codigo invalido ou expirado.";
  }

  if (status === 400 && message.includes("email is already verified")) {
    return "Este email ja foi validado.";
  }

  return "Nao foi possivel concluir a solicitacao agora. Tente novamente.";
}

async function authRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${getAuthApiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const rawMessage = await response.text();
    let message = rawMessage;

    try {
      const parsed = JSON.parse(rawMessage) as {
        message?: string | string[];
      };

      if (Array.isArray(parsed.message)) {
        message = parsed.message.join(" | ");
      } else if (typeof parsed.message === "string") {
        message = parsed.message;
      }
    } catch {}

    throw new Error(JSON.stringify({ message, status: response.status }));
  }

  return (await response.json()) as T;
}

export async function loginWithPassword(email: string, password: string) {
  return authRequest<AuthApiSession>("/auth/login", {
    body: JSON.stringify({ email, password }),
    method: "POST",
  });
}

export async function registerWithPassword(
  email: string,
  password: string,
  name: string,
) {
  return authRequest<AuthApiSession>("/auth/register", {
    body: JSON.stringify({ email, name, password }),
    method: "POST",
  });
}

export async function verifyEmailCode(accessToken: string, code: string) {
  return authRequest<AppSessionUser>("/auth/verify-email", {
    body: JSON.stringify({ code }),
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
  });
}

export async function resendVerificationCode(accessToken: string) {
  return authRequest<{ ok: true }>("/auth/resend-verification-code", {
    body: JSON.stringify({}),
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
  });
}

export async function logoutWithRefreshToken(refreshToken: string) {
  return authRequest<{ ok: true }>("/auth/logout", {
    body: JSON.stringify({ refreshToken }),
    method: "POST",
  });
}

export async function forgotPassword(email: string) {
  return authRequest<{ ok: true }>("/auth/forgot-password", {
    body: JSON.stringify({ email }),
    method: "POST",
  });
}

export async function resetPassword(token: string, newPassword: string) {
  return authRequest<{ ok: true }>("/auth/reset-password", {
    body: JSON.stringify({ token, newPassword }),
    method: "POST",
  });
}

export function parseAuthApiError(error: unknown) {
  if (!(error instanceof Error)) {
    return {
      message: getAuthErrorMessage(500, "unknown"),
      status: 500,
    };
  }

  try {
    const parsed = JSON.parse(error.message) as {
      message?: string;
      status?: number;
    };

    return {
      message: getAuthErrorMessage(parsed.status ?? 500, parsed.message ?? ""),
      status: parsed.status ?? 500,
    };
  } catch {
    return {
      message: getAuthErrorMessage(500, error.message),
      status: 500,
    };
  }
}
