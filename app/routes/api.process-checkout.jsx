// app/routes/api.process-checkout.jsx

export async function action({ request }) {
  // 1. Define CORS Headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // 2. Handle Pre-flight
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Helper for JSON response
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
                custom: true, // Custom item
              },
            ],
          },
        }),
      }
    );

    const updateData = await updateResponse.json();

    if (!updateResponse.ok) {
      throw new Error(JSON.stringify(updateData));
    }

    // 4. Return the invoice URL (Checkout Link)
    return jsonResponse({
      success: true,
      checkoutUrl: updateData.draft_order.invoice_url,
    });

  } catch (error) {
    console.error("Checkout Error:", error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}