# PayBridge Frontend Portal

A modern, high-fidelity web interface built for the **PayBridge Core Banking & Settlement Engine** using React 18, Vite, Tailwind CSS, Lucide Icons, and Sonner.

---

## 🚀 Quick Start

Ensure the PayBridge backend is running on port `8080` (via Docker Compose and `./mvnw spring-boot:run`).

### 1. Start the Dev Server
From this directory:
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

> Vite's built-in dev proxy automatically forwards all `/api/*` and `/actuator/*` requests to `http://localhost:8080`, eliminating CORS issues during development.

---

## ⚡ Core Features & Modules Covered

### 1. 👥 Customer & Account Management
- **Customer Registration**: Register customers (e.g., Ada Obi, Bola Eze) with name, phone, and unique email. Automatically normalises Nigerian phone numbers to `+234` format.
- **NUBAN Generation**: Instantly open customer accounts with real 10-digit Nigerian NUBAN numbers generated via database sequence + check digit calculation (`bank-code: 999`).
- **KYC Tier Management**: Upgrade customer verification tiers (`UNVERIFIED` ➔ `BASIC` ➔ `FULL`) with live limit adjustment.
- **Account Switcher**: Multi-account support with live balance display.

### 2. 💸 Money Transfers
- **Internal Transfers (Instant, ₦0 Fee)**:
  - Account-to-account transfer within PayBridge.
  - Recipient NUBAN live lookup / name enquiry.
  - Idempotency key generation and **"Test Duplicate Replay"** action to prove that network retries return `HTTP 200` with header `Idempotent-Replayed: true` without moving money twice.
- **External Transfers (Other Banks)**:
  - Bank selector (GTBank, Access, First Bank, Zenith, PayBridge Test Bank).
  - Name enquiry / account resolution (`POST /api/beneficiaries/resolve`).
  - Saved Beneficiaries management.
  - Stepped transfer fee calculation (₦10 up to ₦5k, ₦25 up to ₦50k, ₦50 above).
  - Outbox dispatcher and reconciler status polling (`PENDING` ➔ `PROCESSING` ➔ `SUCCESS` / `FAILED`).
  - Preset test profiles for simulated bank account suffixes (`3333` instant success, `1111` instant refund, `1234` reconciler completion, `5555` timeout).

### 3. 🧪 Dev Funding (Double-Entry Test Money)
- Instant test funding using `POST /api/dev/accounts/{id}/fund`.
- Posts double-entry journal lines: debit `FUNDING_SOURCE` and credit target account.
- Enforces database zero-sum trigger (`ledger_check_entry_balanced`).

### 4. 📜 Immutable Double-Entry Ledger Statement
- Live statement viewer showing append-only journal entries.
- Credit/Debit badges, entry types (`TRANSFER`, `FUNDING`), reference IDs, and exact timestamps.

### 5. 🛡️ Compliance & Limits
- Visual quota tracker displaying today's consumed transfer amount vs. KYC daily cap.
- Enforced atomically using single-row PostgreSQL reservation upserts.

### 6. 🔔 Asynchronous Notifications
- Real-time customer alert inbox displaying SMS and Email messages dispatched by Spring Modulith `@ApplicationModuleListener` after database commit.

### 7. 🎬 1-Click Interactive Demo Guide Runner
- Built-in interactive modal executing the 10 core verification steps from `DEMO-GUIDE.md`:
  1. Create Ada & Bola
  2. Open NUBAN accounts
  3. Fund Ada with ₦3,000
  4. Ada transfers ₦500 to Bola
  5. Replay identical request to prove idempotency
  6. Verify balances (₦2,500 vs ₦500)
  7. Verify double-entry ledger lines
  8. Test refusals (Overdraft 422, KYC limit 422, Self-transfer 400)
  9. Inspect compliance daily usage
  10. Inspect customer SMS/Email alerts
- Includes a live terminal log console displaying request/response payloads side-by-side.

---

## 🛠️ Project Structure

```
paybridge front end/
├── index.html              # HTML shell with Google Fonts
├── vite.config.js          # Vite config with /api proxy to :8080
├── tailwind.config.js      # Tailwind theme configuration
├── postcss.config.js       # PostCSS plugins
├── package.json            # Scripts & dependencies
└── src/
    ├── main.jsx            # React root with Sonner Toaster
    ├── App.jsx             # Main application tabs layout
    ├── index.css           # Styling, dark mode, custom scrollbars
    ├── api.js              # Centralized PayBridge API client & helpers
    ├── context/
    │   └── AppContext.jsx  # Global state (customer, account, limits, alerts)
    └── components/
        ├── Navbar.jsx              # Header, customer/account selector, status
        ├── OverviewTab.jsx         # Balance cards, quick actions, refusal tests
        ├── TransfersTab.jsx        # Internal & external transfer forms
        ├── LedgerStatementTab.jsx  # Double-entry ledger statement table
        ├── CustomersTab.jsx        # Customer registration & KYC management
        ├── ComplianceTab.jsx       # Quota progress bar & tier specs
        ├── NotificationsTab.jsx    # SMS & Email alerts inbox
        ├── DevFundModal.jsx        # Test money injection modal
        └── DemoRunnerModal.jsx     # Interactive 10-step demo script runner
```
