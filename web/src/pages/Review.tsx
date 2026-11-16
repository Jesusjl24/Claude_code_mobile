import { useMemo, useState, type FormEvent } from 'react';
import { ErrorList, StepHeading, TextFileInput } from '../components/ui';
import { classificationRequest, parseClassification } from '../lib/classification';
import { copyText, formatDay, formatNumber, saveTextFile } from '../lib/files';
import { checkMentor, mentorUrl, type MentorInput } from '../lib/mentors';
import {
  OFF_GOAL_PICKS,
  REVIEW_FILE_NAME,
  applyAssistantAnswer,
  effectiveOffGoalPicks,
  newReview,
  offGoalAccounts,
  overrideVerdict,
  parseReviewFile,
  reviewList,
  scoreOf,
  toReviewFile,
  verdictMap,
  type ReviewWork,
} from '../lib/review';
import { BUCKET_LABEL, NOT_ENOUGH_TEXT, SCORE_LABEL, isBucket, sharePercent, type Score, type Verdict } from '../lib/scoring';
import { APP_LABEL, attributedEvents, parseSummaryFile } from '../lib/summary';
import { ReportExport } from './ReportExport';

export function ScoreLine({ score }: { score: Score }) {
  return (
    <div className="card" role="status" aria-live="polite" aria-atomic="true">
      <p className="label">Goal match</p>
      <div className="score-line">
        {score.enough ? <span className="score-big">{score.goalMatchPercent}%</span> : <span className="score-big" style={{ fontSize: '1.4rem' }}>{NOT_ENOUGH_TEXT}</span>}
        <span className="muted">{score.enough ? SCORE_LABEL : 'needs at least 60% coverage'}</span>
      </div>
      <p className="mono small">
        Coverage {score.coveragePercent}% ({formatNumber(score.classified)} of {formatNumber(score.attributed)} attributed views classified). On-goal{' '}
        {formatNumber(score.views['on-goal'])}, neutral {formatNumber(score.views.neutral)}, off-goal {formatNumber(score.views['off-goal'])}, unclassified{' '}
        {formatNumber(score.unclassified)}.
      </p>
    </div>
  );
}

export function ReviewPage() {
  const [work, setWork] = useState<ReviewWork | null>(null);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [pasted, setPasted] = useState('');
  const [pasteErrors, setPasteErrors] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [mentorInput, setMentorInput] = useState<MentorInput>({ app: 'instagram', handle: '', name: '', reason: '' });
  const [mentorError, setMentorError] = useState('');

  const listed = useMemo(() => (work ? reviewList(work.summary.accounts) : []), [work?.summary]);
  const request = useMemo(() => (work ? classificationRequest(work.summary, listed) : ''), [work?.summary, listed]);

  const start = (next: ReviewWork) => {
    setWork(next);
    setLoadErrors([]);
    setPasted('');
    setPasteErrors([]);
    setMentorError('');
    setMentorInput({ app: next.summary.app, handle: '', name: '', reason: '' });
  };

  const loadSummary = (text: string) => {
    const r = parseSummaryFile(text);
    if (r.ok) {
      start(newReview(r.summary));
      setStatus('Summary loaded.');
    } else {
      setLoadErrors(r.errors);
    }
  };
  const loadWork = (text: string) => {
    const r = parseReviewFile(text);
    if (r.ok) {
      start(r.work);
      setStatus('Saved work reloaded.');
    } else {
      setLoadErrors(r.errors);
    }
  };

  if (!work) {
    return (
      <section className="stack">
        <StepHeading>Review a summary</StepHeading>
        <p className="lead">Builder tool. Everything stays in this tab and in the files you save; nothing is stored in the browser or sent anywhere.</p>
        <div className="card stack">
          <TextFileInput id="summary-file" label="Load a tester's summary file" hint="algorithm-health-summary.json" accept=".json,application/json" onText={loadSummary} />
          <TextFileInput id="work-file" label="Or reload saved work" hint={REVIEW_FILE_NAME} accept=".json,application/json" onText={loadWork} />
        </div>
        <ErrorList title="That file could not be loaded" errors={loadErrors} />
      </section>
    );
  }

  const { summary } = work;
  const attributed = attributedEvents(summary);
  const score = scoreOf(work);
  const verdicts = verdictMap(work.classifications);
  const listedViews = listed.reduce((n, a) => n + a.views, 0);
  const offGoal = offGoalAccounts(work);
  const picks = effectiveOffGoalPicks(work);
  const pickNames = new Set(picks.map((p) => p.name));
  const picksViews = picks.reduce((n, a) => n + a.views, 0);

  const applyPaste = () => {
    const r = parseClassification(pasted, listed);
    if (!r.ok) {
      setPasteErrors(r.errors);
      setStatus('');
      return;
    }
    setPasteErrors([]);
    setWork(applyAssistantAnswer(work, r.entries));
    setStatus(`Answer accepted: ${r.entries.length} accounts classified.`);
  };

  const togglePick = (name: string, on: boolean) => {
    const current = picks.map((p) => p.name);
    const next = on ? [...current, name] : current.filter((n) => n !== name);
    if (next.length > OFF_GOAL_PICKS) return;
    setWork({ ...work, offGoalPicks: next.length ? next : null, offGoalConfirmed: false });
  };

  const addMentor = (e: FormEvent) => {
    e.preventDefault();
    const r = checkMentor(mentorInput, summary, work.mentors);
    if (!r.ok) return setMentorError(r.error);
    setMentorError('');
    setWork({ ...work, mentors: [...work.mentors, r.mentor] });
    setMentorInput({ app: summary.app, handle: '', name: '', reason: '' });
    setStatus(`Mentor @${r.mentor.handle} added.`);
  };

  return (
    <section className="stack">
      <StepHeading>Review a summary</StepHeading>
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>

      <div className="card stack-sm">
        <h2>The tester</h2>
        <dl className="stat-grid">
          <div className="stat full">
            <dt>Goal</dt>
            <dd style={{ fontFamily: 'var(--font-body)' }}>{summary.goal}</dd>
          </div>
          <div className="stat">
            <dt>App</dt>
            <dd>{APP_LABEL[summary.app]}</dd>
          </div>
          <div className="stat">
            <dt>Range</dt>
            <dd>
              {formatDay(summary.rangeStart)} to {formatDay(summary.rangeEnd)}
            </dd>
          </div>
          <div className="stat">
            <dt>View events</dt>
            <dd>
              {formatNumber(summary.totalViewEvents)} ({formatNumber(summary.unattributedEvents)} with no account)
            </dd>
          </div>
          <div className="stat">
            <dt>Accounts / following</dt>
            <dd>
              {formatNumber(summary.accounts.length)} / {formatNumber(summary.following.length)}
            </dd>
          </div>
        </dl>
        <div className="row">
          <button type="button" className="btn btn-small" onClick={() => setWork(null)}>
            Load a different file
          </button>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              saveTextFile(REVIEW_FILE_NAME, toReviewFile(work, new Date()), 'application/json');
              setStatus('Work in progress saved as a file.');
            }}
          >
            Save work in progress
          </button>
        </div>
      </div>

      <div className="card stack-sm">
        <h2>1. Copy the classification request</h2>
        <p>
          {listed.length} accounts cover {sharePercent(listedViews, attributed)}% of attributed views (the list stops at 80% or 150 accounts). Paste this text into the AI
          assistant named in your consent wording.
        </p>
        <div className="field">
          <label htmlFor="request-text">Classification request</label>
          <textarea id="request-text" className="code" readOnly value={request} rows={10} />
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={async () => setStatus((await copyText(request)) ? 'Request copied.' : 'Copy failed. Select the text and copy it by hand.')}>
            Copy request
          </button>
          <span className="muted small" aria-hidden="true">
            {status.startsWith('Request copied') || status.startsWith('Copy failed') ? status : ''}
          </span>
        </div>
      </div>

      <div className="card stack-sm">
        <h2>2. Paste the answer</h2>
        <div className="field">
          <label htmlFor="answer-text">The assistant's JSON answer</label>
          <span className="hint" id="answer-hint">
            Checked strictly. If anything is wrong, nothing is applied and each problem is listed. Applying replaces all current buckets.
          </span>
          <textarea id="answer-text" className="code" aria-describedby="answer-hint" value={pasted} rows={8} onChange={(e) => setPasted(e.target.value)} />
        </div>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={applyPaste}>
            Check and apply
          </button>
        </div>
        <ErrorList title={`The answer was not applied: ${pasteErrors.length} problem${pasteErrors.length === 1 ? '' : 's'}`} errors={pasteErrors} />
      </div>

      <ScoreLine score={score} />

      <div className="stack-sm">
        <h2>3. Check every bucket</h2>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Accounts and buckets">
          <table>
            <caption>
              Change any bucket you disagree with. "Unknown" and "Not classified" are left out of the score.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="num">
                  #
                </th>
                <th scope="col">Account</th>
                <th scope="col" className="num">
                  Views
                </th>
                <th scope="col" className="num">
                  Share
                </th>
                <th scope="col">Bucket</th>
                <th scope="col">Reason</th>
              </tr>
            </thead>
            <tbody>
              {listed.map((a, i) => {
                const c = verdicts.get(a.name);
                return (
                  <tr key={a.name}>
                    <td className="num">{i + 1}</td>
                    <th scope="row" style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--font-body)', fontSize: 'inherit', color: 'var(--text)' }}>
                      <span className="name">{a.name}</span>
                    </th>
                    <td className="num">{formatNumber(a.views)}</td>
                    <td className="num">{sharePercent(a.views, attributed)}%</td>
                    <td>
                      <select
                        aria-label={`Bucket for ${a.name}`}
                        value={c?.verdict ?? ''}
                        onChange={(e) => setWork(overrideVerdict(work, a.name, e.target.value === '' ? null : (e.target.value as Verdict)))}
                      >
                        <option value="">Not classified</option>
                        <option value="on-goal">On-goal</option>
                        <option value="neutral">Neutral</option>
                        <option value="off-goal">Off-goal</option>
                        <option value="unknown">Unknown</option>
                      </select>
                    </td>
                    <td>
                      {c?.reason} {c?.source === 'builder' && <span className="pill accent">changed by you</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {summary.accounts.length > listed.length && (
          <p className="muted small">
            {formatNumber(summary.accounts.length - listed.length)} more accounts ({sharePercent(attributed - listedViews, attributed)}% of attributed views) are not listed
            and stay unclassified.
          </p>
        )}
      </div>

      <div className="card stack-sm">
        <h2>4. Confirm the top three off-goal accounts</h2>
        {offGoal.length === 0 ? (
          <p className="muted">No account is marked off-goal, so there is nothing to confirm.</p>
        ) : (
          <>
            <p>
              These go in the report as the accounts pulling furthest from the goal. The three most viewed are ticked; choose up to {OFF_GOAL_PICKS}.
            </p>
            <fieldset className="stack-sm">
              <legend className="sr-only">Off-goal accounts for the report</legend>
              {offGoal.slice(0, 12).map((a) => {
                const on = pickNames.has(a.name);
                return (
                  <label key={a.name} className="check" style={{ padding: '4px 0' }}>
                    <input type="checkbox" checked={on} disabled={!on && picks.length >= OFF_GOAL_PICKS} onChange={(e) => togglePick(a.name, e.target.checked)} />
                    <span>
                      {a.name}{' '}
                      <span className="mono muted">
                        {formatNumber(a.views)} views, {sharePercent(a.views, attributed)}%
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
            <p className="mono small">
              Combined share of the chosen {picks.length}: {sharePercent(picksViews, attributed)}% of attributed views.
            </p>
            <div className="row">
              <button
                type="button"
                className="btn"
                aria-pressed={work.offGoalConfirmed}
                onClick={() => {
                  setWork({ ...work, offGoalPicks: picks.map((p) => p.name), offGoalConfirmed: !work.offGoalConfirmed });
                  setStatus(work.offGoalConfirmed ? 'Off-goal accounts no longer confirmed.' : 'Off-goal accounts confirmed.');
                }}
              >
                {work.offGoalConfirmed ? 'Confirmed. Press to change' : `Confirm ${picks.length === 1 ? 'this account' : `these ${picks.length} accounts`}`}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card stack-sm">
        <h2>5. Add mentors</h2>
        <p>Accounts worth following for this goal. One the tester already follows, or one on a different app from the scan, is refused.</p>
        <form className="stack-sm" onSubmit={addMentor} noValidate>
          <div className="two-col">
            <div className="field">
              <label htmlFor="mentor-app">App the mentor is on</label>
              <select id="mentor-app" value={mentorInput.app} onChange={(e) => setMentorInput({ ...mentorInput, app: e.target.value })}>
                <option value="instagram">Instagram</option>
                <option value="youtube">YouTube</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="mentor-handle">Handle or profile link</label>
              <input id="mentor-handle" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} value={mentorInput.handle} onChange={(e) => setMentorInput({ ...mentorInput, handle: e.target.value })} />
            </div>
          </div>
          {mentorInput.app === 'youtube' && (
            <div className="field">
              <label htmlFor="mentor-name">Channel name, as YouTube shows it</label>
              <input id="mentor-name" type="text" autoComplete="off" value={mentorInput.name} onChange={(e) => setMentorInput({ ...mentorInput, name: e.target.value })} />
            </div>
          )}
          <div className="field">
            <label htmlFor="mentor-reason">One-line reason</label>
            <input id="mentor-reason" type="text" autoComplete="off" value={mentorInput.reason} onChange={(e) => setMentorInput({ ...mentorInput, reason: e.target.value })} />
          </div>
          {mentorError && (
            <p className="alert" role="alert">
              {mentorError}
            </p>
          )}
          <div className="row">
            <button type="submit" className="btn">
              Add mentor
            </button>
          </div>
        </form>
        {work.mentors.length > 0 && (
          <ul className="rank-list" aria-label="Mentors">
            {work.mentors.map((m) => (
              <li key={m.handle}>
                <span className="name">
                  <strong>{m.name || `@${m.handle}`}</strong> {m.name && <span className="mono muted">@{m.handle}</span>}
                  <br />
                  {m.reason}
                  <br />
                  <span className="mono small muted">{mentorUrl(m)}</span>
                </span>
                <button type="button" className="btn btn-small" aria-label={`Remove mentor ${m.handle}`} onClick={() => setWork({ ...work, mentors: work.mentors.filter((x) => x !== m) })}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ReportExport work={work} onStatus={setStatus} />

      <p className="muted small">
        Buckets set: {work.classifications.filter((c) => isBucket(c.verdict)).length} of {listed.length} listed ({(['on-goal', 'neutral', 'off-goal'] as const)
          .map((b) => `${BUCKET_LABEL[b]} ${work.classifications.filter((c) => c.verdict === b).length}`)
          .join(', ')}
        ).
      </p>
    </section>
  );
}
