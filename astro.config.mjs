import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Digital Garden scaffold — local-first, loopback only (PRD F7/F8).
// `astro dev` binds localhost by default; never set `host: true` and never
// expose this server beyond the loopback interface.
// F2 SSR (plan R1/R7): `output: 'server'` + `@astrojs/node` standalone adapter
// so `/`, `/new` and `POST /api/capture` are on-demand routes — never
// `server.host: true`, never `--host` (loopback only, PRD F7/F8).
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
});
