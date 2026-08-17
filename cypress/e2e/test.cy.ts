describe('AFA Registration smoke test', () => {
  it('loads the app and redirects unauthenticated users to login', () => {
    cy.visit('/');
    cy.url().should('include', '/login');
    cy.contains('button', /sign in|login/i).should('be.visible');
  });

  it('renders the register page', () => {
    cy.visit('/register');
    cy.contains('button', /create account|register|sign up/i).should('be.visible');
  });
});