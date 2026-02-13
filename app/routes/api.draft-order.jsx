import db from "../db.server";
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  // 1. Authenticate
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    const body = await request.json();
    const { 
      customerEmail, 
      customerName, 
      productTitle, 
      note, 
      optionGroups, 
      images, 
      video, 
      isTemplate, 
      templateName 
    } = body;

    // 2. Validation
    if (isTemplate) {
      if (!productTitle || !templateName) {
        return Response.json(
          { success: false, error: "Template Name and Product Title required" },
          { status: 400 }
        );
      }
    } else {
      if (!productTitle) {
        return Response.json(
          { success: false, error: "Product Title is required" },
          { status: 400 }
        );
      }
    }

    // 3. Prepare Data
    const imagesString = JSON.stringify(images || []);
    const optionsString = JSON.stringify(optionGroups || []);

    let createdRecord;

    if (isTemplate) {
      // --- SAVE AS TEMPLATE ---
      createdRecord = await db.template.create({
        data: {
          shop,
          name: templateName,
          productTitle,
          optionGroups: optionsString,
          // images: imagesString, // Uncomment if your Template model has images
        },
      });

      return Response.json({ success: true, isTemplate: true });

    } else {
      // --- SAVE AS ORDER BLOCK IN OUR DB ---
      const createdRecord = await db.orderBlock.create({
        data: {
          shop,
          productTitle,
          customerName: customerName || "",
          customerEmail: customerEmail || "",
          note: note || "",
          optionGroups: optionsString,
          images: imagesString,
          video: video || null,
        },
      });

      // --- CALCULATE TOTAL PRICE ---
      let totalPrice = 0;
      optionGroups.forEach(group => {
        group.values.forEach(val => {
          totalPrice += parseFloat(val.price || 0);
        });
      });
      // Ensure a base price if no options or price is 0
      if (totalPrice === 0) {
        totalPrice = 1.00; // Shopify Draft Orders require a positive price. Minimum 1.00.
      }

      // --- PREPARE LINE ITEMS FOR SHOPIFY DRAFT ORDER ---
      const lineItemCustomAttributes = [];
      optionGroups.forEach(group => {
          group.values.forEach(val => {
              lineItemCustomAttributes.push({ key: `${group.name} - ${val.label}`, value: val.price });
          });
      });

      // Add main image as custom attribute if available
      if (images && images.length > 0) {
        lineItemCustomAttributes.push({ key: "Product Image", value: images[0] });
      }
      if (video) {
        lineItemCustomAttributes.push({ key: "Product Video", value: video });
      }


      const lineItems = [
        {
          title: productTitle,
          quantity: 1,
          originalUnitPrice: parseFloat(totalPrice.toFixed(2)),
          customAttributes: lineItemCustomAttributes,
        },
      ];

      // --- PREPARE CUSTOMER FOR SHOPIFY DRAFT ORDER ---
      let customerInput = null;
      if (customerEmail) {
        customerInput = {
          email: customerEmail,
          firstName: customerName || "",
          lastName: "", // Assuming no last name from current form
        };
      }

      // --- CREATE SHOPIFY DRAFT ORDER ---
      const createDraftOrderMutation = `
        mutation draftOrderCreate($input: DraftOrderInput!) {
          draftOrderCreate(input: $input) {
            draftOrder {
              id
              invoiceUrl
              customer {
                id
                email
                displayName
              }
              lineItems {
                nodes {
                  title
                  quantity
                  originalUnitPrice {
                    amount
                  }
                  customAttributes {
                    key
                    value
                  }
                }
              }
              tags
              note
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
          note: note,
          tags: [`draft-order-app-id-${createdRecord.id}`], // Link to our internal OrderBlock ID
        },
      };
      
      const authResult = await authenticate.admin(request); // Get the full auth result
      const admin = authResult.admin; // Explicitly get the admin client

      if (!admin || typeof admin.graphql !== 'function') {
        throw new Error("Shopify Admin GraphQL client is not available. Ensure proper authentication and setup.");
      }

      const response = await admin.graphql(createDraftOrderMutation, draftOrderInput);
      const responseJson = await response.json();

      if (responseJson.errors || responseJson.data.draftOrderCreate.userErrors.length > 0) {
        const errors = responseJson.errors?.map(err => err.message) || responseJson.data.draftOrderCreate.userErrors.map(err => err.message);
        throw new Error("Shopify Draft Order creation failed: " + errors.join(", "));
      }

      const shopifyDraftOrder = responseJson.data.draftOrderCreate.draftOrder;
      const shopifyDraftOrderId = shopifyDraftOrder.id;
      const checkoutUrl = shopifyDraftOrder.invoiceUrl;

      // --- UPDATE OUR ORDER BLOCK WITH SHOPIFY DRAFT ORDER DETAILS ---
      await db.orderBlock.update({
        where: { id: createdRecord.id },
        data: {
          shopifyDraftOrderId: shopifyDraftOrderId,
          checkoutUrl: checkoutUrl,
        },
      });

      return Response.json({ success: true, customerLink: checkoutUrl });
    }

  } catch (error) {
    console.error("Error creating order block:", error);
    return Response.json(
      { success: false, error: "Server error: " + error.message },
      { status: 500 }
    );
  }
}

export async function loader() {
  return new Response("Method not allowed", { status: 405 });
}