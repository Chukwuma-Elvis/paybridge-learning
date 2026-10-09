# PayBridge: Internal Transfer Demo Guide

A step-by-step script for demonstrating an **internal account-to-account transfer**, with an explanation of what
every step does: the modules, files and methods involved, and how they connect.

> **Rehearsed on 2026-10-09** against this project in Git Bash. Every command below produced the output shown.
> All values in the sample outputs (ids, numbers) will differ on your run.

**Contents**

1. [Before you start](#1-before-you-start)
2. [The demo, step by step](#2-the-demo-step-by-step)
3. [Optional finale: look inside the database](#3-optional-finale-look-inside-the-database)
4. [The 60-second architecture story](#4-the-60-second-architecture-story)
5. [Questions you may be asked](#5-questions-you-may-be-asked)
6. [If something goes wrong](#6-if-something-goes-wrong)
7. [Rehearsal plan](#7-rehearsal-plan)

---

## 1. Before you start

**Two minutes of preparation:**

1. **Start Docker Desktop** and wait until it is fully running.
2. **Make sure nothing else is using port 8080** (stop any old copy of the app).
3. **Terminal 1: start the app** from the project folder:

   ```bash
   cd "/c/Users/CHUKWUMA/projects/paybridge/paybridge(learning copy)"
   ./mvnw spring-boot:run
   ```

   Wait for a line containing **`Started PayBridgeApplication`** (about 30 to 40 seconds). On the way you will
   see Spring start Postgres through `compose.yaml` and Flyway apply migrations 1 to 8.

4. **Terminal 2: open a second Git Bash window and use the same window for the whole demo.** The commands store
   ids in shell variables (`ADA`, `ADA_ACC`, ...), and variables only live inside one window.

   ```bash
   BASE=http://localhost:8080
   H='Content-Type: application/json'
   S=$RANDOM
   ```

   `S` is a random number added to emails and idempotency keys, so you can **repeat the demo as many times as you
   like** without "email already exists" errors.

> **Paste the commands, do not use a Run button.** The steps share variables, so they must be pasted into the
> same window one after another.

**Money is in kobo:** 100 kobo = ₦1, so `300000` kobo = ₦3,000 and `50000` kobo = ₦500.

---

## 2. The demo, step by step

For each step: **the command, what you will see, what happens inside, and what to say.**

### Step 1: Create two customers

```bash
ADA_JSON=$(curl -s -X POST $BASE/api/customers -H "$H" -d '{"firstName":"Ada","lastName":"Obi","email":"ada'$S'@example.com","phone":"08012345678"}')
echo "$ADA_JSON"
ADA=$(echo "$ADA_JSON" | sed -E 's/.*"id":"([^"]+)".*/\1/')
BOLA_JSON=$(curl -s -X POST $BASE/api/customers -H "$H" -d '{"firstName":"Bola","lastName":"Eze","email":"bola'$S'@example.com","phone":"08098765432"}')
BOLA=$(echo "$BOLA_JSON" | sed -E 's/.*"id":"([^"]+)".*/\1/')
echo "ADA=$ADA"; echo "BOLA=$BOLA"
```

**You will see:**
`{"id":"9acd...","firstName":"Ada","lastName":"Obi","email":"ada17839@example.com","phone":"+2348012345678","kycTier":"UNVERIFIED","status":"ACTIVE"}`

**What the shell commands do:** `curl -s` sends the HTTP request quietly. `$(...)` captures the reply into a variable.
`sed -E 's/.*"id":"([^"]+)".*/\1/'` pulls the `id` out of the JSON text so you do not have to copy ids by hand.

**What happens inside:**

| # | Where | What |
|---|---|---|
| 1 | `shared/config/RequestIdFilter.doFilterInternal` | Gives the request a unique id that appears on every log line and in the `X-Request-Id` header |
| 2 | `customer/web/CustomerController.create` | Receives the JSON |
| 3 | `CreateCustomerRequest` (validation) | `@NotBlank`, `@Email`, `@Pattern` on the phone, checked **before** the method runs |
| 4 | `customer/service/CustomerService.register` | Lower-cases the email; `existsByEmail` (friendly check); builds `new Customer(...)`; `saveAndFlush`; catches a unique-constraint race |
| 5 | `customer/domain/Customer` | The constructor sets `UNVERIFIED` and `ACTIVE`: nobody can create a pre-verified customer |
| 6 | `CustomerService.normalisePhone` | `0801...` becomes `+234801...` |
| 7 | `shared/audit/AuditableEntity` | `created_at` and `updated_at` are stamped automatically |
| 8 | Database table `customer` (migration V2) | `UNIQUE (email)` is the real guarantee |
| 9 | `CustomerResponse.from`, `201 Created`, `Location` header | The reply |

**Say:** *"Every customer starts unverified and active. Their KYC tier decides how much they can send. The phone was
normalised, and the id is a UUID so it cannot be guessed."*

---

### Step 2: Open an account for each

```bash
ADA_ACC_JSON=$(curl -s -X POST $BASE/api/accounts -H "$H" -d '{"customerId":"'$ADA'"}')
echo "$ADA_ACC_JSON"
ADA_ACC=$(echo "$ADA_ACC_JSON" | sed -E 's/.*"id":"([^"]+)".*/\1/')
ADA_NUM=$(echo "$ADA_ACC_JSON" | sed -E 's/.*"accountNumber":"([0-9]+)".*/\1/')
BOLA_ACC_JSON=$(curl -s -X POST $BASE/api/accounts -H "$H" -d '{"customerId":"'$BOLA'"}')
BOLA_ACC=$(echo "$BOLA_ACC_JSON" | sed -E 's/.*"id":"([^"]+)".*/\1/')
BOLA_NUM=$(echo "$BOLA_ACC_JSON" | sed -E 's/.*"accountNumber":"([0-9]+)".*/\1/')
echo "Ada: $ADA_NUM   Bola: $BOLA_NUM"
```

**You will see:**
`{"id":"...","accountNumber":"1000000017","customerId":"...","currency":"NGN","balanceMinor":0,"status":"ACTIVE"}`

**What happens inside:**

| # | Where | What |
|---|---|---|
| 1 | `account/web/AccountController.open` | Receives `OpenAccountRequest` (`customerId` is mandatory; the currency defaults to `NGN` through `currencyOrDefault()`) |
| 2 | `account/service/AccountService.openCustomerAccount` | Only NGN is allowed for now |
| 3 | `CustomerApi.getCustomer` → `CustomerService` (**customer module, through its front desk**) | The customer must exist (404 otherwise) and be active |
| 4 | `AccountRepository.nextAccountSerial` | Takes the next number from the database sequence `account_number_seq` (100000001, 100000002, ...) |
| 5 | `account/domain/Nuban.generate("999", serial)` | Adds the **check digit**: `100000001` + `7` = `1000000017` (the bank code `999` comes from `application.yml`) |
| 6 | `Account.openForCustomer` | Balance 0, status `ACTIVE`, type `CUSTOMER` |
| 7 | Database table `account` (migration V3) | `CHECK (balance_minor >= 0)` for customer accounts; `UNIQUE (account_number)` |

**Say:** *"The account number is a Nigerian NUBAN: nine digits from a database sequence plus a check digit, so a
mistyped number is caught instantly. The balance starts at zero, and the database itself refuses to let a customer
account go negative."*

---

### Step 3: Put test money in Ada's account

```bash
curl -s -X POST $BASE/api/dev/accounts/$ADA_ACC/fund -H "$H" -d '{"amountMinor":300000}'; echo
```

**You will see:** `{"accountId":"...","balanceMinor":300000,"entryId":"..."}` (**300000 kobo = ₦3,000**)

**What happens inside:**

| # | Where | What |
|---|---|---|
| 1 | `ledger/web/DevFundingController.fund` | **Test scaffolding**, switched on by `paybridge.dev.funding-enabled: true` in `application.yml` |
| 2 | `LedgerApi.post(FUNDING ...)` → `LedgerService.doPost` | Debit `FUNDING_SOURCE` −300000, credit Ada +300000 |
| 3 | `LedgerService.validateShape` | Two lines, none zero, one currency, **the sum is zero** |
| 4 | `AccountService.lockAccounts` → `AccountRepository.findByIdForUpdate` | Locks both rows (`SELECT ... FOR UPDATE`) in id order |
| 5 | `journalEntryRepository.findByEntryTypeAndReference` | "Has this event been posted already?" No |
| 6 | Pre-checks, then `AccountService.applyBalanceChange` → `Account.applyBalanceChange` | Frozen? Overdraft? Then change the balance |
| 7 | Save `JournalEntry` and two `LedgerLine`s | The permanent record |
| 8 | Database at commit | Trigger `ledger_check_entry_balanced`: −300000 + 300000 = 0 ✓ |

**Say:** *"There is no real deposit yet, so this endpoint stands in for one. Notice it does not just set a number: it
posts a balanced ledger entry from the bank's own funding account. Even test money obeys double-entry bookkeeping."*

---

### Step 4: THE TRANSFER: Ada sends Bola ₦500

```bash
KEY=demo-$S-0001
curl -s -i -X POST $BASE/api/transfers/internal -H "$H" -H "Idempotency-Key: $KEY" \
  -d '{"sourceAccountId":"'$ADA_ACC'","destinationAccountNumber":"'$BOLA_NUM'","amountMinor":50000,"narration":"rent"}' | grep -E "^HTTP|^Location|^X-Request-Id|^\{"
```

**You will see:** `HTTP/1.1 201`, a `Location: /api/transfers/...` header, an `X-Request-Id`, and the JSON with
`"status":"SUCCESS"`, `"type":"INTERNAL"`, `"amountMinor":50000`, `"feeMinor":0`.
(`-i` shows the headers; `grep` keeps only the useful lines.)

#### The full call chain (know this one by heart)

| # | Module · File · Method | What it does | Table touched |
|---|---|---|---|
| 1 | `shared` · `RequestIdFilter.doFilterInternal` | Tags the request | |
| 2 | `transfer.web` · `TransferController.transferInternal` | Entry point for `POST /api/transfers/internal` | |
| 3 | `InternalTransferRequest` | `@Valid`: source id present, destination is 10 digits, amount > 0 | |
| 4 | `IdempotencyHeader.require` | Header present, 8 to 100 safe characters | |
| 5 | `transfer.service` · `TransferService.transferInternal` | **Opens ONE database transaction** for everything below | |
| 6 | `IdempotencyService.fingerprint` | SHA-256 of (source, destination, amount, narration) | |
| 7 | `IdempotencyService.begin` → `IdempotencyKeyRepository.claim` | `INSERT ... ON CONFLICT DO NOTHING` returns **1** → brand-new request | `idempotency_key` |
| 8 | `AccountApi.getAccount` / `getByAccountNumber` → `AccountService` | Both accounts exist, are customer accounts, and are active | `account` (read) |
| 9 | `TransferService` checks | Not the same account; same currency | |
| 10 | `CustomerApi.getCustomer` → `CustomerService` | The sender is active | `customer` (read) |
| 11 | `ComplianceApi.reserve` → `ComplianceService.reserve` | Reads the tier's limits from `application.yml`; **one atomic upsert** adds to today's total only if within the daily limit | `daily_usage` |
| 12 | `TransferRepository.save(Transfer.internal(...))` | Creates the record: status `PENDING`, reference `pb-<uuid>` | `transfer` |
| 13 | `LedgerApi.post` → `LedgerService.doPost` | Validate; **lock** both accounts in id order; replay check; check rules; apply | see 13a to 13c |
| 13a | `AccountService.lockAccounts` | `SELECT ... FOR UPDATE` | `account` |
| 13b | `AccountService.applyBalanceChange` → `Account.applyBalanceChange` | Ada −50000, Bola +50000 (version bumped) | `account` |
| 13c | `JournalEntryRepository.save` + `LedgerLineRepository.save` ×2 | The permanent ink record | `journal_entry`, `ledger_line` |
| 14 | `Transfer.markSuccess` → `TransferStatus.canMoveTo` | The state machine allows `PENDING → SUCCESS`; sets `completedAt` | |
| 15 | `IdempotencyService.complete` | Writes the transfer id onto the stub | `idempotency_key` |
| 16 | `ApplicationEventPublisher.publishEvent(TransferCompleted)` | Pins the notice on the board | `event_publication` |
| 17 | `TransferMapper.toSummary` → `TransferController.respond` | Builds `201 Created` + `Location` | |
| 18 | **COMMIT** | Hibernate writes everything; the Postgres trigger checks the ledger lines sum to 0 | all of the above |
| 19 | *after commit* · `notification.listener.TransferEventListener.on` → `NotificationService.onTransferCompleted` | Sends alerts to Ada ("you sent") and Bola ("you received") | `notification` |

**Say:** *"Everything between steps 5 and 18 is a single database transaction: the idempotency stub, the allowance,
the transfer record, the money movement and the event commit together or not at all. The transfer service never
touches a balance itself: it only asks the ledger. And the ledger can only reach accounts through the account
module's `api`."*

---

### Step 5: Send the identical request again (the strongest moment)

```bash
curl -s -i -X POST $BASE/api/transfers/internal -H "$H" -H "Idempotency-Key: $KEY" \
  -d '{"sourceAccountId":"'$ADA_ACC'","destinationAccountNumber":"'$BOLA_NUM'","amountMinor":50000,"narration":"rent"}' | grep -E "^HTTP|^Idempotent-Replayed|^\{"
```

**You will see:** `HTTP/1.1 200` (not 201), `Idempotent-Replayed: true`, and the **same transfer id and reference** as
Step 4.

**What happens inside:**

| # | Where | What |
|---|---|---|
| 1 | Steps 1 to 6 of the call chain, as before | |
| 2 | `IdempotencyKeyRepository.claim` | Returns **0**: the stub already exists |
| 3 | `IdempotencyService.begin` → `find` | Compares fingerprints: **equal**; the stub has a `transferId` → returns that id |
| 4 | `TransferService.transferInternal` | Returns `new TransferResult(getTransfer(id), true)` and **stops** |
| 5 | `TransferController.respond` | `replayed == true` → `200 OK` plus the header |

Nothing else runs: **no compliance, no ledger, no event, no new rows.**

**Say:** *"Networks fail and clients retry. If the first reply was lost, the customer's app sends the request again.
Without protection, Bola would be paid twice. The unique key makes this safe, and the 200 versus 201 tells the client
'I already did this'."*

---

### Step 6: Check the balances

```bash
echo -n "Ada : "; curl -s $BASE/api/accounts/$ADA_ACC; echo
echo -n "Bola: "; curl -s $BASE/api/accounts/$BOLA_ACC; echo
```

**You will see:** Ada `"balanceMinor":250000` (**₦2,500**), Bola `"balanceMinor":50000` (**₦500**).

`AccountController.get` → `AccountService.getAccount` (read-only) → the cached `balance_minor` column.

**Say:** *"₦3,000 − ₦500 = ₦2,500, and it moved exactly once even though I sent the request twice."*

---

### Step 7: The statements (the evidence)

```bash
curl -s $BASE/api/accounts/$ADA_ACC/entries; echo
curl -s $BASE/api/accounts/$BOLA_ACC/entries; echo
```

**You will see:** Ada: `TRANSFER −50000` (newest) then `FUNDING +300000`. Bola: `TRANSFER +50000`. Both show the
**same entry id and reference**.

`ledger/web/StatementController` → `LedgerApi.statement` → `LedgerLineRepository.statement` (a JPQL query joining
`LedgerLine` and `JournalEntry`, newest first, limited by `PageRequest`) → `StatementRow` → `LedgerLineView` →
`StatementLineResponse`.

**Say:** *"Negative is money out, positive is money in. It is the same journal entry on both statements: one event,
two sides, adding up to zero. That is double-entry bookkeeping."*

---

### Step 8: The refusals (show the safety)

Run each one. Note the standard error shape: `code` (for programs), `detail` (for people), `requestId` (for support).

**8a. Overdraw: ₦40,000 from a ₦2,500 balance**

```bash
curl -s -X POST $BASE/api/transfers/internal -H "$H" -H "Idempotency-Key: demo-$S-0002" -d '{"sourceAccountId":"'$ADA_ACC'","destinationAccountNumber":"'$BOLA_NUM'","amountMinor":4000000}'; echo
```

**8b. Over the ₦50,000 limit for an unverified customer**

```bash
curl -s -X POST $BASE/api/transfers/internal -H "$H" -H "Idempotency-Key: demo-$S-0003" -d '{"sourceAccountId":"'$ADA_ACC'","destinationAccountNumber":"'$BOLA_NUM'","amountMinor":5000001}'; echo
```

**8c. No Idempotency-Key header**

```bash
curl -s -X POST $BASE/api/transfers/internal -H "$H" -d '{"sourceAccountId":"'$ADA_ACC'","destinationAccountNumber":"'$BOLA_NUM'","amountMinor":100}'; echo
```

**8d. Same key, different amount**

```bash
curl -s -X POST $BASE/api/transfers/internal -H "$H" -H "Idempotency-Key: $KEY" -d '{"sourceAccountId":"'$ADA_ACC'","destinationAccountNumber":"'$BOLA_NUM'","amountMinor":99999,"narration":"rent"}'; echo
```

**8e. To herself**

```bash
curl -s -X POST $BASE/api/transfers/internal -H "$H" -H "Idempotency-Key: demo-$S-0005" -d '{"sourceAccountId":"'$ADA_ACC'","destinationAccountNumber":"'$ADA_NUM'","amountMinor":100}'; echo
```

| Refusal | HTTP · code | **Which layer says no** | Method |
|---|---|---|---|
| 8a overdraw | 422 `INSUFFICIENT_FUNDS` | **Ledger**, in the "check every rule before changing anything" stage | `LedgerService.doPost` → `InsufficientFundsException` |
| 8b over the limit | 422 `LIMIT_EXCEEDED` | **Compliance** | `ComplianceService.reserve` |
| 8c no key | 400 `VALIDATION_FAILED` | **Web layer**, before the service even starts | `IdempotencyHeader.require` |
| 8d key reuse | 422 `IDEMPOTENCY_KEY_REUSED` | **Idempotency service** (the fingerprints differ) | `IdempotencyService.begin` |
| 8e to herself | 400 `VALIDATION_FAILED` | **Transfer service** business rule | `TransferService.transferInternal` |

**Every refusal ends the same way:** the exception travels up to `shared/exception/GlobalExceptionHandler`, which turns
it into the standard JSON using the `ErrorCode` → HTTP status mapping.

**Say:** *"Each rule is enforced at the layer that owns it. And a refused transfer leaves no trace: the allowance is not
used up, no key is burned, no row is written, because the whole thing was one transaction that rolled back."*

---

### Step 9: Limits and history

```bash
curl -s $BASE/api/compliance/customers/$ADA/limits; echo
curl -s "$BASE/api/transfers?accountId=$ADA_ACC"; echo
```

**You will see:** `"usedTodayMinor":50000` out of `"dailyMinor":10000000`, and Ada's one `SUCCESS` transfer.

`ComplianceController` → `ComplianceService.limitStatus` (reads `daily_usage`).
`TransferController.listForAccount` → `TransferService.listForAccount` → `TransferRepository.findForAccount`
(transfers sent **or** received, newest first).

---

### Step 10: The alerts

```bash
curl -s "$BASE/api/notifications?customerId=$BOLA"; echo
```

**You will see:** two alerts for Bola (`SMS` and `EMAIL`): *"You received NGN 500.00 in your account 1000000024.
Ref: pb-..."*. **Also look at Terminal 1:** the app logged lines like
`[SMS] to +2348098765432: You received NGN 500.00 ...`.

**Chain:** `TransferService` published `TransferCompleted` (call-chain step 16) → after the commit, Spring Modulith
delivers it to `notification/listener/TransferEventListener.on` (`@ApplicationModuleListener`) →
`NotificationService.onTransferCompleted` → for each person `deliver(...)`: dedup check, save a `Notification` row,
`LoggingNotificationSender.send` (writes the log line).

**Say:** *"The transfer module does not know the notification module exists: it just announced the event. If the SMS
provider were down, the transfer would be unaffected, and the event is kept until it is handled."*

---

## 3. Optional finale: look inside the database

First find the name of your database container:

```bash
docker ps --format "{{.Names}}"
```

It contains `postgres` (for example `paybridgelearningcopy-postgres-1`). Replace `DBNAME` in the commands below.

**The ledger lines, named by account:**

```bash
docker exec DBNAME psql -U paybridge -d paybridge -c "select coalesce(a.account_number, a.code) as account, l.amount_minor, e.entry_type from ledger_line l join account a on a.id = l.account_id join journal_entry e on e.id = l.entry_id order by l.created_at, l.amount_minor;"
```

**You will see** (from the rehearsal):

```
    account     | amount_minor | entry_type
----------------+--------------+------------
 FUNDING_SOURCE |      -300000 | FUNDING
 1000000017     |       300000 | FUNDING
 1000000017     |       -50000 | TRANSFER
 1000000024     |        50000 | TRANSFER
```

**Does the whole bank add up to zero?**

```bash
docker exec DBNAME psql -U paybridge -d paybridge -c "select sum(balance_minor) as all_balances_added_together from account;"
```

**You will see `0`:** across the whole bank, money was neither created nor destroyed.

**Try to rewrite history:**

```bash
docker exec DBNAME psql -U paybridge -d paybridge -c "update ledger_line set amount_minor = 1;"
```

**You will see** `ERROR: the ledger is append-only: UPDATE on ledger_line is not allowed`. Even a developer typing SQL
directly cannot rewrite history.

**Try to make a customer balance negative:**

```bash
docker exec DBNAME psql -U paybridge -d paybridge -c "update account set balance_minor = -1 where account_type = 'CUSTOMER';"
```

**You will see** `violates check constraint "ck_account_customer_not_negative"`. Even bypassing the Java, a customer
cannot go negative.

**Say:** *"These last two are the point of the design: the important rules are enforced twice, once in code and once
in the database, so a bug in one layer cannot corrupt money."*

---

## 4. The 60-second architecture story

> *"PayBridge is a modular monolith: one application split into modules that may only talk through public `api`
> interfaces, and a test enforces that. The `customer` module knows who people are; `account` holds balances;
> `ledger` is the only way money moves, as balanced double-entry records that can never be edited; `compliance`
> enforces limits by KYC tier; `transfer` orchestrates it all inside one database transaction; `notification` reacts to
> events afterwards; and `shared` holds money, errors and auditing. The result: transfers that cannot overdraw,
> cannot be duplicated, and cannot be partially applied."*

---

## 5. Questions you may be asked

| Question | Short answer |
|---|---|
| Why store money as kobo integers? | Floating-point cannot represent decimals exactly; whole numbers can. |
| What stops two simultaneous withdrawals overdrawing? | Row locks taken in a fixed order (so no deadlocks), plus a database `CHECK`. |
| What if the client retries? | The `Idempotency-Key` header and a unique database constraint: same key → same transfer. |
| What if the server crashes mid-transfer? | It is one transaction: nothing is saved unless everything is. |
| Why a separate ledger? | It is the single audited path for all money and it is append-only; balances are a cache of it. |
| Why events for notifications? | A failed alert can never undo a transfer, and the modules stay independent. |
| What proves it works? | 214 automated tests (including races of 40 and 200 simultaneous transfers), plus this live demo. |
| What is not built yet? | Real Paystack transfers (the interface and a simulated bank exist), webhooks, API-key security. |

---

## 6. If something goes wrong

| Symptom | Fix |
|---|---|
| `curl: (7) Failed to connect` | The app is not running yet. Wait for `Started PayBridgeApplication` in Terminal 1. |
| `Port 8080 was already in use` | Stop the other copy. Check with `netstat -ano \| grep 8080`. |
| App fails with "Could not find a valid Docker environment" | Start Docker Desktop and wait until it is ready. |
| `password authentication failed for user "paybridge"` | A Windows Postgres is on port 5432; `compose.yaml` must map `"5433:5432"`. |
| A variable is empty (`echo $ADA` prints nothing) | The previous step failed, or you opened a new window. Re-run from Step 1 in this window. |
| Step 4 returns 404 | `$BOLA_NUM` is empty; re-run Step 2. |
| You want a clean slate | Stop the app, then run `docker compose down -v` in the project folder (this deletes the local demo data). |

---

## 7. Rehearsal plan

1. **Run it once with this guide open**, copying every command.
2. **Run it again without reading the commands**, saying out loud what each step does.
3. **Practise the call chain for Step 4** until you can recite it:
   *header → validation → one transaction → stub → accounts → sender → allowance → record → ledger (lock, check,
   apply, write) → success → event → commit → alerts.*

**Five talking points that win the demo:**
(1) money is stored as whole kobo; (2) every movement is balanced double-entry; (3) the same request twice moves money
once; (4) a refused transfer leaves no trace; (5) the database enforces the rules even if the code is wrong.
