/// <reference types="cypress" />

declare global {
  // Cypress command typings require a namespace declaration.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string): Chainable<void>;
    }
  }
}

Cypress.Commands.add("login", (email: string, password: string) => {
  cy.visit("/login");
  cy.get('input[placeholder="you@example.com"]', { timeout: 15000 })
    .first()
    .type(email, { force: true });
  cy.get('input[placeholder="Enter your password"]', { timeout: 15000 })
    .first()
    .type(password, { force: true });
  cy.get('button[type="submit"]', { timeout: 10000 }).first().click({ force: true });
  // Wait for the auth round-trip to settle and the app to route away from /login.
  cy.url({ timeout: 20000 }).should("not.include", "/login");
});

export {};