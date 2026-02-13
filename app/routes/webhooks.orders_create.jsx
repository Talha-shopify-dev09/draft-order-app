
import db from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (!payload || !payload.id) {
    console.error(`Webhook received without payload or ID for topic ${topic}`);
    return new Response(JSON.stringify({ message: "Payload or ID missing" }), { headers: { "Content-Type": "application/json" }, status: 400 });
  }

  switch (topic) {
    case "ORDERS_CREATE":
      // Extract our internal OrderBlock ID from the order's tags
      const orderTags = payload.tags || [];
      const orderBlockIdTag = orderTags.find(tag => tag.startsWith("draft-order-app-id-"));

      if (!orderBlockIdTag) {
        console.warn(`ORDERS_CREATE webhook received but no matching 'draft-order-app-id-' tag found in order ${payload.id}`);
        return new Response(JSON.stringify({ message: "No matching OrderBlock ID tag found" }), { headers: { "Content-Type": "application/json" }, status: 200 });
      }

      const internalOrderBlockId = orderBlockIdTag.replace("draft-order-app-id-", "");
      console.log(`Received ORDERS_CREATE for Shopify Order ID: ${payload.id}, linked to internal OrderBlock ID: ${internalOrderBlockId}`);

      try {
        const updatedOrderBlock = await db.orderBlock.updateMany({
          where: {
            id: internalOrderBlockId, // Use our internal OrderBlock ID
            shop: shop,
          },
          data: {
            isPurchased: true,
          },
        });

        if (updatedOrderBlock.count > 0) {
          console.log(`Updated OrderBlock (ID: ${internalOrderBlockId}) to isPurchased: true.`);
        } else {
          console.warn(`No matching OrderBlock found for internal ID: ${internalOrderBlockId} in shop ${shop}`);
        }

      } catch (error) {
        console.error(`Error updating OrderBlock for ORDERS_CREATE webhook: ${error}`);
        return new Response(JSON.stringify({ message: "Failed to process webhook" }), { headers: { "Content-Type": "application/json" }, status: 500 });
      }
      break;

    default:
      console.warn(`Unhandled webhook topic: ${topic}`);
      return new Response(JSON.stringify({ message: "Unhandled webhook topic" }), { headers: { "Content-Type": "application/json" }, status: 404 });
  }

  return new Response(JSON.stringify({ message: "Webhook processed" }), { headers: { "Content-Type": "application/json" }, status: 200 });
};
