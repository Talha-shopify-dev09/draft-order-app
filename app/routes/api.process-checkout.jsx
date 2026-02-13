// app/routes/api.process-checkout.jsx
import db from "../db.server";
import { authenticate } from "../shopify.server";

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
    const { id, variantName, price, shop: shopFromClient, customImage } = body;

    // 1. Validate inputs
    if (!id || !price || !shopFromClient) {
      return jsonResponse({ success: false, error: "Missing ID, shop, or price" }, 400);
    }

    // 2. Fetch OrderBlock from our DB
    const orderBlock = await db.orderBlock.findUnique({
      where: { id: id },
    });

    if (!orderBlock) {
      return jsonResponse({ success: false, error: "Custom order not found" }, 404);
    }
    
    // If a Shopify Draft Order already exists for this OrderBlock and it's not purchased,
    // we can redirect to the existing checkout URL or update it.
    // For now, let's create a new one to simplify the flow as per the new requirement.
    // If orderBlock.checkoutUrl exists, we can perhaps just return that for idempotency.
    if (orderBlock.checkoutUrl && !orderBlock.isPurchased) {
        return jsonResponse({ success: true, checkoutUrl: orderBlock.checkoutUrl });
    }

    // 3. Authenticate with Shopify
    const authResult = await authenticate.admin(request);
    const admin = authResult.admin;

    if (!admin || typeof admin.graphql !== 'function') {
      throw new Error("Shopify Admin GraphQL client is not available. Ensure proper authentication and setup.");
    }

    // 4. Prepare Line Item for creating Shopify Draft Order
    const lineItemCustomAttributes = [];
    
    // Add custom attributes from OrderBlock's optionGroups
    let optionGroups = [];
    try {
      optionGroups = JSON.parse(orderBlock.optionGroups || "[]");
    } catch (e) {
      console.error("Error parsing option groups from OrderBlock:", e);
    }
    optionGroups.forEach(group => {
      group.values.forEach(val => {
        lineItemCustomAttributes.push({ key: `${group.name} - ${val.label}`, value: val.price });
      });
    });

    // Add selected variantName and customImage
    if (variantName) {
      lineItemCustomAttributes.push({ key: "Selected Options", value: variantName });
    }
    if (customImage) {
      lineItemCustomAttributes.push({ key: "Preview Image", value: customImage });
    }

    const lineItems = [
      {
        title: orderBlock.productTitle || "Custom Product",
        quantity: 1,
        originalUnitPrice: price, // 'price' from frontend is the final selected price
        customAttributes: lineItemCustomAttributes,
      },
    ];

    // Prepare Customer Input
    let customerInput = null;
    if (orderBlock.customerEmail) {
      customerInput = {
        email: orderBlock.customerEmail,
        firstName: orderBlock.customerName || "",
        lastName: "",
      };
    }

    // 5. Construct GraphQL Mutation for Draft Order Creation
    const createDraftOrderMutation = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            invoiceUrl
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const draftOrderInput = {
      input: {
        lineItems: lineItems,
        customer: customerInput,
        note: orderBlock.note + (variantName ? `\nSelected by customer: ${variantName}` : ""),
        tags: [`draft-order-app-id-${id}`], // Link to our internal OrderBlock ID
      },
    };
    
    console.log("DEBUG: draftOrderInput sent to Shopify for creation:", JSON.stringify(draftOrderInput, null, 2));

    const response = await admin.graphql(createDraftOrderMutation, draftOrderInput);
    const responseJson = await response.json();

    if (responseJson.errors) {
      console.error("Shopify GraphQL API graphQLErrors (create):", JSON.stringify(responseJson.errors, null, 2));
      throw new Error("Shopify GraphQL API error: " + responseJson.errors.map(err => err.message).join(", "));
    }
    if (responseJson.data.draftOrderCreate.userErrors.length > 0) {
      const userErrors = responseJson.data.draftOrderCreate.userErrors;
      console.error("Shopify Draft Order creation user errors:", JSON.stringify(userErrors, null, 2));
      const formattedErrors = userErrors.map(err => {
        return `${err.field ? `Field '${err.field.join(".")}'`: "General"}: ${err.message}`;
      }).join("; ");
      throw new Error("Shopify Draft Order creation failed: " + formattedErrors);
    }

    const shopifyDraftOrder = responseJson.data.draftOrderCreate.draftOrder;
    const shopifyDraftOrderId = shopifyDraftOrder.id;
    const checkoutUrl = shopifyDraftOrder.invoiceUrl;

    // 6. UPDATE OUR ORDER BLOCK WITH SHOPIFY DRAFT ORDER DETAILS
    await db.orderBlock.update({
      where: { id: id },
      data: {
        shopifyDraftOrderId: shopifyDraftOrderId,
        checkoutUrl: checkoutUrl,
        isPurchased: false, // Newly created Draft Order is not yet purchased
      },
    });

    return jsonResponse({
      success: true,
      checkoutUrl: checkoutUrl,
    });

  } catch (error) {
    console.error("Checkout Server Error:", error);
    return jsonResponse({ success: false, error: "Server error processing checkout: " + error.message }, 500);
  }
}