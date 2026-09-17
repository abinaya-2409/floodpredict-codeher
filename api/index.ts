import { app, mountNotFound } from './_app.js';

// vercel.json rewrites every /api/* request to this function. Vercel keeps the
// original req.url across a rewrite, so Express still sees the real path and
// matches its own routes normally.
//
// The 404 fallback is mounted here, not in _app.ts: the dev server shares that
// app with Vite's middleware, and a catch-all registered at import time would
// intercept every page request.
mountNotFound();

export default app;
