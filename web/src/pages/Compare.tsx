import { useState } from 'react';
import { ErrorList, StepHeading, TextFileInput } from '../components/ui';
import { TAG_LABEL, compare, type FollowChange } from '../lib/compare';
import { formatDay, formatNumber } from '../lib/files';
import { REVIEW_FILE_NAME, parseReviewFile, type ReviewWork } from '../lib/review';
import { NOT_ENOUGH_TEXT, SCORE_LABEL, type Score } from '../lib/scoring';
import { APP_LABEL, SUMMARY_FILE_NAME, parseSummaryFile, type Summary } from '../lib/summary';

type Slot<T> = { value: T; fileName: string } | { errors: string[]; fileName: string } | null;

function ScoreCard({ title, s, summary }: { title: string; s: Score; summary: Summary }) {
  return (
    <div className="card stack-sm">
      <h3>{title}</h3>
      <p className="mono small muted">
        {formatDay(summary.rangeStart)} to {formatDay(summary.rangeEnd)}
      </p>
      {s.enough ? <p className="score-big">{s.goalMatchPercent}%</p> : <p className="score-big" style={{ fontSize: '1.3rem' }}>{NOT_ENOUGH_TEXT}</p>}
      <p className="muted small">{SCORE_LABEL}</p>
      <p className="mono small">
        Coverage {s.coveragePercent}% ({formatNumber(s.classified)} of {formatNumber(s.attributed)} views)
      </p>
    </div>
  );
}

function ChangeTable({ caption, rows, empty }: { caption: string; rows: FollowChange[]; empty: string }) {
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={caption}>
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Account</th>
            <th scope="col">In the report</th>
            <th scope="col">Matches the report?</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>
                <span className="name">{r.name}</span>
              </td>
              <td>{TAG_LABEL[r.tag]}</td>
              <td>{r.matchesReport ? <span className="pill accent">Yes</span> : r.againstReport ? <span className="pill">Against it</span> : <span className="muted">No link</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ComparePage() {
  const [firstSlot, setFirst] = useState<Slot<Summary>>(null);
  const [secondSlot, setSecond] = useState<Slot<Summary>>(null);
  const [reportSlot, setReport] = useState<Slot<ReviewWork>>(null);

  const readSummary = (set: (s: Slot<Summary>) => void) => (text: string, fileName: string) => {
    const r = parseSummaryFile(text);
    set(r.ok ? { value: r.summary, fileName } : { errors: r.errors, fileName });
  };
  const readReport = (text: string, fileName: string) => {
    const r = parseReviewFile(text);
    setReport(r.ok ? { value: r.work, fileName } : { errors: r.errors, fileName });
  };

  const first = firstSlot && 'value' in firstSlot ? firstSlot.value : null;
  const second = secondSlot && 'value' in secondSlot ? secondSlot.value : null;
  const report = reportSlot && 'value' in reportSlot ? reportSlot.value : null;
  const result = first && second && report ? compare(first, second, report) : null;

  const loaded = (slot: Slot<unknown>) =>
    slot && 'value' in slot ? (
      <p className="hint" role="status">
        Loaded {slot.fileName}.
      </p>
    ) : null;

  return (
    <section className="stack">
      <StepHeading>Compare two summaries</StepHeading>
      <p className="lead">Builder tool. Did the tester's following list change the way their report suggested? Everything stays in this tab.</p>

      <div className="card stack">
        <div className="stack-sm">
          <TextFileInput id="first-file" label="1. First summary (the one the report was made from)" hint={SUMMARY_FILE_NAME} accept=".json,application/json" onText={readSummary(setFirst)} />
          {loaded(firstSlot)}
          {firstSlot && 'errors' in firstSlot && <ErrorList title={`${firstSlot.fileName} could not be loaded`} errors={firstSlot.errors} />}
        </div>
        <div className="stack-sm">
          <TextFileInput id="second-file" label="2. Second summary (7 to 14 days later)" hint={SUMMARY_FILE_NAME} accept=".json,application/json" onText={readSummary(setSecond)} />
          {loaded(secondSlot)}
          {secondSlot && 'errors' in secondSlot && <ErrorList title={`${secondSlot.fileName} could not be loaded`} errors={secondSlot.errors} />}
        </div>
        <div className="stack-sm">
          <TextFileInput id="report-file" label="3. Report data" hint={`${REVIEW_FILE_NAME}, saved from /review`} accept=".json,application/json" onText={readReport} />
          {loaded(reportSlot)}
          {reportSlot && 'errors' in reportSlot && <ErrorList title={`${reportSlot.fileName} could not be loaded`} errors={reportSlot.errors} />}
        </div>
      </div>

      {result && !result.ok && <ErrorList title="These files do not belong together" errors={result.errors} />}

      {result && result.ok && first && second && (
        <div className="stack" aria-live="polite">
          <div className="card stack-sm">
            <h2>Result</h2>
            <p className="score-line">
              <span className="score-big">{result.comparison.matching}</span>
              <span>
                following-list {result.comparison.matching === 1 ? 'change matches' : 'changes match'} the report
                {result.comparison.against > 0 && `, ${result.comparison.against} ${result.comparison.against === 1 ? 'goes' : 'go'} against it`}.
              </span>
            </p>
            <p className="muted small">
              {APP_LABEL[first.app]}, goal "{first.goal}". Second summary made {result.comparison.gapDays} days after the first. A change matches when the tester followed a mentor or unfollowed an
              account the report put off-goal.
            </p>
            {result.comparison.warnings.length > 0 && <ErrorList title="Check before counting this tester" errors={result.comparison.warnings} />}
          </div>

          <div className="stack-sm">
            <h2>Goal match before and after</h2>
            <p className="muted small">Both use the buckets from the first report. Accounts that were not classified then (including new ones and mentors) are left out of both.</p>
            <div className="two-col stack-sm">
              <ScoreCard title="Before (first scan)" s={result.comparison.before} summary={first} />
              <ScoreCard title="After (second scan)" s={result.comparison.after} summary={second} />
            </div>
            <p className="mono small">Views of mentor accounts in the second scan: {formatNumber(result.comparison.mentorViewsAfter)} (outside the score).</p>
          </div>

          <div className="card stack-sm">
            <h2>Mentors and off-goal picks from the report</h2>
            <ul className="rank-list">
              {result.comparison.mentors.map(({ mentor, followedNow }) => (
                <li key={mentor.handle}>
                  <span className="name">Mentor {mentor.name || `@${mentor.handle}`}</span>
                  <span className={followedNow ? 'pill accent' : 'pill'}>{followedNow ? 'Now followed' : 'Not followed'}</span>
                </li>
              ))}
              {result.comparison.picks.map((p) => (
                <li key={p.name}>
                  <span className="name">Off-goal pick {p.name}</span>
                  <span className={p.followedBefore && !p.followedNow ? 'pill accent' : 'pill'}>
                    {!p.followedBefore ? (p.followedNow ? 'Now followed' : 'Was not followed') : p.followedNow ? 'Still followed' : 'Unfollowed'}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="stack-sm">
            <h2>Newly followed ({result.comparison.newlyFollowed.length})</h2>
            <ChangeTable caption="Accounts in the second following list but not the first" rows={result.comparison.newlyFollowed} empty="No newly followed accounts." />
          </div>
          <div className="stack-sm">
            <h2>Unfollowed ({result.comparison.unfollowed.length})</h2>
            <ChangeTable caption="Accounts in the first following list but not the second" rows={result.comparison.unfollowed} empty="No unfollowed accounts." />
          </div>
        </div>
      )}
    </section>
  );
}
