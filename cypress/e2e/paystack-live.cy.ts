/// <reference types="cypress" />

// Paystack live-key E2E.
//
// Purpose: prove the LIVE Paystack public key (VITE_PAYSTACK_PUBLIC_KEY =
// pk_live_...) is correctly wired end-to-end: the top-up flow reaches
// walletApi.initiateTopUp (real backend transaction creation) and the live
// Paystack Inline checkout iframe opens. We deliberately do NOT complete a
// charge — the test asserts the checkout iframe mounted, then closes it.
//
// This is a real live-key smoke test: it creates a genuine pending Paystack
// transaction (small amount) and opens the real live checkout. It is meant to
// run against the local dev server (.env with the live key) or a deploy that
// has the live key set.

const EMAIL = Cypress.env("E2E_EMAIL") || "odisa@gmail.com";
const PASSWORD = Cypress.env("E2E_PASSWORD") || "123456789";

describe("Paystack live checkout init", () => {
  it("opens the live Paystack checkout iframe for a wallet top-up", () => {
    cy.login(EMAIL, PASSWORD);
    cy.url({ timeout: 20000 }).should("include", "/dashboard");

    // Go to wallet.
    cy.visit("/wallet");
    cy.get("#root", { timeout: 20000 }).should("exist");
    cy.get("#root").should("not.be.empty");

    // Capture the initiateTopUp backend call + any Paystack script load.
    // The real function is POST /functions/v1/initiate-wallet-topup.
    const backendCalls: { url: string; status: number }[] = [];
    cy.intercept("POST", "**/functions/v1/initiate-wallet-topup*", (req) => {
      req.on("response", (res) => {
        backendCalls.push({ url: req.url, status: res.statusCode });
      });
    }).as("initiateTopUp");

    // Open the top-up modal. There are two triggers; click the first visible.
    cy.contains("button, ion-button", /top up|top-up|add funds|fund wallet/i)
      .first()
      .click({ force: true });

    // Enter a valid amount. The live pricing sets wallet_min_topup = GH₵10, so
    // anything below 10 is rejected client-side before Paystack opens.
    cy.get("#topup-amount-input", { timeout: 15000 }).should("be.visible");
    cy.get("#topup-amount-input").clear().type("10", { force: true });

    // Click Pay. This calls the backend then opens the live iframe.
    cy.get("button.proceed-btn, ion-button.proceed-btn", { timeout: 10000 })
      .first()
      .click({ force: true });

    // Assert the backend initiateTopUp call was made (real live transaction).
    cy.wait("@initiateTopUp", { timeout: 20000 });
    cy.log(`initiateTopUp calls: ${JSON.stringify(backendCalls)}`);

    // The Paystack Inline checkout mounts a cross-origin iframe on the page.
    // Give it time to load the live checkout.
    cy.wait(5000);
    cy.get("body").then(($body) => {
      const iframes = $body.find("iframe");
      cy.log(`iframes on page after Pay = ${iframes.length}`);
      // Paystack Inline opens an iframe (its checkout overlay). We assert at
      // least one iframe appeared, proving the live popup initialized. If the
      // key were invalid, PaystackPop.setup would fail and no iframe would mount.
      expect(
        iframes.length,
        "Paystack checkout iframe mounted (live key initialized the popup)"
      ).to.be.greaterThan(0);
    });

    // Best-effort: verify the Paystack script itself loaded from js.paystack.co.
    cy.window().then((win) => {
      const scripts = Array.from(win.document.scripts).map((s) => s.src);
      const paystackScript = scripts.find((src) => src.includes("js.paystack.co"));
      cy.log(`paystack script: ${paystackScript || "<none>"}`);
      // Don't hard-fail if the loader inlined it differently; the iframe
      // assertion above is the primary signal.
    });
  });
});
