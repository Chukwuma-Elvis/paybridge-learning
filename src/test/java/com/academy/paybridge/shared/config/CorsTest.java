package com.academy.paybridge.shared.config;

import com.academy.paybridge.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The browser front end lives on another origin (Vercel), so it can only read a response that carries
 * Access-Control-Allow-Origin. The health check is how the front end decides "Connected" or "Backend Offline".
 */
class CorsTest extends AbstractIntegrationTest {

    private static final String FRONT_END = "https://paybridge-frontend.vercel.app";

    @Test
    void theHealthCheckCanBeReadFromAnotherOrigin() throws Exception {
        mockMvc.perform(get("/actuator/health").header("Origin", FRONT_END))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", FRONT_END));
    }

    /** The front end sends Content-Type on every request, so the browser asks permission first (a preflight). */
    @Test
    void theBrowserPreflightForTheHealthCheckIsAccepted() throws Exception {
        mockMvc.perform(options("/actuator/health")
                        .header("Origin", FRONT_END)
                        .header("Access-Control-Request-Method", "GET")
                        .header("Access-Control-Request-Headers", "content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", FRONT_END))
                .andExpect(header().string("Access-Control-Allow-Headers", "content-type"));
    }

    @Test
    void theBrowserPreflightForTheApiIsAccepted() throws Exception {
        mockMvc.perform(options("/api/accounts")
                        .header("Origin", FRONT_END)
                        .header("Access-Control-Request-Method", "GET")
                        .header("Access-Control-Request-Headers", "content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", FRONT_END));
    }

    @Test
    void theApiCanBeReadFromAnotherOrigin() throws Exception {
        mockMvc.perform(get("/api/accounts")
                        .param("customerId", "00000000-0000-0000-0000-000000000000")
                        .header("Origin", FRONT_END))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", FRONT_END));
    }
}
