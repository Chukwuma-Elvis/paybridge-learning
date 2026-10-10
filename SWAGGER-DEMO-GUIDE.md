# PayBridge: Swagger Demo Guide

How to demo the **internal** and **external** transfers by clicking through **Swagger UI** in the browser instead of
typing `curl` commands.

> **Status of this guide:** the endpoints, request bodies, status codes and timings come from the shell rehearsals
> (`DEMO-GUIDE.md` and `EXTERNAL-TRANSFER-GUIDE.md`), which ran against this same code. The Swagger page itself has
> **not** been clicked through yet. The suite of 214 tests passes with Swagger added, but do one full dry run in the
> browser before presenting and correct anything that differs.
>
> For the *why* behind each step (modules, files, methods, call chains) see the two earlier guides. This one is the
> **click-through runbook**.

**Contents**

1. [What Swagger is and how it differs from the shell demo](#1-what-swagger-is-and-how-it-differs-from-the-shell-demo)
2. [Before you start](#2-before-you-start)
3. [How every call works](#3-how-every-call-works)
4. [Your notepad of ids](#4-your-notepad-of-ids)
5. [Part A: internal transfer](#5-part-a-internal-transfer)
6. [Part B: external transfer](#6-part-b-external-transfer)
7. [Tips for presenting in Swagger](#7-tips-for-presenting-in-swagger)
8. [If something goes wrong](#8-if-something-goes-wrong)
9. [Running order and timing](#9-running-order-and-timing)

---

## 1. What Swagger is and how it differs from the shell demo

**Swagger UI** is a web page, generated automatically from the controllers (by the `springdoc-openapi` library), that
lists every endpoint. You fill in the JSON, click **Execute**, and read the response.

> **Analogy: a restaurant menu with an order button.** The shell demo is walking into the kitchen and shouting orders.
> Swagger is the printed menu: every dish (endpoint) is listed, with a form for your order, and a button to send it.

| Shell demo | Swagger demo |
|---|---|
| Variables (`ADA`, `ADA_ACC`, ...) store ids for you | **You copy ids by hand** from one response into the next request |
| `wait_final` polls a transfer automatically | **You click Execute again** on the transfer lookup |
| Shows only what you `grep` | Shows the status code, body **and headers** in one place |
| Faster for the long waits and the database queries | Friendlier to watch, and shows every endpoint that exists |

**Good use of each:** do the first transfers and the refusals in Swagger (visual), and use the shell scripts for the
long timeouts and the database finale.

---

## 2. Before you start

### Open the page

| Where | URL |
|---|---|
| Local | http://localhost:8080/swagger-ui.html |
| Deployed (Render) | https://paybridge-zkvm.onrender.com/swagger-ui.html |

The raw API description is at `/v3/api-docs` (the same path on either host).

### If you are demoing locally

1. Start Docker Desktop and wait until it is fully running.
2. Make sure nothing else uses port 8080.
3. From the project folder: `./mvnw spring-boot:run`. Wait for **`Started PayBridgeApplication`**.

### If you are demoing the deployed version

The free Render service **sleeps** when idle (the first request can take 30 to 60 seconds), and the dispatcher and
reconciler timers stop while it sleeps. Wake it a few minutes beforehand:

```bash
curl -s -m 90 https://paybridge-zkvm.onrender.com/actuator/health; echo
```

Wait for `{"status":"UP"}`. Then open the Swagger URL above.

> **Open the right page.** The root address (`/`) shows a "No static resource" 404 because PayBridge is a backend-only
> API with no home page. That is normal. Use `/swagger-ui.html`.

### The page layout

Endpoints are grouped by controller (customers, accounts, beneficiaries, transfers, notifications, and so on). Click a
group to expand it. Each endpoint has a coloured method tag: green `POST`, blue `GET`.

---

## 3. How every call works

1. **Expand** the endpoint.
2. Click **Try it out**.
3. Edit the fields: path parameters, query parameters, headers (such as `Idempotency-Key`), and the JSON body.
4. Click **Execute**.
5. Read **Server response**: the **code**, the **body**, and the **headers** (you need the headers for
   `idempotent-replayed`).
6. **Copy the ids** you need into your notepad (next section).

> **Money is in kobo:** 100 kobo = ₦1, so `300000` = ₦3,000 and `50000` = ₦500.

### The Idempotency-Key header

The two transfer endpoints (`POST /api/transfers/internal` and `POST /api/transfers/external`) have an
**Idempotency-Key** field above the request body, marked required, with a prefilled example.

- A **new value for every new transfer** (8 to 100 characters: letters, digits, `.` `_` `:` `-`).
- Use the **same value again** only when you want to show the replay.
- **Change the prefilled example before sending.** If you leave `demo-0001` in place for a second, different transfer,
  you will get a replay or a key-reuse error instead.

Leaving it empty returns a `400 VALIDATION_FAILED` ("The Idempotency-Key header is required"). That is a good thing to
show first: *"no key, no transfer"*.

---

## 4. Your notepad of ids

Swagger has no variables, so keep a text file open and fill it in as you go. Copy this template:

```
ADA        =                      (customer id)
BOLA       =                      (customer id)
ADA_ACC    =                      (account id)
BOLA_ACC   =                      (account id)
BOLA_NUM   =                      (Bola's 10-digit account NUMBER, not the id)
BEN_YES    =                      (payee id, account ending 3333)
BEN_NO     =                      (payee id, ending 1111)
BEN_LATER  =                      (payee id, ending 1234)
BEN_UNSURE =                      (payee id, ending 5555)
BEN_LOST   =                      (payee id, ending 2222)
T1         =                      (transfer id of the first external transfer)
```

Two kinds of identifier get confused: an **account id** (a long UUID, used in paths and in `sourceAccountId`) and an
**account number** (10 digits, used as `destinationAccountNumber`). Keep them apart.

**Use unique emails.** The customer endpoint rejects a duplicate email. Put a number in them, for example
`ada101@example.com`, and change the number on every run.

---

## 5. Part A: internal transfer

Ada sends Bola ₦500 inside PayBridge. The call chain to recite is in `DEMO-GUIDE.md`, Step 4.

### A1: Create two customers

**Endpoint:** `POST /api/customers`

Body for Ada:

```json
{"firstName":"Ada","lastName":"Obi","email":"ada101@example.com","phone":"08012345678"}
```

Body for Bola (a second Execute):

```json
{"firstName":"Bola","lastName":"Eze","email":"bola101@example.com","phone":"08098765432"}
```

**You will see:** `201`, with `"kycTier":"UNVERIFIED"`, `"status":"ACTIVE"` and the phone normalised to `+234...`.
**Copy:** each response's `id` → **ADA** and **BOLA**.
**Say:** *"Every customer starts unverified and active. Their KYC tier decides how much they can send."*

### A2: Open an account for each

**Endpoint:** `POST /api/accounts`

Body (twice, once per customer):

```json
{"customerId":"<ADA>"}
```

**You will see:** `201`, currency `NGN`, balance `0`, and a 10-digit `accountNumber`.
**Copy:** Ada's `id` → **ADA_ACC**. Bola's `id` → **BOLA_ACC** and Bola's **`accountNumber`** → **BOLA_NUM**.
**Say:** *"A NUBAN: nine digits from a database sequence plus a check digit, so a mistyped number is caught."*

### A3: Put test money in Ada's account

**Endpoint:** `POST /api/dev/accounts/{accountId}/fund`

Path parameter `accountId`: **ADA_ACC**. Body:

```json
{"amountMinor":300000}
```

**You will see:** `200` with `"balanceMinor":300000` (₦3,000).
**If you see 404:** the dev funding switch is off (see [section 8](#8-if-something-goes-wrong)).
**Say:** *"No real deposits yet, so this test-only endpoint stands in. It still posts a balanced ledger entry from the
bank's funding account."*

### A4: Show the missing key first

**Endpoint:** `POST /api/transfers/internal`

Leave **Idempotency-Key** empty. Body:

```json
{"sourceAccountId":"<ADA_ACC>","destinationAccountNumber":"<BOLA_NUM>","amountMinor":50000,"narration":"rent"}
```

**You will see:** `400` `VALIDATION_FAILED`: "The Idempotency-Key header is required ...".
**Say:** *"Without a key a retry could pay twice, so the API refuses to proceed."*

### A5: THE TRANSFER: Ada sends Bola ₦500

Same endpoint and body. Now type **Idempotency-Key** = `demo-101-0001` (a value you will reuse in A6) and Execute.

**You will see:** `201`, `"status":"SUCCESS"`, `"type":"INTERNAL"`, `"amountMinor":50000`, `"feeMinor":0`, and a
`location` header in the response headers.
**Say:** *"Everything happens in one database transaction: the idempotency stub, the daily allowance, the transfer
record, the ledger entry and the event commit together or not at all."*

### A6: The identical request again (replay)

Click Execute again **without changing anything** (same key, same body).

**You will see:** `200` (not 201), the response header **`idempotent-replayed: true`**, and the **same transfer id** as A5.
**Say:** *"If the first reply is lost, the app retries. The unique key means Bola is not paid twice."*

### A7: Check the balances

**Endpoint:** `GET /api/accounts/{id}`. Run it for **ADA_ACC**, then **BOLA_ACC**.

**You will see:** Ada `"balanceMinor":250000` (₦2,500), Bola `"balanceMinor":50000` (₦500). It moved once although you
sent it twice.

### A8: The statements

**Endpoint:** `GET /api/accounts/{id}/entries`. Run it for each account.

**You will see:** Ada `TRANSFER −50000` then `FUNDING +300000`; Bola `TRANSFER +50000`. Both show the same entry id and
reference.
**Say:** *"Negative is money out, positive is money in. One journal entry, two sides, adding to zero."*

### A9: The refusals

All on `POST /api/transfers/internal`. Use a **new key** each time, except where noted.

| Try | Change | You will see | Which layer says no |
|---|---|---|---|
| Overdraw | `amountMinor` = `4000000`, key `demo-101-0002` | **422** `INSUFFICIENT_FUNDS` | Ledger |
| Over the limit | `amountMinor` = `5000001`, key `demo-101-0003` | **422** `LIMIT_EXCEEDED` | Compliance |
| Key reuse | the key from A5 (`demo-101-0001`), `amountMinor` = `99999` | **422** `IDEMPOTENCY_KEY_REUSED` | Idempotency service |
| To herself | `destinationAccountNumber` = Ada's own number, key `demo-101-0005` | **400** `VALIDATION_FAILED` | Transfer service |

Every refusal has the same shape: `code` (for programs), `detail` (for people), `requestId` (for support).
**Say:** *"Each rule is enforced by the layer that owns it, and a refused transfer leaves no trace."*

### A10: Limits, history and alerts

| Endpoint | Input | You will see |
|---|---|---|
| `GET /api/compliance/customers/{customerId}/limits` | **ADA** | `"usedTodayMinor":50000` against `"dailyMinor":10000000` |
| `GET /api/transfers` | query `accountId` = **ADA_ACC** | Ada's one `SUCCESS` transfer |
| `GET /api/notifications` | query `customerId` = **BOLA** | Two alerts (`SMS`, `EMAIL`): "You received NGN 500.00 ..." |

---

## 6. Part B: external transfer

Ada sends money to an account at another bank, through the simulated bank. Full explanations are in
`EXTERNAL-TRANSFER-GUIDE.md`. Reuse **ADA** and **ADA_ACC** from Part A, or run A1 to A3 first.

> **The simulated bank** decides what to do from the **last four digits** of the payee's account number:
>
> | Ends in | What happens | Time |
> |---|---|---|
> | `3333` | Pays at once → `SUCCESS` | about 2 s |
> | `1111` | Refuses → `FAILED`, refunded | about 3 s |
> | `1234` | Accepts, still working → `SUCCESS` | about 14 s |
> | `5555` | Times out **after** receiving → `SUCCESS`, paid once | about 19 s |
> | `2222` | Times out **before** receiving → `FAILED`, refunded | about 34 s |
> | `9999` | Name enquiry cannot find the account → 404 | instant |
>
> The timers must be awake. On the deployed version, if a transfer sits in `PENDING` for more than ~10 seconds, check
> the service is not asleep.

### B0: Fund Ada with ₦30,000 (if needed)

`POST /api/dev/accounts/{accountId}/fund` with **ADA_ACC** and `{"amountMinor":3000000}`. External transfers cost the
amount **plus a fee**, so make sure there is enough.

### B1: Name enquiry: "whose account is this?"

**Endpoint:** `POST /api/beneficiaries/resolve`

```json
{"bankCode":"058","accountNumber":"0123453333"}
```

**You will see:** `200` with `"accountName":"TEST ACCOUNT 3333"`.
Then try `0123459999`: **404** `RESOURCE_NOT_FOUND` (correct, not a bug).
**Say:** *"Before paying a stranger's account, we ask the bank who owns it."*

### B2: Save the payees

**Endpoint:** `POST /api/beneficiaries`. Run it five times, changing `accountNumber`:

```json
{"customerId":"<ADA>","bankCode":"058","accountNumber":"0123453333"}
```

Use `0123453333`, `0123451111`, `0123451234`, `0123455555`, `0123452222`.

**You will see:** `201` (or `200` if saved already) with the bank-supplied `accountName`.
**Copy:** each `id` → **BEN_YES**, **BEN_NO**, **BEN_LATER**, **BEN_UNSURE**, **BEN_LOST** (match the ending to the name
in your notepad).

### B3: Send ₦2,000 to the "YES" payee (instant success)

**Endpoint:** `POST /api/transfers/external`. **Idempotency-Key** = `ext-101-0001`. Body:

```json
{"sourceAccountId":"<ADA_ACC>","beneficiaryId":"<BEN_YES>","amountMinor":200000,"narration":"to GTB"}
```

**You will see:** `202 Accepted` (not 201), `"status":"PENDING"`, `"feeMinor":1000`.
**Copy:** the `id` → **T1**.

Now check Ada's balance straight away (`GET /api/accounts/{id}` with **ADA_ACC**): it has already dropped by `201000`
(the ₦2,000 plus the ₦10 fee), because the money is on hold.

Then **click Execute on `GET /api/transfers/{id}`** (path = **T1**) every few seconds until it reads `SUCCESS` (about
2 seconds). Ada's balance stays down.

**Say:** *"The money is held the instant the request is accepted, so it can't be spent twice. A separate worker then
contacts the bank with no database transaction open."*

### B4: Send the identical request again (replay)

Same endpoint, same key (`ext-101-0001`), same body, Execute.

**You will see:** `200` and the header `idempotent-replayed: true`. Ada's balance is unchanged.

### B5: The bank refuses: everything is refunded

`POST /api/transfers/external` with **Idempotency-Key** = `ext-101-0002`, `beneficiaryId` = **BEN_NO**,
`amountMinor` = `100000`. Copy the new transfer `id` (call it **T2**).

1. Check Ada's balance: it dipped by `101000`.
2. Click Execute on `GET /api/transfers/{id}` (**T2**) until it reads `FAILED`, with
   `"failureReason":"Simulated refusal by the provider"` (about 3 seconds).
3. Check Ada's balance again: it is back where it started.
4. Open `GET /api/accounts/{id}/entries` for **ADA_ACC**: you will see `REVERSAL +101000` above `EXTERNAL_HOLD −101000`.

**Say:** *"A refund is not an erasure. The hold stays in the book and a reversing entry cancels it, fee included."*

### B6: Refusals that happen before the bank is contacted

First create a second customer ("Chi") with a small balance, as in A1 to A3: fund their account with `200500` kobo
(₦2,005) and save a payee for them (`bankCode` `058`, `accountNumber` `0123453333`). Then, on
`POST /api/transfers/external` with the source set to Chi's account:

| Try | Body change | You will see |
|---|---|---|
| Covers the amount but not amount plus fee | `amountMinor` = `200000` | **422** `INSUFFICIENT_FUNDS` |
| Below the ₦100 minimum | `amountMinor` = `5000` | **400** `VALIDATION_FAILED` |
| Someone else's saved payee | `beneficiaryId` = **BEN_LATER** (Ada's) | **404** `RESOURCE_NOT_FOUND` |
| A payee that does not exist | `beneficiaryId` = `00000000-0000-0000-0000-000000000000` | **404** |

Check Chi's balance: still `200500`.
**Say:** *"None of these reached the bank, and none left a trace. The fee must be covered as well as the amount, and you
can only pay through your own saved payees."*

### B7: The slow bank (about 14 seconds)

`POST /api/transfers/external`, key `ext-101-0003`, `beneficiaryId` = **BEN_LATER**, `amountMinor` = `150000`. Poll the
transfer with `GET /api/transfers/{id}`.

**You will see:** `PENDING` → `PROCESSING` (about 10 seconds) → `SUCCESS`.
**Say:** *"The money sits safely in suspense, and a second worker, the reconciler, goes back and asks the bank."*

### B8: A timeout, but the bank DID get it (about 19 seconds)

Key `ext-101-0004`, `beneficiaryId` = **BEN_UNSURE**, `amountMinor` = `120000`. Poll until it reads `SUCCESS`.

**Say:** *"A timeout means 'I don't know', not 'it failed'. We keep the money held and retry with the same reference, so
the bank treats it as the same request and pays exactly once."*

### B9 (optional, about 34 seconds): A timeout, and the bank NEVER got it

Key `ext-101-0005`, `beneficiaryId` = **BEN_LOST**, `amountMinor` = `110000`. Poll the transfer. It stays `PROCESSING`
for about 30 seconds, then reads `FAILED` with *"The transfer never reached the payment provider"*, and Ada's balance
is restored.

**Say:** *"We only refund when the bank has confirmed it never received the request."*

### B10: The alerts

`GET /api/notifications` with query `customerId` = **ADA**. You will see one SMS per outcome, newest first: successes
with the fee, refusals with the reason and "the money has been returned".

---

## 7. Tips for presenting in Swagger

- **Keep two windows side by side:** Swagger and your notepad of ids.
- **Zoom the browser** (Ctrl and +) so the audience can read the response.
- **Collapse each endpoint** after you use it, so the page stays short.
- **Polling:** there is no automatic refresh. Click Execute on the transfer lookup every 2 to 3 seconds. For the long
  waits (B7 to B9), say what is happening while you wait, or run those in the shell with the `wait_final` helper from
  `EXTERNAL-TRANSFER-GUIDE.md` instead.
- **Headers matter:** scroll the response to its **Response headers** for `location` and `idempotent-replayed`.
- **Reload the page** (Ctrl+F5) after a redeploy, since Swagger caches the API description.
- **Do not demo the dev funding endpoint to people who may exploit it.** It mints money. On Render, switch it off after
  presenting (`PAYBRIDGE_DEV_FUNDING_ENABLED=false`).

---

## 8. If something goes wrong

| Symptom | Fix |
|---|---|
| Swagger page won't load or is blank | Open `/v3/api-docs` directly. If that fails, check the app logs. On Render, wait for the service to wake and retry. |
| `Failed to fetch` / "CORS" in Swagger | The server URL in the Swagger **Servers** box does not match the page you opened. Open Swagger from the app's own address. |
| `400` "Idempotency-Key header is required" | The key field is empty. Type a new value. |
| `422 IDEMPOTENCY_KEY_REUSED` | You reused a key with a different body. Use a new key. |
| `200` instead of `201`/`202` | You reused a key with the same body: it is a replay. Correct if intended; otherwise use a new key. |
| `404` on `/api/dev/accounts/.../fund` | The dev funding switch is off. Locally it is on by default; on Render set `PAYBRIDGE_DEV_FUNDING_ENABLED` to `true`. |
| `404` on a transfer lookup | The id is wrong. Copy it again from the creating response. |
| `404` when saving a payee | An account number ending `9999` cannot be resolved by design. |
| `409`/duplicate email | That email is taken. Change the number in it. |
| Transfer stays `PENDING` | The dispatcher runs every 2 seconds. On Render, make sure the service is awake. |
| Transfer stays `PROCESSING` | Expected for `1234`, `5555`, `2222` (14 to 34 seconds). |
| `422 LIMIT_EXCEEDED` after many runs | Limits are per customer per day. Create fresh customers. |
| Swagger changes after a code change don't appear | Restart the app and hard-reload the page (Ctrl+F5). |

---

## 9. Running order and timing

**Suggested order (about 5 minutes of talking and about 30 seconds of waiting):**

| Order | Step | Waits | Why include it |
|---|---|---|---|
| 1 | A1 to A3: customers, accounts, funding | none | Sets the scene |
| 2 | A4: missing key | none | "No key, no transfer" |
| 3 | **A5: internal transfer** | none | The core feature |
| 4 | **A6: replay** | none | Idempotency |
| 5 | A7 to A8: balances, statements | none | The evidence |
| 6 | A9: refusals | none | Safety |
| 7 | B1 to B2: name enquiry, payees | none | The real-world flow |
| 8 | **B3: external success** | about 2 s | Hold, then settle |
| 9 | **B5: refusal and refund** | about 3 s | Nothing erased, fee returned |
| 10 | **B8: timeout after receipt** | about 19 s | "Unknown is not failed", paid once |

Skip B7 and B9 (14 s and 34 s) if you are short of time.

**Practise saying this in order (external):** *accept → hold in suspense → outbox note → dispatcher asks the bank (no
transaction open) → yes: pay out and earn the fee / no: refund / no answer: keep holding and retry → reconciler asks
later → finish.*

**Five talking points that win the demo:**
(1) money is stored as whole kobo; (2) every movement is balanced double-entry; (3) the same request twice moves money
once; (4) a timeout is "unknown", never "failed", and a retry cannot pay twice; (5) the database enforces the rules even
if the code is wrong.
