import { describe, expect, it } from 'vitest';
import { routeFromPath } from '../src/router';

describe('routeFromPath', () => {
  it('maps the three routes and home', () => {
    expect(routeFromPath('/', '')).toBe('home');
    expect(routeFromPath('/scan', '')).toBe('scan');
    expect(routeFromPath('/review/', '')).toBe('review');
    expect(routeFromPath('/compare/index.html', '')).toBe('compare');
  });
  it('honours a base path', () => {
    expect(routeFromPath('/ah/scan', '/ah')).toBe('scan');
    expect(routeFromPath('/ah/', '/ah')).toBe('home');
  });
  it('reports unknown paths', () => {
    expect(routeFromPath('/profile', '')).toBe('not-found');
  });
});
