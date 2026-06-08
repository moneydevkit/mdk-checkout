import { withPayment } from "@moneydevkit/nextjs/server";

const productId = process.env.MDK_E2E_PRODUCT_ID ?? "prod_e2e_nextjs_demo";

export const GET = withPayment(
  {
    type: "PRODUCTS",
    product: productId,
  } as any,
  async () => Response.json({ ok: true, version: "0.18.0", mode: "product" }),
);
