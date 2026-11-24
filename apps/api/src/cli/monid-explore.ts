/**
 * Explore Monid endpoints with your own key, to choose the LinkedIn endpoint.
 *
 *   pnpm monid discover "linkedin company posts"
 *   pnpm monid inspect <provider> <endpoint>
 *
 * Neither command starts a run. Check Monid's pricing before running anything.
 * The API key is read from .env.local or .env and never printed.
 */
import { writeFileSync } from 'node:fs';
import { createMonidClient } from '../adapters/outbound/monid/monid.factory';
import { loadAppConfig, loadRootEnvFiles, REPO_ROOT } from '../config';
import type { JsonObject, JsonValue } from '../core/domain';

async function main(): Promise<void> {
  loadRootEnvFiles(REPO_ROOT);
  const config = loadAppConfig(process.env);
  if (config.monid === null) {
    throw new Error('Set MONID_API_KEY in the repository-root .env.local first.');
  }
  const client = createMonidClient(config.monid);
  const [command, ...args] = process.argv.slice(2);

  if (command === 'discover') {
    const query = args.join(' ').trim();
    if (query === '') throw new Error('Usage: discover "<natural language query>"');
    const results = await client.discover(query, 15);
    for (const r of results) {
      console.log(`${r.score.toFixed(2)}  ${r.provider} ${r.endpoint}`);
      console.log(`      ${r.description}`);
      console.log(`      price: ${JSON.stringify(r.price)}  tags: ${r.tags.join(', ')}`);
    }
    return;
  }
  if (command === 'inspect') {
    const [provider, endpoint] = args;
    if (provider === undefined || endpoint === undefined) {
      throw new Error('Usage: inspect <provider> <endpoint>');
    }
    console.log(JSON.stringify(await client.inspect(provider, endpoint), null, 2));
    return;
  }
  if (command === 'run') {
    // PAID: starts a real Monid run. Saves the raw output to a file (keep it outside the
    // repository) and prints only its structure, so content is not echoed to the terminal.
    const [provider, endpoint, inputJson, outFile] = args;
    if (
      provider === undefined ||
      endpoint === undefined ||
      inputJson === undefined ||
      outFile === undefined
    ) {
      throw new Error('Usage: run <provider> <endpoint> <input-json> <output-file>');
    }
    const input = JSON.parse(inputJson) as JsonObject;
    const run = await client.runAndWait(provider, endpoint, input);
    writeFileSync(outFile, JSON.stringify(run, null, 2));
    console.log(
      `status=${run.status} providerHttpStatus=${run.providerHttpStatus} billedUnits=${run.billedUnits} providerError=${run.providerError}`,
    );
    console.log(`saved to ${outFile}`);
    console.log(describeShape(run.output));
    return;
  }
  throw new Error(
    'Commands: discover "<query>" | inspect <provider> <endpoint> | run <provider> <endpoint> <input-json> <output-file>',
  );
}

/** Field names and types only (one level into arrays), so the output shape can be mapped. */
function describeShape(value: JsonValue | null, depth = 0): string {
  const pad = '  '.repeat(depth);
  if (Array.isArray(value)) {
    const first = value[0];
    return `${pad}array(${value.length})${first === undefined ? '' : ` of:\n${describeShape(first, depth + 1)}`}`;
  }
  if (value !== null && typeof value === 'object') {
    if (depth > 3) return `${pad}object`;
    return Object.entries(value)
      .map(([key, child]) =>
        child !== null && typeof child === 'object'
          ? `${pad}${key}:\n${describeShape(child, depth + 1)}`
          : `${pad}${key}: ${child === null ? 'null' : typeof child}`,
      )
      .join('\n');
  }
  return `${pad}${value === null ? 'null' : typeof value}`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
