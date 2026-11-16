import { useState, type FormEvent } from 'react';
import type { ScanProgress, ScanResult } from '../adapters/types';
import { ExportErrorPanel, StepHeading } from '../components/ui';
import { aiAssistantName, consentParagraphs } from '../lib/consent';
import { formatDay, formatNumber, saveTextFile } from '../lib/files';
import { buildSummary, scanExport } from '../lib/scan';
import { APP_LABEL, GOAL_MAX_LENGTH, SUMMARY_FILE_NAME, toSummaryFile, type AppId, type Summary } from '../lib/summary';
import { baseName } from '../adapters/types';

type Step = 'welcome' | 'goal' | 'app' | 'file' | 'preview' | 'consent' | 'save';
const ORDER: Step[] = ['welcome', 'goal', 'app', 'file', 'preview', 'consent', 'save'];
const stepLabel = (s: Step) => `Step ${ORDER.indexOf(s) + 1} of ${ORDER.length}`;

// Export instructions. UNVERIFIED: written from memory of each product's
// menus, which change often. Check them against the real apps before testers see them.
const EXPORT_STEPS: Record<AppId, string[]> = {
  instagram: [
    'In Instagram, open your profile, then the menu, then "Accounts Centre".',
    'Choose "Your information and permissions", then "Download your information" (it may be called "Export your information").',
    'Start a new export for your Instagram account and choose to download it to your device.',
    'If you are asked what to include, choose "Ads information" (it may be called "Ads and topics") and "Followers and following". If you cannot find those, include everything: this page still opens only the two things it needs.',
    'Set the format to JSON, not HTML. Set media quality to the lowest option; photos and videos are not needed.',
    'Set the date range to "All time" so your full following list is included.',
    'Instagram tells you when the export is ready. That can take from minutes to days. Download the zip, then come back to this page.',
  ],
  youtube: [
    'Go to takeout.google.com in a browser, signed in to the Google account you use for YouTube.',
    'Press "Deselect all", then tick only "YouTube and YouTube Music".',
    'Press "All YouTube data included", deselect all, then tick only "history" and "subscriptions".',
    'Press "Multiple formats" and, next to History, change HTML to JSON.',
    'Continue to the next step, choose a one-off export as a .zip file, and create the export.',
    'Google emails you when the export is ready. Download the zip, then come back to this page.',
  ],
};

type ScanState =
  | { status: 'idle' }
  | { status: 'scanning'; progress: ScanProgress | null }
  | { status: 'error'; error: unknown };

export function ScanPage() {
  const [step, setStep] = useState<Step>('welcome');
  const [goal, setGoal] = useState('');
  const [goalError, setGoalError] = useState('');
  const [app, setApp] = useState<AppId | null>(null);
  const [appError, setAppError] = useState('');
  const [scan, setScan] = useState<ScanState>({ status: 'idle' });
  const [result, setResult] = useState<ScanResult | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [consentError, setConsentError] = useState('');
  const [saved, setSaved] = useState<Summary | null>(null);

  const back = (to: Step) => (
    <button type="button" className="btn" onClick={() => setStep(to)}>
      Back
    </button>
  );

  const onGoal = (e: FormEvent) => {
    e.preventDefault();
    if (goal.trim() === '') return setGoalError('Type a goal to continue.');
    setGoalError('');
    setStep('app');
  };

  const onApp = (e: FormEvent) => {
    e.preventDefault();
    if (!app) return setAppError('Pick Instagram or YouTube to continue.');
    setAppError('');
    setStep('file');
  };

  const onFile = async (file: File | undefined) => {
    if (!file || !app) return;
    setResult(null);
    setAgreed(false);
    setSaved(null);
    setScan({ status: 'scanning', progress: null });
    let lastShown = 0;
    try {
      const r = await scanExport(app, file, (progress) => {
        // Update the screen at most a few times a second.
        const now = Date.now();
        if (now - lastShown < 200 && progress.bytesDone < progress.bytesTotal) return;
        lastShown = now;
        setScan({ status: 'scanning', progress });
      });
      setResult(r);
      setScan({ status: 'idle' });
      setStep('preview');
    } catch (error) {
      setScan({ status: 'error', error });
    }
  };

  const onSave = () => {
    if (!result) return;
    const summary = buildSummary(result, goal, new Date());
    saveTextFile(SUMMARY_FILE_NAME, toSummaryFile(summary), 'application/json');
    setSaved(summary);
  };

  if (step === 'welcome') {
    return (
      <section className="stack">
        <StepHeading step={stepLabel(step)}>How much of what you watch serves your goal?</StepHeading>
        <p className="lead">
          This page reads the data export you request from Instagram or YouTube and counts which accounts you viewed posts from.
        </p>
        <ul className="steps">
          <li>The export is read on this device. It is never uploaded.</li>
          <li>You see exactly what will be shared before anything leaves your device.</li>
          <li>You send one small summary file yourself, and get a report back.</li>
        </ul>
        <p className="muted">You will need your export zip. If you do not have it yet, the next screens explain how to request it.</p>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => setStep('goal')}>
            Start
          </button>
        </div>
      </section>
    );
  }

  if (step === 'goal') {
    return (
      <form className="stack" onSubmit={onGoal} noValidate>
        <StepHeading step={stepLabel(step)}>What is your goal?</StepHeading>
        <div className="field">
          <label htmlFor="goal">The goal you want your feed to serve</label>
          <span className="hint" id="goal-hint">
            One sentence, in your own words. For example: "Get better at cooking for my family."
          </span>
          <textarea
            id="goal"
            value={goal}
            maxLength={GOAL_MAX_LENGTH}
            aria-describedby={goalError ? 'goal-hint goal-error' : 'goal-hint'}
            aria-invalid={goalError ? true : undefined}
            onChange={(e) => setGoal(e.target.value)}
          />
          <span className="hint mono">
            {goal.length}/{GOAL_MAX_LENGTH}
          </span>
          {goalError && (
            <span id="goal-error" className="alert" role="alert">
              {goalError}
            </span>
          )}
        </div>
        <div className="row">
          {back('welcome')}
          <button type="submit" className="btn btn-primary">
            Next
          </button>
        </div>
      </form>
    );
  }

  if (step === 'app') {
    return (
      <form className="stack" onSubmit={onApp} noValidate>
        <StepHeading step={stepLabel(step)}>Which app do you scroll most?</StepHeading>
        <fieldset className="stack-sm" aria-describedby={appError ? 'app-error' : undefined}>
          <legend className="sr-only">App to scan</legend>
          {(['instagram', 'youtube'] as const).map((id) => (
            <label key={id} className="choice">
              <input type="radio" name="app" value={id} checked={app === id} onChange={() => setApp(id)} />
              {APP_LABEL[id]}
            </label>
          ))}
        </fieldset>
        {appError && (
          <p id="app-error" className="alert" role="alert">
            {appError}
          </p>
        )}
        {app && (
          <div className="card stack-sm" aria-live="polite">
            <h2>How to request your {APP_LABEL[app]} export</h2>
            <ol className="steps">
              {EXPORT_STEPS[app].map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p className="hint">Menu names change from time to time. If a step does not match what you see, ask the person who sent you this page.</p>
          </div>
        )}
        <div className="row">
          {back('goal')}
          <button type="submit" className="btn btn-primary">
            I have my zip file
          </button>
        </div>
      </form>
    );
  }

  if (step === 'file' && app) {
    const p = scan.status === 'scanning' ? scan.progress : null;
    return (
      <section className="stack">
        <StepHeading step={stepLabel(step)}>Choose your {APP_LABEL[app]} export</StepHeading>
        <div className="field">
          <label htmlFor="export-file">The .zip file from {app === 'youtube' ? 'Google Takeout' : 'Instagram'}</label>
          <span className="hint" id="export-file-hint">
            The file is opened on this device only. It is not uploaded.
          </span>
          <input
            id="export-file"
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            aria-describedby="export-file-hint"
            disabled={scan.status === 'scanning'}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              void onFile(file);
            }}
          />
        </div>
        <div aria-live="polite" className="stack-sm">
          {scan.status === 'scanning' && (
            <>
              <p>{p ? `Reading ${baseName(p.file)}` : 'Opening the zip'}. This stays on your device.</p>
              <progress aria-label="Reading progress" max={p?.bytesTotal || 1} value={p ? p.bytesDone : undefined} />
            </>
          )}
        </div>
        {scan.status === 'error' && <ExportErrorPanel error={scan.error} />}
        <div className="row">{back('app')}</div>
      </section>
    );
  }

  if (step === 'preview' && result) {
    const summary = buildSummary(result, goal, new Date());
    const top = result.accounts.slice(0, 10);
    return (
      <section className="stack">
        <StepHeading step={stepLabel(step)}>This is what will be shared</StepHeading>
        <p>Everything below goes into one small file. Nothing else from your export is in it.</p>
        <dl className="stat-grid">
          <div className="stat full">
            <dt>Your goal</dt>
            <dd style={{ fontFamily: 'var(--font-body)' }}>{summary.goal}</dd>
          </div>
          <div className="stat full">
            <dt>Date range</dt>
            <dd>
              {formatDay(result.rangeStart)} to {formatDay(result.rangeEnd)}
            </dd>
          </div>
          <div className="stat">
            <dt>View events</dt>
            <dd>{formatNumber(result.totalViewEvents)}</dd>
          </div>
          <div className="stat">
            <dt>Accounts</dt>
            <dd>{formatNumber(result.accounts.length)}</dd>
          </div>
          <div className="stat">
            <dt>Accounts you follow</dt>
            <dd>{formatNumber(result.following.length)}</dd>
          </div>
          <div className="stat">
            <dt>Views with no account named</dt>
            <dd>{formatNumber(result.unattributedEvents)}</dd>
          </div>
        </dl>
        <div className="card stack-sm">
          <h2>Top {top.length === 10 ? 'ten ' : ''}accounts by views</h2>
          {top.length === 0 ? (
            <p className="muted">No accounts were named in your view history.</p>
          ) : (
            <ol className="rank-list">
              {top.map((a) => (
                <li key={a.name}>
                  <span className="name">{a.name}</span>
                  <span className="num">{formatNumber(a.views)} views</span>
                </li>
              ))}
            </ol>
          )}
          <p className="hint">
            The file lists all {formatNumber(result.accounts.length)} accounts with their view counts, and the names of the{' '}
            {formatNumber(result.following.length)} accounts you follow. It also says which app this is and when the file was made.
          </p>
        </div>
        <details className="card">
          <summary>See the whole file, word for word</summary>
          <pre className="file-list" tabIndex={0} aria-label="Contents of the summary file">
            {toSummaryFile(summary)}
          </pre>
        </details>
        <details className="card">
          <summary>What was read from your export</summary>
          <ul className="file-list">
            {result.info.filesOpened.map((f) => (
              <li key={f}>Opened: {f}</li>
            ))}
            <li>Only the most recent 30 days of views are counted. {formatNumber(result.info.eventsBeforeRange)} older view events were left out.</li>
            {result.info.skippedRecords > 0 && <li>{formatNumber(result.info.skippedRecords)} records could not be read and were skipped.</li>}
            {result.info.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </details>
        <div className="row">
          {back('file')}
          <button type="button" className="btn btn-primary" onClick={() => setStep('consent')}>
            Next
          </button>
        </div>
      </section>
    );
  }

  if (step === 'consent' && result) {
    return (
      <form
        className="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!agreed) return setConsentError('Tick the box to continue, or close this page to stop.');
          setConsentError('');
          setStep('save');
        }}
      >
        <StepHeading step={stepLabel(step)}>Before you share</StepHeading>
        <div className="card consent">
          {consentParagraphs(aiAssistantName()).map((p) => (
            <p key={p.heading}>
              <strong>{p.heading}</strong> {p.body}
            </p>
          ))}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={agreed}
            aria-describedby={consentError ? 'consent-error' : undefined}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span>I have read this and I agree to share the summary file.</span>
        </label>
        {consentError && (
          <p id="consent-error" className="alert" role="alert">
            {consentError}
          </p>
        )}
        <div className="row">
          {back('preview')}
          <button type="submit" className="btn btn-primary">
            Next
          </button>
        </div>
      </form>
    );
  }

  if (step === 'save' && result && agreed) {
    return (
      <section className="stack">
        <StepHeading step={stepLabel(step)}>Save your summary file</StepHeading>
        <p>
          Save the file to this device, then send it to the person who invited you, the same way you usually message them. This page does not
          send it for you.
        </p>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={onSave}>
            Save {SUMMARY_FILE_NAME}
          </button>
        </div>
        <div aria-live="polite">
          {saved && (
            <div className="card stack-sm">
              <h2>Saved</h2>
              <p>
                Look for <span className="mono">{SUMMARY_FILE_NAME}</span> in your downloads and send it on. You can close this page; nothing is
                kept here.
              </p>
            </div>
          )}
        </div>
        <div className="row">{back('consent')}</div>
      </section>
    );
  }

  // A step was reached without the data it needs (should not happen); start again.
  return (
    <section className="stack">
      <StepHeading>Start again</StepHeading>
      <p>This screen needs information from an earlier step.</p>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={() => setStep('welcome')}>
          Go to the start
        </button>
      </div>
    </section>
  );
}
