"use client";

import { Checkout } from "@moneydevkit/nextjs";
import Link from "next/link";
import { use } from "react";

export default function CheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <main className="page">
      <div className="container narrow">
        <div className="card">
          <p className="eyebrow">Demo checkout</p>
          <h1 className="hero-title">Complete your purchase</h1>
          <p className="subtext">
            The Money Dev Kit checkout widget is rendered directly in this page. Use the buttons
            below the QR to copy the invoice or open a Lightning wallet.
          </p>
          <div className="checkout-wrapper" data-test="checkout-shell">
            <Checkout id={id} />
          </div>
          <p className="muted center">
            Need to adjust the metadata? <Link href="/">Start again</Link>.
          </p>
        </div>
      </div>
    </main>
  );
}
