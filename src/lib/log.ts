import "server-only";

/**
 * One-line JSON logs to stdout — the format the compose stack ingests
 * without any collector. Fields are stable across events so downstream
 * queries are straightforward.
 *
 * No PII: never log emails or entry descriptions. Actor id is fine.
 */

type Level = "debug" | "info" | "warn" | "error";

export interface LogFields {
  msg: string;
  actorId?: string;
  requestId?: string;
  path?: string;
  method?: string;
  durationMs?: number;
  outcome?: "ok" | "error";
  error?: string;
  [k: string]: unknown;
}

export function log(level: Level, fields: LogFields): void {
  const line = {
    level,
    ts: new Date().toISOString(),
    ...fields,
  };
  const stream = level === "error" ? process.stderr : process.stdout;
  stream.write(JSON.stringify(line) + "\n");
}

/** Small helper for wrapping a Server Action's body — timing + outcome. */
export async function withLog<T>(
  fields: LogFields,
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    log("info", { ...fields, outcome: "ok", durationMs: Date.now() - started });
    return result;
  } catch (e) {
    log("error", {
      ...fields,
      outcome: "error",
      durationMs: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
