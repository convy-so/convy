# Convy

Convy is a web application for AI-assisted research interviews and classroom tutoring. It brings together survey design and analysis, educator and student workspaces, lesson-material processing, expert knowledge, and live tutoring sessions. The project is organized as a Next.js application with separate background-worker and WebSocket processes for work that should not run inside a page request.

## What the application includes

- Research and survey workflows, including education and skills catalogs.
- Tutoring workspaces for teachers and students, with lesson materials and session features.
- AI-backed generation and media-retrieval workflows using configured model and search providers.
- Authentication, email workflows, PostgreSQL persistence, queued background work, and realtime messaging.

Some features depend on external providers and credentials. Configure only the integrations needed for the workflows you plan to use; an absent provider key can make its dependent feature unavailable.

## Technology

- Next.js App Router, React, and TypeScript
- PostgreSQL, Drizzle ORM, and `pgvector`
- Redis and BullMQ for background jobs
- Better Auth for authentication
- AI SDK integrations, with optional providers for voice, media search, and observability

## Local development

### Prerequisites

- Node.js 20 or newer
- pnpm 10.10.0
- PostgreSQL with the `pgvector` extension
- Redis
- Provider credentials for the features you want to use

### Start the application

1. Install packages: `pnpm install`.
2. Copy `.env.example` to `.env` and replace placeholder values with local database, auth, and provider settings. Keep real credentials out of version control.
3. Create the configured database and apply migrations with `pnpm db:migrate`.
4. Start the web app, background worker, and realtime server with `pnpm dev:all`.

The web app uses port `3000` by default and the WebSocket server uses port `3001`. `pnpm dev` starts only the web app; queued material processing and realtime functionality require the worker and WebSocket processes as well. The `.env.example` file documents the available environment-variable names and local defaults.

## Common commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the Next.js development server |
| `pnpm dev:all` | Start the web app, worker, and WebSocket server together |
| `pnpm db:migrate` | Apply existing Drizzle migrations |
| `pnpm db:generate` | Generate a migration from schema changes |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Check TypeScript without emitting output |
| `pnpm test` | Run the repository's assertion-based test suites |

## Repository layout

- `app/` — localized routes, pages, and request handlers.
- `features/` — product areas and their UI, server logic, and supporting assets.
- `shared/` — shared database, authentication, AI, queue, and realtime infrastructure.
- `scripts/` — developer and quality-check utilities.
- `docs/` — engineering notes, including the [module seam audit](docs/module-seam-audit.md).

## Configuration and data

Use a dedicated local database for development and review the migrations before applying schema changes to any existing data. Never commit `.env` files, provider tokens, private user data, or generated credentials. `.env.example` is a template; it does not contain working credentials. Integrations such as email delivery, OAuth, AI models, and media search require their own provider accounts and configuration.

## Licensing and ownership

This repository does not currently include a `LICENSE` file. Before redistribution or sale, confirm ownership and transfer rights for the application code, prompts, media, fonts, dependencies, and other included assets, then provide the license and transaction terms that apply.
