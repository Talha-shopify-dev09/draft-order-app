// app/routes/api.process-checkout.jsx
import db from "../db.server";

// 1. Define CORS Headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// 2. Handle OPTIONS (Pre-flight)
export async function loader({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
}

// 3. Handle POST
export async function action({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const jsonResponse = (data, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  };

  try {
    const body = await request.json();
    const { token, variantName, price, shop, currency, customImage } = body;

    // 1. Validate inputs
    if (!shop || !price) {
      return jsonResponse({ success: false, error: "Missing shop or price" }, 400);
    }

    // 2. Look up Session
    const session = await db.session.findFirst({
      where: { shop: shop },
    });

    if (!session || !session.accessToken) {
      console.error(`No session found for shop: ${shop}`);
      return jsonResponse({ success: false, error: "Shop not authorized" }, 401);
    }

    // 3. Prepare Line Item
    const lineItem = {
      title: variantName || "Custom Order",
      price: price,
      quantity: 1,
      custom: true,
      taxable: true,
      properties: []
    };

    if (customImage) {
      lineItem.properties.push({ name: "Preview Image", value: customImage });
    }

    // 4. CREATE DRAFT ORDER
    const createResponse = await fetch(
      `https://${shop}/admin/api/2024-10/draft_orders.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": session.accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          draft_order: {
            line_items: [lineItem],
            currency: currency || "USD",
            use_customer_default_address: false,
            
            // --- FIX IS HERE ---
            // 1. Use a short, simple tag
            tags: "app_custom_order", 
            
            // 2. Put the long token in note_attributes (No 40 char limit here)
            note_attributes: [
              { name: "_app_token", value: token }
            ]
          },
        }),
      }
    );

    const createData = await createResponse.json();

    // Catch Errors (Like the tag error you just saw)
    if (!createResponse.ok) {
      console.error("Shopify Creation Failed:", JSON.stringify(createData));
      return jsonResponse({ success: false, error: JSON.stringify(createData) }, 500);
    }

    // 5. Success
    return jsonResponse({
      success: true,
      checkoutUrl: createData.draft_order.invoice_url,
    });

  } catch (error) {
    console.error("Checkout Server Error:", error);
    return jsonResponse({ success: false, error: "Server error processing checkout" }, 500);
  }
}