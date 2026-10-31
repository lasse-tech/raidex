// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
import { createLogger, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// Warnings fail the build.
const logger = createLogger();
const logWarn = logger.warn.bind(logger);
logger.warn = (msg, options) => {
  logWarn(msg, options);
  process.exitCode = 1;
};

// The About page shows package.json's version.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Every environment serves the app at the domain root, so one build fits all and
// base stays '/'.
//
// `npm run dev` runs the frontend locally against a running Raidex server:
// RAIDEX_API=https://raidex.example.org npm run dev
const API_TARGET = process.env.RAIDEX_API;

const proxy = {
  target: API_TARGET,
  changeOrigin: true,
  // TLS stays verified.
  secure: true,
  // Session cookies are issued for the backend host; without the rewrite the
  // browser drops them on localhost and every request comes back 401.
  cookieDomainRewrite: 'localhost',
};

export default defineConfig(({ command }) => {
  if (command === 'serve' && !API_TARGET) {
    throw new Error('RAIDEX_API is not set: the address of the Raidex server the dev server proxies to');
  }
  return {
    base: '/',
    customLogger: logger,
    plugins: [react()],
    define: { __APP_VERSION__: JSON.stringify(version) },
    server: {
      port: 5173,
      proxy: { '/api': proxy, '/r': proxy },
    },
  };
});
