import type { ReactNode } from "react";

import { EmailsSubNav } from "../_components/emails-subnav";

// Esta rota faz parte da aba única "Emails" do admin: o layout só acrescenta
// a sub-navegação acima da página (que continua como estava).
export default function EmailsAreaLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <EmailsSubNav />
      {children}
    </>
  );
}
