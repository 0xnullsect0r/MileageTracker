import "server-only";
import type { ParsedDocument, ParsedTable } from "./mapping";

const PARSER_URL = process.env.PARSER_URL ?? "http://parser:8000";
const MAX_MB = Number(process.env.MAX_UPLOAD_MB ?? "32");

export class ParseError extends Error {}

/**
 * Parse an uploaded spreadsheet.
 *
 * `.numbers` goes to the sidecar (Snappy-compressed protobuf, no viable Node
 * parser). CSV is handled here. Both produce the same shape, so everything
 * downstream — mapping, outlier review, commit — is one code path.
 */
export async function parseUpload(file: File): Promise<ParsedDocument> {
  if (file.size > MAX_MB * 1024 * 1024) {
    throw new ParseError(`That file is larger than ${MAX_MB}MB.`);
  }
  const name = file.name.toLowerCase();

  if (name.endsWith(".numbers")) return parseNumbers(file);
  if (name.endsWith(".csv") || name.endsWith(".txt")) return parseCsv(file);
  throw new ParseError("Upload a .numbers or .csv file.");
}

async function parseNumbers(file: File): Promise<ParsedDocument> {
  const body = new FormData();
  body.append("file", file, file.name);

  let res: Response;
  try {
    res = await fetch(`${PARSER_URL}/parse`, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new ParseError(
      "The .numbers reader is not reachable. Check that the `parser` service is running.",
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ParseError(
      res.status === 413
        ? `That file is larger than ${MAX_MB}MB.`
        : `That .numbers file could not be read. ${safeDetail(detail)}`.trim(),
    );
  }
  return (await res.json()) as ParsedDocument;
}

async function parseCsv(file: File): Promise<ParsedDocument> {
  const text = await file.text();
  const rows = parseCsvText(text);
  if (rows.length === 0) throw new ParseError("That file is empty.");

  const table: ParsedTable = {
    name: file.name.replace(/\.[^.]+$/, ""),
    headers: (rows[0] ?? []).map((h) => h.trim()),
    rows: rows.slice(1),
    numRows: Math.max(0, rows.length - 1),
  };
  return { filename: file.name, sheets: [{ name: table.name, tables: [table] }] };
}

/** RFC4180-ish: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Strip a UTF-8 BOM from the first cell.
  const first = rows[0]?.[0];
  if (first?.charCodeAt(0) === 0xfeff) rows[0]![0] = first.slice(1);
  return rows.filter((r) => r.length > 0);
}

function safeDetail(detail: string): string {
  try {
    const parsed = JSON.parse(detail) as { detail?: string };
    return typeof parsed.detail === "string" ? parsed.detail.slice(0, 200) : "";
  } catch {
    return "";
  }
}
