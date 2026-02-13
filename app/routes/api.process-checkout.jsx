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
    const { token, variantName, price, shop: shopFromClient, customImage } = body; // shopFromClient is the shop from the liquid block

    // 1. Validate inputs
    if (!token || !price || !shopFromClient) {
      return jsonResponse({ success: false, error: "Missing token, shop, or price" }, 400);
    }

    // 2. Fetch OrderBlock from our DB
    const orderBlock = await db.orderBlock.findUnique({
      where: { id: token },
    });

    if (!orderBlock || !orderBlock.shopifyDraftOrderId) {
      return jsonResponse({ success: false, error: "Custom order not found or invalid" }, 404);
    }

    // 3. Authenticate with Shopify
    const authResult = await authenticate.admin(request); // Get the full auth result
    const admin = authResult.admin; // Explicitly get the admin client

    if (!admin || typeof admin.graphql !== 'function') {
      throw new Error("Shopify Admin GraphQL client is not available. Ensure proper authentication and setup.");
    }


    // 4. Prepare Line Item for updating Shopify Draft Order
    const lineItemCustomAttributes = [];
    if (customImage) {
      lineItemCustomAttributes.push({ key: "Preview Image", value: customImage });
    }
    // Optionally, parse and add actual option groups here if you want to update them in the Draft Order's custom attributes
    // For now, we'll just use variantName as a custom attribute or part of title

    const lineItems = [
      {
        title: variantName || orderBlock.productTitle || "Custom Product",
        quantity: 1,
        originalUnitPrice: price,
        customAttributes: lineItemCustomAttributes,
      },
    ];

    // 5. Construct GraphQL Mutation for Draft Order Update
    const draftOrderUpdateMutation = `
      mutation draftOrderUpdate($id: ID!, $input: DraftOrderInput!) {
        draftOrderUpdate(id: $id, input: $input) {
          draftOrder {
            id
            invoiceUrl
            totalPrice
            lineItems(first: 1) {
              nodes {
                title
                originalUnitPrice
                customAttributes {
                  key
                  value
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const draftOrderInput = {
      id: orderBlock.shopifyDraftOrderId,
      input: {
        lineItems: lineItems,
        // Update the note if necessary with more details from the selection
        note: orderBlock.note + (variantName ? `\nSelected Options: ${variantName}` : ""),
      },
    };
    
    const response = await admin.graphql(draftOrderUpdateMutation, draftOrderInput);
    const responseJson = await response.json();

    if (responseJson.errors || responseJson.data.draftOrderUpdate.userErrors.length > 0) {
      const errors = responseJson.errors?.map(err => err.message) || responseJson.data.draftOrderUpdate.userErrors.map(err => err.message);
      throw new Error("Shopify Draft Order update failed: " + errors.join(", "));
    }

    // 6. Return the existing checkout URL for redirection
    return jsonResponse({
      success: true,
      checkoutUrl: orderBlock.checkoutUrl,
    });

  } catch (error) {
    console.error("Checkout Server Error:", error);
    return jsonResponse({ success: false, error: "Server error processing checkout" }, 500);
  }
}