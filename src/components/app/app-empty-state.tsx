import {
  PageShell,
  PageShellContent,
  PageShellHeader,
  PageShellHeading,
  PageShellTitle,
} from "./page-shell";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

interface AppEmptyStateProps {
  title: string;
  description: string;
}

export function AppEmptyState({ title, description }: AppEmptyStateProps) {
  return (
    <PageShell className="min-h-0">
      <PageShellHeader>
        <PageShellHeading>
          <PageShellTitle>{title}</PageShellTitle>
        </PageShellHeading>
      </PageShellHeader>
      <PageShellContent className="min-h-0">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{title}</EmptyTitle>
            <EmptyDescription>{description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </PageShellContent>
    </PageShell>
  );
}
