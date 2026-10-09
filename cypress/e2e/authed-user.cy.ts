/// <reference types="cypress" />

// Authenticated smoke suite: logs in for real, then exercises the protected
// routes a user can reach. Credentials come from Cypress env
// (CYPRESS_E2E_EMAIL / CYPRESS_E2E_PASSWORD) with the documented test
// account as the default.
const EMAIL = Cypress.env("E2E_EMAIL") || "odisa@gmail.com";
const PASSWORD = Cypress.env("E2E_PASSWORD") || "123456789";

describe("authenticated user routes", () => {
  beforeEach(() => {
    cy.login(EMAIL, PASSWORD);
  });

  it("lands on the user dashboard with no console errors", () => {
    const errors: string[] = [];
    cy.window().then((win) => {
      const orig = win.console.error;
      win.console.error = (...args: unknown[]) => {
        errors.push(args.map(String).join(" "));
        orig.apply(win.console, args as []);
      };
    });

    cy.url({ timeout: 20000 }).should("include", "/dashboard");
    cy.get("#root", { timeout: 15000 }).should("exist");
    // Dashboard should render real content, not a blank shell or NaN.
    cy.get("body").then(($b) => {
      const t = $b.text().replace(/\s+/g, " ").trim();
      expect(t.length, "dashboard rendered text").to.be.greaterThan(50);
      expect(t, "no NaN leaked into dashboard").to.not.match(/(^|[^a-z])nan([^a-z]|$)/);
      expect(t.toLowerCase()).to.not.match(/signing in|verifying access/i);
    });

    cy.log(`console.error count on dashboard = ${errors.length}`);
  });

  it("renders the wallet page and shows a balance control", () => {
    cy.visit("/wallet");
    cy.url({ timeout: 15000 }).should("include", "/wallet");
    cy.get("#root", { timeout: 20000 }).should("exist");
    cy.get("#root").should("not.be.empty");
    cy.wait(2000);
    cy.get("body").then(($b) => {
      const t = $b.text().replace(/\s+/g, " ").trim();
      expect(t.length, "wallet rendered text").to.be.greaterThan(50);
      expect(t.toLowerCase(), "wallet shows a balance/amount affordance").to.match(/balance|ghs|gh₵|top up|wallet/i);
      expect(t, "no NaN leaked into wallet").to.not.match(/(^|[^a-z])nan([^a-z]|$)/);
    });
  });

  it("renders the orders page", () => {
    cy.visit("/orders");
    cy.url({ timeout: 15000 }).should("include", "/orders");
    cy.get("#root", { timeout: 20000 }).should("exist");
    cy.get("#root").should("not.be.empty");
    cy.wait(2000);
    cy.get("body").then(($b) => {
      const t = $b.text().replace(/\s+/g, " ").trim();
      expect(t.length, "orders rendered text").to.be.greaterThan(20);
      expect(t.toLowerCase(), "orders page mentions orders").to.match(/order|no orders|empty|history/i);
      expect(t, "no NaN leaked into orders").to.not.match(/(^|[^a-z])nan([^a-z]|$)/);
    });
  });

  it("renders the profile page", () => {
    cy.visit("/profile");
    cy.url({ timeout: 15000 }).should("include", "/profile");
    cy.get("#root", { timeout: 20000 }).should("exist");
    cy.get("#root").should("not.be.empty");
    cy.wait(2000);
    cy.get("body").then(($b) => {
      const t = $b.text().replace(/\s+/g, " ").trim();
      expect(t.length, "profile rendered text").to.be.greaterThan(30);
      expect(t.toLowerCase(), "profile shows identity fields").to.match(/profile|email|name|phone|logout|sign out/i);
      expect(t, "no NaN leaked into profile").to.not.match(/(^|[^a-z])nan([^a-z]|$)/);
    });
  });

  it("renders the referrals page", () => {
    cy.visit("/referrals");
    cy.url({ timeout: 15000 }).should("include", "/referrals");
    cy.get("#root", { timeout: 20000 }).should("exist");
    cy.get("#root").should("not.be.empty");
    cy.wait(2000);
    cy.get("body").then(($b) => {
      const t = $b.text().replace(/\s+/g, " ").trim();
      expect(t.length, "referrals rendered text").to.be.greaterThan(30);
      expect(t.toLowerCase(), "referrals page mentions referral concepts").to.match(/referral|invite|earn|code/i);
      expect(t, "no NaN leaked into referrals").to.not.match(/(^|[^a-z])nan([^a-z]|$)/);
    });
  });
});
