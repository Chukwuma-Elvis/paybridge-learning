package com.academy.paybridge.ledger.web;

import com.academy.paybridge.account.api.AccountApi;
import com.academy.paybridge.account.api.AccountSummary;
import com.academy.paybridge.account.api.SystemAccount;
import com.academy.paybridge.ledger.api.EntryType;
import com.academy.paybridge.ledger.api.LedgerApi;
import com.academy.paybridge.ledger.api.PostedEntry;
import com.academy.paybridge.ledger.api.PostingLine;
import com.academy.paybridge.ledger.api.PostingRequest;
import com.academy.paybridge.shared.exception.ErrorCode;
import com.academy.paybridge.shared.exception.PayBridgeException;
import com.academy.paybridge.shared.money.Money;
import jakarta.validation.Valid;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

/**
 * TEST SCAFFOLDING. Contains developer endpoints for funding accounts and resetting test data.
 * Switch it off with {@code paybridge.dev.funding-enabled=false} anywhere that is not a developer's machine.
 */
@RestController
@RequestMapping("/api/dev")
@ConditionalOnProperty(name = "paybridge.dev.funding-enabled", havingValue = "true")
public class DevFundingController {

    private final LedgerApi ledgerApi;
    private final AccountApi accountApi;
    private final JdbcTemplate jdbcTemplate;

    public DevFundingController(LedgerApi ledgerApi, AccountApi accountApi, JdbcTemplate jdbcTemplate) {
        this.ledgerApi = ledgerApi;
        this.accountApi = accountApi;
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostMapping({"/accounts/{accountId}/fund", "/accounts/{accountId}/fund/"})
    public Map<String, Object> fund(@PathVariable UUID accountId, @Valid @RequestBody FundAccountRequest request) {
        AccountSummary account = accountApi.getAccount(accountId);
        if (!account.isCustomerAccount()) {
            throw new PayBridgeException(ErrorCode.VALIDATION_FAILED, "Only customer accounts can be funded");
        }

        Money amount = Money.ofMinor(request.amountMinor(), account.currency());
        PostedEntry entry = ledgerApi.post(PostingRequest.of(
                EntryType.FUNDING,
                "funding:" + UUID.randomUUID(),
                "Dev funding",
                new PostingLine(accountApi.systemAccountId(SystemAccount.FUNDING_SOURCE), amount.negate()),
                new PostingLine(accountId, amount)));

        return Map.of(
                "entryId", entry.id(),
                "accountId", accountId,
                "balanceMinor", accountApi.getAccount(accountId).balanceMinor());
    }

    @PostMapping({"/reset", "/accounts/clear"})
    @DeleteMapping({"/accounts", "/reset"})
    @Transactional
    public Map<String, Object> clearAllCustomerData() {
        jdbcTemplate.execute("""
            TRUNCATE TABLE 
                transfer_outbox,
                idempotency_key,
                transfer, 
                ledger_line, 
                journal_entry, 
                event_publication, 
                notification, 
                beneficiary, 
                daily_usage 
            CASCADE;

            DELETE FROM account WHERE account_type = 'CUSTOMER';
            DELETE FROM customer;
            UPDATE account SET balance_minor = 0 WHERE account_type = 'SYSTEM';
            ALTER SEQUENCE account_number_seq RESTART WITH 100000001;
        """);

        return Map.of(
                "status", "SUCCESS",
                "message", "All customer accounts, customers, ledger entries, and transfers have been cleared.");
    }
}