import { HealthCard } from './health-card';

export default function HomePage(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Bills</h1>
        <p className="text-sm text-muted-foreground">
          The bills workspace lands in Phase 9. This bootstrap exists to prove the API client, role
          switcher, and shell are wired before the data views arrive.
        </p>
      </header>
      <HealthCard />
    </div>
  );
}
