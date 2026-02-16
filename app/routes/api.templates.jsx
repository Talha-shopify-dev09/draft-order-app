// app/routes/api.templates.jsx

import db from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Helper to create JSON responses
  const jsonResponse = (data, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const templates = await db.template.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        productTitle: true,
        optionGroups: true,
      },
    });

    const normalized = templates.map(t => ({
      id: t.id,
      name: t.name || "Untitled Template",
      productTitle: t.productTitle || "",
      optionGroups: JSON.parse(t.optionGroups || "[]"),
    }));

    return jsonResponse({ success: true, templates: normalized });

  } catch (error) {
    console.error("Template Fetch Error:", error);
    return jsonResponse({ success: false, message: error.message }, 500);
  }
}
