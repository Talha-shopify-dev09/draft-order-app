import { json } from "@remix-run/node";
import db from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (!payload || !payload.id) {
    console.error(`Webhook received without payload or ID for topic ${topic}`);
    return json({ message: "Payload or ID missing" }, { status: 400 });
  }

  switch (topic) {
    case "DRAFT_ORDERS_FINALIZED":
      const shopifyDraftOrderId = `gid://shopify/DraftOrder/${payload.id}`;
      console.log(`Received DRAFT_ORDERS_FINALIZED for Shopify Draft Order ID: ${shopifyDraftOrderId}`);

      try {
        const updatedOrderBlock = await db.orderBlock.updateMany({
          where: {
            shopifyDraftOrderId: shopifyDraftOrderId,
            shop: shop,
          },
          data: {
            isPurchased: true,
          },
        });

        if (updatedOrderBlock.count > 0) {
          console.log(`Updated OrderBlock to isPurchased: true for Shopify Draft Order ID: ${shopifyDraftOrderId}`);
        } else {
          console.warn(`No matching OrderBlock found for Shopify Draft Order ID: ${shopifyDraftOrderId} in shop ${shop}`);
        }

      } catch (error) {
        console.error(`Error updating OrderBlock for DRAFT_ORDERS_FINALIZED webhook: ${error}`);
        return json({ message: "Failed to process webhook" }, { status: 500 });
      }
      break;

    default:
      console.warn(`Unhandled webhook topic: ${topic}`);
      return json({ message: "Unhandled webhook topic" }, { status: 404 });
  }

  return json({ message: "Webhook processed" }, { status: 200 });
};
