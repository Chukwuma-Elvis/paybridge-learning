package com.academy.paybridge.transfer;

import com.academy.paybridge.AbstractIntegrationTest;
import com.academy.paybridge.transfer.domain.IdempotencyKey;
import com.academy.paybridge.transfer.repository.IdempotencyKeyRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The idempotency "claim" is a single SQL statement, so these tests talk to the real database.
 * Each claim runs in its own transaction, exactly as it will inside a real transfer.
 */
class IdempotencyKeyRepositoryTest extends AbstractIntegrationTest {

    @Autowired
    IdempotencyKeyRepository repository;

    @Autowired
    TransactionTemplate transactionTemplate;

    private static String uniqueScope() {
        return "test:" + UUID.randomUUID();
    }

    private int claim(String scope, String key, String hash) {
        Integer rows = transactionTemplate.execute(status -> repository.claim(scope, key, hash));
        return rows == null ? -1 : rows;
    }

    @Test
    void theFirstClaimWinsAndTheSecondDoesNot() {
        String scope = uniqueScope();

        assertThat(claim(scope, "key-0001", "hash-a")).isEqualTo(1);
        assertThat(claim(scope, "key-0001", "hash-a")).isEqualTo(0);
    }

    @Test
    void aClaimStaysTakenEvenWithADifferentFingerprint() {
        String scope = uniqueScope();
        claim(scope, "key-0002", "hash-a");

        assertThat(claim(scope, "key-0002", "hash-b")).as("same key, different request: still taken").isEqualTo(0);
    }

    @Test
    void theSameKeyInADifferentScopeIsIndependent() {
        String keyShared = "key-0003";

        assertThat(claim(uniqueScope(), keyShared, "hash-a")).isEqualTo(1);
        assertThat(claim(uniqueScope(), keyShared, "hash-a")).isEqualTo(1);
    }

    @Test
    void aClaimedKeyCanBeFoundWithItsFingerprintAndNoTransferYet() {
        String scope = uniqueScope();
        claim(scope, "key-0004", "fingerprint-xyz");

        Optional<IdempotencyKey> found = transactionTemplate.execute(status -> repository.find(scope, "key-0004"));

        assertThat(found).isPresent();
        assertThat(found.get().getRequestHash()).isEqualTo("fingerprint-xyz");
        assertThat(found.get().getTransferId()).isNull();
    }

    @Test
    void anUnclaimedKeyIsNotFound() {
        Optional<IdempotencyKey> found =
                transactionTemplate.execute(status -> repository.find(uniqueScope(), "never-claimed"));

        assertThat(found).isEmpty();
    }

    @Test
    void whenManyIdenticalRequestsArriveAtOnceExactlyOneWins() throws Exception {
        String scope = uniqueScope();
        int attempts = 10;

        ExecutorService pool = Executors.newFixedThreadPool(8);
        try {
            CountDownLatch startingGun = new CountDownLatch(1);
            List<Future<Integer>> results = new ArrayList<>();
            for (int i = 0; i < attempts; i++) {
                results.add(pool.submit(() -> {
                    startingGun.await();
                    return claim(scope, "race-key-0001", "same-hash");
                }));
            }
            startingGun.countDown();

            int winners = 0;
            for (Future<Integer> result : results) {
                int rows = result.get(60, TimeUnit.SECONDS);
                assertThat(rows).isIn(0, 1);
                winners += rows;
            }
            assertThat(winners).as("exactly one request is allowed to do the work").isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
    }
}
