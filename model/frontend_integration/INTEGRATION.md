# Wiring the orchestrator into the React app (about 10 minutes)

Written against the `App.jsx` in the zip you shared. If your friends changed it, the same 4 edits apply.

1. Copy `orchestratorApi.js` and `OrchestratorPanel.jsx` into `src/`.
2. Edit `src/App.jsx`:
   ```jsx
   // (a) top of file
   import OrchestratorPanel from './OrchestratorPanel'

   // (b) next to the other useState lines
   const [ownerEmail, setOwnerEmail] = useState('')

   // (c) the login email input: make it controlled so we know who the leader is
   <input id="email" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} ... />

   // (d) final step: keep the success message and add the panel under it
   : <><div className="success-message" ...>...</div>
        <OrchestratorPanel organizationName={organizationName} ownerEmail={ownerEmail} members={members} /></>
   ```
3. Run the backend (`uvicorn app.main:app --port 8000`) and the frontend (`npm run dev`).
   Change the API address with `VITE_ORCH_URL` in a `.env` file if needed.

What the panel does: project form, domain checkboxes per member, SDLC model picker, live agent progress
while the orchestrator runs (polls `stage`), task list with status dropdowns (locked tasks are disabled until
their phase starts), assignments, "ask the orchestrator" box, agent message log and the latest report.

If your friends later add a domain picker to their member form, just pass `domains` on each member
(`{email, role, domains: ['backend']}`) and the panel will pre-tick the boxes.

Styling is minimal inline styles so it works without their CSS; restyle as you like.
