import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { getRouteAccessRedirectPath } from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";

import { AdminTopbar } from "./_components/admin-topbar";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
  },
  title: "Admin | EarlyCV",
};

type AdminLayoutProps = {
  children: ReactNode;
};

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/admin", user);

  if (redirectPath) {
    notFound();
  }

  const userInitial = user?.name?.[0] ?? user?.email?.[0] ?? "A";
  const userName = user?.name?.split(" ")[0] ?? "admin";

  return (
    <div
      className="min-h-screen"
      style={{ background: "#f0eee9", color: "#2a2620" }}
    >
      <AdminTopbar userInitial={userInitial} userName={userName} />
      <div className="min-h-screen">{children}</div>
    </div>
  );
}
