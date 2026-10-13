import Link from "next/link";

import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminPageWrap,
  AdminPagination,
  AdminTable,
  AdminTd,
  AdminTh,
  AT,
} from "@/app/admin/_components/admin-primitives";
import { AdminShellHeader } from "@/app/admin/_components/admin-shell-header";
import { AdminTokenState } from "@/app/admin/_components/admin-token-state";
import { listPendingReviewJobs } from "@/lib/admin-job-review-api";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { approveReviewJobAction, rejectReviewJobAction } from "./actions";

export const metadata = buildAdminMetadata("Vagas em revisão");

const PAGE_SIZE = 20;

function formatLocation(job: {
  locationText: string;
  city: string | null;
  state: string | null;
  country: string | null;
}) {
  const parts = [job.city, job.state, job.country].filter(Boolean).join(", ");
  return parts ? `${job.locationText} (${parts})` : job.locationText;
}

type PageProps = {
  searchParams: Promise<{ page?: string }>;
};

export default async function AdminVagasEmRevisaoPage({
  searchParams,
}: PageProps) {
  const token = await getBackofficeSessionToken();
  if (!token) {
    const state = buildAdminStateModel(
      "missing-token",
      "/admin/vagas-em-revisao",
    );
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const { page } = await searchParams;
  const pageNum = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);
  const data = await listPendingReviewJobs(pageNum, PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <AdminPageWrap>
      <AdminShellHeader
        eyebrow="Radar"
        title="Vagas em revisão"
        subtitle="Vagas só com localização Remote vindas de board global, sem como saber se são do Brasil. Ficam fora do radar até a revisão. Aprovar publica a vaga; rejeitar tira de vez (o crawler não a traz de volta)."
      />

      {data.jobs.length === 0 ? (
        <p style={{ color: AT.muted, fontSize: 13 }}>
          Nenhuma vaga aguardando revisão.
        </p>
      ) : (
        <>
          <AdminTable>
            <thead>
              <tr>
                <AdminTh>Empresa</AdminTh>
                <AdminTh>Vaga</AdminTh>
                <AdminTh>Localização</AdminTh>
                <AdminTh>Fonte</AdminTh>
                <AdminTh align="right">Ações</AdminTh>
              </tr>
            </thead>
            <tbody>
              {data.jobs.map((job) => (
                <tr key={job.id}>
                  <AdminTd muted>{job.companyName}</AdminTd>
                  <AdminTd>{job.title}</AdminTd>
                  <AdminTd muted>{formatLocation(job)}</AdminTd>
                  <AdminTd muted>
                    {job.sourceUrl ? (
                      <a
                        href={job.sourceUrl}
                        rel="noreferrer"
                        style={{ color: AT.info }}
                        target="_blank"
                      >
                        {job.sourceUrl}
                      </a>
                    ) : (
                      "sem fonte"
                    )}
                  </AdminTd>
                  <AdminTd align="right">
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        justifyContent: "flex-end",
                      }}
                    >
                      <form action={approveReviewJobAction}>
                        <input name="jobId" type="hidden" value={job.id} />
                        <button
                          className={buttonVariants({ size: "sm" })}
                          type="submit"
                        >
                          Aprovar
                        </button>
                      </form>
                      <form action={rejectReviewJobAction}>
                        <input name="jobId" type="hidden" value={job.id} />
                        <button
                          className={buttonVariants({
                            size: "sm",
                            variant: "outline",
                          })}
                          type="submit"
                        >
                          Rejeitar
                        </button>
                      </form>
                    </div>
                  </AdminTd>
                </tr>
              ))}
            </tbody>
          </AdminTable>

          <AdminPagination
            summary={`${data.total} vagas · página ${pageNum} de ${totalPages}`}
          >
            {pageNum > 1 && (
              <Link
                className={buttonVariants({ size: "sm", variant: "outline" })}
                href={`/admin/vagas-em-revisao?page=${pageNum - 1}`}
              >
                Anterior
              </Link>
            )}
            {pageNum < totalPages && (
              <Link
                className={buttonVariants({ size: "sm", variant: "outline" })}
                href={`/admin/vagas-em-revisao?page=${pageNum + 1}`}
              >
                Próxima
              </Link>
            )}
          </AdminPagination>
        </>
      )}
    </AdminPageWrap>
  );
}
