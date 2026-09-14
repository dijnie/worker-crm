import { Skeleton } from "@/components/ui/skeleton";

export interface StatCardProps {
  name: string;
  label: string;
  description: string;
  value?: string | number;
  loading: boolean;
}

export function StatCard({ name, label, description, value, loading }: StatCardProps) {
  return <div data-stat={name} className="min-w-0 rounded-lg border bg-card p-4 sm:p-6">
    <dt className="text-sm font-medium">{label}</dt>
    <dd className="mt-3 break-words text-2xl font-semibold tabular-nums [overflow-wrap:anywhere]">
      {value !== undefined ? value : loading ? <Skeleton className="h-8 w-24" /> : <span className="text-base font-normal text-muted-foreground">Unavailable</span>}
    </dd>
    <dd className="mt-2 text-xs leading-relaxed text-muted-foreground">{description}</dd>
  </div>;
}
