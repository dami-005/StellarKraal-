# StellarKraal

[![CI](https://img.shields.io/github/actions/workflow/status/teslims2/StellarKraal-/backend-ci.yml?branch=main&label=backend%20CI)](https://github.com/teslims2/StellarKraal-/actions/workflows/backend-ci.yml)
[![CI](https://img.shields.io/github/actions/workflow/status/teslims2/StellarKraal-/frontend-ci.yml?branch=main&label=frontend%20CI)](https://github.com/teslims2/StellarKraal-/actions/workflows/frontend-ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-70%25%20min-brightgreen)](https://github.com/teslims2/StellarKraal-/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)


<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/23b2988b-5df8-4ca8-8350-cb556a98002a" />


<img width="1920" height="1080" alt="Screenshot from 2026-06-08 19-30-32" src="https://github.com/user-attachments/assets/88b1d3f6-ba00-483c-81c7-d38f633e82bb" />

<img width="1920" height="1080" alt="Screenshot from 2026-06-08 19-30-16" src="https://github.com/user-attachments/assets/7298b819-0ad8-4ce4-ad77-868393feb72f" />

<img width="1920" height="1080" alt="Screenshot from 2026-06-08 19-30-10" src="https://github.com/user-attachments/assets/c7d2183f-9971-47f0-8391-d14488a69ff0" />

link to website https://kraal-bloom-connect.lovable.app/

## Project Overview

StellarKraal enables livestock-backed loans on the Stellar network. Animals are registered as collateral and borrowers can request loans against their appraised value, with on-chain loan lifecycle management and liquidation protection.

See the [CHANGELOG](CHANGELOG.md) for release notes and upcoming changes.

## Architecture

```mermaid
flowchart LR
  subgraph Frontend
    F[Next.js frontend] -->|HTTP| B[Backend API]
  end

  subgraph Backend
    B -->|SQL| DB[(SQLite / PostgreSQL)]
    B -->|RPC| S[Soroban smart contract]
    B -->|logs, json-file driver| PT[Promtail]
    B -->|/metrics| PR[Prometheus]
  end

  subgraph Contracts
    S -->|WASM| W[(Stellar contract)]
  end

  subgraph Observability
    PT -->|push| LK[(Loki)]
    PR -->|scrape / alert rules| GF[Grafana]
    LK -->|query| GF[Grafana]
  end

  subgraph Infrastructure["Infrastructure (Terraform, AWS)"]
    ECS[ECS Fargate: backend/frontend] --> RDS[(RDS PostgreSQL)]
    ECS --> S3[(S3 backups)]
    SNS[SNS + CloudWatch alerts] -.-> B
  end

  B -.deployed on.-> ECS
```

### Architecture Summary

- Frontend: React + Next.js 14 with Tailwind CSS.
- Observability: backend metrics are scraped by Prometheus (alert rules in [`observability/prometheus-rules.yml`](observability/prometheus-rules.yml)); container logs are shipped by Promtail to Loki; Grafana visualizes both. See [docs/observability.md](docs/observability.md).
- Infrastructure: Terraform ([`terraform/`](terraform/) and [`infrastructure/`](infrastructure/)) provisions AWS resources (ECS Fargate, RDS, S3, VPC, backups, SNS/CloudWatch alerting) for staging/production.
- Backend: Node.js + TypeScript + Express.
- Smart contract: Rust using the Soroban SDK.
- Infrastructure: Docker, Docker Compose, local SQLite database.

### Loan State Machine

```mermaid
stateDiagram-v2
    [*] --> Pending : submit loan

    Pending --> Active : request_loan()

    Active --> at_risk : HF drops

    at_risk --> Active : HF recovers

    Active --> Repaid : repay_loan()

    Active --> Liquidated : liquidate()

    at_risk --> Repaid : repay_loan()

    at_risk --> Liquidated : liquidate()

    Repaid --> [*]
    Liquidated --> [*]
```

Full documentation: [Loan State Machine](docs/protocol/loan-state-machine.md)

## Liquidation Mechanism

A loan becomes liquidatable when its **health factor (HF)** falls below `1.0`:

```
HF = (collateral_value × liquidation_threshold) / outstanding_debt
```

Liquidations are **partial**: a liquidator repays a portion of the outstanding debt and receives a proportional slice of collateral plus a **liquidation bonus**. The bonus is paid out of the seized collateral, so the borrower's remaining position is reduced but not wiped out unless the liquidator repays the full debt.

### Liquidation bonus

```
collateral_seized = debt_repaid × (1 + liquidation_bonus)
bonus_paid        = debt_repaid × liquidation_bonus
```

- `liquidation_bonus` is a protocol parameter (e.g. `0.05` = 5%).
- The bonus is **distributed to the liquidator** as extra collateral value on top of the debt they repaid; the protocol does not take a cut of the bonus.
- Seized collateral is deducted from the borrower's collateral balance at the appraised value used for the HF calculation.

### Worked examples (partial liquidation)

Assume `liquidation_threshold = 0.80` and `liquidation_bonus = 0.05` throughout.

**Example 1 — small partial liquidation**

| Field | Value |
|---|---|
| Collateral value | 10,000 |
| Outstanding debt | 8,500 |
| HF before | (10,000 × 0.80) / 8,500 = **0.94** (liquidatable) |
| Debt repaid by liquidator | 1,000 |
| Collateral seized | 1,000 × 1.05 = **1,050** |
| Bonus to liquidator | 1,000 × 0.05 = **50** |
| Collateral after | 10,000 − 1,050 = 8,950 |
| Debt after | 8,500 − 1,000 = 7,500 |
| HF after | (8,950 × 0.80) / 7,500 = **0.955** (still liquidatable) |

**Example 2 — partial liquidation that restores health**

| Field | Value |
|---|---|
| Collateral value | 10,000 |
| Outstanding debt | 8,500 |
| HF before | **0.94** (liquidatable) |
| Debt repaid by liquidator | 2,500 |
| Collateral seized | 2,500 × 1.05 = **2,625** |
| Bonus to liquidator | 2,500 × 0.05 = **125** |
| Collateral after | 10,000 − 2,625 = 7,375 |
| Debt after | 8,500 − 2,500 = 6,000 |
| HF after | (7,375 × 0.80) / 6,000 = **0.983** (still liquidatable) |

**Example 3 — partial liquidation that clears the re-liquidation threshold**

| Field | Value |
|---|---|
| Collateral value | 10,000 |
| Outstanding debt | 8,500 |
| HF before | **0.94** (liquidatable) |
| Debt repaid by liquidator | 3,500 |
| Collateral seized | 3,500 × 1.05 = **3,675** |
| Bonus to liquidator | 3,500 × 0.05 = **175** |
| Collateral after | 10,000 − 3,675 = 6,325 |
| Debt after | 8,500 − 3,500 = 5,000 |
| HF after | (6,325 × 0.80) / 5,000 = **1.012** (safe) |

### Avoiding re-liquidation

After a partial liquidation the borrower remains exposed unless the resulting health factor is **strictly greater than `1.0`** (the protocol's `re_liquidation_threshold`). A position with `HF ≤ 1.0` can be liquidated again in the next block. Borrowers should either:

- repay enough debt themselves, or
- add collateral,

so that `HF > 1.0` after any liquidation event. In Example 3 above the borrower ends at `HF = 1.012` and is no longer liquidatable; Examples 1 and 2 leave the position below `1.0` and open to further partial liquidations.

### Liquidator's guide

1. **Monitor** — watch for loans whose `HF < 1.0` (the backend exposes this via the loan status endpoint and the `at_risk` state).
2. **Choose a repayment amount** — any amount up to the outstanding debt. Repaying more seizes more collateral and pushes the borrower's HF higher.
3. **Trigger** — call `liquidate(loan_id, amount)` on the Soroban contract (or use the frontend liquidation action). The contract transfers `amount` of the debt asset from the liquidator, marks the loan `Liquidated` if fully repaid, and otherwise keeps it `Active`/`at_risk`.
4. **Receive collateral** — the contract transfers `amount × (1 + liquidation_bonus)` of collateral value to the liquidator. Profit is `bonus_paid` minus any transaction fees and slippage on converting seized collateral back to the debt asset.
5. **Verify** — confirm the borrower's post-liquidation HF. If it is still `≤ 1.0`, the position can be liquidated again.

## Local Development

> For a detailed, platform-specific walkthrough see **[docs/development/local-setup.md](docs/development/local-setup.md)**.

### Prerequisites

Ensure the following minimum versions are installed before you begin:

| Tool | Minimum version | Install |
|------|-----------------|---------|
| Node.js | **20.x** | [nodejs.org](https://nodejs.org/) or `nvm install 20` |
| npm | **10.x** (bundled with Node 20) | — |
| Rust | **1.78+** | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| stellar-cli | **22+** | `cargo install --locked stellar-cli --features opt` |
| Docker & Docker Compose | **24+** (optional, for containerised setup) | [docs.docker.com](https://docs.docker.com/get-docker/) |
| Freighter | latest | [freighter.app](https://www.freighter.app/) (browser extension) |

Verify your environment:

```bash
node --version   # v20.x or higher
npm --version    # 10.x or higher
rustc --version  # 1.78.x or higher
stellar --version # 22.x or higher
```

### Clone and setup

```bash
git clone https://github.com/<your-username>/StellarKraal-.git
cd StellarKraal-
cp .env.example .env
```

### Environment Variables

Create a `.env` file in the project root containing:

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_NETWORK` | Stellar network to use | `testnet` |
| `RPC_URL` | Soroban JSON-RPC endpoint | `https://soroban-testnet.stellar.org` |
| `CONTRACT_ID` | Deployed Soroban contract ID | `G...` |
| `PORT` | Backend service port | `3001` |
| `NEXT_PUBLIC_API_URL` | Frontend API base URL | `http://localhost:3001` |
| `SHUTDOWN_TIMEOUT_MS` | Graceful shutdown drain timeout (ms, min 1000, default 10000). On SIGTERM/SIGINT the server stops accepting new connections and waits up to this duration for in-flight requests to complete before forcing exit. | `10000` |

### Run with Docker Compose

```bash
docker-compose up --build
```

Access:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:3001`

### Pulling pre-built images (Apple Silicon / arm64)

GHCR images are published as multi-arch manifests covering `linux/amd64` and `linux/arm64`. Docker Desktop on Apple Silicon automatically selects the native arm64 layer — no `--platform` flag needed.

```bash
# Pull latest images (arm64 selected automatically on Apple Silicon)
docker pull ghcr.io/teslims2/stellarkraal-backend:main
docker pull ghcr.io/teslims2/stellarkraal-frontend:main

# Or run directly — Docker resolves the correct arch from the manifest
docker run --rm -p 3001:3001 ghcr.io/teslims2/stellarkraal-backend:main
docker run --rm -p 3000:3000 ghcr.io/teslims2/stellarkraal-frontend:main
```

To verify you received the native arm64 image:

```bash
docker inspect ghcr.io/teslims2/stellarkraal-backend:main | grep Architecture
# Should print: "Architecture": "arm64"
```

### Run without Docker

#### Backend

```bash
cd backend
npm install
npm run build
npm start
```

#### OpenAPI Specification Generation

To auto-generate `openapi.json` from in-code `@openapi` route annotations:

```bash
cd backend
npm run openapi:generate
```

This scans all annotated route handlers, generates `backend/openapi.json`, and updates the spec version to match `package.json`. CI automatically verifies that `openapi.json` is not stale.

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

#### Smart contract tests

```bash
cd contracts/stellarkraal
cargo test
```

### Common Setup Errors

| Symptom | Cause | Resolution |
|---------|-------|------------|
| `nvm: command not found` | nvm not installed | Install via [nvm install guide](https://github.com/nvm-sh/nvm#installing-and-updating), then `nvm install 20` |
| `npm ERR! code ERESOLVE` | Node version mismatch | Ensure Node.js 20+ (`node --version`). Delete `node_modules` and re-run `npm install`. |
| `sqlite3` build error | Missing native build tools | Run `npm rebuild sqlite3` after installing system build tools (see [local-setup.md](docs/development/local-setup.md)) |
| `stellar: command not found` | `~/.cargo/bin` not in PATH | Add `export PATH="$HOME/.cargo/bin:$PATH"` to your shell profile |
| `error[E0463]: can't find crate` | Wrong Rust toolchain | Run `rustup target add wasm32-unknown-unknown` inside `contracts/stellarkraal/` |
| `PORT already in use` | Port 3001 occupied | Stop the conflicting process or set a different `PORT` in `.env` |
| `Cannot conn

Common errors and their resolutions are documented in **[docs/troubleshooting.md](docs/troubleshooting.md)**, covering:

- **Setup** — dependency conflicts, missing CLI tools, build failures, SQLite addon errors
- **Runtime** — port conflicts, RPC connectivity, CORS, JWT errors, Docker health checks
- **Contract** — invocation errors, sequence number mismatches, missing contract deployments
- **Database** — SQLite open failures, migration conflicts

Quick reference for the most frequent issues:

| Symptom | Resolution |
|---|---|
| `PORT already in use` | Stop the process on that port or change `PORT` in `.env` |
| `Cannot connect to RPC_URL` | Verify network and RPC endpoint reachability |
| `npm test` failures | Ensure dependencies are installed and Node.js 20+ is active |
| `Docker build` errors | Rebuild with `docker-compose build --no-cache` |

For anything not listed here, see the [full troubleshooting guide](docs/troubleshooting.md).

## Contribution Guidelines

This repository uses a documented contribution workflow. See [CONTRIBUTING.md](CONTRIBUTING.md) for branch naming, commit style, PR template, and code review expectations.

New contributors should start with the **[Contributing Quickstart](docs/development/contributing-quickstart.md)** — a step-by-step guide verified on Ubuntu 22.04 and macOS that covers prerequisites, cloning, running tests, and opening your first PR.

### Pull Request Checklist

- [ ] Branch created from latest `main`
- [ ] Commit messages follow Conventional Commits
- [ ] Tests run successfully locally
- [ ] Documentation updated when necessary

## Lighthouse CI

Performance thresholds are enforced in `frontend/lighthouserc.js`. The CI Lighthouse job runs against the built app and **fails the build** if any score falls below:

| Category | Minimum Score |
|---|---|
| Performance | 80 |
| Accessibility | 90 |
| Best Practices | 90 |
| SEO | 80 |

Scores are reported as a GitHub Actions step summary.

## Security & Vulnerability Management

Dependencies are scanned automatically:

- **Dependabot** monitors `backend/`, `frontend/`, and `contracts/stellarkraal/` packages weekly. PRs are labelled `dependencies` and `security`. See [docs/guides/dependabot.md](docs/guides/dependabot.md) for the triage/merge process.
- **npm audit** runs every Monday via the [`npm-audit`](.github/workflows/npm-audit.yml) workflow. The workflow fails if any `high` or `critical` severity vulnerability is found.

To run an audit locally:

```bash
cd backend && npm audit --audit-level=high
cd frontend && npm audit --audit-level=high
```

To report a security vulnerability, please read [SECURITY.md](SECURITY.md) for our full vulnerability disclosure policy, reporting instructions, response timeline, and safe harbour statement.

## Development Scripts

Run the following from the repository root:

```bash
npm run test:contract
npm run test:backend
npm run test:frontend
```

## Documentation

| Document | Description |
|---|---|
| [Loan State Machine](docs/protocol/loan-state-machine.md) | All loan states, valid transitions, triggering events, and on-chain event mapping |
| [API Quickstart](docs/guides/api-quickstart.md) | Base URL, auth flow, and common `/api/v1` operations |
| [Freighter Wallet Integration](docs/guides/freighter-integration.md) | `freighterClient.ts` API, connect/sign/disconnect flow, mock API for testing, and network mismatch detection |
| [Rate limits](docs/guides/rate-limits.md) | Global, auth, read, and write tiers; headers and retry behavior |
| [Liquidation Mechanism](docs/protocol/liquidation.md) | Health factor formula, liquidation threshold, partial liquidation examples |
| [Smart Contract Interface](docs/contracts/stellarkraal-interface.md) | Soroban contract public API, error codes, state changes, and CLI invocation guide |
| [Contract Event Listener](docs/guides/contract-event-listener.md) | Polling interval, ledger cursor tracking, event handling pipeline, and structured logging |
| [Audit Middleware](docs/guides/audit-middleware.md) | What is logged (method, path, status, duration, user), the `redact` function, PII masking, and how to add new audit fields |
| [Event Listener Lifecycle](docs/guides/event-listener-lifecycle.md) | When `startEventListener`/`stopEventListener` are called, how missed events replay on restart, and polling interval config |
| [Contract API Docs](https://teslims2.github.io/StellarKraal-/contracts/) | Auto-generated `cargo doc` reference published to GitHub Pages |
| [Observability Stack](docs/observability.md) | Prometheus metrics, Loki/Promtail logs, Grafana dashboards, alert rules, and how to extend each |
| [API Error Code Reference](docs/api-error-codes.md) | All HTTP status codes, application error codes, and contract error codes with descriptions |
| [CORS Configuration](docs/cors-configuration.md) | Allowed origins strategy, per-environment setup, and troubleshooting |
| [Docker Compose Services](docs/docker-compose-services.md) | Service dependencies, startup order, health checks, and volumes |
| [Performance Tuning Guide](docs/performance-tuning.md) | Environment variables, DB tuning, caching, and profiling guidance |
| [Threat Model](docs/security/threat-model.md) | Key attack surfaces (JWT forgery, oracle manipulation, re-entrancy, webhook replay), mitigations, and residual risk register |

## User Guides

| Guide | Description |
|---|---|
| [Register Livestock as Collateral](docs/guides/register-collateral.md) | Step-by-step guide (English + Kiswahili) for registering animals and requesting a loan |
| [API Integration Tutorial](docs/guides/api-integration-tutorial.md) | How an external app can register collateral, request a loan, and monitor loan status via webhooks |
| [Webhook Payload Reference](docs/guides/webhooks.md) | JSON schemas, example payloads, signature verification, and encrypted-delivery guide for all event types |

See also: [Help & Guides page](/help) in the app.

## User Guides

Step-by-step guides for borrowers are in [`docs/guides/`](docs/guides/).

| Guide | Description |
|---|---|
| [How to Request a Loan](docs/guides/request-loan.md) | Walks through all four wizard steps: Collateral, Amount, Review, Confirm. Explains LTV, health factor, and origination fee in plain language. |
| [How to Repay a Loan](docs/guides/repay-loan.md) | Covers partial vs full repayment, how repayment improves the health factor, repayment deadlines, and a repayment calculator example. |
| [Understanding Liquidation](docs/guides/understanding-liquidation.md) | Borrower-facing explainer of the health factor, when liquidation occurs, worked numeric example, and how to avoid it. |
| [Accessibility Guide](docs/guides/accessibility.md) | ARIA usage patterns, testing commands, common mistakes, and pre-PR checklist for accessible components. |

## Architecture Decision Records

Key design decisions are documented as ADRs in [`docs/adr/`](docs/adr/).

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](docs/adr/ADR-001-soroban.md) | Use Soroban for On-Chain Loan Lifecycle Management | Accepted |
| [ADR-002](docs/adr/ADR-002-jwt-auth.md) | JWT-Based Authentication Strategy | Accepted |
| [ADR-003](docs/adr/ADR-003-sqlite.md) | SQLite as the Off-Chain Database | Accepted |
| [ADR-004](docs/adr/ADR-004-nextjs-tailwind.md) | Next.js 14 + Tailwind CSS for the Frontend | Accepted |
| [ADR-005](docs/adr/ADR-005-collateral-appraisal-model.md) | Off-chain collateral appraisal model | Accepted |
| [ADR-006](docs/adr/ADR-006-oracle-design.md) | Multi-oracle median aggregation for price feeds | Accepted |
| [ADR-007](docs/adr/ADR-007-oracle-twap.md) | Time-Weighted Average Price (TWAP) for liquidation price feeds | Accepted |
| [ADR-008](docs/adr/ADR-008-webhooks.md) | Webhook-based event delivery for loan lifecycle notifications | Accepted |
| [ADR-009](docs/adr/ADR-009-api-v2-design.md) | API v2 Design Direction (REST vs GraphQL vs tRPC) | Superseded by ADR-011 |
| [ADR-010](docs/adr/ADR-010-event-driven-architecture.md) | Event-Driven Architecture | Accepted |
| [ADR-011](docs/adr/ADR-011-graphql-api-v2.md) | GraphQL as the API v2 Query Layer | Accepted |

To add a new ADR, copy [`docs/adr/template.md`](docs/adr/template.md), increment the number, fill in all sections, and add a row to the table above.

---
website https://kraal-bloom-connect.lovable.app/

## License

MIT © StellarKraal
.

## Handsoff notes

<!-- handsoff-issue-1372 -->
- #1372: Publish OpenAPI spec to docs site and add Swagger UI
