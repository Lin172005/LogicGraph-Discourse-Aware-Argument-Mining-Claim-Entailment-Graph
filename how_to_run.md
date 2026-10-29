# LogicGraph: How to Run

## Requirements

- Docker Desktop
- Node.js and npm

## 1. Configure the environment

Run these commands from the `logicgraph` folder:

```powershell
Copy-Item .\.env.example .\.env
```

Open `.env` and add at least one valid API key:

```env
GEMINI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key
```

Gemini is used first and Groq is used as a fallback. Keep `.env` private.

## 2. Start the backend and database

From the `logicgraph` folder:

```powershell
docker compose up -d --build
```

Check that the containers are running:

```powershell
docker compose ps
```

Check the backend:

```powershell
(Invoke-WebRequest http://localhost:8000/health).Content
```

The API documentation is available at:

```text
http://localhost:8000/docs
```

## 3. Start the frontend

Open a second PowerShell window:

```powershell
cd .\frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal, normally:

```text
http://localhost:5173
```

## 4. Use the application

1. Open the frontend.
2. Upload a `.txt` or `.pdf` file from **Ingest**.
3. Open **Dialectic Studio**.
4. Enter a topic and click **Synthesize**.

## Useful commands

View backend logs:

```powershell
docker compose logs -f backend
```

Stop the services:

```powershell
docker compose down
```

Stop the services and delete Neo4j data:

```powershell
docker compose down -v
```
