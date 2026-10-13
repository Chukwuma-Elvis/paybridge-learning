package com.academy.paybridge.ledger.web;

import com.academy.paybridge.account.api.AccountApi;
import com.academy.paybridge.ledger.api.LedgerApi;
import com.academy.paybridge.account.api.AccountSummary;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping({"/api/accounts", "/api/ledger"})
public class StatementController {

    private static final int MAX_LIMIT = 200;

    private final LedgerApi ledgerApi;
    private final AccountApi accountApi;

    public StatementController(LedgerApi ledgerApi, AccountApi accountApi) {
        this.ledgerApi = ledgerApi;
        this.accountApi = accountApi;
    }

    /** The account's money movements, newest first. */
    @GetMapping("/{accountId}/entries")
    public List<StatementLineResponse> statement(@PathVariable UUID accountId,
                                                 @RequestParam(defaultValue = "50") int limit) {
        accountApi.getAccount(accountId); // 404 if there is no such account
        int bounded = Math.max(1, Math.min(limit, MAX_LIMIT));
        return ledgerApi.statement(accountId, bounded).stream().map(StatementLineResponse::from).toList();
    }

    /** All money movements across all accounts, newest first. */
    @GetMapping({"/entries", "/entries/"})
    public List<GlobalStatementResponse> allEntries(@RequestParam(defaultValue = "100") int limit) {
        int bounded = Math.max(1, Math.min(limit, MAX_LIMIT));
        return ledgerApi.allStatements(bounded).stream()
                .map(view -> {
                    String accountNumber = null;
                    String accountCode = null;
                    try {
                        AccountSummary summary = accountApi.getAccount(view.accountId());
                        accountNumber = summary.accountNumber();
                        accountCode = summary.code();
                    } catch (Exception ignored) {
                    }
                    return GlobalStatementResponse.from(view, accountNumber, accountCode);
                })
                .toList();
    }
}