import {
  BlockStack,
  Button,
  Text,
  extend,
} from "@shopify/ui-extensions/checkout";

extend("purchase.thank-you.block.render", (root) => {
  const result = root.createComponent(Text, undefined, "");

  const button = root.createComponent(Button, {
    kind: "secondary",
    onPress: () => {
      result.updateText("Wheel placeholder message.");
    },
  });
  button.updateText("Spin the Zardo Wheel");

  const layout = root.createComponent(BlockStack, { spacing: "base" }, [
    root.createComponent(Text, { size: "medium", emphasis: "bold" }, "Zardo Wheel of Fortune"),
    button,
    result,
  ]);

  root.appendChild(layout);
});
