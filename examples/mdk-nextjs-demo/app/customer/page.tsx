'use client';

import { useCustomer } from "@moneydevkit/nextjs";
import Link from "next/link";
import { useState } from "react";

type IdentifierType = 'externalId' | 'email' | 'id';

export default function CustomerPage() {
  const [identifierType, setIdentifierType] = useState<IdentifierType>('externalId');
  const [identifierValue, setIdentifierValue] = useState('');
  const [submittedIdentifier, setSubmittedIdentifier] = useState<{ type: IdentifierType; value: string } | null>(null);

  const identifier = submittedIdentifier
    ? { [submittedIdentifier.type]: submittedIdentifier.value } as
        | { externalId: string }
        | { email: string }
        | { id: string }
    : null;

  const { customer, isLoading, error, refetch } = useCustomer(identifier);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (identifierValue.trim()) {
      setSubmittedIdentifier({ type: identifierType, value: identifierValue.trim() });
    }
  };

  const handleClear = () => {
    setSubmittedIdentifier(null);
    setIdentifierValue('');
  };

  return (
    <main className="page">
      <div className="container narrow">
        <div className="card">
          <p className="eyebrow">useCustomer Hook Test</p>
          <h1 className="hero-title">Customer Lookup</h1>
          <p className="lead">
            Test the useCustomer hook by looking up a customer by external ID, email, or customer ID.
          </p>

          <form onSubmit={handleSubmit} className="form">
            <label className="label">Identifier Type</label>
            <div className="grid-two" style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                className={`pill ${identifierType === 'externalId' ? 'pill-active' : ''}`}
                onClick={() => setIdentifierType('externalId')}
                style={{ cursor: 'pointer', justifyContent: 'center' }}
              >
                External ID
              </button>
              <button
                type="button"
                className={`pill ${identifierType === 'email' ? 'pill-active' : ''}`}
                onClick={() => setIdentifierType('email')}
                style={{ cursor: 'pointer', justifyContent: 'center' }}
              >
                Email
              </button>
              <button
                type="button"
                className={`pill ${identifierType === 'id' ? 'pill-active' : ''}`}
                onClick={() => setIdentifierType('id')}
                style={{ cursor: 'pointer', justifyContent: 'center' }}
              >
                Customer ID
              </button>
            </div>

            <label className="label" htmlFor="identifier">
              {identifierType === 'externalId' && 'External ID'}
              {identifierType === 'email' && 'Email Address'}
              {identifierType === 'id' && 'Customer ID'}
            </label>
            <input
              id="identifier"
              className="input"
              type={identifierType === 'email' ? 'email' : 'text'}
              value={identifierValue}
              onChange={(e) => setIdentifierValue(e.target.value)}
              placeholder={
                identifierType === 'externalId' ? 'user_123' :
                identifierType === 'email' ? 'customer@example.com' :
                'cust_abc123'
              }
            />

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="button" disabled={!identifierValue.trim()}>
                Look up customer
              </button>
              {submittedIdentifier && (
                <button type="button" className="button" onClick={handleClear} style={{ background: 'rgba(255,255,255,0.1)' }}>
                  Clear
                </button>
              )}
            </div>
          </form>

          {submittedIdentifier && (
            <div className="stack" style={{ marginTop: '1.5rem' }}>
              <div className="badge">Result</div>

              {isLoading && (
                <p className="subtext">Loading customer data...</p>
              )}

              {error && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                  <p style={{ color: '#ef4444', margin: 0 }}>
                    <strong>Error:</strong> {error.message}
                  </p>
                  {error.code && (
                    <p style={{ color: '#ef4444', margin: '0.5rem 0 0', fontSize: '0.875rem' }}>
                      Code: {error.code}
                    </p>
                  )}
                </div>
              )}

              {customer && !isLoading && (
                <div>
                  <div className="pill" style={{ marginBottom: '1rem' }}>
                    <span role="img" aria-label="check">✓</span>
                    <span>Customer found</span>
                  </div>

                  <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div className="pill">
                      <span style={{ opacity: 0.8 }}>ID</span>
                      <strong>{customer.id}</strong>
                    </div>
                    {customer.email && (
                      <div className="pill">
                        <span style={{ opacity: 0.8 }}>Email</span>
                        <strong>{customer.email}</strong>
                      </div>
                    )}
                    {customer.name && (
                      <div className="pill">
                        <span style={{ opacity: 0.8 }}>Name</span>
                        <strong>{customer.name}</strong>
                      </div>
                    )}
                    {customer.externalId && (
                      <div className="pill">
                        <span style={{ opacity: 0.8 }}>External ID</span>
                        <strong>{customer.externalId}</strong>
                      </div>
                    )}
                    <div className="pill">
                      <span style={{ opacity: 0.8 }}>Active Subscription</span>
                      <strong style={{ color: customer.hasActiveSubscription ? '#22c55e' : '#f59e0b' }}>
                        {customer.hasActiveSubscription ? 'Yes' : 'No'}
                      </strong>
                    </div>
                  </div>

                  {customer.subscriptions.length > 0 && (
                    <>
                      <div className="badge">Subscriptions ({customer.subscriptions.length})</div>
                      <div style={{ marginTop: '0.5rem' }}>
                        {customer.subscriptions.map((sub) => (
                          <div key={sub.id} style={{
                            background: 'rgba(255,255,255,0.04)',
                            padding: '1rem',
                            borderRadius: '12px',
                            border: '1px solid rgba(255,255,255,0.05)',
                            marginBottom: '0.5rem'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                              <code style={{ fontSize: '0.75rem' }}>{sub.id}</code>
                              <span className="badge" style={{
                                background: sub.status === 'active' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                                color: sub.status === 'active' ? '#22c55e' : '#f59e0b'
                              }}>
                                {sub.status}
                              </span>
                            </div>
                            <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}>
                              <strong>${(sub.amount / 100).toFixed(2)} {sub.currency}</strong> / {sub.recurringInterval.toLowerCase()}
                            </p>
                            <p style={{ margin: '0.25rem 0', fontSize: '0.75rem', opacity: 0.7 }}>
                              Current period: {new Date(sub.currentPeriodStart).toLocaleDateString()} - {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                            </p>
                            {sub.cancelAtPeriodEnd && (
                              <p style={{ margin: '0.25rem 0', fontSize: '0.75rem', color: '#f59e0b' }}>
                                Cancels at period end
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <button type="button" className="button" onClick={refetch} style={{ marginTop: '1rem' }}>
                    Refetch
                  </button>
                </div>
              )}

              <div className="badge" style={{ marginTop: '1rem' }}>Raw Response</div>
              <pre
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  padding: '1rem',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.05)',
                  overflowX: 'auto',
                  fontSize: '0.75rem',
                }}
              >
                {JSON.stringify({ customer, isLoading, error }, null, 2)}
              </pre>
            </div>
          )}

          <div style={{ marginTop: '1.5rem' }}>
            <Link href="/" className="button" style={{ width: 'fit-content', background: 'rgba(255,255,255,0.1)' }}>
              Back to checkout
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
