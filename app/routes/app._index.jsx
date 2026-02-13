import { useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  Text,
  MediaCard
} from "@shopify/polaris";
import { PlusIcon, ViewIcon } from "@shopify/polaris-icons";

export default function Index() {
  const navigate = useNavigate();

  return (
    <Page>
      <Layout>
        <Layout.Section>
          <MediaCard
            title="Manage Your Custom Orders"
            primaryAction={{
              content: 'Create New Draft Order',
              onAction: () => navigate("/app/create-draft-order"),
              icon: PlusIcon
            }}
            description="Start building a new custom draft order for your customers with personalized options, images, and videos."
            popoverContent="Create a custom product with dynamic options and generate a shareable checkout link."
            portrait={false}
          >
            <img
              alt=""
              width="100%"
              height="100%"
              style={{
                objectFit: 'cover',
                objectPosition: 'center',
              }}
              src="https://cdn.shopify.com/s/files/1/0533/2088/1429/files/placeholder-images-product-url1.png?2022"
            />
          </MediaCard>
        </Layout.Section>
        <Layout.Section>
          <MediaCard
            title="View Existing Draft Orders"
            primaryAction={{
              content: 'View All Draft Orders',
              onAction: () => navigate("/app/list-draft-orders"),
              icon: ViewIcon
            }}
            description="Review, manage, or delete custom draft orders you've previously created."
            popoverContent="See all your created draft orders, their status, and customer links."
            portrait={false}
          >
            <img
              alt=""
              width="100%"
              height="100%"
              style={{
                objectFit: 'cover',
                objectPosition: 'center',
              }}
              src="https://cdn.shopify.com/s/files/1/0533/2088/1429/files/placeholder-images-product-url2.png?2022"
            />
          </MediaCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
}