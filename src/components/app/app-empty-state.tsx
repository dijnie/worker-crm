interface AppEmptyStateProps {
  title: string;
  description: string;
}

export function AppEmptyState({ title, description }: AppEmptyStateProps) {
  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6">
        <h1 className="text-2xl font-medium tracking-tight md:text-3xl">
          {title}
        </h1>
        <div className="rounded-lg border bg-card p-6 text-card-foreground">
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}
