// Vercel adapter: exposes the existing API handler (built to dist/ by `npm run build`)
// as serverless functions. The app itself is unchanged; locally use `npm run dev` / `npm start`.
import { createApiHandler } from "../dist/server/api.js";

const handleApi = createApiHandler();

export default async function handler(req, res) {
  const handled = await handleApi(req, res);
  if (!handled) res.writeHead(404).end();
}
