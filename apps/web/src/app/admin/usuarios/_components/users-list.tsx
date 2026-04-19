"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { buttonVariants } from "@/components/ui";

type UserRow = {
  id: string;
  name: string;
  email: string;
  planType: string;
  completenessStatus: { label: string; tone: string };
  detailHref: string;
  masterResumeHref: string | null;
};

type UsersListProps = {
  users: UserRow[];
  deleteAction: (userId: string) => Promise<void>;
};

export function UsersList({ users, deleteAction }: UsersListProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const userToDelete = users.find((u) => u.id === pendingDeleteId) ?? null;

  function handleDeleteConfirm() {
    if (!pendingDeleteId) return;
    startTransition(async () => {
      await deleteAction(pendingDeleteId);
      setPendingDeleteId(null);
    });
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50 text-left">
              <th className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-stone-500">
                Usuario
              </th>
              <th className="hidden px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-stone-500 md:table-cell">
                Plano
              </th>
              <th className="hidden px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-stone-500 lg:table-cell">
                Status
              </th>
              <th className="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-stone-500">
                Acoes
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-stone-50/60">
                <td className="px-4 py-3">
                  <p className="font-semibold text-stone-950">{user.name}</p>
                  <p className="text-xs text-stone-500">{user.email}</p>
                </td>
                <td className="hidden px-4 py-3 text-stone-600 md:table-cell">
                  {user.planType}
                </td>
                <td className="hidden px-4 py-3 lg:table-cell">
                  <span className="inline-block rounded-full bg-stone-100 px-2 py-0.5 font-mono text-[11px] text-stone-600">
                    {user.completenessStatus.label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                      href={user.detailHref}
                    >
                      Abrir usuario
                    </Link>
                    {user.masterResumeHref ? (
                      <Link
                        className={buttonVariants({
                          size: "sm",
                          variant: "outline",
                        })}
                        href={user.masterResumeHref}
                      >
                        Ver CV master
                      </Link>
                    ) : null}
                    <button
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-red-300 bg-white px-3.5 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-red-700 transition-colors hover:bg-red-50 disabled:pointer-events-none disabled:opacity-50"
                      onClick={() => setPendingDeleteId(user.id)}
                      type="button"
                    >
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {userToDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold tracking-tight text-stone-950">
              Confirmar exclusao
            </h2>
            <p className="mt-2 text-sm text-stone-600">
              Voce esta prestes a excluir permanentemente a conta de{" "}
              <strong className="text-stone-900">{userToDelete.name}</strong> (
              {userToDelete.email}). Todos os dados vinculados — perfil,
              curriculos, adaptacoes e historico — serao removidos e nao poderao
              ser recuperados.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                className={buttonVariants({ variant: "outline" })}
                disabled={isPending}
                onClick={() => setPendingDeleteId(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="inline-flex h-11 items-center justify-center rounded-lg border border-red-300 bg-red-600 px-5 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-white transition-colors hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50"
                disabled={isPending}
                onClick={handleDeleteConfirm}
                type="button"
              >
                {isPending ? "Excluindo..." : "Excluir permanentemente"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
