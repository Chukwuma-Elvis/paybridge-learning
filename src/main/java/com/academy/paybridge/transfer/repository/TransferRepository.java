package com.academy.paybridge.transfer.repository;

import com.academy.paybridge.transfer.domain.Transfer;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TransferRepository extends JpaRepository<Transfer, UUID> {

    Optional<Transfer> findByReference(String reference);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from Transfer t where t.id = :id")
    Optional<Transfer> findByIdForUpdate(@Param("id") UUID id);

    @Query("""
            select t from Transfer t
            where t.sourceAccountId = :accountId or t.destinationAccountId = :accountId
            order by t.createdAt desc
            """)
    List<Transfer> findForAccount(@Param("accountId") UUID accountId, Pageable pageable);
}
