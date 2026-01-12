// app/routes/api.draft-order.jsx
import crypto from "crypto"; // Native Node modules are fine to keep at top

export async function action({ request }) {
  // DYNAMIC IMPORT: Fixes build error
  const { authenticate } = await import("../shopify.server");
  
  const { admin, session } = await authenticate.admin(request);

  try {
    const body = await request.json();
    const { 
      customerEmail, 
      customerName, 
      productTitle, 
      note, 
      optionGroups,
      productImage,
      isTemplate,
      templateName 
    } = body;

    // Validation
    if (isTemplate) {
      if (!productTitle || !templateName) {
         return new Response(JSON.stringify({ success: false, error: "Template Name and Product Title required" }), { status: 400, headers: { "Content-Type": "application/json" }});
      }
    } else {
      if (!customerEmail || !customerName || !productTitle || !optionGroups) {
        return new Response(JSON.stringify({ success: false, error: "Missing required fields" }), { status: 400, headers: { "Content-Type": "application/json" }});
      }
    }

    // Data Preparation
    const token = crypto.randomBytes(4).toString('hex');
    let tags = "";
    
    const cleanOptionGroups = optionGroups ? optionGroups.map(g => ({
      name: g.name,
      values: g.values.map(v => ({
        id: v.id,
        label: v.label,
        price: v.price || "0"
      }))
    })) : [];

    const noteAttributes = [
      { name: "_title", value: productTitle },
      { name: "_img", value: productImage || "" },
      { name: "_option_groups", value: JSON.stringify(cleanOptionGroups) }
    ];

    if (isTemplate) {
      tags = "app_template";
      noteAttributes.push({ name: "_template_name", value: templateName });
    } else {
      tags = `custom,t_${token}`;
      noteAttributes.push({ name: "_token", value: token });
    }

    const draftOrderPayload = {
      line_items: [{
        title: productTitle,
        quantity: 1,
        price: "0.00",
        custom: true
      }],
      tags: tags,
      note: note || "",
      note_attributes: noteAttributes,
      use_customer_default_address: false
    };

    if (!isTemplate && customerEmail && customerName) {
      const nameParts = customerName.trim().split(' ');
      draftOrderPayload.customer = {
        email: customerEmail,
        first_name: nameParts[0],
        last_name: nameParts.slice(1).join(' ') || ''
      };
      draftOrderPayload.email = customerEmail;
    }

    // Call Shopify API
    const createResponse = await fetch(
      `https://${session.shop}/admin/api/2024-10/draft_orders.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': session.accessToken
        },
        body: JSON.stringify({ draft_order: draftOrderPayload })
      }
    );

    const createResult = await createResponse.json();

    if (!createResponse.ok || createResult.errors) {
      return new Response(JSON.stringify({
        success: false,
        error: JSON.stringify(createResult.errors)
      }), { status: 400, headers: { "Content-Type": "application/json" }});
    }

    // Return Success
    if (isTemplate) {
      return new Response(JSON.stringify({ success: true, isTemplate: true }), { status: 200, headers: { "Content-Type": "application/json" }});
    }

    const customerLink = `https://${session.shop}/pages/custom-order?token=${token}`;
    return new Response(JSON.stringify({
      success: true,
      draftOrder: createResult.draft_order,
      customerLink: customerLink
    }), { status: 200, headers: { "Content-Type": "application/json" }});

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { "Content-Type": "application/json" }});
  }
}

export async function loader() {
  return new Response("Method not allowed", { status: 405 });
}