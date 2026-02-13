import { useNavigate, useLoaderData } from "react-router";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  Text,
  MediaCard,
  InlineStack,
  Box,
  Link
} from "@shopify/polaris";
import { PlusIcon, ViewIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const [purchased, activeLinks, checkoutPending, shopCurrency] = await Promise.all([
    db.orderBlock.findMany({
      where: { shop, isPurchased: true },
      select: { finalPrice: true, currencyCode: true },
    }),
    db.orderBlock.count({ where: { shop } }),
    db.orderBlock.count({
      where: { shop, isPurchased: false, checkoutUrl: { not: null } },
    }),
    admin
      .graphql(
        `
        query {
          shop {
            currencyCode
          }
        }
        `,
      )
      .then((r) => r.json())
      .then((d) => d?.data?.shop?.currencyCode || "USD")
      .catch(() => "USD"),
  ]);

  let totalSales = 0;
  let currency = "";
  for (const o of purchased) {
    const num = Number(o.finalPrice);
    if (Number.isFinite(num)) {
      totalSales += num;
      if (!currency && o.currencyCode) currency = o.currencyCode;
    }
  }

  return {
    totalSales: totalSales.toFixed(2),
    currency: shopCurrency || currency || "USD",
    activeLinks: activeLinks,
    checkoutPending: checkoutPending,
  };
};

export default function Index() {
  const navigate = useNavigate();
  const { totalSales, currency, activeLinks, checkoutPending } = useLoaderData();

  return (
    <Page>
      <Layout>
        <Layout.Section>
          <Card>
            <Box padding="400" background="bg-surface-secondary" borderRadius="200">
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Sales Overview</Text>
                <InlineStack gap="600">
                  <BlockStack gap="100">
                    <Text variant="bodySm" as="p" color="subdued">Total Sales</Text>
                    <Text variant="headingLg" as="p">{totalSales} {currency}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text variant="bodySm" as="p" color="subdued">Active Draft Links</Text>
                    <Text variant="headingLg" as="p">{activeLinks}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text variant="bodySm" as="p" color="subdued">Checkout Links (Not Purchased)</Text>
                    <Text variant="headingLg" as="p">{checkoutPending}</Text>
                  </BlockStack>
                </InlineStack>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Box padding="200" background="bg-surface-secondary" borderRadius="200">
            <MediaCard
              title="Manage Your Custom Orders"
              primaryAction={{
                content: "Create New Draft Order",
                onAction: () => navigate("/app/create-draft-order"),
                icon: PlusIcon,
              }}
              description="Start building a new custom draft order for your customers with personalized options, images, and videos."
              popoverContent="Create a custom product with dynamic options and generate a shareable checkout link."
              portrait={false}
            />
          </Box>
        </Layout.Section>
        <Layout.Section>
          <Box padding="200" background="bg-surface-secondary" borderRadius="200">
            <MediaCard
              title="View Existing Draft Orders"
              primaryAction={{
                content: "View All Draft Orders",
                onAction: () => navigate("/app/list-draft-orders"),
                icon: ViewIcon,
              }}
              description="Review, manage, or delete custom draft orders you've previously created."
              popoverContent="See all your created draft orders, their status, and customer links."
              portrait={false}
            />
          </Box>
        </Layout.Section>
        <Layout.Section>
          <Card>
            <Box padding="300">
              <InlineStack gap="200">
                <Text variant="bodySm" as="p" color="subdued">
                  Powered by{" "}
                  <Link url="https://socoba.co" external>
                    Socoba
                  </Link>
                </Text>
                <Text variant="bodySm" as="p" color="subdued">
                  Contact:{" "}
                  <Link url="mailto:socoba.apps@gmail.com" external>
                    socoba.apps@gmail.com
                  </Link>
                </Text>
              </InlineStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
