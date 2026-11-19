import { saveTextFile } from '../lib/files';
import { REPORT_FILE_NAME, buildReportHtml, reportReadiness } from '../lib/report';
import { REPORT_FONTS } from '../lib/report-fonts';
import { REVIEW_FILE_NAME, toReviewFile, type ReviewWork } from '../lib/review';

export function ReportExport({ work, onStatus }: { work: ReviewWork; onStatus: (s: string) => void }) {
  const readiness = reportReadiness(work);
  return (
    <div className="card stack-sm">
      <h2>6. Export the report</h2>
      <p>
        One self-contained file. It makes no outside requests when opened, and it holds account names, so send it only to this tester.
      </p>
      {!readiness.ready && (
        <div className="alert" id="report-missing">
          <h3>Before you can export</h3>
          <ul className="steps">
            {readiness.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!readiness.ready}
          aria-describedby={readiness.ready ? undefined : 'report-missing'}
          onClick={() => {
            saveTextFile(REPORT_FILE_NAME, buildReportHtml(work, REPORT_FONTS, new Date()), 'text/html');
            onStatus('report.html saved.');
          }}
        >
          Export {REPORT_FILE_NAME}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            saveTextFile(REVIEW_FILE_NAME, toReviewFile(work, new Date()), 'application/json');
            onStatus('Report data saved.');
          }}
        >
          Save report data for /compare
        </button>
      </div>
      <p className="hint">
        Keep the report data file ({REVIEW_FILE_NAME}). In 7 to 14 days, /compare reads it with the tester's two summaries.
      </p>
    </div>
  );
}
