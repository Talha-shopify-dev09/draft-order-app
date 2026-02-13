// app/routes/api.get-order.jsx
import db from "../db.server";

// Helper to construct a CORS-enabled response for a specific shop
const createCorsResponse = (shop, data, status = 200) => {
  const origin = `https://${shop}`;
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
  return new Response(JSON.stringify(data), { status, headers });
};

export async function loader({ request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const shop = url.searchParams.get("shop");

  // Ensure shop is provided for security
  if (!shop) {
    return new Response("Missing 'shop' parameter", { status: 400 });
  }

  // Handle Browser Pre-check (OPTIONS request)
  if (request.method === "OPTIONS") {
    return createCorsResponse(shop, null, 204);
  }
  
  if (!id) {
    console.warn("[API] Missing ID in request to api/get-order.");
    return createCorsResponse(shop, { success: false, error: "Missing ID" }, 400);
  }

  try {
    console.log(`[API] Searching for OrderBlock with ID: ${id} for shop: ${shop}`);

    const order = await db.orderBlock.findUnique({
      where: { id: id }, // Find by ID only
    });

    if (!order) {
      console.error(`[API] Order not found for ID: ${id}`);
      return createCorsResponse(shop, { success: false, error: "Order not found or expired" }, 404);
    }
    console.log(`[API] Order found for ID: ${id}`);

    // 3. PARSE DATA SAFELY
    // Database stores arrays as JSON strings, so we parse them back to arrays
    let images = [];
    try {
      images = JSON.parse(order.images || "[]");
    } catch (e) {
      // Fallback for old data format
      if (order.images && order.images.startsWith("http")) {
        images = [order.images];
      }
    }

    let optionGroups = [];
    try {
      optionGroups = JSON.parse(order.optionGroups || "[]");
    } catch (e) {
      console.error("Error parsing option groups", e);
    }

    // 4. RETURN DATA
    return createCorsResponse(shop, {
      success: true,
      productTitle: order.productTitle,
      note: order.note,
      images: images,       // Array of image URLs
      video: order.video,   // Video URL
      optionGroups: optionGroups,
      isPurchased: order.isPurchased, // Include the new status
      checkoutUrl: order.checkoutUrl,  // Include the Shopify-generated checkout URL
      appUrl: process.env.SHOPIFY_APP_URL // Pass the app URL dynamically
    });

  } catch (error) {
    console.error("API Error:", error);
    return createCorsResponse(shop, { success: false, error: "Server error: " + error.message }, 500);
  }
}