// app/routes/api.get-order.jsx

export async function loader({ request }) {
  // 1. CORS Headers (Allow frontend to talk to backend)
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Handle Browser Pre-check
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const shop = url.searchParams.get("shop");

  // Helper for JSON response
  const jsonResponse = (data, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  };

  if (!token || !shop) {
    return jsonResponse({ success: false, error: "Missing token or shop" }, 400);
  }

  try {
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

    // 2. Fetch Draft Orders from Shopify
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
    
    // 3. Find the specific order
    const draftOrder = data.draft_orders?.find((order) =>
      order.tags?.includes(`t_${token}`)
    );

    if (!draftOrder) {
      return jsonResponse({ success: false, error: "Order not found" }, 404);
    }

    // 4. Extract Data Safely
    const getAttr = (name) => {
      const attr = draftOrder.note_attributes?.find((a) => a.name === name);
      return attr ? attr.value : null;
    };

    // Parse Option Groups (The new dropdowns)
    let optionGroups = [];
    const rawGroups = getAttr("_option_groups");
    if (rawGroups) {
      try {
        optionGroups = JSON.parse(rawGroups);
      } catch (e) {
        console.error("Error parsing option groups:", e);
      }
    }

    // Parse Image (Cloudinary URL)
    const imgUrl = getAttr("_img");

    // 5. Return Data to Frontend
    return jsonResponse({
      success: true,
      draftOrderId: draftOrder.id,
      productTitle: getAttr("_title") || "Custom Order",
      productImage: imgUrl,      // <--- Frontend looks for this exact name
      note: draftOrder.note,
      optionGroups: optionGroups, // <--- Frontend loops through this
      price: draftOrder.total_price,
      currency: draftOrder.currency,
    });

  } catch (error) {
    console.error("API Error:", error);
    return jsonResponse({ success: false, error: "Server error" }, 500);
  }
}