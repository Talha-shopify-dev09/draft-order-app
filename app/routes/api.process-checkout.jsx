// app/routes/api.process-checkout.jsx
import db from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";

// Helper to construct a CORS-enabled response for a specific shop
const createCorsResponse = (shop, data, status = 200) => {
  const origin = `https://${shop}`;
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
  return new Response(JSON.stringify(data), { status, headers });
};

// Handle OPTIONS (Pre-flight) by trying to read the shop from the body if possible
export async function loader({ request }) {
  // For OPTIONS, we might not have a body, but we can try to get the origin header.
  // A more robust solution might involve a fixed list of allowed origins if the shop is not available.
  // However, for this app, we'll rely on the shop being sent in the actual request.
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Origin": origin || "*", // Fallback for safety, but browser should send Origin
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: headers, status: 204 });
  }
  return new Response("Method Not Allowed", { status: 405, headers: headers });
}


// 3. Handle POST
export async function action({ request }) {
  let shopFromClient = "";
  try {
    const body = await request.json();
    shopFromClient = body.shop; // Keep shop for CORS response even on error

    // 1. Validate inputs
    if (!body.id || !body.price || !shopFromClient) {
      return createCorsResponse(shopFromClient || "*", { success: false, error: "Missing ID, shop, or price" }, 400);
    }

    // 2. Fetch OrderBlock from our DB
    const orderBlock = await db.orderBlock.findUnique({
      where: { id: body.id }, // Find by ID only
    });

    if (!orderBlock) {
      return createCorsResponse(shopFromClient, { success: false, error: "Custom order not found" }, 404);
    }
    
    if (orderBlock.checkoutUrl && !orderBlock.isPurchased) {
        return createCorsResponse(shopFromClient, { success: true, checkoutUrl: orderBlock.checkoutUrl });
    }

    // 3. Authenticate with Shopify
    // App Proxy requests won't have an embedded session, so fall back to unauthenticated admin.
    let admin;
    try {
      const authResult = await authenticate.admin(request);
      admin = authResult.admin;
    } catch (error) {
      const unauth = await unauthenticated.admin(shopFromClient);
      admin = unauth.admin;
    }

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
    if (body.variantName) {
      lineItemCustomAttributes.push({ key: "Selected Options", value: body.variantName });
    }
    if (body.customImage) {
      lineItemCustomAttributes.push({ key: "Preview Image", value: body.customImage });
    }

    const priceNumber = Number(String(body.price).replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(priceNumber) || priceNumber < 0) {
      return createCorsResponse(shopFromClient, { success: false, error: "Invalid price" }, 400);
    }
    const priceAmount = priceNumber.toFixed(2);
    // Always use shop currency to avoid invalid MoneyInput
    let currencyCode = "USD";
    try {
      const shopResp = await admin.graphql(`
        query {
          shop {
            currencyCode
          }
        }
      `);
      const shopJson = await shopResp.json();
      currencyCode = shopJson?.data?.shop?.currencyCode || currencyCode;
    } catch (e) {
      // Fallback to provided currency if shop query fails
      currencyCode = (body.currency || currencyCode).toString().trim().toUpperCase();
    }

    const lineItems = [
      {
        title: orderBlock.productTitle || "Custom Product",
        quantity: 1,
        // MoneyInput expected in GraphQL
        originalUnitPrice: { amount: priceAmount, currencyCode },
        customAttributes: lineItemCustomAttributes,
      },
    ];

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
        note: `${orderBlock.note || ""}${body.variantName ? `\nSelected by customer: ${body.variantName}` : ""}`,
        tags: [`draft-order-app-id-${body.id}`],
      },
    };

    if (orderBlock.customerEmail) {
      // DraftOrderInput supports email/customerId, not customer object
      draftOrderInput.input.email = orderBlock.customerEmail;
    }
    
    const response = await admin.graphql(createDraftOrderMutation, { variables: draftOrderInput });
    const responseJson = await response.json();

    if (responseJson.errors) {
      console.error("Shopify GraphQL API graphQLErrors (create):", JSON.stringify(responseJson.errors, null, 2));
      return createCorsResponse(shopFromClient, {
        success: false,
        error: "Shopify GraphQL API error",
        graphQLErrors: responseJson.errors,
      }, 500);
    }

    const userErrors = responseJson.data?.draftOrderCreate?.userErrors || [];
    if (userErrors.length > 0) {
      console.error("Shopify Draft Order creation user errors:", JSON.stringify(userErrors, null, 2));
      const formattedErrors = userErrors.map(err => `${err.field ? `Field '${err.field.join(".")}'`: "General"}: ${err.message}`).join("; ");
      return createCorsResponse(shopFromClient, {
        success: false,
        error: "Shopify Draft Order creation failed: " + formattedErrors,
        userErrors,
      }, 400);
    }

    const shopifyDraftOrder = responseJson.data.draftOrderCreate.draftOrder;
    
    await db.orderBlock.update({
      where: { id: body.id },
      data: {
        shopifyDraftOrderId: shopifyDraftOrder.id,
        checkoutUrl: shopifyDraftOrder.invoiceUrl,
        isPurchased: false,
      },
    });

    return createCorsResponse(shopFromClient, {
      success: true,
      checkoutUrl: shopifyDraftOrder.invoiceUrl,
    });

  } catch (error) {
    console.error("Checkout Server Error:", error);
    return createCorsResponse(shopFromClient || "*", { success: false, error: "Server error processing checkout: " + error.message }, 500);
  }
}
