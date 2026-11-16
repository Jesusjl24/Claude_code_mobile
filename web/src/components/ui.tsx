import { useEffect, useRef, type ReactNode } from 'react';
import { ExportError } from '../adapters/types';

/** A heading that takes focus when it appears, so keyboard and screen-reader users land on each new screen. */
export function StepHeading(props: { children: ReactNode; step?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
    window.scrollTo(0, 0);
  }, []);
  return (
    <div className="stack-sm">
      {props.step && <p className="progress-label">{props.step}</p>}
      <h1 ref={ref} tabIndex={-1}>
        {props.children}
      </h1>
    </div>
  );
}

const MAX_NAMES_SHOWN = 200;

export function ExportErrorPanel({ error }: { error: unknown }) {
  const isExport = error instanceof ExportError;
  const message = isExport ? error.message : 'Something went wrong while reading the file. Nothing was saved or sent.';
  const names = isExport ? error.filesFound : [];
  const detail = isExport ? error.detail : error instanceof Error ? error.message : String(error);
  return (
    <div className="alert" role="alert">
      <h2>This file could not be used</h2>
      <p>{message}</p>
      {names.length > 0 && (
        <details open>
          <summary>
            File names found in the zip ({names.length})
          </summary>
          <p className="hint">Only the names were read. They are shown on this device and have not been sent anywhere.</p>
          <ul className="file-list">
            {names.slice(0, MAX_NAMES_SHOWN).map((n) => (
              <li key={n}>{n}</li>
            ))}
            {names.length > MAX_NAMES_SHOWN && <li>and {names.length - MAX_NAMES_SHOWN} more</li>}
          </ul>
        </details>
      )}
      {detail && (
        <details>
          <summary>Technical detail</summary>
          <p className="mono small">{detail}</p>
        </details>
      )}
    </div>
  );
}

export function ErrorList({ title, errors }: { title: string; errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="alert" role="alert">
      <h3>{title}</h3>
      <ul className="file-list">
        {errors.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

/** A labelled file input that hands the chosen file's text to `onText`. */
export function TextFileInput(props: { id: string; label: string; hint?: string; accept: string; onText: (text: string, fileName: string) => void }) {
  return (
    <div className="field">
      <label htmlFor={props.id}>{props.label}</label>
      {props.hint && (
        <span className="hint" id={`${props.id}-hint`}>
          {props.hint}
        </span>
      )}
      <input
        id={props.id}
        type="file"
        accept={props.accept}
        aria-describedby={props.hint ? `${props.id}-hint` : undefined}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          props.onText(await file.text(), file.name);
        }}
      />
    </div>
  );
}
