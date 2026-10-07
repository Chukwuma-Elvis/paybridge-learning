package com.academy.paybridge.customer.api;

import java.util.UUID;

public interface CustomerApi {

    CustomerSummary getCustomer(UUID customerId);
}