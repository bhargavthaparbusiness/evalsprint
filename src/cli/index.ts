#!/usr/bin/env node
import { loadDotEnv } from "../server/env.js";
import { runCli } from "./main.js";

loadDotEnv(process.cwd());

runCli(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(`${text}\n`),
  stderr: (text) => process.stderr.write(`${text}\n`),
  cwd: process.cwd(),
  color: Boolean(process.stdout.isTTY) && !process.env.NO_COLOR,
})
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 2;
  });
