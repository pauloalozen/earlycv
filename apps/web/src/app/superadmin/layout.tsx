import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";

import { getRouteAccessRedirectPath } from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";

import { SuperadminSidebar } from "./_components/superadmin-sidebar";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
  },
  title: {
    default: "Superadmin | EarlyCV",
    template: "%s | Superadmin | EarlyCV",
  },
};

type SuperadminLayoutProps = {
  children: ReactNode;
};

export default async function SuperadminLayout({
  children,
}: SuperadminLayoutProps) {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/superadmin", user);

  if (redirectPath) {
    redirect(redirectPath);
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-stone-100 via-white to-slate-100 text-stone-900">
      <Suspense
        fallback={
          <div className="border-b border-slate-200 bg-white/90 px-5 py-4 lg:fixed lg:inset-y-0 lg:w-80 lg:border-b-0 lg:border-r" />
        }
      >
        <SuperadminSidebar />
      </Suspense>
      <div className="lg:pl-80">
        <div className="min-h-screen">{children}</div>
      </div>
    </div>
  );
}
