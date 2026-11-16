import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';

export type Route = 'home' | 'scan' | 'review' | 'compare' | 'not-found';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export function routeFromPath(pathname: string, base = BASE): Route {
  let p = pathname;
  if (base && p.startsWith(base)) p = p.slice(base.length);
  p = p.replace(/\/index\.html$/, '').replace(/^\/+|\/+$/g, '');
  if (p === '') return 'home';
  if (p === 'scan' || p === 'review' || p === 'compare') return p;
  return 'not-found';
}

export function hrefFor(route: Exclude<Route, 'not-found'>): string {
  return route === 'home' ? `${BASE}/` : `${BASE}/${route}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => routeFromPath(window.location.pathname));
  useEffect(() => {
    const onChange = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener('popstate', onChange);
    window.addEventListener('ah:navigate', onChange);
    return () => {
      window.removeEventListener('popstate', onChange);
      window.removeEventListener('ah:navigate', onChange);
    };
  }, []);
  return route;
}

export function Link(props: { to: Exclude<Route, 'not-found'>; className?: string; children: ReactNode }) {
  const href = hrefFor(props.to);
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    window.history.pushState(null, '', href);
    window.dispatchEvent(new Event('ah:navigate'));
  };
  return (
    <a href={href} className={props.className} onClick={onClick}>
      {props.children}
    </a>
  );
}
