"use client";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

export function GoogleAuthButton({
  href,
  next,
}: {
  href: string;
  next: string;
}) {
  return (
    <a
      href={href}
      onClick={() => {
        if (next) {
          try {
            // biome-ignore lint/suspicious/noDocumentCookie: setting a short-lived redirect hint cookie before OAuth
            document.cookie = `post_auth_next=${encodeURIComponent(next)}; path=/; max-age=300; samesite=lax`;
          } catch {}
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        width: "100%",
        background: "#fff",
        border: "1px solid #d8d6ce",
        borderRadius: 10,
        padding: "12px",
        fontSize: 13.5,
        fontWeight: 500,
        color: "#0a0a0a",
        textDecoration: "none",
        marginBottom: 22,
        fontFamily: GEIST,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
      className="entrar-google-btn"
    >
      {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
      <svg aria-hidden width="16" height="16" viewBox="0 0 18 18">
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        />
        <path
          fill="#FBBC05"
          d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        />
      </svg>
      Continuar com Google
    </a>
  );
}
