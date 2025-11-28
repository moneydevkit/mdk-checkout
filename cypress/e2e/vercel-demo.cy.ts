describe("MDK Vercel demo checkout", () => {
  it("creates a checkout and renders the hosted UI", () => {
    cy.visit("/");
    cy.get('[data-test="start-checkout"]').should("be.visible").click();

    cy.url({ timeout: 30000 }).should("include", "/checkout/");
    cy.get('[data-test="checkout-shell"]', { timeout: 45000 }).should("exist");
    cy.contains("Powered by", { timeout: 45000 }).should("be.visible");
  });
});
