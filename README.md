# Autonomous Delivery Lead for Google Apps Script

This project turns the original static page into a deployable Google Apps Script web app that acts like an autonomous product manager and delivery lead.

## What it does

- Maintains a living agent profile with mission, operating model, SAFe context, and Six Sigma Black Belt focus.
- Accepts evolving directions as they arrive and converts them into an updated charter and backlog.
- Ingests Google Drive files or pasted text so the agent can learn from new documents over time.
- Produces SAFe-style outputs such as strategic theme, epic hypothesis, features, PI objectives, risks, and evidence.
- Produces Six Sigma outputs such as DMAIC phase, CTQs, problem statement, root-cause signals, improvement actions, and control plan.
- Supports optional OpenAI or Gemini narrative generation if you store an API key in Apps Script Script Properties.

## Files

- `Code.gs` – Apps Script backend and planning engine.
- `index.html` – HtmlService front-end.
- `appsscript.json` – Apps Script manifest for web app deployment.

## Deploy in Google Apps Script

1. Create a new Apps Script project.
2. Copy `Code.gs`, `index.html`, and `appsscript.json` into the project.
3. Deploy as a web app.
4. If you want optional model-generated narrative:
   - Add `OPENAI_API_KEY` and optionally `OPENAI_MODEL` in Script Properties, or
   - Add `GEMINI_API_KEY` and optionally `GEMINI_MODEL` in Script Properties.
5. Open the deployed URL and start adding directions and artifacts.

## Notes on ingestion

- Google Docs bodies are read directly.
- Plain text, CSV, JSON, and Markdown-like text blobs are read directly.
- Unsupported binary file types are captured with metadata only unless you paste a text summary.

## Suggested next enhancements

- Add folder watchers or a scheduled trigger to ingest a specific Drive folder automatically.
- Persist decisions, metrics, and owner assignments in Sheets.
- Add approval workflows for autonomous recommendations.
- Extend artifact parsing for PDFs and Slides with document-specific extractors.
