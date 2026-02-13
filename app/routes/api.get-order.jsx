// app/routes/api.get-order.jsx
import db from "../db.server";

// 1. CORS Headers (Allow frontend to talk to backend)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function loader({ request }) {
  // Handle Browser Pre-check (OPTIONS request)
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  
  // Helper for JSON response (No Remix 'json' helper used)
  const jsonResponse = (data, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  };

  if (!id) {
    return jsonResponse({ success: false, error: "Missing ID" }, 400);
  }

  try {
    console.log(`[API] Looking up order in DB with ID: ${id}`);

    // 2. FIND ORDER IN DATABASE
    // We search by the ID directly
    const order = await db.orderBlock.findUnique({
      where: { id: id },
    });

    if (!order) {
      console.error(`[API] Order not found for ID: ${id}`);
      return jsonResponse({ success: false, error: "Order not found or expired" }, 404);
    }

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
    return jsonResponse({
      success: true,
      productTitle: order.productTitle,
      note: order.note,
      images: images,       // Array of image URLs
      video: order.video,   // Video URL
      optionGroups: optionGroups,
      isPurchased: order.isPurchased, // Include the new status
      checkoutUrl: order.checkoutUrl  // Include the Shopify-generated checkout URL
    });

  } catch (error) {
    console.error("API Error:", error);
    return jsonResponse({ success: false, error: "Server error: " + error.message }, 500);
  }
}