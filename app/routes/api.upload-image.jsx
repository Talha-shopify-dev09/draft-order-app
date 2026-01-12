// app/routes/api.upload-image.jsx
import { authenticate } from "../shopify.server";
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

export async function action({ request }) {
  await authenticate.admin(request);

  try {
    const body = await request.json();
    const { image } = body;

    if (!image) {
      return new Response(JSON.stringify({
        success: false,
        error: "No image provided"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(image, {
      folder: 'draft-orders',
      resource_type: 'auto',
      transformation: [
        { width: 1000, height: 1000, crop: 'limit' },
        { quality: 'auto' }
      ]
    });

    return new Response(JSON.stringify({
      success: true,
      imageUrl: uploadResult.secure_url,
      publicId: uploadResult.public_id
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Image upload error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || "Failed to upload image"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function loader() {
  return new Response(JSON.stringify({
    error: "Method not allowed"
  }), {
    status: 405,
    headers: { "Content-Type": "application/json" }
  });
}