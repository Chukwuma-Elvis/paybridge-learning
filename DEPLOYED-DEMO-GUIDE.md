# PayBridge: Deployed Demo Guide (Render)

How to demo the **internal** and **external** transfers on the version deployed to **Render**, with the exact
commands to paste and what to say.

> **Status of this guide:** the commands and expected outputs are taken from the local rehearsals
> (`DEMO-GUIDE.md` and `EXTERNAL-TRANSFER-GUIDE.md`), which ran against this same code. The deployment-specific parts
> (waking the service, the database connection, logs on Render) have **not** been run against your live Render
> service yet. Do one full dry run before presenting, and correct anything that differs.
>
> The *why* behind each step (modules, files, methods, call chains) is in the two earlier guides. This one is the
> **runbook**: the commands, the order, and what is different when the app lives on the internet.

**Contents**

1. [What is different on Render](#1-what-is-different-on-render)
2. [Before the demo: preparation](#2-before-the-demo-preparation)
3. [Part A: internal transfer](#3-part-a-internal-transfer)
4. [Part B: external transfer](#4-part-b-external-transfer)
5. [Finale: look inside the database](#5-finale-look-inside-the-database)
6. [Safety after the demo](#6-safety-after-the-demo)
7. [If something goes wrong](#7-if-something-goes-wrong)
8. [Running order and timing](#8-running-order-and-timing)

---

## 1. What is different on Render

| Local demo | Deployed demo |
|---|---|
| `BASE=http://localhost:8080` | `BASE=https://<your-service>.onrender.com` |
| Start the app with `./mvnw spring-boot:run` in Terminal 1 | Render runs it. Nothing to start, but it may be **asleep** (see below). |
| Watch alerts and warnings in Terminal 1 | Render dashboard → your service → **Logs** |
| `docker exec DBNAME psql ...` | `psql "<External Database URL>" ...` |
| Data disappears with `docker compose down -v` | Data **persists** between runs. The guide's random `S` keeps every run unique. |
| Nobody else can reach it | **Anyone with the URL can**, and there is no authentication yet. Keep it fake-data only. |

**The sleep problem.** On the free plan Render puts the service to sleep after a period with no requests. The first
request after that takes 30 to 60 seconds. Worse for this app, **the dispatcher and reconciler are timers inside the
app**, so while it sleeps, external transfers cannot progress. Always wake it before you start.

---

## 2. Before the demo: preparation

Do this 5 to 10 minutes before presenting.

### 2.1 Find your URL and wake the service

In the Render dashboard, open the `paybridge` service and copy its URL. Then, in **Git Bash**:

```bash
BASE=https://<your-service>.onrender.com
curl -s -m 90 $BASE/actuator/health; echo
```

**You will see** `{"status":"UP"}` (it may take up to a minute the first time). If you get HTML, an empty reply or a
502, the service is still waking: wait 30 seconds and run it again.

### 2.2 Paste the helper block into ONE Git Bash window

Use this same window for the whole demo (the variables only live inside one window). `BASE` is already set from 2.1.

```bash
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
| `S` | Random number added to emails and keys so you can repeat the demo without clashes |
| `idof` / `statusof` | Pull the `"id"` / `"status"` value out of JSON text |
| `bal ID` | Prints an account's balance in kobo |
| `wait_final ID` | Checks a transfer every 2 seconds until it reaches `SUCCESS`, `FAILED` or `REVERSED` |

> **Money is in kobo:** 100 kobo = ₦1, so `300000` = ₦3,000 and `50000` = ₦500.
> **Paste the commands, don't use a Run button.** The steps share variables.

### 2.3 Optional: prepare the database connection

In the Render dashboard open `paybridge-db` → **Connect** → **External** and copy the **External Database URL**.
Keep it in a text file **outside the project** (it contains the password; never commit it or paste it into chat).
Then:

```bash
DBURL='<paste the External Database URL>'
psql "$DBURL" -c "select count(*) from customer;"
```

You should see a number. If `psql` is not found, see [section 7](#7-if-something-goes-wrong).

### 2.4 Open the Render logs

Open the service's **Logs** tab in a browser window beside your terminal. You will use it to show the alerts
(`[SMS] to ...`) and the retry warnings.

---

## 3. Part A: internal transfer

Ada sends Bola ₦500 inside PayBridge. Full explanations are in `DEMO-GUIDE.md`; the call chain to recite is in its Step 4.

### A1: Create two customers

```bash
ADA_JSON=$(curl -s -X POST $BASE/api/customers -H "$H" -d '{"firstName":"Ada","lastName":"Obi","email":"ada'$S'@example.com","phone":"08012345678"}')
echo "$ADA_JSON"
ADA=$(echo "$ADA_JSON" | idof)
BOLA=$(curl -s -X POST $BASE/api/customers -H "$H" -d '{"firstName":"Bola","lastName":"Eze","email":"bola'$S'@example.com","phone":"08098765432"}' | idof)
echo "ADA=$ADA"; echo "BOLA=$BOLA"
```

**You will see:** a customer with `"kycTier":"UNVERIFIED"` and `"status":"ACTIVE"`, and the phone normalised to
`+234...`.
**Say:** *"Every customer starts unverified and active. Their KYC tier decides how much they can send."*

### A2: Open an account for each

```bash
ADA_ACC_JSON=$(curl -s -X POST $BASE/api/accounts -H "$H" -d '{"customerId":"'$ADA'"}')
echo "$ADA_ACC_JSON"
ADA_ACC=$(echo "$ADA_ACC_JSON" | idof)
ADA_NUM=$(echo "$ADA_ACC_JSON" | sed -E 's/.*"accountNumber":"([0-9]+)".*/\1/')
BOLA_ACC_JSON=$(curl -s -X POST $BASE/api/accounts -H "$H" -d '{"customerId":"'$BOLA'"}')
BOLA_ACC=$(echo "$BOLA_ACC_JSON" | idof)
BOLA_NUM=$(echo "$BOLA_ACC_JSON" | sed -E 's/.*"accountNumber":"([0-9]+)".*/\1/')
echo "Ada: $ADA_NUM   Bola: $BOLA_NUM"
```

**You will see:** 10-digit account numbers, currency `NGN`, balance `0`. On a database that has been used before, the
numbers will be higher than the local `1000000017`: the sequence keeps counting.
**Say:** *"A NUBAN: nine digits from a database sequence plus a check digit, so a mistyped number is caught."*

### A3: Put test money in Ada's account

```bash
curl -s -X POST $BASE/api/dev/accounts/$ADA_ACC/fund -H "$H" -d '{"amountMinor":300000}'; echo
```

**You will see:** `"balanceMinor":300000` (₦3,000).
If you get `404`, the dev funding switch is off ([section 7](#7-if-something-goes-wrong)).
**Say:** *"No real deposits yet, so this test-only endpoint stands in. It still posts a balanced ledger entry from the
bank's funding account."*

### A4: The transfer: Ada sends Bola ₦500

```bash
KEY=demo-$S-0001
curl -s -i -X POST $BASE/api/transfers/internal -H "$H" -H "Idempotency-Key: $KEY" \
  -d '{"sourceAccountId":"'$ADA_ACC'","destinationAccountNumber":"'$BOLA_NUM'","amountMinor":50000,"narration":"rent"}' | grep -E "^HTTP|^Location|^X-Request-Id|^\{"
```

**You will see:** `HTTP/1.1 201`, a `Location` header, an `X-Request-Id`, and `"status":"SUCCESS"`, `"type":"INTERNAL"`,
`"amountMinor":50000`, `"feeMinor":0`.
**Say:** *"One database transaction: idempotency stub, daily allowance, transfer record, ledger entry and event commit
together or not at all."*

### A5: Send the identical request again (replay)

```bash
curl -s -i -X POST $BASE/api/transfers/internal -H "$H" -H "Idempotency-Key: $KEY" \
  -d '{"sourceAccountId":"'$ADA_ACC'","destinationAccountNumber":"'$BOLA_NUM'","amountMinor":50000,"narration":"rent"}' | grep -E "^HTTP|^Idempotent-Replayed|^\{"
```

**You will see:** `HTTP/1.1 200` (not 201), `Idempotent-Replayed: true`, the **same transfer id** as A4.
**Say:** *"If the first reply is lost, the client retries. The unique key means Bola is not paid twice."*

### A6: Check the balances

```bash
echo "Ada : $(bal $ADA_ACC)"; echo "Bola: $(bal $BOLA_ACC)"
```

**You will see:** Ada `250000` (₦2,500), Bola `50000` (₦500). It moved once even though you sent it twice.

### A7: The statements

```bash
curl -s $BASE/api/accounts/$ADA_ACC/entries; echo
curl -s $BASE/api/accounts/$BOLA_ACC/entries; echo
```

**You will see:** Ada `TRANSFER −50000` then `FUNDING +300000`; Bola `TRANSFER +50000`, with the **same entry id and
reference** on both sides.
**Say:** *"Negative is money out, positive is money in. One journal entry, two sides, adding to zero."*

### A8: The refusals

```bash
echo "-- overdraw (422 INSUFFICIENT_FUNDS)"
curl -s -X POST $BASE/api/transfers/internal -H "$H" -H "Idempotency-Key: demo-$S-0002" -d '{"sourceAccountId":"'$ADA_ACC'","destinationAccountNumber":"'$BOLA_NUM'","amountMinor":4000000}'; echo
echo "-- over the NGN 50,000 limit (422 LIMIT_EXCEEDED)"
curl -s -X POST $BASE/api/transfers/internal -H "$H" -H "Idempotency-Key: demo-$S-0003" -d '{"sourceAccountId":"'$ADA_ACC'","destinationAccountNumber":"'$BOLA_NUM'","amountMinor":5000001}'; echo
echo "-- no Idempotency-Key (400 VALIDATION_FAILED)"
curl -s -X POST $BASE/api/transfers/internal -H "$H" -d '{"sourceAccountId":"'$ADA_ACC'","destinationAccountNumber":"'$BOLA_NUM'","amountMinor":100}'; echo
echo "-- same key, different amount (422 IDEMPOTENCY_KEY_REUSED)"
curl -s -X POST $BASE/api/transfers/internal -H "$H" -H "Idempotency-Key: $KEY" -d '{"sourceAccountId":"'$ADA_ACC'","destinationAccountNumber":"'$BOLA_NUM'","amountMinor":99999,"narration":"rent"}'; echo
echo "-- to herself (400 VALIDATION_FAILED)"
curl -s -X POST $BASE/api/transfers/internal -H "$H" -H "Idempotency-Key: demo-$S-0005" -d '{"sourceAccountId":"'$ADA_ACC'","destinationAccountNumber":"'$ADA_NUM'","amountMinor":100}'; echo
```

| Refusal | HTTP · code | Which layer says no |
|---|---|---|
| Overdraw | 422 `INSUFFICIENT_FUNDS` | Ledger (`LedgerService.doPost`) |
| Over the limit | 422 `LIMIT_EXCEEDED` | Compliance (`ComplianceService.reserve`) |
| No key | 400 `VALIDATION_FAILED` | Web layer (`IdempotencyHeader.require`) |
| Key reuse | 422 `IDEMPOTENCY_KEY_REUSED` | `IdempotencyService.begin` |
| To herself | 400 `VALIDATION_FAILED` | `TransferService.transferInternal` |

**Say:** *"Each rule is enforced by the layer that owns it, and a refused transfer leaves no trace."*

### A9: Limits, history and alerts

```bash
curl -s $BASE/api/compliance/customers/$ADA/limits; echo
curl -s "$BASE/api/transfers?accountId=$ADA_ACC"; echo
curl -s "$BASE/api/notifications?customerId=$BOLA"; echo
```

**You will see:** `"usedTodayMinor":50000` against `"dailyMinor":10000000`; Ada's one `SUCCESS` transfer; two alerts for
Bola (`SMS`, `EMAIL`): *"You received NGN 500.00 ..."*. In the **Render Logs** tab you will see the matching
`[SMS] to +2348098765432: You received NGN 500.00 ...` line.

---

## 4. Part B: external transfer

Ada sends money to an account at another bank, through the simulated bank. Full explanations are in
`EXTERNAL-TRANSFER-GUIDE.md`. Reuse the Part A customers (`ADA`, `ADA_ACC`), or run this part on its own with B0.

> **The simulated bank** decides what to do from the **last four digits** of the payee's account number:
> `3333` pays at once (about 2 s) · `1111` refuses (about 3 s, refund) · `1234` slow success (about 14 s) ·
> `5555` times out *after* receiving, still paid once (about 19 s) · `2222` times out *before* receiving, refunded
> (about 34 s) · `9999` unknown account (404).
> **The timers must be awake.** If a transfer sits in `PENDING` for more than ~10 seconds, check the service is awake.

### B0: Fund Ada with ₦30,000 (skip if you used Part A and Ada has enough)

```bash
curl -s -X POST $BASE/api/dev/accounts/$ADA_ACC/fund -H "$H" -d '{"amountMinor":3000000}' >/dev/null
echo "Ada balance: $(bal $ADA_ACC) kobo"
```

If you skipped Part A, create `ADA` and `ADA_ACC` first (A1 and A2).

### B1: Name enquiry: "whose account is this?"

```bash
curl -s -X POST $BASE/api/beneficiaries/resolve -H "$H" -d '{"bankCode":"058","accountNumber":"0123453333"}'; echo
echo "-- an account the bank cannot find (ends 9999):"
curl -s -X POST $BASE/api/beneficiaries/resolve -H "$H" -d '{"bankCode":"058","accountNumber":"0123459999"}'; echo
```

**You will see:** `"accountName":"TEST ACCOUNT 3333"`, then a `404 RESOURCE_NOT_FOUND` for `9999` (correct, not a bug).
**Say:** *"Before paying a stranger's account, we ask the bank who owns it."*

### B2: Save the payees

```bash
BEN_YES=$(curl -s -X POST $BASE/api/beneficiaries -H "$H" -d '{"customerId":"'$ADA'","bankCode":"058","accountNumber":"0123453333"}' | tee /dev/stderr | idof)
echo
BEN_NO=$(curl -s -X POST $BASE/api/beneficiaries -H "$H" -d '{"customerId":"'$ADA'","bankCode":"058","accountNumber":"0123451111"}' | idof)
BEN_LATER=$(curl -s -X POST $BASE/api/beneficiaries -H "$H" -d '{"customerId":"'$ADA'","bankCode":"058","accountNumber":"0123451234"}' | idof)
BEN_UNSURE=$(curl -s -X POST $BASE/api/beneficiaries -H "$H" -d '{"customerId":"'$ADA'","bankCode":"058","accountNumber":"0123455555"}' | idof)
BEN_LOST=$(curl -s -X POST $BASE/api/beneficiaries -H "$H" -d '{"customerId":"'$ADA'","bankCode":"058","accountNumber":"0123452222"}' | idof)
echo "BEN_YES=$BEN_YES"
```

**You will see** the saved payee with the bank-supplied name. Saving the same payee twice is harmless.

### B3: Send ₦2,000 to the "YES" payee (instant success)

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

**You will see:** `HTTP/1.1 202` (accepted, not finished), `"status":"PENDING"`, `"feeMinor":1000`. Ada's balance
drops at once by `201000` (the amount plus the ₦10 fee), then `PENDING → SUCCESS` within a few seconds, and the
balance stays down.
**Say:** *"The money is held the instant the request is accepted, so it can't be spent twice. A separate worker then
contacts the bank with no database transaction open."*

### B4: Send the identical request again (replay)

```bash
curl -s -i -X POST $BASE/api/transfers/external -H "$H" -H "Idempotency-Key: $KEY" \
  -d '{"sourceAccountId":"'$ADA_ACC'","beneficiaryId":"'$BEN_YES'","amountMinor":200000,"narration":"to GTB"}' | grep -E "^HTTP|^Idempotent-Replayed"
echo "Ada balance (unchanged): $(bal $ADA_ACC)"
```

**You will see:** `HTTP/1.1 200`, `Idempotent-Replayed: true`, balance unchanged.

### B5: The bank refuses: everything is refunded

```bash
BEFORE=$(bal $ADA_ACC)
T2=$(curl -s -X POST $BASE/api/transfers/external -H "$H" -H "Idempotency-Key: ext-$S-0002" -d '{"sourceAccountId":"'$ADA_ACC'","beneficiaryId":"'$BEN_NO'","amountMinor":100000,"narration":"will be refused"}' | idof)
echo "Ada balance right after:  $(bal $ADA_ACC)   (was $BEFORE)"
wait_final $T2
echo "Ada balance at the end:   $(bal $ADA_ACC)   (everything refunded)"
curl -s $BASE/api/transfers/$T2 | sed -E 's/.*"status":"([A-Z]+)".*"failureReason":"([^"]*)".*/status=\1  reason=\2/'
```

**You will see:** the balance dips by `101000`, comes back, and ends `status=FAILED  reason=Simulated refusal by the provider`.
Prove nothing was erased:

```bash
curl -s $BASE/api/accounts/$ADA_ACC/entries | sed 's/},{/},\n{/g' | sed -E 's/.*"type":"([A-Z_]+)".*"amountMinor":(-?[0-9]+).*/  \1 \2/'
```

**Say:** *"A refund is not an erasure. The hold stays in the book and a reversing entry cancels it, fee included."*

### B6: Refusals before the bank is contacted

```bash
BOLA2=$(curl -s -X POST $BASE/api/customers -H "$H" -d '{"firstName":"Chi","lastName":"Eze","email":"chi'$S'@example.com","phone":"08098765432"}' | idof)
BOLA2_ACC=$(curl -s -X POST $BASE/api/accounts -H "$H" -d '{"customerId":"'$BOLA2'"}' | idof)
curl -s -X POST $BASE/api/dev/accounts/$BOLA2_ACC/fund -H "$H" -d '{"amountMinor":200500}' >/dev/null
BEN_BOLA2=$(curl -s -X POST $BASE/api/beneficiaries -H "$H" -d '{"customerId":"'$BOLA2'","bankCode":"058","accountNumber":"0123453333"}' | idof)

echo "-- covers the amount (NGN 2,000) but not amount + fee (422 INSUFFICIENT_FUNDS)"
curl -s -X POST $BASE/api/transfers/external -H "$H" -H "Idempotency-Key: ext-$S-0101" -d '{"sourceAccountId":"'$BOLA2_ACC'","beneficiaryId":"'$BEN_BOLA2'","amountMinor":200000}'; echo
echo "-- below the NGN 100 minimum (400)"
curl -s -X POST $BASE/api/transfers/external -H "$H" -H "Idempotency-Key: ext-$S-0102" -d '{"sourceAccountId":"'$BOLA2_ACC'","beneficiaryId":"'$BEN_BOLA2'","amountMinor":5000}'; echo
echo "-- using someone else's saved payee (404)"
curl -s -X POST $BASE/api/transfers/external -H "$H" -H "Idempotency-Key: ext-$S-0103" -d '{"sourceAccountId":"'$BOLA2_ACC'","beneficiaryId":"'$BEN_LATER'","amountMinor":100000}'; echo
echo "-- a payee that does not exist (404)"
curl -s -X POST $BASE/api/transfers/external -H "$H" -H "Idempotency-Key: ext-$S-0104" -d '{"sourceAccountId":"'$BOLA2_ACC'","beneficiaryId":"00000000-0000-0000-0000-000000000000","amountMinor":100000}'; echo
echo "Balance untouched: $(bal $BOLA2_ACC)"
```

**You will see** `422 INSUFFICIENT_FUNDS`, `400 VALIDATION_FAILED`, `404`, `404`, and the balance still `200500`.
**Say:** *"None of these reached the bank, and none left a trace. The fee must be covered as well as the amount, and you
can only pay through your own saved payees."*

### B7: The slow bank (about 14 seconds)

```bash
T3=$(curl -s -X POST $BASE/api/transfers/external -H "$H" -H "Idempotency-Key: ext-$S-0003" -d '{"sourceAccountId":"'$ADA_ACC'","beneficiaryId":"'$BEN_LATER'","amountMinor":150000,"narration":"slow bank"}' | idof)
START=$(date +%s); wait_final $T3; echo "  took $(( $(date +%s) - START )) seconds"
```

**You will see:** `PENDING`, then `PROCESSING` for about 10 seconds, then `SUCCESS`.
**Say:** *"The money sits safely in suspense, and a second worker, the reconciler, goes back and asks the bank."*

### B8: A timeout, but the bank DID get it (about 19 seconds)

```bash
T4=$(curl -s -X POST $BASE/api/transfers/external -H "$H" -H "Idempotency-Key: ext-$S-0004" -d '{"sourceAccountId":"'$ADA_ACC'","beneficiaryId":"'$BEN_UNSURE'","amountMinor":120000,"narration":"timeout after receipt"}' | idof)
START=$(date +%s); wait_final $T4; echo "  took $(( $(date +%s) - START )) seconds"
```

**You will see:** `PROCESSING` for a while, then `SUCCESS`, paid once. In the Render Logs you can see the retry.
**Say:** *"A timeout means 'I don't know', not 'it failed'. We keep the money held and retry with the same reference, so
the bank treats it as the same request and pays exactly once."*

### B9 (optional, about 34 seconds): A timeout, and the bank NEVER got it

```bash
BEFORE=$(bal $ADA_ACC)
T5=$(curl -s -X POST $BASE/api/transfers/external -H "$H" -H "Idempotency-Key: ext-$S-0005" -d '{"sourceAccountId":"'$ADA_ACC'","beneficiaryId":"'$BEN_LOST'","amountMinor":110000,"narration":"timeout before receipt"}' | idof)
echo "Ada balance before: $BEFORE"
START=$(date +%s); wait_final $T5; echo "  took $(( $(date +%s) - START )) seconds"
echo "Ada balance after:  $(bal $ADA_ACC)   (back to $BEFORE)"
curl -s $BASE/api/transfers/$T5 | sed -E 's/.*"status":"([A-Z]+)".*"failureReason":"([^"]*)".*/  status=\1  reason=\2/'
```

**You will see:** `PROCESSING` for about 30 seconds, then `FAILED` with *"The transfer never reached the payment provider"*,
balance restored. In the **Render Logs** look for `Giving up sending transfer ... after 5 attempts`.
**Say:** *"We only refund when the bank has confirmed it never received the request. Refunding on a timeout alone could
mean paying the customer back while the bank also paid the recipient."*

### B10: The alerts

```bash
curl -s "$BASE/api/notifications?customerId=$ADA" | sed 's/},{/},\n{/g' | grep '"channel":"SMS"' | sed -E 's/.*"message":"([^"]*)".*/  - \1/' | cut -c1-170
```

**You will see** one SMS per outcome, newest first (successes with the fee, refusals with the reason and "the money
has been returned").

---

## 5. Finale: look inside the database

Uses `DBURL` from section 2.3. (If you skipped it, run only the API parts.)

**The bank's own accounts:**

```bash
psql "$DBURL" -c "select code, balance_minor from account where account_type = 'SYSTEM' order by code;"
```

`SUSPENSE` should be `0` once every external transfer has finished (nothing stuck in transit). `FEES` holds the fees
earned, `PAYSTACK_SETTLEMENT` the amount paid out.
*Because the Render database persists, these figures include earlier runs and will not match the local guides.*

**Every transfer and how it ended** (newest run last):

```bash
psql "$DBURL" -c "select b.account_number as to_account, t.status, t.amount_minor, t.fee_minor from transfer t join beneficiary b on b.id = t.beneficiary_id order by t.created_at desc limit 8;"
```

**Does the whole bank still add up to zero?**

```bash
psql "$DBURL" -c "select sum(balance_minor) as all_balances_added_together from account;"
```

**You will see `0`.** This is the strongest line of the demo: after any number of runs, refunds, retries and timeouts,
money was neither created nor destroyed.

**Try to rewrite history:**

```bash
psql "$DBURL" -c "update ledger_line set amount_minor = 1;"
```

**You will see** `ERROR: the ledger is append-only: UPDATE on ledger_line is not allowed`.

> Do not try to edit or delete other data on the shared demo database. Everything above is read-only except the
> refused update, which the database rejects.

---

## 6. Safety after the demo

The deployed app has **no authentication** and a **public money-minting endpoint** (`/api/dev/.../fund`). After you
present:

1. In the Render dashboard open the service → **Environment**, set `PAYBRIDGE_DEV_FUNDING_ENABLED` to `false`, and save
   (the service redeploys). The funding endpoint then stops working.
2. Or **suspend** the service until you need it again.
3. Never put a real Paystack key on this deployment until Step 13 (authentication) exists.

---

## 7. If something goes wrong

| Symptom | Fix |
|---|---|
| Empty reply, HTML, or `502` | The service is asleep or still starting. Wait 30 to 60 seconds and retry `curl -s $BASE/actuator/health`. |
| Health is `UP` but a transfer stays `PENDING` | The dispatcher runs every 2 s, so wait a few seconds. If it persists, check the Logs tab for errors. |
| A transfer stays `PROCESSING` for a long time | Expected for `1234`, `5555`, `2222` (14 to 34 s). Longer than ~60 s: check the Logs. |
| `404` on `/api/dev/accounts/.../fund` | `PAYBRIDGE_DEV_FUNDING_ENABLED` is `false` on Render. Set it to `true` for the demo. |
| `wait_final` prints `status = ` (empty) | The transfer id variable is empty because the previous `curl` failed. Re-run that step and read its output. |
| `404` when saving a payee | An account number ending `9999` cannot be resolved by design. |
| `422 LIMIT_EXCEEDED` after many runs | Limits are per customer per day. Use new customers (re-run A1/A2) or a smaller amount. |
| `psql: command not found` | Use the full path, for example `"/c/Program Files/PostgreSQL/18/bin/psql"`, or run the queries in Render's database shell. |
| `psql` cannot connect | Use the **External** URL (not Internal), and check the database is not suspended or expired (free databases expire). |
| `CORS`/SSL errors | None expected from `curl`. Make sure `BASE` starts with `https://`. |
| Deploy failed / app won't start on Render | Open the service's **Logs** (build or runtime). The usual causes are a missing `DB_*` variable or a wrong profile (`SPRING_PROFILES_ACTIVE` must be `prod`). |

---

## 8. Running order and timing

**Suggested order for a live demo (about 5 minutes of talking and about 40 seconds of waiting):**

| Order | Step | Waits | Why include it |
|---|---|---|---|
| 0 | Section 2: wake, helpers (do beforehand) | up to 60 s | The service must be awake |
| 1 | A1 to A3: customers, accounts, funding | none | Sets the scene |
| 2 | **A4: internal transfer** | none | The core feature |
| 3 | **A5: replay** | none | Idempotency |
| 4 | A6 to A7: balances, statements | none | The evidence |
| 5 | A8: refusals | none | Safety |
| 6 | B1 to B2: name enquiry, payees | none | The real-world flow |
| 7 | **B3: external success** | about 2 s | Hold, then settle |
| 8 | **B5: refusal and refund** | about 3 s | Nothing erased, fee returned |
| 9 | **B8: timeout after receipt** | about 19 s | "Unknown is not failed", paid once |
| 10 | Section 5: the database | none | The books add up to zero |

Skip B7 and B9 (14 s and 34 s) if you are short of time.

**Practise saying this in order (external):** *accept → hold in suspense → outbox note → dispatcher asks the bank (no
transaction open) → yes: pay out and earn the fee / no: refund / no answer: keep holding and retry → reconciler asks
later → finish.*

**Five talking points that win the demo:**
(1) money is stored as whole kobo; (2) every movement is balanced double-entry, and the whole bank sums to zero;
(3) the same request twice moves money once; (4) a timeout is "unknown", never "failed", and a retry cannot pay twice;
(5) the database enforces the rules even if the code is wrong.
