import { useState, useCallback, useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router"; // FIXED IMPORT
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
  Select,
  Divider,
  Box,
  Text
} from "@shopify/polaris";
import { DeleteIcon, PlusIcon, SaveIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  // Return plain object in React Router v7
  return { shop: session.shop };
};

export default function Index() {
  const { shop } = useLoaderData(); 
  const fetcher = useFetcher();

  const [formData, setFormData] = useState({
    customerEmail: "",
    customerName: "",
    productTitle: "",
    note: "",
    productImage: null,
    productImagePreview: null,
  });

  const [optionGroups, setOptionGroups] = useState([
    { 
      id: Date.now(), 
      name: "Dimensions", 
      values: [{ id: Date.now() + 1, label: "", price: "0" }] 
    }
  ]);

  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [isTemplateSave, setIsTemplateSave] = useState(false);

  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");

  // Fetch Templates on Load
  useEffect(() => {
    if (shop) {
      fetch(`/api/templates?shop=${shop}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) setTemplates(data.templates);
        })
        .catch(console.error);
    }
  }, [shop]);

  const handleChange = useCallback((field) => (value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  // --- Image Handlers ---
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setErrorMessage('Please upload an image file');
        return;
      }
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

  // --- Option Group Logic ---
  const addGroup = () => {
    setOptionGroups([...optionGroups, { 
      id: Date.now(), 
      name: "", 
      values: [{ id: Date.now() + 1, label: "", price: "0" }] 
    }]);
  };

  const removeGroup = (idx) => {
    const newGroups = [...optionGroups];
    newGroups.splice(idx, 1);
    setOptionGroups(newGroups);
  };

  const updateGroup = (idx, field, val) => {
    const newGroups = [...optionGroups];
    newGroups[idx][field] = val;
    setOptionGroups(newGroups);
  };

  const addValueToGroup = (groupIdx) => {
    const newGroups = [...optionGroups];
    newGroups[groupIdx].values.push({ id: Date.now(), label: "", price: "0" });
    setOptionGroups(newGroups);
  };

  const updateValue = (groupIdx, valIdx, field, val) => {
    const newGroups = [...optionGroups];
    newGroups[groupIdx].values[valIdx][field] = val;
    setOptionGroups(newGroups);
  };

  const removeValue = (groupIdx, valIdx) => {
    const newGroups = [...optionGroups];
    newGroups[groupIdx].values.splice(valIdx, 1);
    setOptionGroups(newGroups);
  };

  // --- Template Loading Logic ---
  const handleLoadTemplate = (templateId) => {
    const template = templates.find(t => t.id == templateId);
    if (template) {
      setFormData(prev => ({
        ...prev,
        productTitle: template.productTitle || "",
      }));
      setOptionGroups(template.optionGroups || []);
      setSelectedTemplate(templateId);
    }
  };

  // --- Submit Logic ---
  const handleSubmit = async (saveAsTemplate = false) => {
    setLoading(true);
    setSuccessMessage("");
    setErrorMessage("");
    setGeneratedLink("");
    setIsTemplateSave(saveAsTemplate);

    try {
      const isValid = optionGroups.every(g => g.name && g.values.every(v => v.label));
      
      if (!isValid) {
        setErrorMessage("Please ensure all Option Groups and Values have names.");
        setLoading(false);
        return;
      }

      if (saveAsTemplate && !templateName) {
        setErrorMessage("Please enter a name for the template.");
        setLoading(false);
        return;
      }

      // Upload image to Cloudinary
      let imageUrl = null;
      if (formData.productImage) {
        const imageBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(formData.productImage);
        });

        const uploadResponse = await fetch("/api/upload-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: imageBase64 }),
        });

        const uploadData = await uploadResponse.json();
        if (uploadData.success) {
          imageUrl = uploadData.imageUrl;
        } else {
          throw new Error("Failed to upload image: " + uploadData.error);
        }
      }

      const payload = {
        customerEmail: formData.customerEmail,
        customerName: formData.customerName,
        productTitle: formData.productTitle,
        note: formData.note,
        optionGroups: optionGroups,
        productImage: imageUrl,
        isTemplate: saveAsTemplate,
        templateName: saveAsTemplate ? templateName : null
      };

      const response = await fetch("/api/draft-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.success) {
        if (saveAsTemplate) {
          setSuccessMessage("Template saved successfully!");
          fetch(`/api/templates?shop=${shop}`)
            .then(res => res.json())
            .then(d => d.success && setTemplates(d.templates));
        } else {
          setSuccessMessage("Draft order created successfully!");
          setGeneratedLink(data.customerLink);
        }
      } else {
        throw new Error(data.error || "Operation failed");
      }
    } catch (error) {
      setErrorMessage(error.message || "An error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page title="Custom Order Builder">
      <BlockStack gap="500">
        
        {/* Messages */}
        {successMessage && (
          <Banner title="Success" tone="success" onDismiss={() => setSuccessMessage("")}>
            <p>{successMessage}</p>
            {generatedLink && (
              <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                <p><strong>Customer Link:</strong> <a href={generatedLink} target="_blank" rel="noreferrer">{generatedLink}</a></p>
              </Box>
            )}
          </Banner>
        )}
        {errorMessage && (
          <Banner title="Error" tone="critical" onDismiss={() => setErrorMessage("")}>
            <p>{errorMessage}</p>
          </Banner>
        )}

        {/* Template Selection */}
        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">Templates</Text>
            <InlineStack gap="400">
               <div style={{flex: 1}}>
                 <Select
                   label="Load Saved Template"
                   options={[{label: "Select a template...", value: ""}, ...templates.map(t => ({label: t.name, value: t.id}))]}
                   value={selectedTemplate}
                   onChange={handleLoadTemplate}
                 />
               </div>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text variant="headingLg" as="h1">Order Details</Text>
            <FormLayout>
              
              <TextField
                label="Product Title"
                value={formData.productTitle}
                onChange={handleChange("productTitle")}
                autoComplete="off"
              />

              <FormLayout.Group>
                <TextField
                  label="Customer Name"
                  value={formData.customerName}
                  onChange={handleChange("customerName")}
                  autoComplete="off"
                />
                <TextField
                  label="Customer Email"
                  type="email"
                  value={formData.customerEmail}
                  onChange={handleChange("customerEmail")}
                  autoComplete="email"
                />
              </FormLayout.Group>

              <div>
                <p style={{marginBottom: '8px', fontWeight: 500}}>Product Image</p>
                {formData.productImagePreview ? (
                  <BlockStack gap="300">
                    <Thumbnail source={formData.productImagePreview} alt="Preview" size="large" />
                    <Button onClick={removeImage} icon={DeleteIcon}>Remove Image</Button>
                  </BlockStack>
                ) : (
                  <input type="file" accept="image/*" onChange={handleImageUpload} />
                )}
              </div>

              <Divider />

              {/* Option Group Builder */}
              <Text variant="headingMd" as="h2">Variant Options</Text>
              
              {optionGroups.map((group, groupIdx) => (
                <div key={group.id} style={{background: '#f7f7f7', padding: '15px', borderRadius: '8px', border: '1px solid #e1e3e5'}}>
                  <BlockStack gap="300">
                    <InlineStack align="space-between">
                       <div style={{width: '70%'}}>
                         <TextField 
                           label="Option Name (e.g. Dimensions)" 
                           value={group.name} 
                           onChange={(v) => updateGroup(groupIdx, 'name', v)} 
                           autoComplete="off"
                         />
                       </div>
                       <Button icon={DeleteIcon} tone="critical" onClick={() => removeGroup(groupIdx)}>Remove Group</Button>
                    </InlineStack>

                    <Text variant="bodySm" as="p" fontWeight="bold">Values</Text>
                    {group.values.map((val, valIdx) => (
                      <InlineStack key={val.id} gap="300" align="center">
                        <div style={{flex: 2}}>
                           <TextField placeholder="Label (e.g. 10x10)" value={val.label} onChange={(v) => updateValue(groupIdx, valIdx, 'label', v)} autoComplete="off" />
                        </div>
                        <div style={{flex: 1}}>
                           <TextField type="number" prefix="$" placeholder="Price" value={val.price} onChange={(v) => updateValue(groupIdx, valIdx, 'price', v)} autoComplete="off" />
                        </div>
                        <Button icon={DeleteIcon} onClick={() => removeValue(groupIdx, valIdx)} />
                      </InlineStack>
                    ))}
                    <div style={{marginTop: '5px'}}>
                      <Button variant="plain" icon={PlusIcon} onClick={() => addValueToGroup(groupIdx)}>Add Value</Button>
                    </div>
                  </BlockStack>
                </div>
              ))}
              
              <Button onClick={addGroup} variant="secondary" icon={PlusIcon}>Add New Option Group</Button>

              <Divider />

              <TextField
                label="Note to Customer"
                value={formData.note}
                onChange={handleChange("note")}
                multiline={3}
              />

              <Divider />

              {/* Action Buttons */}
              <InlineStack align="space-between" gap="400">
                 <InlineStack gap="200">
                    <div style={{width: '200px'}}>
                      <TextField placeholder="Template Name" value={templateName} onChange={setTemplateName} autoComplete="off" />
                    </div>
                    <Button icon={SaveIcon} onClick={() => handleSubmit(true)} loading={loading && isTemplateSave}>Save as Template</Button>
                 </InlineStack>

                 <Button variant="primary" size="large" onClick={() => handleSubmit(false)} loading={loading && !isTemplateSave}>
                    Create Customer Link
                 </Button>
              </InlineStack>

            </FormLayout>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}