// app/routes/app-proxy.get-order.jsx

export async function loader({ request }) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const shop = url.searchParams.get('shop');

  if (!token || !shop) {
    return new Response(JSON.stringify({
      success: false,
      error: "Token and shop are required"
    }), {
      status: 400,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  try {
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    
    if (!accessToken) {
      throw new Error("Shopify access token not configured");
    }

    // Search for draft order by shortened token tag
    const response = await fetch(
      `https://${shop}/admin/api/2026-01/draft_orders.json?limit=250`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = await response.json();

    // Find draft order with matching token tag
    const draftOrder = data.draft_orders?.find(order => 
      order.tags?.includes(`t_${token}`)
    );

    if (!draftOrder) {
      return new Response(JSON.stringify({
        success: false,
        error: "Order not found"
      }), {
        status: 404,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // Extract data from note_attributes
    const noteAttributes = draftOrder.note_attributes || [];
    const getAttr = (name) => {
      const attr = noteAttributes.find(a => a.name === name);
      return attr ? attr.value : null;
    };

    const variantsJson = getAttr('_variants');
    const productTitle = getAttr('_title') || draftOrder.line_items[0]?.title || 'Product';
    const hasImage = getAttr('_img') === 'yes';

    let variants = [];
    if (variantsJson) {
      try {
        variants = JSON.parse(variantsJson);
      } catch (e) {
        console.error('Failed to parse variants:', e);
      }
    }

    // Get image from metafields
    let productImage = null;
    if (hasImage) {
      try {
        const metafieldResponse = await fetch(
          `https://${shop}/admin/api/2026-01/draft_orders/${draftOrder.id}/metafields.json`,
          {
            headers: {
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json'
            }
          }
        );

        const metafieldData = await metafieldResponse.json();
        const imageMetafield = metafieldData.metafields?.find(
          m => m.namespace === 'custom_order' && m.key === 'product_image'
        );
        
        if (imageMetafield) {
          productImage = imageMetafield.value;
        }
      } catch (metafieldError) {
        console.error('Error fetching metafields:', metafieldError);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      draftOrderId: draftOrder.id,
      productTitle: productTitle,
      productImage: productImage,
      note: draftOrder.note || '',
      variants: variants,
      customerEmail: draftOrder.email,
      shop: shop
    }), {
      status: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (error) {
    console.error('Error fetching order:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || "Failed to fetch order"
    }), {
      status: 500,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}