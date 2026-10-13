package com.academy.paybridge.ledger.repository;

import com.academy.paybridge.ledger.api.EntryType;

import java.time.Instant;
import java.util.UUID;

/** A ledger line projection across all accounts with its journal entry metadata. */
public record GlobalStatementRow(
        UUID entryId,
        EntryType entryType,
        String reference,
        String description,
        UUID lineId,
        UUID accountId,
        long amountMinor,
        String currency,
        Instant createdAt) {
}
