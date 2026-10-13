package com.academy.paybridge.ledger.api;

import java.time.Instant;
import java.util.UUID;

public record GlobalLedgerLineView(
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
