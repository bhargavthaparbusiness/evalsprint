import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Loads `.env` from the given directory into process.env if the file exists.
 * Variables already set in the environment take precedence.
 */
export function loadDotEnv(dir: string = process.cwd()): void {
  const file = path.join(dir, ".env");
  if (existsSync(file)) process.loadEnvFile(file);
}
