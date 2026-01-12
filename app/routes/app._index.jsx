// app/routes/app._index.jsx
import { useState, useCallback } from "react";
import {
  Page,
  Card,
  FormLayout,
  TextField,
  Button,
  Banner,
  BlockStack,
  InlineStack,
  Thumbnail,
  Icon,
} from "@shopify/polaris";
import { DeleteIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  const [formData, setFormData] = useState({
    customerEmail: "",
    customerName: "",
    productTitle: "",
    note: "",
    productImage: null,
    productImagePreview: null,
  });

  const [variants, setVariants] = useState([
    { id: "1", name: "", price: "" }
  ]);

  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");

  const handleChange = useCallback((field) => (value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setErrorMessage('Please upload an image file');
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setErrorMessage('Image size should be less than 5MB');
        return;
      }

      setFormData(prev => ({
        ...prev,
        productImage: file,
        productImagePreview: URL.createObjectURL(file)
      }));
    }
  };

  const removeImage = () => {
    if (formData.productImagePreview) {
      URL.revokeObjectURL(formData.productImagePreview);
    }
    setFormData(prev => ({
      ...prev,
      productImage: null,
      productImagePreview: null
    }));
  };

  const addVariant = () => {
    setVariants([...variants, { 
      id: Date.now().toString(), 
      name: "", 
      price: "" 
    }]);
  };

  const removeVariant = (id) => {
    if (variants.length > 1) {
      setVariants(variants.filter(v => v.id !== id));
    }
  };

  const updateVariant = (id, field, value) => {
    setVariants(variants.map(v => 
      v.id === id ? { ...v, [field]: value } : v
    ));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setSuccessMessage("");
    setErrorMessage("");
    setGeneratedLink("");

    try {
      // Validate variants
      const validVariants = variants.filter(v => v.name && v.price);
      if (validVariants.length === 0) {
        setErrorMessage("Please add at least one variant with name and price");
        setLoading(false);
        return;
      }

      // Upload image to Cloudinary first
      let imageUrl = null;
      if (formData.productImage) {
        const imageBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(formData.productImage);
        });

        // Upload to Cloudinary
        const uploadResponse = await fetch("/api/upload-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ image: imageBase64 }),
        });

        const uploadData = await uploadResponse.json();
        if (uploadData.success) {
          imageUrl = uploadData.imageUrl;
        } else {
          setErrorMessage("Failed to upload image: " + uploadData.error);
          setLoading(false);
          return;
        }
      }

      const response = await fetch("/api/draft-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerEmail: formData.customerEmail,
          customerName: formData.customerName,
          productTitle: formData.productTitle,
          note: formData.note,
          variants: validVariants,
          productImage: imageUrl, // Now it's a URL, not base64
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccessMessage("Draft order created successfully!");
        setGeneratedLink(data.customerLink);
        
        // Reset form
        if (formData.productImagePreview) {
          URL.revokeObjectURL(formData.productImagePreview);
        }
        setFormData({
          customerEmail: "",
          customerName: "",
          productTitle: "",
          note: "",
          productImage: null,
          productImagePreview: null,
        });
        setVariants([{ id: "1", name: "", price: "" }]);
      } else {
        // Make sure we only set string error messages
        const errorMsg = typeof data.error === 'string' 
          ? data.error 
          : JSON.stringify(data.error) || "Failed to create draft order";
        setErrorMessage(errorMsg);
      }
    } catch (error) {
      const errorMsg = typeof error === 'string' 
        ? error 
        : error?.message || "An error occurred. Please try again.";
      setErrorMessage(errorMsg);
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const isFormValid =
    formData.customerEmail &&
    formData.customerName &&
    formData.productTitle &&
    variants.some(v => v.name && v.price);

  return (
    <Page title="Create Draft Order">
      <BlockStack gap="500">
        {successMessage && (
          <Banner
            title="Success"
            tone="success"
            onDismiss={() => {
              setSuccessMessage("");
              setGeneratedLink("");
            }}
          >
            <BlockStack gap="200">
              <p>{successMessage}</p>
              {generatedLink && (
                <div>
                  <p style={{ marginBottom: "8px" }}>
                    <strong>Customer Link:</strong>
                  </p>
                  <div style={{ 
                    padding: "10px", 
                    backgroundColor: "#f0f2ff", 
                    borderRadius: "4px",
                    wordBreak: "break-all"
                  }}>
                    <a 
                      href={generatedLink} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ color: "#5469d4" }}
                    >
                      {generatedLink}
                    </a>
                  </div>
                  <p style={{ marginTop: "8px", fontSize: "13px", color: "#666" }}>
                    Copy this link and send it to your customer via email
                  </p>
                </div>
              )}
            </BlockStack>
          </Banner>
        )}

        {errorMessage && (
          <Banner
            title="Error"
            tone="critical"
            onDismiss={() => setErrorMessage("")}
          >
            <p>{errorMessage}</p>
          </Banner>
        )}

        <Card>
          <BlockStack gap="400">
            <p>Create a custom draft order with variants and send a selection link to your customer.</p>

            <FormLayout>
              {/* Customer Information */}
              <FormLayout.Group>
                <TextField
                  label="Customer Name"
                  value={formData.customerName}
                  onChange={handleChange("customerName")}
                  placeholder="John Doe"
                  autoComplete="off"
                  requiredIndicator
                />
                <TextField
                  label="Customer Email"
                  type="email"
                  value={formData.customerEmail}
                  onChange={handleChange("customerEmail")}
                  placeholder="customer@example.com"
                  autoComplete="email"
                  requiredIndicator
                />
              </FormLayout.Group>

              {/* Product Information */}
              <TextField
                label="Product Title"
                value={formData.productTitle}
                onChange={handleChange("productTitle")}
                placeholder="Custom Product Name"
                autoComplete="off"
                requiredIndicator
              />

              {/* Image Upload */}
              <div>
                <label style={{ 
                  display: "block", 
                  marginBottom: "8px",
                  fontWeight: 500,
                  fontSize: "14px"
                }}>
                  Product Image
                </label>
                
                {formData.productImagePreview ? (
                  <BlockStack gap="300">
                    <Thumbnail
                      source={formData.productImagePreview}
                      alt={formData.productTitle}
                      size="large"
                    />
                    <InlineStack align="start">
                      <Button onClick={removeImage} icon={DeleteIcon}>
                        Remove Image
                      </Button>
                    </InlineStack>
                  </BlockStack>
                ) : (
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      style={{ display: "none" }}
                      id="image-upload"
                    />
                    <label htmlFor="image-upload">
                      <Button onClick={() => document.getElementById('image-upload').click()}>
                        Upload Image
                      </Button>
                    </label>
                  </div>
                )}
              </div>

              {/* Variants Section */}
              <div>
                <BlockStack gap="300">
                  <div style={{ 
                    display: "flex", 
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                    <label style={{ 
                      fontWeight: 500,
                      fontSize: "14px"
                    }}>
                      Product Variants
                    </label>
                    <Button onClick={addVariant} size="slim">
                      Add Variant
                    </Button>
                  </div>

                  {variants.map((variant, index) => (
                    <Card key={variant.id}>
                      <BlockStack gap="300">
                        <FormLayout>
                          <FormLayout.Group>
                            <TextField
                              label="Variant Name"
                              value={variant.name}
                              onChange={(value) => updateVariant(variant.id, "name", value)}
                              placeholder="e.g., Small, Red, Basic"
                              autoComplete="off"
                            />
                            <TextField
                              label="Price"
                              type="number"
                              value={variant.price}
                              onChange={(value) => updateVariant(variant.id, "price", value)}
                              placeholder="0.00"
                              prefix="$"
                              autoComplete="off"
                            />
                          </FormLayout.Group>
                        </FormLayout>
                        {variants.length > 1 && (
                          <InlineStack align="start">
                            <Button 
                              onClick={() => removeVariant(variant.id)}
                              tone="critical"
                              size="slim"
                            >
                              Remove
                            </Button>
                          </InlineStack>
                        )}
                      </BlockStack>
                    </Card>
                  ))}
                </BlockStack>
              </div>

              {/* Note */}
              <TextField
                label="Note to Customer (Optional)"
                value={formData.note}
                onChange={handleChange("note")}
                multiline={4}
                placeholder="Add a personalized message..."
                autoComplete="off"
              />

              <InlineStack align="start">
                <Button
                  variant="primary"
                  loading={loading}
                  onClick={handleSubmit}
                  disabled={!isFormValid}
                >
                  Create Draft Order & Send Link
                </Button>
              </InlineStack>
            </FormLayout>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}