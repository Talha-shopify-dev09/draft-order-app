import { useState, useCallback, useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router"; 
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
  Text,
  DropZone
} from "@shopify/polaris";
import { DeleteIcon, PlusIcon, SaveIcon, ImageIcon, PlayIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

// --- 1. LOADER: FETCH CURRENCY ---
// app/routes/app._index.jsx

// ... imports remain the same ...

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  
  // Query Shopify to get the Money Format
  const response = await admin.graphql(`
    query {
      shop {
        currencyFormats {
          moneyFormat
        }
      }
    }
  `);

  const data = await response.json();
  const moneyFormat = data.data.shop.currencyFormats.moneyFormat;
  
  // FIX: Stronger Regex to remove {{amount}} AND {{amount_with_comma_separator}}
  const currencySymbol = moneyFormat
    .replace(/\{\{.*?\}\}/g, "") // Removes anything inside {{ }}
    .replace(/<[^>]*>/g, "")     // Removes <span> or HTML tags
    .trim();

  return { shop: session.shop, currencySymbol };
};

// ... Rest of the file remains the same ...

export default function Index() {
  // Get currencySymbol from loader
  const { shop, currencySymbol } = useLoaderData(); 
  const fetcher = useFetcher();

  const [formData, setFormData] = useState({
    customerEmail: "",
    customerName: "",
    productTitle: "",
    note: "",
    images: [], 
    video: null,
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

  // --- Image Logic ---
  const handleImageUpload = (event) => {
    const files = Array.from(event.target.files);
    let newImages = [];
    let error = "";

    if (formData.images.length + files.length > 2) {
      setErrorMessage("You can only upload a maximum of 2 images.");
      return;
    }

    files.forEach((file) => {
      if (!file.type.startsWith('image/')) {
        error = 'Only image files are allowed.';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        error = 'Image size should be less than 5MB';
        return;
      }
      newImages.push({
        file,
        preview: URL.createObjectURL(file)
      });
    });

    if (error) {
      setErrorMessage(error);
      return;
    }

    setFormData(prev => ({
      ...prev,
      images: [...prev.images, ...newImages]
    }));
  };

  const removeImage = (index) => {
    setFormData(prev => {
      const updatedImages = [...prev.images];
      URL.revokeObjectURL(updatedImages[index].preview); 
      updatedImages.splice(index, 1);
      return { ...prev, images: updatedImages };
    });
  };

  // --- Video Logic ---
  const handleVideoUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      setErrorMessage('Please upload a valid video file.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setErrorMessage('Video size should be less than 20MB');
      return;
    }

    setFormData(prev => ({
      ...prev,
      video: {
        file,
        preview: URL.createObjectURL(file)
      }
    }));
  };

  const removeVideo = () => {
    if (formData.video?.preview) {
      URL.revokeObjectURL(formData.video.preview);
    }
    setFormData(prev => ({ ...prev, video: null }));
  };

  // --- Option Group Logic ---
  const addGroup = () => {
    setOptionGroups([...optionGroups, { id: Date.now(), name: "", values: [{ id: Date.now() + 1, label: "", price: "0" }] }]);
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

  // --- Template Logic ---
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

  // --- File to Base64 ---
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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

      // -- A. Upload Images --
      const uploadedImageUrls = [];
      for (const imgObj of formData.images) {
        const imageBase64 = await fileToBase64(imgObj.file);
        
        const uploadResponse = await fetch("/api/upload-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: imageBase64, type: 'image' }),
        });

        const uploadData = await uploadResponse.json();
        if (uploadData.success) {
          uploadedImageUrls.push(uploadData.imageUrl);
        } else {
          throw new Error("Failed to upload image: " + uploadData.error);
        }
      }

      // -- B. Upload Video --
      let uploadedVideoUrl = null;
      if (formData.video) {
        const videoBase64 = await fileToBase64(formData.video.file);
        
        const uploadResponse = await fetch("/api/upload-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: videoBase64, type: 'video' }), 
        });

        const uploadData = await uploadResponse.json();
        if (uploadData.success) {
          uploadedVideoUrl = uploadData.imageUrl;
        } else {
          throw new Error("Failed to upload video: " + uploadData.error);
        }
      }

      // -- C. Prepare Payload --
      const payload = {
        customerEmail: formData.customerEmail,
        customerName: formData.customerName,
        productTitle: formData.productTitle,
        note: formData.note,
        optionGroups: optionGroups,
        images: uploadedImageUrls, 
        video: uploadedVideoUrl,
        isTemplate: saveAsTemplate,
        templateName: saveAsTemplate ? templateName : null,
        // Optional: Pass currency if your backend needs it to create draft order in correct currency
        currency: currencySymbol 
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

              <Divider />

              {/* Images Section */}
              <Text variant="headingSm" as="h3">Product Images (Max 2)</Text>
              
              <InlineStack gap="400" align="start">
                {formData.images.map((img, index) => (
                  <div key={index} style={{position: 'relative'}}>
                     <Thumbnail source={img.preview} alt={`Preview ${index}`} size="large" />
                     <div style={{position: 'absolute', top: -10, right: -10}}>
                       <Button icon={DeleteIcon} size="micro" tone="critical" onClick={() => removeImage(index)} />
                     </div>
                  </div>
                ))}

                {formData.images.length < 2 && (
                  <div style={{ width: '80px', height: '80px', border: '1px dashed #ccc', borderRadius: '4px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', position: 'relative' }}>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleImageUpload} 
                      style={{position: 'absolute', width: '100%', height: '100%', opacity: 0, cursor: 'pointer'}} 
                    />
                    <ImageIcon fill="#5c5f62" />
                  </div>
                )}
              </InlineStack>

              <div style={{ height: '10px' }}></div>

              {/* Video Section (Fixed Layout) */}
              <Text variant="headingSm" as="h3">Product Video (Max 1)</Text>
              {formData.video ? (
                <BlockStack gap="200" align="start">
                  <video src={formData.video.preview} controls style={{ maxWidth: '300px', maxHeight: '200px', borderRadius: '8px' }} />
                  <Button icon={DeleteIcon} tone="critical" onClick={removeVideo}>Remove Video</Button>
                </BlockStack>
              ) : (
                <div style={{ maxWidth: '300px', padding: '20px', border: '1px dashed #ccc', borderRadius: '4px', textAlign: 'center', position: 'relative' }}>
                  <InlineStack align="center" gap="200">
                     <PlayIcon /> 
                     <Text>Upload Video</Text>
                  </InlineStack>
                  <input 
                    type="file" 
                    accept="video/*" 
                    onChange={handleVideoUpload} 
                    style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer'}} 
                  />
                </div>
              )}

              <Divider />

              {/* Variant Options with Dynamic Currency */}
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
                           {/* 2. DYNAMIC CURRENCY SYMBOL USED HERE */}
                           <TextField 
                                type="number" 
                                prefix={currencySymbol} // <--- Shows £, €, etc.
                                placeholder="Price" 
                                value={val.price} 
                                onChange={(v) => updateValue(groupIdx, valIdx, 'price', v)} 
                                autoComplete="off" 
                           />
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