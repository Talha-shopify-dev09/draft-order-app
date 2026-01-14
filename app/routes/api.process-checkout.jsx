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
  // Handle Pre-flight inside action too
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Helper for JSON response
  const jsonResponse = (data, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  };

  try {
    const body = await request.json();
    // CHANGED: We now accept 'token' (DB ID) instead of 'draftOrderId'
    // We also accept 'customImage' to show the link in checkout
    const { token, variantName, price, shop, currency, customImage } = body;

    // 1. Validate inputs
    if (!shop || !price) {
      return jsonResponse({ success: false, error: "Missing shop or price" }, 400);
    }

    // 2. Look up the Session (Credentials)
    const session = await db.session.findFirst({
      where: { shop: shop },
    });

    if (!session || !session.accessToken) {
      console.error(`No session found for shop: ${shop}`);
      return jsonResponse({ success: false, error: "Shop not authorized (No token found)" }, 401);
    }

    const accessToken = session.accessToken; 

    // 3. Prepare the Line Item
    const lineItem = {
      title: variantName || "Custom Order",
      price: price,
      quantity: 1,
      custom: true, // Important: Tells Shopify this is a custom item
      taxable: true, // Usually custom orders are taxable
      properties: []
    };

    // If an image exists, add it as a clickable link in checkout
    if (customImage) {
      lineItem.properties.push({ name: "Preview Image", value: customImage });
    }

    // 4. CREATE (POST) the Draft Order
    const createResponse = await fetch(
      `https://${shop}/admin/api/2024-10/draft_orders.json`,
      {
        method: "POST", // <--- CHANGED FROM PUT TO POST
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          draft_order: {
            line_items: [lineItem],
            currency: currency || "USD",
            use_customer_default_address: false,
            // Add a tag so you can find these orders later in Shopify Admin
            tags: `app_custom_order, token_${token}`
          },
        }),
      }
    );

    const createData = await createResponse.json();

    if (!createResponse.ok) {
      console.error("Shopify Creation Failed:", createData);
      return jsonResponse({ success: false, error: JSON.stringify(createData) }, 500);
    }

    // 5. Success! Return the Invoice URL
    return jsonResponse({
      success: true,
      checkoutUrl: createData.draft_order.invoice_url,
    });

  } catch (error) {
    console.error("Checkout Server Error:", error);
    return jsonResponse({ success: false, error: "Server error processing checkout" }, 500);
  }
}