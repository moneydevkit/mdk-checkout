import { withPayment } from "@moneydevkit/nextjs/server";

export const GET = withPayment(
  {
    amount: 100,
    currency: "USD",
  },
  async () => Response.json({ ok: true, version: "0.18.0" }),
);
