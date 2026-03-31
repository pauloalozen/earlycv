import type { Metadata } from "next";
import { type ReactNode, Suspense } from "react";

import { AdminSidebar } from "./_components/admin-sidebar";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
  },
  title: {
    default: "Admin | EarlyCV",
    template: "%s | Admin | EarlyCV",
  },
};

type AdminLayoutProps = {
  children: ReactNode;
};

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <Suspense
        fallback={
          <div className="border-b border-stone-200 bg-white px-5 py-4 lg:fixed lg:inset-y-0 lg:w-72 lg:border-b-0 lg:border-r" />
        }
      >
        <AdminSidebar />
      </Suspense>
      <div className="lg:pl-72">
        <div className="min-h-screen">{children}</div>
      </div>
    </div>
  );
}
