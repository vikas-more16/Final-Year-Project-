# Orchestra

Orchestra is an AI-assisted project planning and workflow platform built as a full-stack final-year project. It converts a Business Requirements Document (BRD) into a structured project plan, organizes epics, stories, and tasks, assigns work based on team roles and skills, and keeps project progress synchronized through an interactive orchestration system.

## Features

- **Authentication** — Email/password login and Firebase Google sign-in with secure HTTP-only session cookies.
- **Project management** — Create, view, update, and delete projects.
- **BRD handling** — Upload and replace BRD documents, with text extraction and project context generation.
- **AI planning** — Generate epics, stories, tasks, estimates, dependencies, and schedules from requirements.
- **Multi-agent orchestration** — Coordinate planning, reconciliation, audit, notification, and project-memory agents.
- **Team management** — Invite members, assign roles and skills, and track team capacity.
- **Automatic assignment** — Match tasks to exact roles or compatible roles and mark unavailable work for manual assignment.
- **Scheduling** — Calculate task dates, sprint allocations, dependencies, blocked work, and deadline risks.
- **Project views** — Summary, backlog, board, team, and AI orchestrator interfaces.
- **Audit trail** — Record agent actions and approval decisions for review.

## Tech Stack

### Client

- React 19
- Vite 8
- React Router 7
- Firebase Authentication
- Lucide React
- Plain CSS

### Server

- Node.js
- Express 5
- MongoDB with Mongoose
- JWT authentication
- Firebase Admin
- OpenAI-compatible LLM APIs
- Multer, Mammoth, and unpdf for document uploads and extraction
- Nodemailer for invitation emails

## Project Structure

```text
.
├── client/
│   ├── public/
│   └── src/
│       ├── components/
│       ├── context/
│       ├── hooks/
│       ├── lib/
│       ├── pages/
│       └── styles/
└── server/
    ├── src/
    │   ├── ai/
    │   ├── config/
    │   ├── controllers/
    │   ├── middleware/
    │   ├── models/
    │   ├── routes/
    │   └── utils/
    └── test/
```

## Prerequisites

- Node.js 20 or later
- npm
- MongoDB, local or hosted
- A Firebase project
- An OpenAI-compatible LLM provider API key (optional for core API usage)

## Environment Setup

### Server

Copy the example environment file:

```bash
cd server
cp .env.example .env
```

Update `.env` with your configuration:

| Variable | Description | Required |
|---|---|---|
| `PORT` | API server port, normally `5000` | No |
| `NODE_ENV` | Runtime environment | No |
| `MONGO_URI` | MongoDB connection URI | Yes |
| `CLIENT_URL` | Frontend origin for CORS | Yes for browser access |
| `JWT_SECRET` | Secret used to sign session tokens | Yes |
| `JWT_EXPIRES_IN` | Session duration, for example `7d` | No |
| `FIREBASE_PROJECT_ID` | Firebase project ID used for Google authentication verification | Yes |
| `SMTP_*` / `MAIL_FROM` | SMTP email settings for team invitations | No |
| `LLM_BASE_URL` | OpenAI-compatible API base URL | For AI features |
| `LLM_API_KEY` | LLM provider API key | For AI features |
| `LLM_MODEL_PLANNER` | Model used for planning | No |
| `LLM_MODEL_FAST` | Model used for faster agent operations | No |
| `LLM_TPM_LIMIT` | Optional token pacing limit | No |

### Client

Copy the example environment file:

```bash
cd client
cp .env.example .env
```

Add the Firebase web configuration:

```dotenv
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
```

## Installation and Running

Install dependencies for both applications:

```bash
cd server
npm install

cd ../client
npm install
```

Start MongoDB, then run the API server:

```bash
cd server
npm run dev
```

The API runs at `http://localhost:5000` by default.

In a separate terminal, start the React client:

```bash
cd client
npm run dev
```

The application runs at `http://localhost:5173` by default.

## Available Scripts

### Client

```bash
npm run dev      # Start the Vite development server
npm run build    # Create a production build
npm run lint     # Run ESLint
npm run preview  # Preview the production build
```

### Server

```bash
npm run dev      # Start the API with Node watch mode
npm start        # Start the API
npm test         # Run the scheduler and dependency engine tests
```

## Core API Areas

- `/api/auth` — Registration, login, logout, Google login, and current-user lookup.
- `/api/projects` — Project CRUD, BRD upload/download, and tab configuration.
- `/api/team` — Team membership and role management.
- `/api/invites` — Team invitation lookup and acceptance.
- `/api/projects/:id/ai` — Planning, orchestration, approvals, audit, and work-item operations.
- `/api/health` — Basic server health check.

## Testing

Run the server test suite from the server directory:

```bash
cd server
npm test
```

The tests cover dependency blocking, status rollups, scheduling, team assignment, sprint capacity, and deadline risk.

## Development Notes

- In development, Vite proxies `/api` requests to the Express server on port `5000`.
- Authentication uses an HTTP-only session cookie.
- The server requires `MONGO_URI`, `JWT_SECRET`, and `FIREBASE_PROJECT_ID` at startup.
- Email delivery is optional; without SMTP settings, invitation links are logged in the server console.
- AI features require a compatible LLM provider and valid API configuration.

## License

No license has been specified for this project.
