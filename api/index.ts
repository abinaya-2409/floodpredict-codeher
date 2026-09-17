import { app } from './_app.js';

// vercel.json rewrites every /api/* request to this function. Vercel keeps the
// original req.url across a rewrite, so Express still sees the real path and
// matches its own routes normally.
export default app;
