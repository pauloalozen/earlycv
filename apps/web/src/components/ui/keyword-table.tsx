import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "./badge";
import { DeltaBadge } from "./delta-badge";

export interface Keyword {
  name: string;
  presente: boolean;
  delta: number;
}

export interface KeywordTableProps extends HTMLAttributes&lt
HTMLTableElement & gt;
{
  keywords: Keyword[]
  onSort?: (column: string) =&gt;
  void
}

export function KeywordTable({
  keywords,
  onSort,
  className,
  ...props
}: KeywordTableProps) {
  const totalDelta = keywords.reduce((sum, k) =&gt;
  sum + k.delta, 0;
  )

  return (
    &lt;
  table;
  className={cn(
        'w-full caption-bottom text-sm',
        className
  )
}
{
  ...props
}
&gt
&lt
thead & gt;
&lt
tr & gt;
&lt
th;
className =
  "h-12 px-4 text-left align-middle font-medium text-muted-foreground" & gt;
&lt
button;
type = "button";
className =
  "inline-flex items-center gap-1 p-0 text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-transparent border-0 cursor-pointer font-medium h-full";
onClick={() =&gt;
onSort?.("name");
}
            &gt
Nome & lt;
/&;bgnotttu & lt;
/&;ghtt & lt;
th;
className =
  "h-12 px-4 text-left align-middle font-medium text-muted-foreground" & gt;
Status & lt;
/&;ghtt & lt;
th;
className =
  "h-12 px-4 text-left align-middle font-medium text-muted-foreground" & gt;
Delta & lt;
/&;ghtt & lt;
/&;grtt & lt;
/&;adeghtt & lt;
tbody & gt;
{
  keywords.map((keyword) =&gt;
  (
          &lt;
  tr;
  key={keyword.name}
  className = "border-t transition-colors hover:bg-muted/50" & gt;
  &lt
  td;
  className = "p-4 align-middle font-medium" & gt;
  keyword.name;
  &lt
  /&;dgtt & lt;
  td;
  className = "p-4 align-middle" & gt;
  &lt
  Badge;
  variant={keyword.presente ? 'success' : 'accent'}
              &gt;
  keyword.presente ? "✓ presente" : "✗ faltante";
  &lt
  /&;Badeggt & lt;
  /&;dgtt & lt;
  td;
  className = "p-4 align-middle" & gt;
  &lt
  DeltaBadge;
  delta={keyword.delta} /&gt;
  &lt
  /&;dgtt & lt;
  /&;grtt;
  ))
}
&lt
/&;bdgotty & lt;
tfoot & gt;
&lt
tr & gt;
&lt
td;
colSpan={3}
className = "p-4 font-semibold text-muted-foreground border-t bg-muted/50" & gt;
Total;
delta:
&lt
DeltaBadge;
delta={totalDelta} /&gt;
&lt
/&;dgtt & lt;
/&;grtt & lt;
/&;fgoottt & lt;
/&;abegltt;
)
}
