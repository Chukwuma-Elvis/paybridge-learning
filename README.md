# PayBridge

[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-4.1.1-6DB33F?style=for-the-badge&logo=springboot&logoColor=white)](https://spring.io/projects/spring-boot)
[![Spring Modulith](https://img.shields.io/badge/Spring%20Modulith-2.1.1-6DB33F?style=for-the-badge)](https://spring.io/projects/spring-modulith)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-336791?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

> **A production-grade Core Banking & Settlement Engine engineered as a Spring Boot Modular Monolith.**  
> Built to model real-world financial infrastructure: double-entry bookkeeping, zero-overdraft concurrency locking, strict idempotency, asynchronous outbox gateway dispatching, multi-bank reconciliation, and tiered AML compliance.

---

## Table of Contents

1. [Architectural Highlights](#-architectural-highlights)
2. [Module Architecture](#-module-architecture)
3. [Transfer Workflows & Flowcharts](#-transfer-workflows--flowcharts)
   - [1. Internal Account-to-Account Transfer](#1-internal-account-to-account-transfer)
   - [2. External Transfer with Simulated Gateway & Reconciler](#2-external-transfer-with-simulated-gateway--reconciler)
4. [External Bank Simulation (Deterministic Behavioral Profiles)](#-external-bank-simulation-profiles)
5. [API Specification](#-api-specification)
6. [Frontend Portal](#-frontend-portal)
7. [Getting Started](#-getting-started)
   - [Prerequisites](#prerequisites)
   - [1. Start Backend (Spring Boot + Postgres)](#1-start-backend)
   - [2. Start Frontend (React + Vite)](#2-start-frontend)
8. [Testing & Verification](#-testing--verification)
9. [Deployment (Render + Vercel)](#-deployment)

---

## 🏛️ Architectural Highlights

PayBridge is architected around foundational financial engineering principles:

* **Append-Only Double-Entry Bookkeeping:** Money is never created or destroyed out of thin air. Every movement is a balanced journal entry where debits and credits sum to zero ($\sum \text{lines} = 0$). PostgreSQL triggers enforce that `ledger_line` records can **never** be edited or deleted (`UPDATE`/`DELETE` prohibited).
* **Guaranteed Integer Kobo Arithmetic:** Floating-point numbers are prohibited in all money pathways. Values are stored as 64-bit signed integers in minor units (kobo: $100\text{ kobo} = ₦1.00$).
* **Pessimistic Row Locking in Canonical Order:** Simultaneous transfers between accounts acquire pessimistic write locks (`SELECT ... FOR UPDATE`) sorted strictly by Account ID. This mathematically eliminates deadlocks under heavy concurrent load.
* **Database Check Constraints as Second Defense Line:** Even if code-level validations fail, the Postgres table schema rejects negative customer balances via check constraint `ck_account_customer_not_negative`.
* **Cryptographic Request Fingerprinting & Idempotency:** The client provides an `Idempotency-Key` header. PayBridge computes a SHA-256 fingerprint over the transaction payload. Duplicate requests return `HTTP 200 OK` with `Idempotent-Replayed: true` and the original receipt without moving funds twice.
* **The Three Rules of External Settlement:**
  1. *Never call external banking APIs inside a database transaction* (holds locks and risks distributed split-brain).
  2. *A gateway timeout means "unknown", never "failed"* (funds remain safely quarantined in a `SUSPENSE` account).
  3. *Applying a bank's status must be idempotent* (reconciler queries can safely repeat without double payouts).
* **Spring Modulith Boundaries:** Code modules interact exclusively through documented public `api/` interfaces. Cross-module package leaks are caught at compile-time and verified by ArchUnit tests.

---

## 🧩 Module Architecture

PayBridge avoids distributed microservice overhead by enforcing hard modular boundaries within a single deployable monolith:

```
src/main/java/com/academy/paybridge/
├── customer/      # Onboarding, phone normalisation (+234), KYC verification tiers
├── account/       # Account lifecycle, check-digit NUBAN generation (bank-code: 999)
├── ledger/        # Append-only journal entries, lines, statement queries, dev funding
├── transfer/      # Internal transfer orchestration, external outbox dispatcher, idempotency
├── compliance/    # Atomic daily reservation upserts by KYC tier
├── notification/  # Asynchronous SMS & Email alerts delivered via domain events
├── shared/        # Immutable Money VO, RequestId MDC filters, CORS, GlobalExceptionHandler
└── [fx/remit/set] # Planned roadmap modules (Rate locking, cross-border remittance)
```

### Module Responsibilities

| Module | Responsibility | Public Interface | Persistence Tables |
|---|---|---|---|
| **`customer`** | Customer identity, phone normalisation, KYC tiers | `CustomerApi` | `customer` |
| **`account`** | Customer & System accounts (`FUNDING_SOURCE`, `SUSPENSE`), balances | `AccountApi` | `account`, `account_number_seq` |
| **`ledger`** | Balanced double-entry transactions, statements | `LedgerApi` | `journal_entry`, `ledger_line` |
| **`transfer`** | Internal transfers, external outbox, beneficiaries | `TransferApi` | `transfer`, `idempotency_key`, `beneficiary` |
| **`compliance`** | Tiered daily & per-transaction quota reservations | `ComplianceApi` | `daily_usage` |
| **`notification`**| Asynchronous customer alerts decoupled via Modulith events | `@ApplicationModuleListener` | `notification` |
| **`shared`** | `Money` value object, error codes, request correlation IDs | Core library | `event_publication` |

---

## 🔄 Transfer Workflows & Flowcharts

### 1. Internal Account-to-Account Transfer

An internal transfer moves funds between two accounts on PayBridge inside a **single atomic database transaction**.

#### Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client App / Frontend
    participant Web as TransferController
    participant Svc as TransferService
    participant Idem as IdempotencyService
    participant Acc as AccountService
    participant Comp as ComplianceService
    participant Ledg as LedgerService
    participant DB as PostgreSQL Database
    participant Event as Modulith Event Bus
    participant Notif as NotificationListener

    Client->>Web: POST /api/transfers/internal<br/>[Header: Idempotency-Key: demo-001]<br/>{sourceAccountId, destNuban, amountMinor, narration}
    Note over Web: RequestIdFilter stamps X-Request-Id
    Web->>Svc: transferInternal(command, idempotencyKey)
    
    activate Svc
    Note over Svc: BEGIN ATOMIC TRANSACTION
    Svc->>Idem: begin(key, payloadFingerprint)
    Idem->>DB: INSERT INTO idempotency_key ON CONFLICT DO NOTHING
    
    alt Idempotency Key Already Exists
        DB-->>Idem: 0 rows inserted (Key exists)
        Idem-->>Svc: Returns existing transferId (Replay)
        Svc-->>Web: TransferResult(transfer, replayed=true)
        Web-->>Client: HTTP 200 OK [Idempotent-Replayed: true]
    else New Request (Claimed)
        DB-->>Idem: 1 row inserted (Claim acquired)
        Svc->>Acc: Verify Source & Destination Accounts
        Acc-->>Svc: Accounts Active & Currency Matches
        
        Svc->>Comp: reserve(senderId, amountMinor)
        Comp->>DB: Atomic UPSERT into daily_usage WHERE used <= limit
        DB-->>Comp: Quota Reserved
        
        Svc->>DB: INSERT INTO transfer (status=PENDING, ref=pb-uuid)
        
        Svc->>Ledg: post(sourceId, destId, amountMinor)
        activate Ledg
        Ledg->>DB: SELECT * FROM account WHERE id IN (src, dst) FOR UPDATE (Sorted Order)
        Note over DB: Row locks acquired without deadlocks
        Ledg->>Ledg: Check balance_minor >= amountMinor
        Ledg->>DB: UPDATE account balance_minor (Ada -500, Bola +500)
        Ledg->>DB: INSERT INTO journal_entry
        Ledg->>DB: INSERT INTO ledger_line (Ada: -500, Bola: +500)
        deactivate Ledg
        
        Svc->>DB: UPDATE transfer SET status='SUCCESS'
        Svc->>Idem: complete(key, transferId)
        Svc->>Event: publishEvent(TransferCompleted)
        
        Note over DB: COMMIT TRANSACTION<br/>(Trigger verifies sum(ledger_lines) == 0)
        deactivate Svc
        
        Web-->>Client: HTTP 201 Created [Location: /api/transfers/:id]
        
        par Async Post-Commit Notification
            Event->>Notif: deliver(TransferCompleted)
            Notif->>DB: INSERT INTO notification (SMS, Email)
            Notif->>Notif: Dispatch External Alerts
        end
    end
```

---

### 2. External Transfer with Simulated Gateway & Reconciler

External transfers interface with banks outside our perimeter. Because remote network calls can fail, hang, or delay, PayBridge uses a **3-Phase Outbox & Reconciliation Pattern**:

1. **Phase 1: ACCEPT (Instant Atomic Lock)** — Funds and stepped fees are quarantined from the sender into the bank's internal `SUSPENSE` account. A `PENDING` transfer and outbox dispatch stub are written, returning `HTTP 202 Accepted` in milliseconds.
2. **Phase 2: DISPATCHER (Background Worker, every 2s)** — Picks up pending outbox items and calls the remote bank gateway **strictly outside any database transaction**.
3. **Phase 3: RECONCILER (Background Detective, every 5s)** — Inquiries on transfers that remain unconfirmed for $>10\text{ seconds}$ to achieve eventual settlement or trigger automated refunds.

#### Architecture Flowchart

```mermaid
flowchart TD
    subgraph PHASE1["1. ACCEPT PHASE (Synchronous API)"]
        A[Client Submits Transfer] --> B[Validate Recipient & KYC Limit]
        B --> C[Debit Customer Account<br/>Credit SUSPENSE Account<br/>Amount + Stepped Fee]
        C --> D[Save Transfer: PENDING]
        D --> E[Write Outbox Record]
        E --> F[Return HTTP 202 Accepted]
    end

    subgraph PHASE2["2. DISPATCHER WORKER (Every 2 seconds)"]
        F -.-> G[Dispatcher Polls Pending Outbox]
        G --> H{Call Remote Bank Gateway<br/>NO DB Txn Open}
        
        H -->|HTTP 200: Paid| I[Debit SUSPENSE<br/>Credit BANK_SETTLEMENT<br/>Mark SUCCESS]
        H -->|HTTP 422: Refused| J[Refund Customer<br/>Debit SUSPENSE<br/>Mark FAILED]
        H -->|HTTP 202: Processing| K[Mark PROCESSING<br/>Wait for Reconciler]
        H -->|Timeout / No Answer| L[Leave in SUSPENSE<br/>Retry counter incremented]
    end

    subgraph PHASE3["3. RECONCILER WORKER (Every 5 seconds)"]
        K -.-> M[Reconciler Scans Quiet Transfers > 10s]
        L -.-> M
        M --> N{Poll Remote Bank Query Status}
        
        N -->|Confirmed Success| O[Finalize Payout<br/>Mark SUCCESS]
        N -->|Confirmed Refusal| P[Full Refund to Customer<br/>Mark FAILED]
        N -->|Still Working| Q[Leave Intact, Re-check Later]
    end

    classDef phase fill:#0f172a,stroke:#334155,stroke-width:1px,color:#f8fafc;
    classDef success fill:#064e3b,stroke:#10b981,stroke-width:1px,color:#a7f3d0;
    classDef failure fill:#4c0519,stroke:#f43f5e,stroke-width:1px,color:#fecdd3;
    classDef warning fill:#451a03,stroke:#f59e0b,stroke-width:1px,color:#fde68a;

    class I,O success;
    class J,P failure;
    class K,L,Q warning;
```

#### Transfer State Machine

```mermaid
stateDiagram-v2
    [*] --> PENDING: POST /api/transfers/external (Funds held in SUSPENSE)
    
    PENDING --> PROCESSING: Gateway responds 'Accepted / Processing'
    PENDING --> SUCCESS: Gateway pays immediately (e.g. Suffix 3333)
    PENDING --> FAILED: Gateway refuses immediately (e.g. Suffix 1111) -> Full Refund
    
    PROCESSING --> SUCCESS: Reconciler verifies payout confirmed
    PROCESSING --> FAILED: Reconciler verifies refusal -> Full Refund
    
    SUCCESS --> [*]: Terminal state (Fee earned)
    FAILED --> [*]: Terminal state (Fully refunded)
```

---

## 🧪 External Bank Simulation Profiles

To test boundary conditions reliably without unpredictable third-party sandboxes, `FakeTransferGateway` deterministically drives gateway behavior via the **payee account number's last 4 digits**:

| Account Suffix | Bank Gateway Reaction | Resolution Mechanism | Final Status | Typical Timing |
|---|---|---|---|---|
| `...3333` | **Immediate Payout:** Remote bank accepts and pays | Dispatcher Worker | `SUCCESS` | $\sim 2\text{ s}$ |
| `...1111` | **Immediate Refusal:** Invalid account / blocked | Dispatcher Worker | `FAILED` *(Refunded)* | $\sim 3\text{ s}$ |
| `...1234` | **Accepted & Processing:** Bank queues payout | Reconciler Worker | `SUCCESS` | $\sim 14\text{ s}$ |
| `...5555` | **Timeout AFTER Receive:** Request processed but network dropped | Reconciler Worker | `SUCCESS` *(Paid exactly once)* | $\sim 19\text{ s}$ |
| `...2222` | **Timeout BEFORE Receive:** Bank never saw request | Reconciler Worker | `FAILED` *(Refunded)* | $\sim 34\text{ s}$ |
| `...9999` | **Name Enquiry Failure:** Account does not exist | Web Layer | `404 Not Found` | Instant |

---

## 📖 API Specification

All amounts are specified in integer **kobo** ($100\text{ kobo} = ₦1.00$).

### 1. Customers
* `POST /api/customers` — Onboard new customer (`firstName`, `lastName`, `email`, `phone`).
* `GET /api/customers/{id}` — Retrieve customer profile and KYC tier.
* `PATCH /api/customers/{id}/kyc-tier` — Update KYC tier (`UNVERIFIED`, `BASIC`, `FULL`).

### 2. Accounts
* `POST /api/accounts` — Open account with auto-generated check-digit NUBAN (`customerId`, `currency`).
* `GET /api/accounts/{id}` — Lookup account and cached balance.
* `GET /api/accounts/by-number/{accountNumber}` — Lookup account by 10-digit NUBAN.
* `GET /api/accounts?customerId={id}` — List all accounts for a customer.

### 3. Money Transfers
* `POST /api/transfers/internal` — Execute instant account-to-account transfer.
  * *Headers:* `Idempotency-Key: <unique-string>`
  * *Body:* `{"sourceAccountId": "uuid", "destinationAccountNumber": "1000000024", "amountMinor": 50000, "narration": "rent"}`
* `POST /api/transfers/external` — Accept transfer to external bank.
  * *Headers:* `Idempotency-Key: <unique-string>`
  * *Body:* `{"sourceAccountId": "uuid", "beneficiaryId": "uuid", "amountMinor": 100000, "narration": "invoice"}`
* `GET /api/transfers/{id}` — Poll outcome of transfer.
* `GET /api/transfers?accountId={id}` — List transfers for an account.

### 4. Beneficiaries (Name Enquiry)
* `POST /api/beneficiaries/resolve` — Perform name enquiry (`bankCode`, `accountNumber`).
* `POST /api/beneficiaries` — Save verified beneficiary.
* `GET /api/beneficiaries?customerId={id}` — List saved beneficiaries.

### 5. Ledger & Dev Scaffolding
* `POST /api/dev/accounts/{accountId}/fund` — Inject test funds via balanced ledger entry (`amountMinor`).
* `GET /api/accounts/{accountId}/entries` — Fetch chronological double-entry statement.

### 6. Compliance & Alerts
* `GET /api/compliance/customers/{customerId}/limits` — Retrieve daily usage and remaining limit.
* `GET /api/notifications?customerId={customerId}` — Retrieve SMS & Email event notices.

---

## 💻 Frontend Portal

The repository includes a modern React portal located in [**`paybridge front end`**](paybridge%20front%20end/):

* **Interactive 10-Step Demo Runner:** Executes the complete verification walkthrough from `DEMO-GUIDE.md` directly inside the browser with side-by-side terminal logs.
* **Instant Idempotency Testing:** Includes dedicated buttons to submit identical requests twice, visually demonstrating `HTTP 200 OK` replays and `Idempotent-Replayed: true` headers.
* **Live Settlement Monitor:** Real-time polling widget showing external transfers moving through `PENDING` $\rightarrow$ `PROCESSING` $\rightarrow$ `SUCCESS`.
* **In-App Render Connection Tool:** Built-in modal to wake sleeping Render instances and test network latency.

---

## 🚀 Getting Started

### Prerequisites
* **Java 25** (or Java 21 LTS)
* **Docker Desktop** (for containerized PostgreSQL)
* **Node.js 18+** & npm (for frontend)

---

### 1. Start Backend

1. **Start PostgreSQL container:**
   ```bash
   docker compose up -d
   ```
2. **Run Spring Boot application:**
   ```bash
   ./mvnw spring-boot:run
   ```
   *The backend will boot on port `8080` and run Flyway migrations 1 through 8 automatically.*

3. **Verify backend health:**
   ```bash
   curl -s http://localhost:8080/actuator/health
   # Expected output: {"status":"UP"}
   ```

---

### 2. Start Frontend

1. **Navigate to the frontend directory:**
   ```bash
   cd "paybridge front end"
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Launch dev server:**
   ```bash
   npm run dev
   ```
4. **Open in browser:** [http://localhost:3000](http://localhost:3000)  
   *(Vite's reverse proxy automatically forwards all `/api/*` calls to `http://localhost:8080`).*

---

## 🧪 Testing & Verification

PayBridge includes automated test suites covering modularity, business rules, and multi-threaded race conditions:

```bash
# Run all automated tests
./mvnw clean test
```

### Key Test Suites

* **Concurrency Race Tests (`ConcurrencyTest.java`):** Fires 40 and 200 simultaneous threads attempting concurrent withdrawals to prove zero negative balances occur.
* **Duplicate Request Race (`DuplicateRequestRaceTest.java`):** Spawns concurrent HTTP requests using the same `Idempotency-Key` to verify only one transfer executes and the rest receive idempotent replays.
* **Modularity Verification (`ModularityTests.java`):** Verifies Spring Modulith boundaries, ensuring zero unauthorized inter-module dependencies exist.
* **External Gateway Lifecycle (`ExternalTransferTest.java`):** Tests outbox dispatch, timeout handling, and automated refunds across all suffix profiles.

---

## 🌐 Deployment

PayBridge is configured for deployment with a decoupled infrastructure topology:

| Tier | Host | Configuration File | Notes |
|---|---|---|---|
| **Backend API** | [Render](https://render.com) | [`render.yaml`](render.yaml) | Docker runtime with PostgreSQL database blueprint |
| **Frontend UI** | [Vercel](https://vercel.com) | [`vercel.json`](paybridge%20front%20end/vercel.json) | Vite build with edge rewrites proxying `/api/*` to Render |

Detailed deployment guides:
* [Frontend Vercel Deployment Guide](paybridge%20front%20end/VERCEL-DEPLOYMENT.md)
* [Backend Render Demo Guide](DEPLOYED-DEMO-GUIDE.md)

---

## 📜 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
