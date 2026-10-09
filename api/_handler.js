// Vercel adapter: exposes the existing API handler (built to dist/ by `npm run build`)
// as serverless functions. Locally use `npm run dev` / `npm start` instead.
//
// Hosted deployments are public and unauthenticated, so this adapter runs in
// demo mode: mock provider only (Anthropic is disabled even if a key is set)
// and tighter request limits to bound compute per request.
import { createApiHandler } from "../dist/server/api.js";

const handleApi = createApiHandler({
  env: {},
  maxBodyBytes: 200_000,
  maxCases: 50,
  regexTimeoutMs: 250,
  regexBudgetMs: 1000,
  anthropicDisabledReason:
    "Disabled on this public demo deployment (no authentication). Run EvalSprint locally with ANTHROPIC_API_KEY to use real models.",
});

export default async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  const handled = await handleApi(req, res);
  if (!handled) res.writeHead(404).end();
}
