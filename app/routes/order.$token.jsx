// app/routes/order.$token.jsx
import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router";

export default function CustomerOrderPage() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const shop = searchParams.get('shop');
  
  const [data, setData] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchOrderData = async () => {
      if (!token || !shop) {
        setError("Invalid order link");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/get-order?token=${token}&shop=${shop}`);
        const result = await response.json();
        
        if (result.success) {
          setData(result);
          if (result.variants && result.variants.length > 0) {
            setSelectedVariant(result.variants[0]);
          }
        } else {
          setError(result.error || "Order not found");
        }
      } catch (err) {
        console.error('Fetch error:', err);
        setError("Failed to load order");
      } finally {
        setLoading(false);
      }
    };

    fetchOrderData();
  }, [token, shop]);

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    setError("");

    try {
      const response = await fetch("/api/process-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          draftOrderId: data.draftOrderId,
          variantName: selectedVariant.name,
          price: selectedVariant.price,
          shop: data.shop
        }),
      });

      const result = await response.json();

      if (result.success && result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      } else {
        setError(result.error || "Failed to create checkout");
        setCheckoutLoading(false);
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
      console.error(err);
      setCheckoutLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ 
        maxWidth: "600px", 
        margin: "100px auto", 
        padding: "20px",
        textAlign: "center",
        fontFamily: "system-ui, -apple-system, sans-serif"
      }}>
        <p>Loading your order...</p>
      </div>
    );
  }

  if (!data || error) {
    return (
      <div style={{ 
        maxWidth: "600px", 
        margin: "100px auto", 
        padding: "20px",
        textAlign: "center",
        fontFamily: "system-ui, -apple-system, sans-serif"
      }}>
        <div style={{
          backgroundColor: "#fee",
          padding: "40px",
          borderRadius: "8px"
        }}>
          <h1 style={{ color: "#c33", marginBottom: "10px" }}>Order Not Found</h1>
          <p style={{ color: "#666" }}>{error || "This order link is invalid or has expired."}</p>
        </div>
      </div>
    );
  }

  if (!selectedVariant) {
    return (
      <div style={{ 
        maxWidth: "600px", 
        margin: "100px auto", 
        padding: "20px",
        textAlign: "center"
      }}>
        <p>Loading variants...</p>
      </div>
    );
  }

  return (
    <div style={{ 
      maxWidth: "600px", 
      margin: "50px auto", 
      padding: "20px",
      fontFamily: "system-ui, -apple-system, sans-serif"
    }}>
      <div style={{
        backgroundColor: "white",
        borderRadius: "8px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        overflow: "hidden"
      }}>
        {/* Product Image */}
        {data.productImage && (
          <img 
            src={data.productImage} 
            alt={data.productTitle}
            style={{
              width: "100%",
              height: "400px",
              objectFit: "cover",
              backgroundColor: "#f5f5f5"
            }}
          />
        )}
        
        {/* Product Details */}
        <div style={{ padding: "30px" }}>
          <h1 style={{ 
            fontSize: "28px", 
            marginBottom: "10px",
            color: "#333",
            fontWeight: "600"
          }}>
            {data.productTitle}
          </h1>
          
          {data.note && (
            <p style={{ 
              color: "#666", 
              marginBottom: "30px",
              lineHeight: "1.6",
              fontSize: "15px"
            }}>
              {data.note}
            </p>
          )}

          {/* Variant Selector */}
          {data.variants && data.variants.length > 0 && (
            <div style={{ marginBottom: "20px" }}>
              <label style={{ 
                display: "block", 
                marginBottom: "10px",
                fontWeight: "600",
                color: "#333",
                fontSize: "14px"
              }}>
                Select Option:
              </label>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {data.variants.map((variant) => (
                  <button
                    key={variant.id}
                    onClick={() => setSelectedVariant(variant)}
                    style={{
                      padding: "12px 24px",
                      border: selectedVariant.id === variant.id 
                        ? "2px solid #5469d4" 
                        : "2px solid #ddd",
                      backgroundColor: selectedVariant.id === variant.id 
                        ? "#f0f2ff" 
                        : "white",
                      color: selectedVariant.id === variant.id 
                        ? "#5469d4" 
                        : "#333",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: "500",
                      transition: "all 0.2s"
                    }}
                  >
                    {variant.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Price Display */}
          <div style={{ 
            fontSize: "32px", 
            fontWeight: "bold",
            color: "#333",
            marginBottom: "30px"
          }}>
            ${selectedVariant.price}
          </div>

          {/* Error Message */}
          {error && (
            <div style={{
              padding: "12px",
              backgroundColor: "#fee",
              color: "#c33",
              borderRadius: "6px",
              marginBottom: "20px",
              fontSize: "14px"
            }}>
              {error}
            </div>
          )}

          {/* Checkout Button */}
          <button
            onClick={handleCheckout}
            disabled={checkoutLoading}
            style={{
              width: "100%",
              padding: "16px",
              backgroundColor: checkoutLoading ? "#ccc" : "#5469d4",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "16px",
              fontWeight: "600",
              cursor: checkoutLoading ? "not-allowed" : "pointer",
              transition: "background-color 0.2s"
            }}
            onMouseOver={(e) => {
              if (!checkoutLoading) e.target.style.backgroundColor = "#4158d0";
            }}
            onMouseOut={(e) => {
              if (!checkoutLoading) e.target.style.backgroundColor = "#5469d4";
            }}
          >
            {checkoutLoading ? "Processing..." : "Proceed to Checkout"}
          </button>

          <p style={{
            textAlign: "center",
            color: "#999",
            fontSize: "12px",
            marginTop: "20px"
          }}>
            🔒 Secure checkout powered by Shopify
          </p>
        </div>
      </div>
    </div>
  );
}