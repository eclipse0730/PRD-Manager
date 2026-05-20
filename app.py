from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi import Request
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent
PRD_PATH = BASE_DIR / "prds" / "prd.md"
SCHEMA_PATH = BASE_DIR / "schemas" / "db_schema.sql"

app = FastAPI(title="PRD Manager")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")


class SavePrdRequest(BaseModel):
    content: str


def ensure_files() -> None:
    PRD_PATH.parent.mkdir(parents=True, exist_ok=True)
    SCHEMA_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not PRD_PATH.exists():
        PRD_PATH.write_text("# New PRD\n\n## 개요\n\n내용을 작성하세요.\n", encoding="utf-8")
    if not SCHEMA_PATH.exists():
        SCHEMA_PATH.write_text("-- db_schema.sql\n", encoding="utf-8")


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    ensure_files()
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/prd")
def get_prd():
    ensure_files()
    return {"content": PRD_PATH.read_text(encoding="utf-8")}


@app.post("/api/prd")
def save_prd(payload: SavePrdRequest):
    ensure_files()
    PRD_PATH.write_text(payload.content, encoding="utf-8")
    return JSONResponse({"ok": True, "message": "prd.md saved"})


@app.get("/api/schema")
def get_schema():
    ensure_files()
    return {"content": SCHEMA_PATH.read_text(encoding="utf-8")}


@app.get("/api/health")
def health():
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8787, reload=True)
