# MD Manager

Local Markdown document manager with preview, editing, split view, change review, and optional schema linking.

## Features

- Load Markdown files from the `md` folder
- Preview, edit, and split view
- Table of contents from Markdown headings
- Unsaved-change indicator
- Save and Save As
- Changes tab for line-by-line differences
- Optional schema files from the `schemas` folder
- Link a Markdown document to a schema file
- Automatic backups when saved content changes

## Install

```powershell
pip install -r requirements.txt
```

## Run

Double-click:

```text
run_md_manager.bat
```

Or run from PowerShell:

```powershell
python run_server.py
```

Then open:

```text
http://127.0.0.1:8787
```

## Folders

```text
md/                 Markdown documents
schemas/            Optional schema files
backups/md/         Markdown backups
backups/schemas/    Schema backups
```
