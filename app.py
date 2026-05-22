import json
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent
PRD_DIR = BASE_DIR / "md"
SCHEMA_DIR = BASE_DIR / "schemas"
LINKS_PATH = BASE_DIR / "md_schema_links.json"
BACKUP_DIR = BASE_DIR / "backups"
PRD_EXTENSIONS = {".md", ".markdown"}
SCHEMA_EXTENSIONS = {".sql", ".ddl", ".prisma", ".json", ".yaml", ".yml", ".md"}

app = FastAPI(title="MD Manager")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")


class SavePrdRequest(BaseModel):
    file: str | None = None
    content: str


class SaveSchemaRequest(BaseModel):
    file: str | None = None
    content: str


class CreateFileRequest(BaseModel):
    file: str
    content: str | None = None


class RenameFileRequest(BaseModel):
    file: str
    new_file: str


class DeleteFileRequest(BaseModel):
    file: str


class LinkSchemaRequest(BaseModel):
    prd_file: str
    schema_file: str | None = None


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
        (PRD_DIR / "document.md").write_text(
            "# New Markdown Document\n\nStart writing here.\n",
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


def resolve_new_managed_file(directory: Path, extensions: set[str], file_name: str) -> Path:
    candidate = (directory / file_name).resolve()
    directory_root = directory.resolve()

    if directory_root != candidate and directory_root not in candidate.parents:
        raise HTTPException(status_code=400, detail="File must be inside managed directory")
    if candidate.suffix.lower() not in extensions:
        raise HTTPException(status_code=400, detail="Unsupported file extension")

    return candidate


def file_payload(directory: Path, file_path: Path) -> dict[str, str]:
    return {
        "name": file_path.name,
        "path": file_path.relative_to(directory).as_posix(),
        "content": file_path.read_text(encoding="utf-8"),
    }


def read_schema_links() -> dict[str, str]:
    if not LINKS_PATH.exists():
        return {}

    try:
        data = json.loads(LINKS_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}

    if not isinstance(data, dict):
        return {}

    return {
        str(prd_file): str(schema_file)
        for prd_file, schema_file in data.items()
        if isinstance(prd_file, str) and isinstance(schema_file, str)
    }


def write_schema_links(links: dict[str, str]) -> None:
    if not links:
        if LINKS_PATH.exists():
            LINKS_PATH.unlink()
        return

    LINKS_PATH.write_text(
        json.dumps(dict(sorted(links.items())), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def valid_schema_links() -> dict[str, str]:
    prd_paths = {file["path"] for file in list_files(PRD_DIR, PRD_EXTENSIONS)}
    schema_paths = {file["path"] for file in list_files(SCHEMA_DIR, SCHEMA_EXTENSIONS)}
    return {
        prd_file: schema_file
        for prd_file, schema_file in read_schema_links().items()
        if prd_file in prd_paths and schema_file in schema_paths
    }


def update_schema_links(old_path: str, new_path: str | None, file_kind: str) -> None:
    links = read_schema_links()
    changed = False

    if file_kind == "prd":
        if old_path in links:
            if new_path is None:
                links.pop(old_path)
            else:
                links[new_path] = links.pop(old_path)
            changed = True
    elif file_kind == "schema":
        for prd_file, schema_file in list(links.items()):
            if schema_file != old_path:
                continue
            if new_path is None:
                links.pop(prd_file)
            else:
                links[prd_file] = new_path
            changed = True

    if changed:
        write_schema_links(links)


def create_managed_file(
    directory: Path,
    extensions: set[str],
    payload: CreateFileRequest,
    default_content: str,
) -> JSONResponse:
    ensure_files()
    selected_file = resolve_new_managed_file(directory, extensions, payload.file)
    if selected_file.exists():
        raise HTTPException(status_code=409, detail="File already exists")

    selected_file.parent.mkdir(parents=True, exist_ok=True)
    selected_file.write_text(payload.content if payload.content is not None else default_content, encoding="utf-8")
    return JSONResponse({
        "ok": True,
        "message": f"{selected_file.name} created",
        "path": selected_file.relative_to(directory).as_posix(),
    })


def rename_managed_file(
    directory: Path,
    extensions: set[str],
    payload: RenameFileRequest,
) -> JSONResponse:
    ensure_files()
    selected_file = resolve_managed_file(directory, extensions, payload.file)
    target_file = resolve_new_managed_file(directory, extensions, payload.new_file)
    if target_file.exists():
        raise HTTPException(status_code=409, detail="Target file already exists")

    target_file.parent.mkdir(parents=True, exist_ok=True)
    selected_file.rename(target_file)
    return JSONResponse({
        "ok": True,
        "message": f"{selected_file.name} renamed",
        "path": target_file.relative_to(directory).as_posix(),
    })


def delete_managed_file(
    directory: Path,
    extensions: set[str],
    payload: DeleteFileRequest,
) -> JSONResponse:
    ensure_files()
    selected_file = resolve_managed_file(directory, extensions, payload.file)
    relative_path = selected_file.relative_to(directory).as_posix()
    selected_file.unlink()
    return JSONResponse({
        "ok": True,
        "message": f"{selected_file.name} deleted",
        "path": relative_path,
    })


def write_with_backup(directory: Path, file_path: Path, content: str, backup_kind: str) -> str | None:
    if not file_path.exists():
        file_path.write_text(content, encoding="utf-8")
        return None

    existing_content = file_path.read_text(encoding="utf-8")
    if existing_content == content:
        return None

    relative_path = file_path.relative_to(directory)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = BACKUP_DIR / backup_kind / relative_path.parent / f"{relative_path.name}.{timestamp}.bak"
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    backup_path.write_text(existing_content, encoding="utf-8")
    file_path.write_text(content, encoding="utf-8")
    return backup_path.relative_to(BASE_DIR).as_posix()


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    ensure_files()
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/documents")
def get_documents():
    ensure_files()
    md_files = list_files(PRD_DIR, PRD_EXTENSIONS)
    return {
        "documents": md_files,
        "schemas": list_files(SCHEMA_DIR, SCHEMA_EXTENSIONS),
        "links": valid_schema_links(),
    }


@app.get("/api/md")
def get_prd(file: str | None = Query(default=None)):
    ensure_files()
    selected_file = resolve_managed_file(PRD_DIR, PRD_EXTENSIONS, file)
    return file_payload(PRD_DIR, selected_file)


@app.post("/api/md")
def save_prd(payload: SavePrdRequest):
    ensure_files()
    selected_file = resolve_managed_file(PRD_DIR, PRD_EXTENSIONS, payload.file)
    backup_path = write_with_backup(PRD_DIR, selected_file, payload.content, "md")
    return JSONResponse({
        "ok": True,
        "message": f"{selected_file.name} saved",
        "path": selected_file.relative_to(PRD_DIR).as_posix(),
        "backup": backup_path,
    })


@app.post("/api/md/file")
def create_prd_file(payload: CreateFileRequest):
    return create_managed_file(
        PRD_DIR,
        PRD_EXTENSIONS,
        payload,
        "# New Markdown Document\n\nStart writing here.\n",
    )


@app.patch("/api/md/file")
def rename_prd_file(payload: RenameFileRequest):
    selected_file = resolve_managed_file(PRD_DIR, PRD_EXTENSIONS, payload.file)
    target_file = resolve_new_managed_file(PRD_DIR, PRD_EXTENSIONS, payload.new_file)
    old_path = selected_file.relative_to(PRD_DIR).as_posix()
    new_path = target_file.relative_to(PRD_DIR).as_posix()
    response = rename_managed_file(PRD_DIR, PRD_EXTENSIONS, payload)
    update_schema_links(old_path, new_path, "prd")
    return response


@app.delete("/api/md/file")
def delete_prd_file(payload: DeleteFileRequest):
    selected_file = resolve_managed_file(PRD_DIR, PRD_EXTENSIONS, payload.file)
    old_path = selected_file.relative_to(PRD_DIR).as_posix()
    response = delete_managed_file(PRD_DIR, PRD_EXTENSIONS, payload)
    update_schema_links(old_path, None, "prd")
    return response


@app.post("/api/md/link")
def link_schema_to_prd(payload: LinkSchemaRequest):
    ensure_files()
    prd_file = resolve_managed_file(PRD_DIR, PRD_EXTENSIONS, payload.prd_file)
    prd_path = prd_file.relative_to(PRD_DIR).as_posix()
    links = read_schema_links()

    if payload.schema_file is None:
        links.pop(prd_path, None)
        write_schema_links(links)
        return JSONResponse({"ok": True, "path": prd_path, "schema": None})

    schema_file = resolve_managed_file(SCHEMA_DIR, SCHEMA_EXTENSIONS, payload.schema_file)
    schema_path = schema_file.relative_to(SCHEMA_DIR).as_posix()
    links[prd_path] = schema_path
    write_schema_links(links)
    return JSONResponse({"ok": True, "path": prd_path, "schema": schema_path})


@app.get("/api/schema")
def get_schema(file: str | None = Query(default=None)):
    ensure_files()
    selected_file = resolve_managed_file(SCHEMA_DIR, SCHEMA_EXTENSIONS, file)
    return file_payload(SCHEMA_DIR, selected_file)


@app.post("/api/schema")
def save_schema(payload: SaveSchemaRequest):
    ensure_files()
    selected_file = resolve_managed_file(SCHEMA_DIR, SCHEMA_EXTENSIONS, payload.file)
    backup_path = write_with_backup(SCHEMA_DIR, selected_file, payload.content, "schemas")
    return JSONResponse({
        "ok": True,
        "message": f"{selected_file.name} saved",
        "path": selected_file.relative_to(SCHEMA_DIR).as_posix(),
        "backup": backup_path,
    })


@app.post("/api/schema/file")
def create_schema_file(payload: CreateFileRequest):
    return create_managed_file(
        SCHEMA_DIR,
        SCHEMA_EXTENSIONS,
        payload,
        "-- New schema\n",
    )


@app.patch("/api/schema/file")
def rename_schema_file(payload: RenameFileRequest):
    selected_file = resolve_managed_file(SCHEMA_DIR, SCHEMA_EXTENSIONS, payload.file)
    target_file = resolve_new_managed_file(SCHEMA_DIR, SCHEMA_EXTENSIONS, payload.new_file)
    old_path = selected_file.relative_to(SCHEMA_DIR).as_posix()
    new_path = target_file.relative_to(SCHEMA_DIR).as_posix()
    response = rename_managed_file(SCHEMA_DIR, SCHEMA_EXTENSIONS, payload)
    update_schema_links(old_path, new_path, "schema")
    return response


@app.delete("/api/schema/file")
def delete_schema_file(payload: DeleteFileRequest):
    selected_file = resolve_managed_file(SCHEMA_DIR, SCHEMA_EXTENSIONS, payload.file)
    old_path = selected_file.relative_to(SCHEMA_DIR).as_posix()
    response = delete_managed_file(SCHEMA_DIR, SCHEMA_EXTENSIONS, payload)
    update_schema_links(old_path, None, "schema")
    return response


@app.get("/api/health")
def health():
    return {"ok": True}


def run_server() -> None:
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8787, log_level="info")


if __name__ == "__main__":
    run_server()
