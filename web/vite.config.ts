import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// VITE_BASE lets the site live under a sub-path (for example "/algorithm-health/").
// Nothing in this repo deploys it; see DECISIONS.md.
// The built site carries a Content-Security-Policy that forbids every outgoing
// connection (fetch, XHR, WebSocket, beacons) and every outside script, style,
// font or image. The browser itself then enforces "nothing leaves the tab".
// It is left out of `npm run dev` only because Vite's dev server needs a WebSocket.
const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'self'";

const cspPlugin = (): Plugin => ({
  name: 'algorithm-health-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<meta name="viewport"', `<meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="viewport"`),
});

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), cspPlugin()],
  build: { target: 'es2022', sourcemap: false },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    testTimeout: 60_000,
  },
});
