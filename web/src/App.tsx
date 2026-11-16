import { useEffect } from 'react';
import { Link, useRoute, type Route } from './router';
import { ScanPage } from './pages/Scan';
import { ReviewPage } from './pages/Review';
import { ComparePage } from './pages/Compare';

const TITLES: Record<Route, string> = {
  home: 'Algorithm Health',
  scan: 'Scan your export — Algorithm Health',
  review: 'Review — Algorithm Health',
  compare: 'Compare — Algorithm Health',
  'not-found': 'Page not found — Algorithm Health',
};

export function App() {
  const route = useRoute();
  useEffect(() => {
    document.title = TITLES[route];
  }, [route]);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Link to="home" className="brand">
          Algorithm Health
        </Link>
        <span className="tag">test build</span>
      </header>
      <main id="main" className={route === 'review' || route === 'compare' ? 'wide' : undefined}>
        {route === 'scan' && <ScanPage />}
        {route === 'review' && <ReviewPage />}
        {route === 'compare' && <ComparePage />}
        {route === 'home' && <Home />}
        {route === 'not-found' && <NotFound />}
      </main>
    </>
  );
}

function Home() {
  return (
    <section className="stack">
      <h1>Algorithm Health</h1>
      <p className="lead">
        Find out what share of the posts you viewed serves a goal you choose. Your export is read on this
        device and is never uploaded.
      </p>
      <Link to="scan" className="btn btn-primary">
        Scan my export
      </Link>
      <nav aria-label="Builder tools" className="card stack-sm">
        <h2 className="label">Builder tools</h2>
        <Link to="review" className="btn">
          Review a summary
        </Link>
        <Link to="compare" className="btn">
          Compare two summaries
        </Link>
      </nav>
    </section>
  );
}

function NotFound() {
  return (
    <section className="stack">
      <h1>Page not found</h1>
      <p>This address does not match a page in Algorithm Health.</p>
      <Link to="home" className="btn">
        Go to the start
      </Link>
    </section>
  );
}
