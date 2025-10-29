import { Spinner, Text } from "@shopify/polaris";
import type { CSSProperties } from "react";

interface FullScreenSpinnerProps {
  label?: string;
}

export function FullScreenSpinner({ label = "Loading" }: FullScreenSpinnerProps) {
  return (
    <div style={containerStyles}>
      <Spinner accessibilityLabel={label} size="large" />
      <Text as="p" variant="bodyMd" tone="subdued">
        {label}
      </Text>
    </div>
  );
}

const containerStyles: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.75rem",
};
