/**
 * Deployment-aware defaults so the same code runs locally and in production without edits.
 * Environment variables still override everything; only secrets (DATABASE_URL, SMTP_*) must be set.
 */
const isProd = !!process.env.RENDER || process.env.NODE_ENV === 'production';

export const FRONTEND_PROD_URL = 'https://zipilot.vercel.app';
export const FRONTEND_DEV_URL = 'http://localhost:3000';

/** Base URL of the web app, used for links in emails. */
export const APP_URL = (process.env.APP_URL || (isProd ? FRONTEND_PROD_URL : FRONTEND_DEV_URL)).replace(/\/$/, '');

export const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'zipilot24x7';

/** Origins allowed to call the API: local dev, production, Vercel preview deployments, plus CORS_ORIGIN. */
const ALLOWED = new Set(
  [FRONTEND_DEV_URL, 'http://127.0.0.1:3000', FRONTEND_PROD_URL, ...(process.env.CORS_ORIGIN ?? '').split(',')]
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),
);
const VERCEL_PREVIEW = /^https:\/\/zipilot(-[a-z0-9-]+)?\.vercel\.app$/i;

export function isAllowedOrigin(origin: string | undefined) {
  if (!origin) return true; // same-origin, curl, health checks
  const o = origin.replace(/\/$/, '');
  return ALLOWED.has(o) || VERCEL_PREVIEW.test(o);
}
