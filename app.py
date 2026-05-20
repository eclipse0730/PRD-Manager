from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent
PRD_DIR = BASE_DIR / "prds"
SCHEMA_DIR = BASE_DIR / "schemas"
PRD_EXTENSIONS = {".md", ".markdown"}
SCHEMA_EXTENSIONS = {".sql", ".ddl", ".prisma", ".json", ".yaml", ".yml", ".md"}

app = FastAPI(title="PRD Manager")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")


class SavePrdRequest(BaseModel):
    file: str | None = None
    content: str


class SaveSchemaRequest(BaseModel):
    file: str | None = None
    content: str


def list_files(directory: Path, extensions: set[str]) -> list[dict[str, str]]:
    if not directory.exists():
        return []

    files = []
    for file_path in directory.rglob("*"):
        if not file_path.is_file() or file_path.suffix.lower() not in extensions:
            continue
        files.append({
            "name": file_path.name,
            "path": file_path.relative_to(directory).as_posix(),
        })

    return sorted(files, key=lambda item: item["path"].lower())


def ensure_files() -> None:
    PRD_DIR.mkdir(parents=True, exist_ok=True)
    SCHEMA_DIR.mkdir(parents=True, exist_ok=True)

    if not list_files(PRD_DIR, PRD_EXTENSIONS):
        (PRD_DIR / "prd.md").write_text(
            "# New PRD\n\n## Overview\n\nWrite your PRD here.\n",
            encoding="utf-8",
        )
    if not list_files(SCHEMA_DIR, SCHEMA_EXTENSIONS):
        (SCHEMA_DIR / "db_schema.sql").write_text("-- db_schema.sql\n", encoding="utf-8")


def resolve_managed_file(directory: Path, extensions: set[str], file_name: str | None) -> Path:
    available_files = list_files(directory, extensions)
    if not available_files:
        raise HTTPException(status_code=404, detail="No managed files found")

    selected_file = file_name or available_files[0]["path"]
    candidate = (directory / selected_file).resolve()
    directory_root = directory.resolve()

    if directory_root != candidate and directory_root not in candidate.parents:
        raise HTTPException(status_code=400, detail="File must be inside managed directory")
    if candidate.suffix.lower() not in extensions:
        raise HTTPException(status_code=400, detail="Unsupported file extension")
    if not candidate.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    return candidate


def file_payload(directory: Path, file_path: Path) -> dict[str, str]:
    return {
        "name": file_path.name,
        "path": file_path.relative_to(directory).as_posix(),
        "content": file_path.read_text(encoding="utf-8"),
    }


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    ensure_files()
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/documents")
def get_documents():
    ensure_files()
    return {
        "prds": list_files(PRD_DIR, PRD_EXTENSIONS),
        "schemas": list_files(SCHEMA_DIR, SCHEMA_EXTENSIONS),
    }


@app.get("/api/prd")
def get_prd(file: str | None = Query(default=None)):
    ensure_files()
    selected_file = resolve_managed_file(PRD_DIR, PRD_EXTENSIONS, file)
    return file_payload(PRD_DIR, selected_file)


@app.post("/api/prd")
def save_prd(payload: SavePrdRequest):
    ensure_files()
    selected_file = resolve_managed_file(PRD_DIR, PRD_EXTENSIONS, payload.file)
    selected_file.write_text(payload.content, encoding="utf-8")
    return JSONResponse({
        "ok": True,
        "message": f"{selected_file.name} saved",
        "path": selected_file.relative_to(PRD_DIR).as_posix(),
    })


@app.get("/api/schema")
def get_schema(file: str | None = Query(default=None)):
    ensure_files()
    selected_file = resolve_managed_file(SCHEMA_DIR, SCHEMA_EXTENSIONS, file)
    return file_payload(SCHEMA_DIR, selected_file)


@app.post("/api/schema")
def save_schema(payload: SaveSchemaRequest):
    ensure_files()
    selected_file = resolve_managed_file(SCHEMA_DIR, SCHEMA_EXTENSIONS, payload.file)
    selected_file.write_text(payload.content, encoding="utf-8")
    return JSONResponse({
        "ok": True,
        "message": f"{selected_file.name} saved",
        "path": selected_file.relative_to(SCHEMA_DIR).as_posix(),
    })


@app.get("/api/health")
def health():
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="127.0.0.1", port=8787)
