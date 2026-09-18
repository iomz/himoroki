import type { ReporterAttribution as Reporter } from '../server/identity-store';

export function ReporterAttribution({ reporter }: { reporter: Reporter }) {
  return <span className="reporter-attribution">
    <span>{reporter.name}</span>
    {reporter.status === 'deleted' && <span className="badge">Deleted member</span>}
  </span>;
}
