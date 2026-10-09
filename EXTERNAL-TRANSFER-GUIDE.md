# PayBridge: External Transfer Guide

How an **external transfer** (money sent from a PayBridge account to an account at **another bank**) works, with a
step-by-step demo script and an explanation of every module, file and method involved.

> **Rehearsed on 2026-10-09** against this project in Git Bash, using the built-in **simulated bank**
> (`FakeTransferGateway`). Every command below produced the output shown, and the waiting times were measured.
> Ids and numbers in sample outputs will differ on your run.
>
> This guide uses the simulated bank, **not Paystack**. The real Paystack client (Step 11) plugs into the same
> interface and changes nothing described here except who answers the bank's questions.

**Contents**

1. [The idea in two minutes](#1-the-idea-in-two-minutes)
2. [The simulated bank: how to provoke each situation](#2-the-simulated-bank-how-to-provoke-each-situation)
3. [Before you start](#3-before-you-start)
4. [The demo, step by step](#4-the-demo-step-by-step)
5. [How the pieces fit: the three workers](#5-how-the-pieces-fit-the-three-workers)
6. [The money trail](#6-the-money-trail)
7. [Look inside the database](#7-look-inside-the-database)
8. [Questions you may be asked](#8-questions-you-may-be-asked)
9. [If something goes wrong](#9-if-something-goes-wrong)
10. [Rehearsal plan and timing cheat sheet](#10-rehearsal-plan-and-timing-cheat-sheet)

---

## 1. The idea in two minutes

An **internal** transfer moves money between two PayBridge accounts. It is instant and entirely under our control.

An **external** transfer sends money to a company we do **not** control (the recipient's bank, reached through a
payment provider). That company can be slow, can refuse, or can simply not answer. The dangerous case is
**"no answer"**: did the money go or not?

> **Analogy: posting a registered letter.** You hand the postman money and a letter. If he comes back and says
> "delivered" or "refused", you know. If he **never comes back**, you do not know. You would not assume the letter was
> lost and send the money again. You would **ask the recipient**.

### The three rules this design is built on

1. **Never call the bank inside a database transaction.** The call is slow and unreliable. A crash between the two
   systems could lose or duplicate money, and the transaction would hold locks while waiting.
2. **A timeout means "unknown", never "failed".** Keep the money on hold and find out.
3. **Applying the bank's answer must be safe to repeat.** Providers repeat themselves; a second "success" must not pay
   twice.

### The lifecycle

```
 1. ACCEPT (one fast transaction)        2. DISPATCHER (every 2 s)               3. RECONCILER (every 5 s)
 hold amount + fee in SUSPENSE           asks the bank, NO transaction open      asks the bank about quiet transfers
 save transfer PENDING                      ├─ yes ........ pay out, earn fee         ├─ yes ........ pay out
 write an "outbox" to-do note               ├─ refused .... refund amount + fee       ├─ refused .... refund
                                            ├─ accepted ... wait (PROCESSING)         ├─ never heard of it .. refund
                                            └─ no answer .. keep money held, retry    └─ still working ..... look again later
```

---

## 2. The simulated bank: how to provoke each situation

Real sandboxes nearly always say "success", so they never show the hard cases. The built-in bank decides how to
behave from the **last four digits of the payee's account number**:

| Payee ends in | What the bank does | Final result | Measured time |
|---|---|---|---|
| `3333` | Pays at once | `SUCCESS` | **about 2 s** |
| `1111` | Refuses at once | `FAILED`, everything refunded | **about 3 s** |
| `1234` (or any other number) | Accepts, still working; later reports success | `SUCCESS` (finished by the reconciler) | **about 14 s** |
| `5555` | **Times out after receiving** the request (the money IS being sent) | `SUCCESS`, paid **exactly once** | **about 19 s** |
| `2222` | **Times out before receiving** (nothing was sent) | `FAILED`, refunded | **about 34 s** |
| `9999` | Name enquiry cannot find the account | payee can't be saved (404) | instant |
| `4444`, `6666`, `7777` | Accepted then failed / pending for ever / success then reversed | covered by automated tests | n/a here |

The waiting times come from `application.yml`: dispatcher every 2 s; reconciler every 5 s and only for transfers
quiet for 10 s; retries after 2, 4, 8, 16 seconds, giving up on the 5th attempt.

> A success followed by a **reversal** (`7777`) cannot be triggered by hand yet, because that needs a webhook
> (Step 12). It is proven by the automated test `aTransferTheBankReversesAfterSucceedingIsFullyRefunded`.

---

## 3. Before you start

1. **Start Docker Desktop** and wait until it is fully running.
2. **Nothing else may use port 8080.**
3. **Terminal 1: start the app:**

   ```bash
   cd "/c/Users/CHUKWUMA/projects/paybridge/paybridge(learning copy)"
   ./mvnw spring-boot:run
   ```

   Wait for **`Started PayBridgeApplication`**. Keep this window visible: it shows the workers' log lines
   (for example the `Giving up sending transfer ...` warning in Step 9, and the `[SMS] to ...` alerts).

4. **Terminal 2: open a second Git Bash window and use it for the whole demo.** Paste this block first. It defines
   the settings and four small helper functions:

   ```bash
   BASE=http://localhost:8080
   H='Content-Type: application/json'
   S=$RANDOM
   idof()     { sed -E 's/.*"id":"([^"]+)".*/\1/'; }
   statusof() { sed -E 's/.*"status":"([A-Z]+)".*/\1/'; }
   bal()      { curl -s $BASE/api/accounts/$1 | sed -E 's/.*"balanceMinor":(-?[0-9]+).*/\1/'; }
   wait_final() {
     for i in $(seq 1 40); do
       ST=$(curl -s $BASE/api/transfers/$1 | statusof)
       echo "  $(date +%T)  status = $ST"
       case $ST in SUCCESS|FAILED|REVERSED) return;; esac
       sleep 2
     done
   }
   ```

   | Helper | What it does |
   |---|---|
   | `idof` | Extracts the `"id"` value from JSON text on its input |
   | `statusof` | Extracts the `"status"` value |
   | `bal ID` | Prints an account's balance in kobo |
   | `wait_final ID` | Checks a transfer every 2 seconds and prints its status **until it reaches a final state**, so you can watch it move from `PENDING` to `PROCESSING` to `SUCCESS` |

   `S` is a random number added to emails and keys so the demo can be repeated without clashes.

> **Paste, don't use a Run button.** Steps share variables, so they must be pasted into one window.
> **Money is in kobo:** 100 kobo = ₦1, so `200000` = ₦2,000 and `1000` = ₦10.

**Fees used in this demo** (placeholders in `application.yml`, charged **on top** of the amount): up to ₦5,000 →
₦10; up to ₦50,000 → ₦25; above → ₦50. Internal transfers are free. The minimum external transfer is ₦100.

---

## 4. The demo, step by step

### Step 0: Set up Ada with ₦30,000

```bash
ADA=$(curl -s -X POST $BASE/api/customers -H "$H" -d '{"firstName":"Ada","lastName":"Obi","email":"ada'$S'@example.com","phone":"08012345678"}' | idof)
ADA_ACC=$(curl -s -X POST $BASE/api/accounts -H "$H" -d '{"customerId":"'$ADA'"}' | idof)
curl -s -X POST $BASE/api/dev/accounts/$ADA_ACC/fund -H "$H" -d '{"amountMinor":3000000}' >/dev/null
echo "ADA=$ADA"; echo "ADA_ACC=$ADA_ACC"; echo "Ada balance: $(bal $ADA_ACC) kobo"
```

**You will see:** `Ada balance: 3000000 kobo` (₦30,000). *(Customers, accounts and funding are explained in
`DEMO-GUIDE.md`, Steps 1 to 3.)*

---

### Step 1: Name enquiry: "whose account is this?"

```bash
curl -s -X POST $BASE/api/beneficiaries/resolve -H "$H" -d '{"bankCode":"058","accountNumber":"0123453333"}'; echo
echo "-- an account the bank cannot find (ends 9999):"
curl -s -X POST $BASE/api/beneficiaries/resolve -H "$H" -d '{"bankCode":"058","accountNumber":"0123459999"}'; echo
```

**You will see:**
`{"bankCode":"058","accountNumber":"0123453333","accountName":"TEST ACCOUNT 3333"}`
and for `9999`: a `404` with `"code":"RESOURCE_NOT_FOUND"` and `"Could not resolve account ..."`.

| # | Where | What |
|---|---|---|
| 1 | `transfer/web/BeneficiaryController.resolve` (`POST /api/beneficiaries/resolve`) | Receives `BeneficiaryRequests.Resolve` (bank code 3 to 6 digits, account number 10 digits) |
| 2 | `transfer/service/BeneficiaryService.resolve` | Passes straight to the gateway; **saves nothing** |
| 3 | `transfer/client/TransferGateway.resolveAccount` → `FakeTransferGateway` | The bank answers with the account holder's name (the fake invents `TEST ACCOUNT <last 4>`; Paystack will return the real name) |

**Say:** *"Before anyone pays a stranger's account, the app asks the bank who owns it, so the customer can confirm the
name. That is called a name enquiry."*

---

### Step 2: Save payees (beneficiaries)

```bash
BEN_YES=$(curl -s -X POST $BASE/api/beneficiaries -H "$H" -d '{"customerId":"'$ADA'","bankCode":"058","accountNumber":"0123453333"}' | tee /dev/stderr | idof)
echo
BEN_NO=$(curl -s -X POST $BASE/api/beneficiaries -H "$H" -d '{"customerId":"'$ADA'","bankCode":"058","accountNumber":"0123451111"}' | idof)
BEN_LATER=$(curl -s -X POST $BASE/api/beneficiaries -H "$H" -d '{"customerId":"'$ADA'","bankCode":"058","accountNumber":"0123451234"}' | idof)
BEN_UNSURE=$(curl -s -X POST $BASE/api/beneficiaries -H "$H" -d '{"customerId":"'$ADA'","bankCode":"058","accountNumber":"0123455555"}' | idof)
BEN_LOST=$(curl -s -X POST $BASE/api/beneficiaries -H "$H" -d '{"customerId":"'$ADA'","bankCode":"058","accountNumber":"0123452222"}' | idof)
echo "BEN_YES=$BEN_YES"
```

**You will see** the saved payee:
`{"id":"...","customerId":"...","bankCode":"058","accountNumber":"0123453333","accountName":"TEST ACCOUNT 3333"}`

| # | Where | What |
|---|---|---|
| 1 | `BeneficiaryController.create` | `POST /api/beneficiaries`; validates `BeneficiaryRequests.Create` |
| 2 | `BeneficiaryService.create` | **Deliberately not transactional**: talking to the bank must never hold a database transaction open |
| 3 | `CustomerApi.getCustomer` | The customer must exist and be active |
| 4 | `BeneficiaryRepository.findByCustomerIdAndBankCodeAndAccountNumber` | Already saved? Return the existing one (saving twice is harmless) |
| 5 | `gateway.resolveAccount` then `gateway.createRecipient` | The bank gives the real name, then a **recipient code** for this payee (the fake returns `RCP_<number>`; Paystack returns `RCP_xxxx`) |
| 6 | `BeneficiaryRepository.save` | A simultaneous duplicate hits the unique constraint and is caught, returning the one that won |
| 7 | Table `beneficiary` (V8) | `UNIQUE (customer_id, bank_code, account_number)` |

**Say:** *"A saved payee is what Paystack calls a transfer recipient. The name comes from the bank, not from the
customer, so it cannot be mistyped."*

---

### Step 3: Send ₦2,000 to the "YES" payee (instant success)

```bash
BEFORE=$(bal $ADA_ACC)
KEY=ext-$S-0001
curl -s -i -X POST $BASE/api/transfers/external -H "$H" -H "Idempotency-Key: $KEY" \
  -d '{"sourceAccountId":"'$ADA_ACC'","beneficiaryId":"'$BEN_YES'","amountMinor":200000,"narration":"to GTB"}' > /tmp/ext1.txt
grep -E "^HTTP|^Location|^\{" /tmp/ext1.txt
T1=$(tail -1 /tmp/ext1.txt | idof)
echo "Ada balance right after:  $(bal $ADA_ACC)   (was $BEFORE: amount + fee are on hold)"
echo "waiting for the bank..."; wait_final $T1
echo "Ada balance at the end:   $(bal $ADA_ACC)"
```

**You will see:**
- `HTTP/1.1 202` (**202 Accepted**, not 201), a `Location` header, and the JSON with `"status":"PENDING"`,
  `"type":"EXTERNAL"`, `"amountMinor":200000`, **`"feeMinor":1000`**.
- Ada's balance drops **immediately** to `2799000` (₦30,000 − ₦2,010: the amount plus the ₦10 fee).
- Then `PENDING → SUCCESS` within about 2 seconds. The balance **stays** at `2799000`.

**Why 202?** It means "I have accepted this and will deal with it, but it is not finished". The client then watches
`GET /api/transfers/{id}` or waits for the alert.

#### Part A: accepting the request (`POST /api/transfers/external`)

| # | Module · File · Method | What it does | Table touched |
|---|---|---|---|
| 1 | `shared` · `RequestIdFilter.doFilterInternal` | Tags the request | |
| 2 | `transfer.web` · `ExternalTransferController.transferExternal` | Entry point; `@Valid ExternalTransferRequest`; `IdempotencyHeader.require` | |
| 3 | `transfer.service` · `ExternalTransferService.initiate` | **Opens ONE transaction** for everything below (note: no call to the bank) | |
| 4 | `IdempotencyService.fingerprint` + `begin` → `IdempotencyKeyRepository.claim` | Fingerprint includes the word `"external"`; `INSERT ... ON CONFLICT DO NOTHING` returns 1 → new request | `idempotency_key` |
| 5 | `AccountApi.getAccount`, `TransferRules.requireUsableCustomerAccount`, `CustomerApi.getCustomer` | Source is an active customer account; sender is active | `account`, `customer` (read) |
| 6 | `BeneficiaryRepository.findById(...).filter(owner)` | **The payee must belong to the sender**; otherwise "not found" | `beneficiary` (read) |
| 7 | `TransferProperties.externalMinMinor` | At least ₦100 | |
| 8 | `FeeCalculator.feeFor` | Picks the fee band (₦2,000 → ₦10); `total = amount + fee` | |
| 9 | `ComplianceApi.reserve` | Counts the **amount** against today's allowance | `daily_usage` |
| 10 | `TransferRepository.save(Transfer.external(...))` | Status `PENDING`, reference `pb-<uuid>` | `transfer` |
| 11 | `LedgerApi.post(EXTERNAL_HOLD)` | Customer **−total**, `SUSPENSE` **+total**. Insufficient funds (including the fee) is refused here. | `account`, `journal_entry`, `ledger_line` |
| 12 | `TransferOutboxRepository.save(TransferOutbox.forTransfer)` | The "to-do note" for the dispatcher: `PENDING`, due now | `transfer_outbox` |
| 13 | `IdempotencyService.complete` | Stamps the key with the transfer id | `idempotency_key` |
| 14 | `ExternalTransferController` | Builds **202 Accepted** + `Location` | |
| 15 | **COMMIT** | Everything above is saved together, or none of it | |

#### Part B: the dispatcher sends it (within 2 seconds)

| # | Module · File · Method | What it does |
|---|---|---|
| 1 | `transfer.service` · `DispatcherSchedule.run` (`@Scheduled`, every 2 s) | Wakes the dispatcher |
| 2 | `TransferDispatcher.dispatchDue` → `ExternalTransferService.dueTransferIds` → `TransferOutboxRepository.findDueTransferIds` | "Which notes are `PENDING` and due?" |
| 3 | `TransferDispatcher.dispatch(id)` → `ExternalTransferService.beginDispatch` | **Short transaction 1:** lock the transfer row, `markProcessing()`, build the `TransferInstruction` (our reference, amount, the payee's recipient code) |
| 4 | `TransferGateway.initiateTransfer` → `FakeTransferGateway` | **The call to the bank, with NO transaction open** (no locks held while waiting) |
| 5 | Bank says `SUCCESS` → `ExternalTransferService.applyProviderResult` → `applySuccess` | **Short transaction 2:** post `EXTERNAL_SETTLEMENT` (SUSPENSE −2010, PAYSTACK_SETTLEMENT +2000, FEES +10); `markSuccess`; outbox `DONE`; publish `TransferCompleted` |
| 6 | After commit · `TransferEventListener` → `NotificationService` | Alert to the customer: *"Your transfer of NGN 2,000.00 was successful. Fee: NGN 10.00."* |

**Say:** *"The request is accepted in one fast transaction: the money is parked in a suspense account and a to-do note
is written. A separate worker then contacts the bank with no database transaction open, and records the answer in
another short transaction. The customer's money is never in limbo: it is always somewhere the books can name."*

---

### Step 4: Send the identical request again (replay)

```bash
curl -s -i -X POST $BASE/api/transfers/external -H "$H" -H "Idempotency-Key: $KEY" \
  -d '{"sourceAccountId":"'$ADA_ACC'","beneficiaryId":"'$BEN_YES'","amountMinor":200000,"narration":"to GTB"}' | grep -E "^HTTP|^Idempotent-Replayed"
echo "Ada balance (unchanged): $(bal $ADA_ACC)"
```

**You will see:** `HTTP/1.1 200`, `Idempotent-Replayed: true`, and the balance unchanged at `2799000`.
`IdempotencyKeyRepository.claim` returns 0 → `IdempotencyService.begin` finds the same fingerprint and the earlier
transfer id → `ExternalTransferService.initiate` returns it with `replayed = true` and stops. No hold, no outbox row,
no second transfer.

**Say:** *"A customer who double-taps 'send' does not pay twice. The same key returns the same transfer."*

---

### Step 5: The bank refuses: everything is refunded

```bash
BEFORE=$(bal $ADA_ACC)
T2=$(curl -s -X POST $BASE/api/transfers/external -H "$H" -H "Idempotency-Key: ext-$S-0002" -d '{"sourceAccountId":"'$ADA_ACC'","beneficiaryId":"'$BEN_NO'","amountMinor":100000,"narration":"will be refused"}' | idof)
echo "Ada balance right after:  $(bal $ADA_ACC)   (was $BEFORE)"
wait_final $T2
echo "Ada balance at the end:   $(bal $ADA_ACC)   (everything refunded)"
curl -s $BASE/api/transfers/$T2 | sed -E 's/.*"status":"([A-Z]+)".*"failureReason":"([^"]*)".*/status=\1  reason=\2/'
```

**You will see:** the balance drops by `101000` (₦1,010) at first, then returns to `2799000`; final
`status=FAILED  reason=Simulated refusal by the provider`.

| # | Where | What |
|---|---|---|
| 1 | `TransferDispatcher.dispatch` | The bank answers `FAILED` (a definite refusal is **returned**, not thrown) |
| 2 | `ExternalTransferService.applyProviderResult` → `applyFailure` | |
| 3 | `LedgerApi.find(EXTERNAL_HOLD, reference)` then `LedgerApi.reverse(holdId, "release:" + reference, ...)` | Posts a **`REVERSAL`** that flips every sign: customer +1010, `SUSPENSE` −1010. **The original hold stays in the history.** |
| 4 | `ComplianceApi.release(customerId, amount, usageDate)` | Gives back the daily allowance for the right day |
| 5 | `Transfer.markFailed(reason, now)` | State machine: `PENDING/PROCESSING → FAILED` |
| 6 | `TransferFailed` event → `NotificationService.onTransferFailed` | *"... did not go through ... The money has been returned to your account."* |

Show Ada's statement to prove nothing was erased:

```bash
curl -s $BASE/api/accounts/$ADA_ACC/entries | sed 's/},{/},\n{/g' | sed -E 's/.*"type":"([A-Z_]+)".*"amountMinor":(-?[0-9]+).*/  \1 \2/'
```
**You will see:** `REVERSAL 101000`, `EXTERNAL_HOLD -101000`, `EXTERNAL_HOLD -201000`, `FUNDING 3000000`.

**Say:** *"A refund is not an erasure. The hold stays in the book and a reversing entry cancels it. The customer got the
fee back too, because the hold took both."*

---

### Step 6: Refusals that happen BEFORE the bank is ever contacted

First create a second customer with a small balance (₦2,005.00):

```bash
BOLA=$(curl -s -X POST $BASE/api/customers -H "$H" -d '{"firstName":"Bola","lastName":"Eze","email":"bola'$S'@example.com","phone":"08098765432"}' | idof)
BOLA_ACC=$(curl -s -X POST $BASE/api/accounts -H "$H" -d '{"customerId":"'$BOLA'"}' | idof)
curl -s -X POST $BASE/api/dev/accounts/$BOLA_ACC/fund -H "$H" -d '{"amountMinor":200500}' >/dev/null
BEN_BOLA=$(curl -s -X POST $BASE/api/beneficiaries -H "$H" -d '{"customerId":"'$BOLA'","bankCode":"058","accountNumber":"0123453333"}' | idof)
```

**6a. The balance covers the amount (₦2,000) but not amount + fee (₦2,010)**

```bash
curl -s -X POST $BASE/api/transfers/external -H "$H" -H "Idempotency-Key: ext-$S-0101" -d '{"sourceAccountId":"'$BOLA_ACC'","beneficiaryId":"'$BEN_BOLA'","amountMinor":200000}'; echo
```
→ `422 INSUFFICIENT_FUNDS`. Refused by `LedgerService.doPost` (stage 3: check every rule before changing anything).

**6b. Below the ₦100 minimum**

```bash
curl -s -X POST $BASE/api/transfers/external -H "$H" -H "Idempotency-Key: ext-$S-0102" -d '{"sourceAccountId":"'$BOLA_ACC'","beneficiaryId":"'$BEN_BOLA'","amountMinor":5000}'; echo
```
→ `400 VALIDATION_FAILED`: "The smallest external transfer is NGN 100.00". Refused by `ExternalTransferService.initiate`.

**6c. Using another customer's saved payee (Bola tries Ada's)**

```bash
curl -s -X POST $BASE/api/transfers/external -H "$H" -H "Idempotency-Key: ext-$S-0103" -d '{"sourceAccountId":"'$BOLA_ACC'","beneficiaryId":"'$BEN_LATER'","amountMinor":100000}'; echo
```
→ `404 RESOURCE_NOT_FOUND`. The `.filter(found -> found.getCustomerId().equals(owner.id()))` check treats it as "not found",
so it does not even reveal that the payee exists.

**6d. A payee that does not exist**

```bash
curl -s -X POST $BASE/api/transfers/external -H "$H" -H "Idempotency-Key: ext-$S-0104" -d '{"sourceAccountId":"'$BOLA_ACC'","beneficiaryId":"00000000-0000-0000-0000-000000000000","amountMinor":100000}'; echo
echo "Bola's balance is untouched: $(bal $BOLA_ACC)"
```
→ `404`. Bola's balance is still `200500`.

**Say:** *"None of these ever reached the bank, and none left a trace: the allowance wasn't used, no transfer row exists.
The fee must be covered as well as the amount, and you can only pay through your own saved payees."*

---

### Step 7: The bank accepts but is still working (about 14 seconds)

```bash
T3=$(curl -s -X POST $BASE/api/transfers/external -H "$H" -H "Idempotency-Key: ext-$S-0003" -d '{"sourceAccountId":"'$ADA_ACC'","beneficiaryId":"'$BEN_LATER'","amountMinor":150000,"narration":"slow bank"}' | idof)
START=$(date +%s); wait_final $T3; echo "  took $(( $(date +%s) - START )) seconds"
```

**You will see:** `PENDING` → `PROCESSING` (for about 10 seconds) → `SUCCESS`.

| # | Where | What |
|---|---|---|
| 1 | `TransferDispatcher.dispatch` | The bank answers **`PENDING`** ("accepted, processing") |
| 2 | `ExternalTransferService.recordAccepted` | Stores the bank's reference; marks the outbox note `DONE`. The transfer stays **`PROCESSING`**, with the money still on hold. |
| 3 | `ReconcilerSchedule.run` (`@Scheduled`, every 5 s) → `TransferReconciler.reconcile` | Picks transfers that are `PROCESSING`, whose note is `DONE`, and that have been quiet for `min-age` (10 s) → `ExternalTransferService.awaitingOutcome` → `TransferRepository.findAwaitingOutcome` |
| 4 | `TransferReconciler.reconcileTransfer(reference)` → `gateway.fetchTransferStatus` | "What happened to this one?" → `SUCCESS` |
| 5 | `applyProviderResult` → `applySuccess` | Settlement posted; `markSuccess` |

**Say:** *"In real life a bank may take minutes. The money sits safely in suspense in the meantime, and a second worker,
the reconciler, goes back and asks. In production, a webhook from the provider would also tell us, but this checking
loop is the safety net that always works."*

---

### Step 8: A timeout, but the bank DID get the request (about 19 seconds)

```bash
T4=$(curl -s -X POST $BASE/api/transfers/external -H "$H" -H "Idempotency-Key: ext-$S-0004" -d '{"sourceAccountId":"'$ADA_ACC'","beneficiaryId":"'$BEN_UNSURE'","amountMinor":120000,"narration":"timeout after receipt"}' | idof)
START=$(date +%s); wait_final $T4; echo "  took $(( $(date +%s) - START )) seconds"
```

**You will see:** `PROCESSING` for a while, then `SUCCESS`, and the transfer is paid **once**.

| # | Where | What |
|---|---|---|
| 1 | `FakeTransferGateway.initiateTransfer` | The bank records the request but then throws `GatewayUnavailableException` ("timeout") |
| 2 | `TransferDispatcher.dispatch` catches it → `ExternalTransferService.scheduleRetryOrGiveUp` | **The customer's money is not touched.** The outbox note is rescheduled with **exponential backoff** (2 s, then 4 s, ...) |
| 3 | The next dispatch asks again **with the same reference** | `FakeTransferGateway` recognises the reference (`executed.putIfAbsent`), does not execute twice, and answers `PENDING` |
| 4 | `recordAccepted`, then the reconciler | As in Step 7 → `SUCCESS` |

**Say:** *"A timeout means 'I don't know', not 'it failed'. We keep the money on hold and retry. Because every request
carries our unique reference, the bank treats the retry as the same request, so the recipient is paid exactly once."*

---

### Step 9 (optional, about 34 seconds): A timeout, and the bank NEVER got the request

```bash
BEFORE=$(bal $ADA_ACC)
T5=$(curl -s -X POST $BASE/api/transfers/external -H "$H" -H "Idempotency-Key: ext-$S-0005" -d '{"sourceAccountId":"'$ADA_ACC'","beneficiaryId":"'$BEN_LOST'","amountMinor":110000,"narration":"timeout before receipt"}' | idof)
echo "Ada balance before: $BEFORE"
START=$(date +%s); wait_final $T5; echo "  took $(( $(date +%s) - START )) seconds"
echo "Ada balance after:  $(bal $ADA_ACC)   (back to $BEFORE)"
curl -s $BASE/api/transfers/$T5 | sed -E 's/.*"status":"([A-Z]+)".*"failureReason":"([^"]*)".*/  status=\1  reason=\2/'
```

**You will see:** `PROCESSING` for about 30 seconds, then `FAILED` with the reason
*"The transfer never reached the payment provider"*, and the balance back where it started.
**Watch Terminal 1:** it logs `Giving up sending transfer ... after 5 attempts; the reconciler will ask the provider`.

| # | Where | What |
|---|---|---|
| 1 | Five dispatch attempts, each throwing `GatewayUnavailableException` | `scheduleRetryOrGiveUp`: waits 2, 4, 8, 16 seconds; the 5th attempt calls `TransferOutbox.giveUp` (note marked `DONE`) |
| 2 | While this goes on | **The transfer stays `PROCESSING` and the money stays held.** It is never assumed to have failed. |
| 3 | `TransferReconciler.reconcileTransfer` → `gateway.fetchTransferStatus` | The bank answers **`NOT_FOUND`**: "I never received this" |
| 4 | `ExternalTransferService.failIfNeverSent` → `applyFailure` | Now it is **safe** to refund: reverse the hold, release the allowance, `markFailed` |

**Say:** *"This is the dangerous case, and the system handles it by never guessing. We only refund when the bank has
confirmed it never received the request. Refunding earlier could mean paying the customer back while the bank also
paid the recipient."*

---

### Step 10: The alerts

```bash
curl -s "$BASE/api/notifications?customerId=$ADA" | sed 's/},{/},\n{/g' | grep '"channel":"SMS"' | sed -E 's/.*"message":"([^"]*)".*/  - \1/' | cut -c1-170
```

**You will see** one SMS per outcome (newest first), for example:
- *Your transfer of NGN 1,100.00 did not go through (The transfer never reached the payment provider). The money has been returned to your account.*
- *Your transfer of NGN 1,200.00 was successful. Fee: NGN 10.00.*
- *Your transfer of NGN 1,000.00 did not go through (Simulated refusal by the provider). The money has been returned ...*

`ExternalTransferService` published `TransferCompleted` or `TransferFailed` inside its transaction; after the commit,
`notification/listener/TransferEventListener.on(...)` → `NotificationService.onTransferCompleted` / `onTransferFailed`
→ `deliver(...)` (de-duplication check, save a `Notification`, `LoggingNotificationSender.send`).

---

## 5. How the pieces fit: the three workers

| Worker | File | Runs | Transaction? | Its job |
|---|---|---|---|---|
| **Accept** | `ExternalTransferService.initiate` | When a request arrives | **Yes, one** | Validate, hold money in suspense, save the transfer, write the outbox note |
| **Dispatcher** | `TransferDispatcher` (woken by `DispatcherSchedule` every 2 s) | Background | **No** (it calls `ExternalTransferService` methods, each its own short transaction) | Ask the bank; record yes / no / accepted / no-answer |
| **Reconciler** | `TransferReconciler` (woken by `ReconcilerSchedule` every 5 s) | Background | **No** (same pattern) | For transfers that are still unresolved, ask the bank what happened and finish them |

**The database changes only happen in `ExternalTransferService`.** The dispatcher and reconciler never write to the
database themselves and never touch money; they *call* its methods. That is why the slow, unreliable bank call can be
sandwiched safely between two short transactions.

### Where each outcome is applied

| The bank says | Method | Money | Final status |
|---|---|---|---|
| `SUCCESS` | `applySuccess` | Settlement: `SUSPENSE` → `PAYSTACK_SETTLEMENT` (+ fee to `FEES`) | `SUCCESS` |
| `FAILED` | `applyFailure` | Reverse the hold: customer gets amount + fee back | `FAILED` |
| `PENDING` | `recordAccepted` | None yet | stays `PROCESSING` |
| no answer (exception) | `scheduleRetryOrGiveUp` | **None. Money stays held.** | stays `PROCESSING` |
| "never heard of it" (`NOT_FOUND`) | `failIfNeverSent` | Reverse the hold | `FAILED` |
| `REVERSED` (after success) | `applyReversal` | Reverse the settlement, then the hold | `REVERSED` |

### Safety rules built into those methods

- **Repeat-safe:** applying `SUCCESS` twice posts one settlement; applying `FAILED` twice refunds once. (Ledger entries
  are unique per `(type, reference)`.)
- **A late "success" for a transfer already refunded** raises a *MANUAL REVIEW NEEDED* error and moves **no** money:
  the one case where the books and the bank genuinely disagree and a human must decide.
- **The transfer state machine** (`TransferStatus.canMoveTo`) refuses illegal moves, so a `FAILED` transfer can never
  become `SUCCESS`.

---

## 6. The money trail

For a ₦2,000 transfer with a ₦10 fee (all amounts in kobo):

| Stage | Ledger entry | Customer | SUSPENSE | PAYSTACK_SETTLEMENT | FEES |
|---|---|---|---|---|---|
| Accept | `EXTERNAL_HOLD` | **−201000** | **+201000** | | |
| Bank says yes | `EXTERNAL_SETTLEMENT` | | −201000 | +200000 | +1000 |
| *or* bank refuses | `REVERSAL` of the hold | **+201000** | −201000 | | |
| *or* bank reverses later | reverse settlement, then reverse hold | **+201000** | | −200000 | −1000 |

At every moment the books balance and you can say where every naira is. `SUSPENSE` always returns to zero once every
transfer has finished.

---

## 7. Look inside the database

First find the database container name: `docker ps --format "{{.Names}}"` (it contains `postgres`). Replace `DBNAME`:

**The bank's own accounts:**

```bash
docker exec DBNAME psql -U paybridge -d paybridge -c "select code, balance_minor from account where account_type = 'SYSTEM' order by code;"
```

From the rehearsal (3 successes of ₦2,000 + ₦1,500 + ₦1,200, two refunds):

```
        code         | balance_minor
---------------------+---------------
 FEES                |          3000      three fees of NGN 10
 FUNDING_SOURCE      |      -3200500      the test money handed out
 PAYSTACK_SETTLEMENT |        470000      NGN 4,700 paid out to "the bank"
 SUSPENSE            |             0      nothing stuck in transit
```

**Every transfer and how it ended:**

```bash
docker exec DBNAME psql -U paybridge -d paybridge -c "select b.account_number as to_account, t.status, t.amount_minor, t.fee_minor from transfer t join beneficiary b on b.id = t.beneficiary_id order by t.created_at;"
```

```
 to_account | status  | amount_minor | fee_minor
------------+---------+--------------+-----------
 0123453333 | SUCCESS |       200000 |      1000
 0123451111 | FAILED  |       100000 |      1000
 0123451234 | SUCCESS |       150000 |      1000
 0123455555 | SUCCESS |       120000 |      1000
 0123452222 | FAILED  |       110000 |      1000
```

**The outbox (the to-do notes): all finished, with the retry history visible:**

```bash
docker exec DBNAME psql -U paybridge -d paybridge -c "select o.status, o.attempts, left(coalesce(o.last_error,''), 60) as last_error from transfer_outbox o join transfer t on t.id = o.transfer_id order by t.created_at;"
```

```
 status | attempts |                          last_error
--------+----------+--------------------------------------------------------------
 DONE   |        0 |
 DONE   |        0 |
 DONE   |        0 |
 DONE   |        1 | Simulated timeout: the provider DID receive the request      ← the "5555" transfer
 DONE   |        5 | Gave up sending after 5 attempts: Simulated timeout: ...     ← the "2222" transfer
```

**One transfer's complete money trail:**

```bash
docker exec DBNAME psql -U paybridge -d paybridge -c "select coalesce(a.account_number, a.code) as account, l.amount_minor, e.entry_type from ledger_line l join account a on a.id = l.account_id join journal_entry e on e.id = l.entry_id where e.reference = (select t.reference from transfer t join beneficiary b on b.id = t.beneficiary_id where b.account_number = '0123453333' limit 1) order by e.entry_type, l.amount_minor;"
```

```
       account       | amount_minor |     entry_type
---------------------+--------------+---------------------
 1000000017          |      -201000 | EXTERNAL_HOLD
 SUSPENSE            |       201000 | EXTERNAL_HOLD
 SUSPENSE            |      -201000 | EXTERNAL_SETTLEMENT
 FEES                |         1000 | EXTERNAL_SETTLEMENT
 PAYSTACK_SETTLEMENT |       200000 | EXTERNAL_SETTLEMENT
```

**Does the whole bank still add up to zero?**

```bash
docker exec DBNAME psql -U paybridge -d paybridge -c "select sum(balance_minor) as all_balances_added_together from account;"
```

**You will see `0`:** after five transfers, two refunds, retries and timeouts, money was neither created nor destroyed.

---

## 8. Questions you may be asked

| Question | Short answer |
|---|---|
| Why not just call the bank and wait for the answer? | It is slow and unreliable; a crash between the bank and our database could lose or duplicate money; and a transaction would hold locks while waiting. So we accept first, then contact the bank outside any transaction. |
| What is the outbox? | A to-do note saved in the **same transaction** as the transfer, so a transfer can never exist without the instruction to send it, and a crash cannot lose it. |
| What happens when the bank times out? | Nothing happens to the money. A timeout means "unknown". We retry with the same reference; if we give up, the reconciler asks the bank. |
| How do you avoid paying twice on a retry? | Every request carries our unique reference, and the bank treats a repeat as the same request. Our settlement is also unique per `(type, reference)`. |
| When do you refund? | When the bank refuses, or when it confirms it **never received** the request. Never on a timeout alone. |
| Why a suspense account? | Money in flight must be somewhere the books can name. It leaves the customer's account at once (so it can't be spent twice) but isn't "paid out" until the bank confirms. |
| What if the bank says "success" after we already refunded? | The system raises *MANUAL REVIEW NEEDED* and moves no money. That is a genuine disagreement for a human. |
| Why does the customer pay a fee on top? | It mirrors the provider's charge for payouts; internal transfers are free. The fee bands are placeholders in `application.yml`. |
| How would Paystack be added? | Write one class implementing `TransferGateway`, set `paybridge.gateway: paystack`. Nothing else changes. |
| What proves it works? | 28 external-transfer tests (timeouts, refusals, reversals, races) plus the invariant that all balances sum to zero after each one. |

---

## 9. If something goes wrong

| Symptom | Fix |
|---|---|
| A transfer stays `PENDING` for more than a few seconds | The dispatcher runs every 2 s. Check Terminal 1 for errors, and that `paybridge.dispatcher.enabled` is `true` in `application.yml` (it is switched **off** only in the test profile). |
| It stays `PROCESSING` for a long time | Expected for `1234`, `5555` and `2222` (14 to 34 seconds). If it is longer, check `paybridge.reconciler.enabled` is `true`. |
| `wait_final` prints nothing useful / `status = ` empty | The transfer id variable is empty; the previous `curl` failed. Re-run that step and check its output. |
| `404` when saving a payee | An account number ending `9999` cannot be resolved by design. |
| `422 INSUFFICIENT_FUNDS` unexpectedly | The balance must cover **amount + fee**, not just the amount. Fund the account again. |
| `422 LIMIT_EXCEEDED` after many runs | An unverified customer may send ₦100,000 a day in total. Use a new customer (re-run Step 0) or a smaller amount. |
| `curl: (7) Failed to connect` | The app is not running. Wait for `Started PayBridgeApplication`. |
| You want a clean slate | Stop the app, then `docker compose down -v` in the project folder (this deletes the local data). |

---

## 10. Rehearsal plan and timing cheat sheet

**Suggested running order for a live demo (about 4 minutes of waiting in total, fewer if you skip Step 9):**

| Order | Step | Waits | Why include it |
|---|---|---|---|
| 1 | Step 0 setup | none | |
| 2 | Step 1 to 2: name enquiry, payees | none | Shows the real-world flow |
| 3 | **Step 3: instant success** | about 2 s | The happy path |
| 4 | **Step 4: replay** | none | Idempotency |
| 5 | **Step 5: refusal and refund** | about 3 s | Nothing is erased, the fee comes back |
| 6 | Step 6: pre-bank refusals | none | Fee is part of the funds check; payees are private |
| 7 | **Step 8: timeout after receipt** | about 19 s | "Unknown is not failed", paid once |
| 8 | Step 7 or 9 (pick one if short of time) | 14 s / 34 s | The slow and the lost cases |
| 9 | Step 10 and section 7 | none | Alerts and the books |

**Practise saying this in order:** *accept → hold in suspense → outbox note → dispatcher asks the bank (no
transaction open) → yes: pay out and earn the fee / no: refund / no answer: keep holding and retry → reconciler
asks later → finish.*

**Five talking points that win the demo:**
(1) the money is held the instant the request is accepted, so it cannot be spent twice;
(2) the bank is never called inside a database transaction;
(3) a timeout is "unknown", never "failed";
(4) a retry cannot pay twice, because of the unique reference;
(5) every outcome leaves the books balanced, and the whole bank always sums to zero.
