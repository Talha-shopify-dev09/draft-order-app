import { json } from "@remix-run/node";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function loader({ request }) {
  // 1. HANDLE PRE-FLIGHT (OPTIONS) REQUESTS
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const shop = url.searchParams.get('shop');

  if (!token || !shop) {
    return json({ success: false, error: "Token and shop are required" }, { 
        status: 400, 
        headers: corsHeaders 
    });
  }

  try {
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    // Fallback if the token is missing in .env
    if (!accessToken) throw new Error("Server Misconfiguration: Access Token missing");

    // Fetch from Shopify Admin
    const response = await fetch(
      `https://${shop}/admin/api/2024-10/draft_orders.json?limit=250`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = await response.json();
    
    if (!data.draft_orders) {
        // If Shopify returns an error (like invalid permissions)
        console.error("Shopify Error:", data);
        throw new Error("Failed to fetch draft orders from Shopify");
    }

    const draftOrder = data.draft_orders.find(order => 
      order.tags && order.tags.includes(`t_${token}`)
    );

    if (!draftOrder) {
      return json({ success: false, error: "Order not found" }, { 
          status: 404, 
          headers: corsHeaders 
      });
    }

    // Extract note_attributes
    const getAttr = (name) => {
      const attr = (draftOrder.note_attributes || []).find(a => a.name === name);
      return attr ? attr.value : null;
    };

    const variantsJson = getAttr('_variants');
    const productTitle = getAttr('_title') || "Custom Order";
    const productImage = getAttr('_img') || "";
    
    let variants = [];
    try {
        variants = variantsJson ? JSON.parse(variantsJson) : [];
    } catch (e) {
        console.error("JSON Parse Error:", e);
    }

    return json({
      success: true,
      draftOrderId: draftOrder.id,
      productTitle,
      productImage,
      note: draftOrder.note || '',
      variants,
      customerEmail: draftOrder.email,
      shop
    }, { 
        status: 200, 
        headers: corsHeaders 
    });

  } catch (error) {
    console.error('Server Error:', error);
    return json({ success: false, error: error.message }, { 
        status: 500, 
        headers: corsHeaders 
    });
  }
}