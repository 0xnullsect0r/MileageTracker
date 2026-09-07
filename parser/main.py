"""
.numbers parser sidecar.

Numbers files are Snappy-compressed protobuf; there is no workable Node
parser, so this exists to keep Python out of the app image while staying
inside the one compose stack.

It has no database access, no volumes, and is not published to the host. It
parses untrusted uploads, so it runs read-only with a tmpfs scratch dir and
holds nothing between requests.
"""

import os
import tempfile
from datetime import date, datetime
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from numbers_parser import Document

MAX_BYTES = int(os.environ.get("MAX_UPLOAD_MB", "32")) * 1024 * 1024

app = FastAPI(title="numbers-parser", docs_url=None, redoc_url=None)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _cell(value: Any) -> Any:
    if isinstance(value, datetime):
        # Times in this file are timezone artifacts; the date is the datum.
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if value == "":
        return None
    return value


@app.post("/parse")
async def parse(file: UploadFile = File(...)) -> dict[str, Any]:
    body = await file.read(MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds {MAX_BYTES // 1024 // 1024}MB.")

    with tempfile.NamedTemporaryFile(suffix=".numbers", delete=True) as tmp:
        tmp.write(body)
        tmp.flush()
        try:
            doc = Document(tmp.name)
        except Exception as exc:  # noqa: BLE001 - surface a clean message, not a stack
            raise HTTPException(status_code=422, detail=f"Could not read that .numbers file: {exc}") from exc

        sheets = []
        for sheet in doc.sheets:
            tables = []
            for table in sheet.tables:
                rows = [[_cell(c) for c in row] for row in table.rows(values_only=True)]
                headers = [str(h) if h is not None else "" for h in (rows[0] if rows else [])]
                tables.append(
                    {
                        "name": table.name,
                        "headers": headers,
                        "rows": rows[1:],
                        "numRows": max(0, len(rows) - 1),
                    }
                )
            sheets.append({"name": sheet.name, "tables": tables})

    return {"filename": file.filename, "sheets": sheets}
