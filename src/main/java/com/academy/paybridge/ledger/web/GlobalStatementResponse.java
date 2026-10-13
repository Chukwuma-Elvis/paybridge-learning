package com.academy.paybridge.ledger.web;

import com.academy.paybridge.ledger.api.EntryType;
import com.academy.paybridge.ledger.api.GlobalLedgerLineView;

import java.time.Instant;
import java.util.UUID;

public record GlobalStatementResponse(
        UUID entryId,
        EntryType entryType,
        String reference,
        String narration,
        UUID lineId,
        UUID accountId,
        String accountNumber,
        String accountCode,
        long amountMinor,
        String currency,
        Instant createdAt) {

    public static GlobalStatementResponse from(GlobalLedgerLineView view, String accountNumber, String accountCode) {
        return new GlobalStatementResponse(
                view.entryId(),
                view.entryType(),
                view.reference(),
                view.description(),
                view.lineId(),
                view.accountId(),
                accountNumber,
                accountCode,
                view.amountMinor(),
                view.currency(),
                view.createdAt());
    }
}
