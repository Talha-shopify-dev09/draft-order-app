// app/routes/api.get-order.jsx

export async function loader({ request }) {
  // 1. Define CORS Headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // 2. Handle Pre-flight (OPTIONS)
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const shop = url.searchParams.get("shop");

  // Helper to return JSON response with CORS
  const jsonResponse = (data, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  };

  if (!token || !shop) {
    return jsonResponse({ success: false, message: "Missing token or shop" }, 400);
  }

  try {
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    // Note: In production, verify this matches the shop making the request if possible
    // or rely on the uniqueness of the random token.

    // 3. Fetch Draft Orders from Shopify Admin
    const response = await fetch(
      `https://${shop}/admin/api/2024-10/draft_orders.json?limit=250`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();

    // 4. Filter for the order with the matching token tag
    const draftOrder = data.draft_orders?.find((order) =>
      order.tags?.includes(`t_${token}`)
    );

    if (!draftOrder) {
      return jsonResponse({ success: false, message: "Order not found" }, 404);
    }

    // 5. Extract Attributes
    const getAttr = (name) => {
      const attr = draftOrder.note_attributes?.find((a) => a.name === name);
      return attr ? attr.value : null;
    };

    const responsePayload = {
      success: true,
      draftOrderId: draftOrder.id,
      productTitle: getAttr("_title") || "Custom Order",
      productImage: getAttr("_img"),
      variants: JSON.parse(getAttr("_variants") || "[]"),
      price: draftOrder.total_price,
      currency: draftOrder.currency,
      note: draftOrder.note,
    };

    return jsonResponse(responsePayload);

  } catch (error) {
    console.error("API Error:", error);
    return jsonResponse({ success: false, message: "Server error" }, 500);
  }
}