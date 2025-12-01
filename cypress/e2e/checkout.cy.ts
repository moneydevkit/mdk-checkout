describe('MDK Checkout happy path', () => {
  it('creates, pays, and lands on success', () => {
    const apiPath = Cypress.env('MDK_API_PATH') || '/api/mdk-mock'

    cy.visit('/')

    cy.get('[data-test="start-checkout"]').click()

    // On checkout page
    cy.url().should('include', '/checkout/')

    // Checkout widget renders with QR + details
    cy.get('[data-test="checkout-shell"]').should('exist')
    cy.contains('View Details', { timeout: 8000 }).should('exist')
    cy.contains('sats').should('exist')

    // Simulate webhook notifying payment received
    cy.request('POST', apiPath, { handler: 'webhook', nodeId: 'mock-node', event: 'incoming-payment' })

    // Flow should transition to payment received after webhook
    cy.contains('Your payment has been received.', { timeout: 8000 }).should('exist')

    cy.contains('button', 'Continue').click()

    cy.url().should('include', '/success')
    cy.contains('Thanks').should('exist')
    cy.contains('Metadata').should('exist')

    // Verify mock backend saw the expected calls and status flipped to paid
    cy.request(apiPath).then((response) => {
      expect(response.status).to.eq(200)
      expect(response.body.status).to.eq('PAYMENT_RECEIVED')
      expect(response.body.log).to.include('client.create')
      expect(response.body.log).to.include('client.confirm')
      expect(response.body.log).to.include('client.registerInvoice')
      expect(response.body.log).to.include('client.get')
    })
  })
})
