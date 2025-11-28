'use client';

import { useCheckout } from "@moneydevkit/nextjs";
import Link from "next/link";
import { useMemo, useState } from "react";

const sellingPoints = [
  "Creates a checkout session from the client and routes to /checkout/[id]",
  "Server route is exposed at /api/mdk using the library's built-in handler",
  "Success page verifies payment state with useCheckoutSuccess()",
  "Wrapped with the Next.js plugin so Lightning binaries stay externalized on Vercel",
];

const chips = [
  { label: "App Router", value: "Next.js 16" },
  { label: "Payments", value: "Lightning + USD" },
  { label: "Deploy target", value: "Vercel" },
];

export default function HomePage() {
  const [customerName, setCustomerName] = useState("Satoshi Nakamoto");
  const [note, setNote] = useState("Fast IBD snapshot with hosted checkout.");
  const { navigate, isNavigating } = useCheckout();

  const metadata = useMemo(
    () => ({
      successUrl: "/checkout/success",
      customerName: customerName.trim() || "Guest",
      note: note.trim(),
      product: "Lightning IBD download",
    }),
    [customerName, note],
  );

  const handleCheckout = () => {
    navigate({
      title: "Lightning download",
      description: "A quick Money Dev Kit checkout running on Vercel.",
      amount: 2500,
      currency: "USD",
      metadata,
      checkoutPath: "/checkout",
    });
  };

  return (
    <main className="page">
      <div className="container">
        <div className="hero-grid">
          <section className="card">
            <p className="eyebrow">Money Dev Kit</p>
            <h1 className="hero-title">Lightning checkout on Vercel</h1>
            <p className="lead">
              A trimmed-down version of the Bitcoin IBD landing page that focuses on the checkout
              flow. Trigger a session, land on the hosted checkout, and confirm payment on the
              success screen.
            </p>

            <div className="grid-two">
              {chips.map((chip) => (
                <div className="pill" key={chip.label}>
                  <span style={{ opacity: 0.8 }}>{chip.label}</span>
                  <strong>{chip.value}</strong>
                </div>
              ))}
            </div>

            <div className="form">
              <label className="label" htmlFor="customer">
                Who is checking out?
              </label>
              <input
                id="customer"
                className="input"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Your customer name"
                autoComplete="name"
              />
              <label className="label" htmlFor="note">
                What are they buying?
              </label>
              <input
                id="note"
                className="input"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Describe the purchase"
                autoComplete="off"
              />
              <button
                type="button"
                className="button"
                onClick={handleCheckout}
                disabled={isNavigating}
                data-test="start-checkout"
              >
                {isNavigating ? "Creating checkout…" : "Launch checkout"}
              </button>
              <p className="hint">
                We create a checkout session with the values above and redirect to
                {" /checkout/[id] "} using <code>useCheckout</code>.
              </p>
            </div>

            <p className="muted">
              Need the full landing page treatment? Check{" "}
              <Link href="https://github.com/moneydevkit/bitcoin-ibd">bitcoin-ibd</Link> for a
              fancier UI; this demo keeps things lean for CI and Vercel deployment.
            </p>
          </section>

          <section className="card alt">
            <p className="eyebrow">What to expect</p>
            <div className="stack">
              <p className="subtext">
                The app is self-contained: the API route lives under <code>/api/mdk</code>, the
                checkout UI renders under <code>/checkout/[id]</code>, and the success page uses
                <code>useCheckoutSuccess()</code> to double-check payment state.
              </p>
              <ul className="feature-list">
                {sellingPoints.map((point) => (
                  <li className="feature-item" key={point}>
                    <span className="badge" aria-hidden>
                      <span role="img" aria-label="spark">⚡</span> Live
                    </span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <div className="card" style={{ background: "rgba(18, 27, 58, 0.75)" }}>
                <p className="eyebrow">Success path</p>
                <p className="lead" style={{ fontSize: "1.05rem" }}>
                  After payment, the success page thanks the customer by name and surfaces
                  checkout metadata so you can pipe it into provisioning logic.
                </p>
                <div className="pill">
                  <span role="img" aria-label="party">🎉</span>
                  <span>Success lives at /checkout/success</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
