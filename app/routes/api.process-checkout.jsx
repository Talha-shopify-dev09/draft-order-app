// app/routes/api.process-checkout.jsx
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  try {
    const body = await request.json();
    const { token, draftOrderId, variantName, price } = body;

    if (!token || !draftOrderId) {
      return new Response(JSON.stringify({
        success: false,
        error: "Missing required parameters"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Authenticate with public app proxy
    const { admin, session } = await authenticate.public.appProxy(request);

    // Update draft order with selected variant
    const updateResponse = await fetch(
      `https://${session.shop}/admin/api/2024-10/draft_orders/${draftOrderId}.json`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': session.accessToken
        },
        body: JSON.stringify({
          draft_order: {
            line_items: [{
              title: `${variantName}`,
              quantity: 1,
              price: price,
              custom: true
            }]
          }
        })
      }
    );

    const updateResult = await updateResponse.json();

    if (!updateResponse.ok) {
      return new Response(JSON.stringify({
        success: false,
        error: "Failed to update order"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Complete the draft order to get invoice URL
    const completeResponse = await fetch(
      `https://${session.shop}/admin/api/2024-10/draft_orders/${draftOrderId}/complete.json`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': session.accessToken
        },
        body: JSON.stringify({
          payment_pending: true
        })
      }
    );

    const completeResult = await completeResponse.json();

    if (!completeResponse.ok) {
      return new Response(JSON.stringify({
        success: false,
        error: "Failed to complete order"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Get the order checkout URL
    const order = completeResult.draft_order;
    const checkoutUrl = order.invoice_url || `https://${session.shop}/cart`;

    return new Response(JSON.stringify({
      success: true,
      checkoutUrl: checkoutUrl
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Checkout error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || "Checkout failed"
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