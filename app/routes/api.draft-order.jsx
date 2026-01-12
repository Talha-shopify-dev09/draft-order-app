// app/routes/api.draft-order.jsx
import { authenticate } from "../shopify.server";
import crypto from "crypto";

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);

  try {
    const body = await request.json();
    const { customerEmail, customerName, productTitle, note, variants, productImage } = body;

    // Validate required fields
    if (!customerEmail || !customerName || !productTitle || !variants || variants.length === 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Missing required fields" 
      }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Generate SHORT unique token (8 characters for tag limit)
    const token = crypto.randomBytes(4).toString('hex'); // 8 characters

    // Split customer name
    const nameParts = customerName.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '';

    // Use the first variant as default for draft order
    const defaultVariant = variants[0];

    // Step 1: Create draft order with image URL (much smaller than base64)
    const draftOrderData = {
      draft_order: {
        line_items: [{
          title: `${productTitle} - ${defaultVariant.name}`,
          quantity: 1,
          price: defaultVariant.price,
          custom: true
        }],
        customer: {
          email: customerEmail,
          first_name: firstName,
          last_name: lastName
        },
        email: customerEmail,
        note: note || "",
        use_customer_default_address: false,
        tags: `custom,t_${token}`,
        note_attributes: [
          {
            name: "_token",
            value: token
          },
          {
            name: "_variants",
            value: JSON.stringify(variants)
          },
          {
            name: "_title",
            value: productTitle
          },
          {
            name: "_img",
            value: productImage || "" // Store Cloudinary URL
          }
        ]
      }
    };

    const createResponse = await fetch(
      `https://${session.shop}/admin/api/2024-10/draft_orders.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': session.accessToken
        },
        body: JSON.stringify(draftOrderData)
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

    const draftOrderId = createResult.draft_order.id;

    // Step 2: Generate customer link - now pointing to store page
    const customerLink = `https://${session.shop}/pages/custom-order?token=${token}`;

    console.log('Customer Link:', customerLink);
    console.log('Email should be sent to:', customerEmail);

    // Return success with customer link
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