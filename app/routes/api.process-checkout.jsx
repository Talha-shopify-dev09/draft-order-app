// app/routes/api.process-checkout.jsx

export async function action({ request }) {
  // 1. Define CORS Headers (Critical for "Failed to fetch" fix)
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // 2. Handle Pre-flight (Browser asking permission)
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Helper for clean JSON responses
  const jsonResponse = (data, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  };

  try {
    const body = await request.json();
    const { token, draftOrderId, variantName, price, shop } = body;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!draftOrderId || !shop) {
        return jsonResponse({ success: false, error: "Missing order ID" }, 400);
    }

    // 3. Update the Draft Order in Shopify
    const updateResponse = await fetch(
      `https://${shop}/admin/api/2024-10/draft_orders/${draftOrderId}.json`,
      {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          draft_order: {
            line_items: [
              {
                title: variantName,
                price: price,
                quantity: 1,
                custom: true, 
                taxable: false // Optional: adjust based on needs
              },
            ],
          },
        }),
      }
    );

    const updateData = await updateResponse.json();

    if (!updateResponse.ok) {
      console.error("Shopify Update Failed:", updateData);
      throw new Error(JSON.stringify(updateData));
    }

    // 4. Return the invoice URL
    return jsonResponse({
      success: true,
      checkoutUrl: updateData.draft_order.invoice_url,
    });

  } catch (error) {
    console.error("Checkout Error:", error);
    return jsonResponse({ success: false, error: "Server error processing checkout" }, 500);
  }
}