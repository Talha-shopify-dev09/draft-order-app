import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
ResourceList,
  ResourceItem,
  Thumbnail,
  Text,
  Link,
  Button,
  BlockStack,
  EmptyState,
  Box,
  InlineStack
} from "@shopify/polaris";
import { DeleteIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// LOADER: Fetch all OrderBlocks for the current shop
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    const orders = await db.orderBlock.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    });

    // Parse JSON strings back to objects/arrays for the UI
    const parsedOrders = orders.map(order => ({
      ...order,
      images: JSON.parse(order.images || "[]"),
      optionGroups: JSON.parse(order.optionGroups || "[]"),
    }));

    return { orders: parsedOrders, shop };
  } catch (error) {
    console.error("Error fetching orders:", error);
    return { orders: [], shop, error: error.message };
  }
};

// ACTION: Handle deletion of an OrderBlock
export const action = async ({ request }) => {
  const { authenticate } = await import("../shopify.server"); // Import dynamically
  await authenticate.admin(request);

  const formData = await request.formData();
  const orderId = formData.get("orderId");
  const _action = formData.get("_action");

  if (_action === "deleteOrder" && orderId) {
    try {
      await db.orderBlock.delete({
        where: { id: orderId },
      });
      return { success: true };
    } catch (error) {
      console.error("Error deleting order:", error);
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: "Invalid action" };
};

export default function ListDraftOrders() {
  const { orders, shop } = useLoaderData();
  const fetcher = useFetcher();

  // Determine if a delete operation is in progress for a specific order
  const isDeleting = (orderId) => fetcher.state === "submitting" && fetcher.formData?.get("orderId") === orderId;

  const getCustomerLink = (orderId) => {
    // Assuming the appUrl from shopify.server.js is accessible or you can construct it
    // For now, construct a relative path based on the structure of custom-order.liquid
    // This needs to match how your theme block generates the URL
    return `https://${shop}/pages/custom-order?token=${orderId}`;
  };

  return (
    <Page title="My Draft Orders">
      <Layout>
        <Layout.Section>
          <Card>
            {orders.length === 0 ? (
              <EmptyState
                heading="No draft orders created yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Create your first custom draft order and send personalized links to your customers.</p>
                <Button url="/app/create-draft-order">Create Draft Order</Button>
              </EmptyState>
            ) : (
              <ResourceList
                resourceName={{ singular: "draft order", plural: "draft orders" }}
                items={orders}
                renderItem={(order) => {
                  const { id, productTitle, customerEmail, images, createdAt } = order;
                  const primaryImage = images && images.length > 0 ? images[0] : null;
                  const customerLink = getCustomerLink(id);

                  return (
                    <ResourceItem
                      id={id}
                      url={customerLink} // Link the item itself to the customer view
                      media={
                        <Thumbnail
                          source={primaryImage || "https://cdn.shopify.com/s/files/1/0533/2088/1429/files/placeholder-images-product-square.png?format=webp&v=1653357753"}
                          alt={productTitle}
                          size="medium"
                        />
                      }
                      accessibilityLabel={`View details for ${productTitle}`}
                    >
                      <BlockStack gap="200">
                        <Text variant="bodyLg" fontWeight="bold" as="h3">
                          <Link url={customerLink} removeUnderline monochrome>{productTitle}</Link>
                        </Text>
                        <InlineStack gap="400">
                           <Text variant="bodyMd" color="subdued">
                             Customer: {customerEmail || "N/A"}
                           </Text>
                           <Text variant="bodyMd" color="subdued">
                              Status: <Text fontWeight="bold" as="span" color="warning">Pending Checkout</Text> {/* Placeholder */}
                           </Text>
                        </InlineStack>
                        <Text variant="bodyMd" color="subdued">
                          Created: {new Date(createdAt).toLocaleDateString()}
                        </Text>
                        <Box>
                          <fetcher.Form method="post">
                            <input type="hidden" name="orderId" value={id} />
                            <input type="hidden" name="_action" value="deleteOrder" />
                            <Button
                              icon={DeleteIcon}
                              tone="critical"
                              variant="plain"
                              submit
                              loading={isDeleting(id)}
                              disabled={isDeleting(id)}
                            >
                              Delete
                            </Button>
                          </fetcher.Form>
                        </Box>
                      </BlockStack>
                    </ResourceItem>
                  );
                }}
              />
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
