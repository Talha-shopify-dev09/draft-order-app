// app/routes/api.process-checkout.jsx
import { json } from "@remix-run/node";
import db from "../db.server"; // Import your database connection

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
    const { draftOrderId, variantName, price, shop } = body;

    // --- FIX STARTS HERE ---
    
    // 1. Validate we have a shop URL
    if (!shop || !draftOrderId) {
      return jsonResponse({ success: false, error: "Missing shop or order ID" }, 400);
    }

    // 2. Look up the CORRECT token for this specific shop from the database
    // We search for a session where the shop matches
    const session = await db.session.findFirst({
      where: { shop: shop },
    });

    if (!session || !session.accessToken) {
      console.error(`No session found for shop: ${shop}`);
      return jsonResponse({ success: false, error: "Shop not authorized (No token found)" }, 401);
    }

    const accessToken = session.accessToken; // <--- NOW WE HAVE THE CORRECT KEY!

    // --- FIX ENDS HERE ---

    // 3. Update the Draft Order
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
                taxable: false 
              },
            ],
          },
        }),
      }
    );

    const updateData = await updateResponse.json();

    if (!updateResponse.ok) {
      console.error("Shopify Update Failed:", updateData);
      // Pass the actual error message back to the frontend
      return jsonResponse({ success: false, error: JSON.stringify(updateData) }, 500);
    }

    return jsonResponse({
      success: true,
      checkoutUrl: updateData.draft_order.invoice_url,
    });

  } catch (error) {
    console.error("Checkout Error:", error);
    return jsonResponse({ success: false, error: "Server error processing checkout" }, 500);
  }
}