"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AT } from "@/app/admin/_components/admin-primitives";
import { searchUsersToTrackAction, trackAlertUserAction } from "../actions";

type SearchResult = { id: string; name: string; email: string };

// Único client component da página — precisa de busca incremental (não dá
// pra listar todos os usuários num <select>) e de estado local pro
// dropdown de resultados. Ao selecionar, chama trackAlertUserAction
// direto (sem <form>) — o próprio redirect() dentro dela navega/atualiza
// a página com o resultado.
export function TrackUserCombobox({ redirectPath }: { redirectPath: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      searchUsersToTrackAction(query).then((users) => {
        setResults(users);
        setOpen(true);
      });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleSelect(user: SearchResult) {
    setOpen(false);
    setQuery("");
    const formData = new FormData();
    formData.set("userId", user.id);
    formData.set("redirectPath", redirectPath);
    startTransition(() => {
      trackAlertUserAction(formData);
    });
  }

  return (
    <div style={{ position: "relative", display: "flex", gap: 8 }}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Buscar usuário pra incluir na lista…"
        disabled={isPending}
        style={{
          height: 32,
          padding: "0 12px",
          borderRadius: 6,
          border: `1px solid ${AT.border}`,
          background: "#fff",
          fontSize: 12.5,
          minWidth: 260,
        }}
      />
      {open && results.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 36,
            left: 0,
            right: 0,
            background: "#fff",
            border: `1px solid ${AT.border}`,
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(10,10,10,0.08)",
            zIndex: 10,
            overflow: "hidden",
          }}
        >
          {results.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => handleSelect(user)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: 12.5,
              }}
            >
              <span style={{ color: AT.ink2 }}>{user.name}</span>{" "}
              <span
                style={{
                  color: AT.muted,
                  fontFamily: '"Geist Mono", monospace',
                }}
              >
                {user.email}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
