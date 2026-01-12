import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  // Helper to create JSON responses
  const jsonResponse = (data, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  };

  if (!shop) return jsonResponse({ success: false, message: "Missing shop" }, 400);

  try {
    // Fetch all draft orders tagged with 'app_template'
    const response = await fetch(
      `https://${shop}/admin/api/2024-10/draft_orders.json?status=open&limit=50`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();
    
    // Filter purely for our templates
    const templates = (data.draft_orders || [])
      .filter(order => order.tags && order.tags.includes('app_template'))
      .map(t => {
        // Parse the stored data
        const getAttr = (name) => {
            const attr = t.note_attributes?.find(a => a.name === name);
            return attr ? attr.value : null;
        };

        return {
          id: t.id,
          name: getAttr('_template_name') || t.line_items[0]?.title || "Untitled Template",
          optionGroups: JSON.parse(getAttr('_option_groups') || '[]'),
          productTitle: getAttr('_title'),
          img: getAttr('_img')
        };
      });

    return jsonResponse({ success: true, templates });

  } catch (error) {
    console.error("Template Fetch Error:", error);
    return jsonResponse({ success: false, message: error.message }, 500);
  }
}