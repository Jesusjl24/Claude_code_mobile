import type { ReviewWork } from '../lib/review';

/** Report export arrives with milestone 8. */
export function ReportExport(_props: { work: ReviewWork; onStatus: (s: string) => void }) {
  return (
    <div className="card stack-sm">
      <h2>6. Export the report</h2>
      <p className="muted">Not built yet (milestone 8).</p>
    </div>
  );
}
