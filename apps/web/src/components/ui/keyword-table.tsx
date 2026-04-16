import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { DeltaBadge } from "./delta-badge";

interface Keyword {
  name: string;
  presente: boolean;
  delta: number;
}

interface KeywordTableProps extends ComponentProps<"div"> {
  keywords: Keyword[];
}

export function KeywordTable({
  keywords,
  className,
  ...props
}: KeywordTableProps) {
  return (
    <div
      className={cn("mt-4", className)}
      data-testid="keyword-table"
      {...props}
    >
      <table className="w-full text-sm [&_th]:font-bold [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-gray-500 [&_tr]:border-b [&_tr:last-child]:border-b-0 [&_td]:py-2 [&_td:first-child]:font-medium">
        <thead>
          <tr>
            <th>Keyword</th>
            <th>Presente</th>
            <th>Delta</th>
          </tr>
        </thead>
        <tbody>
          {keywords.map((k, i) => (
            <tr key={i}>
              <td>{k.name}</td>
              <td>
                <span
                  className={cn(
                    "px-2 py-1 rounded-full text-xs font-semibold",
                    k.presente
                      ? "bg-lime-100 text-lime-800"
                      : "bg-red-100 text-red-800",
                  )}
                >
                  {k.presente ? "Sim" : "Não"}
                </span>
              </td>
              <td>
                <DeltaBadge delta={k.delta} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
