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
      // --- SAVE AS ORDER BLOCK ---
      createdRecord = await db.orderBlock.create({
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

      // 4. Generate Link
      const customerLink = `https://${shop}/pages/custom-order?token=${createdRecord.id}`;

      return Response.json({ success: true, customerLink });
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