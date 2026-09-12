export function CrmTransition({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
      </div>
      <div className="rounded-md border p-4 space-y-4 bg-card">
        <h3 className="text-xl font-bold tracking-tight">Moving to CRM</h3>
        <p className="text-muted-foreground">
          The customer and subscription tools and their API endpoints have been
          retired as this application moves to CRM.
        </p>
        <p className="text-muted-foreground">
          Company, contact, and deal management is not available yet.
        </p>
      </div>
    </div>
  );
}
