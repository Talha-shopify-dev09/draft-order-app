import { authenticate } from "../shopify.server";
import crypto from "crypto";

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);

  try {
    const body = await request.json();
    const { 
      customerEmail, 
      customerName, 
      productTitle, 
      note, 
      optionGroups, // Renamed from 'variants' to support new structure
      productImage,
      isTemplate,   // New: Check if we are saving a template
      templateName  // New: Name of the template
    } = body;

    // --- 1. Validation Logic ---
    if (isTemplate) {
      // For Templates: We only need Title and Template Name
      if (!productTitle || !templateName) {
         return new Response(JSON.stringify({ 
           success: false, 
           error: "Template Name and Product Title are required" 
         }), { 
           status: 400,
           headers: { "Content-Type": "application/json" }
         });
      }
    } else {
      // For Orders: We need Customer Info
      if (!customerEmail || !customerName || !productTitle || !optionGroups) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "Missing required fields (Name, Email, Title)" 
        }), { 
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // --- 2. Data Preparation ---
    const token = crypto.randomBytes(4).toString('hex'); // 8 characters
    let tags = "";
    
    // Clean Option Groups (Ensure numbers are sanitized)
    const cleanOptionGroups = optionGroups ? optionGroups.map(g => ({
      name: g.name,
      values: g.values.map(v => ({
        id: v.id,
        label: v.label,
        price: v.price || "0"
      }))
    })) : [];

    // Note Attributes Setup
    const noteAttributes = [
      { name: "_title", value: productTitle },
      { name: "_img", value: productImage || "" },
      { name: "_option_groups", value: JSON.stringify(cleanOptionGroups) } // Storing full option structure
    ];

    if (isTemplate) {
      tags = "app_template";
      noteAttributes.push({ name: "_template_name", value: templateName });
    } else {
      tags = `custom,t_${token}`;
      noteAttributes.push({ name: "_token", value: token });
    }

    // Line Items
    // We set price to 0.00 initially. The final price depends on customer selection on the frontend.
    const lineItems = [{
      title: productTitle,
      quantity: 1,
      price: "0.00",
      custom: true
    }];

    // --- 3. Construct Payload ---
    const draftOrderPayload = {
      line_items: lineItems,
      tags: tags,
      note: note || "",
      note_attributes: noteAttributes,
      use_customer_default_address: false
    };

    // Add Customer (Only for real orders, optional for templates)
    if (!isTemplate && customerEmail && customerName) {
      const nameParts = customerName.trim().split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || '';

      draftOrderPayload.customer = {
        email: customerEmail,
        first_name: firstName,
        last_name: lastName
      };
      draftOrderPayload.email = customerEmail;
    }

    // --- 4. Call Shopify API ---
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
      console.error('Draft order creation error:', createResult);
      return new Response(JSON.stringify({
        success: false,
        error: typeof createResult.errors === 'string' 
          ? createResult.errors 
          : JSON.stringify(createResult.errors)
      }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // --- 5. Return Success ---
    
    // Scenario A: Template Saved
    if (isTemplate) {
      return new Response(JSON.stringify({
        success: true,
        isTemplate: true,
        message: "Template saved successfully"
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Scenario B: Order Created (Return Link)
    const customerLink = `https://${session.shop}/pages/custom-order?token=${token}`;

    return new Response(JSON.stringify({
      success: true,
      draftOrder: createResult.draft_order,
      customerLink: customerLink,
      token: token,
      message: "Draft order created successfully! Copy the link to send to customer."
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Error creating draft order:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || "An unexpected error occurred"
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function loader() {
  return new Response(JSON.stringify({ 
    error: "Method not allowed" 
  }), { 
    status: 405,
    headers: { "Content-Type": "application/json" }
  });
}