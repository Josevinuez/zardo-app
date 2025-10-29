import {render, useState} from '@shopify/ui-extensions/preact';

function Extension() {
  const [hasSpun, setHasSpun] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [gift, setGift] = useState(null);

  if (hasSpun && gift) {
    return (
      <s-banner heading="Congratulations!" tone="success">
        <s-text>You won: <s-text type="emphasis">{gift}</s-text></s-text>
      </s-banner>
    );
  }

  if (hasSpun && !gift) {
    return null;
  }

  return (
    <s-block-border>
      <s-block-header>
        <s-text size="headingMd">Zardo Wheel</s-text>
      </s-block-header>
      <s-block-content>
        <s-text>Spin the wheel for a chance to win a free gift!</s-text>
        <s-button 
          onPress={handleSpin} 
          loading={isSpinning}
          disabled={isSpinning}
          kind="secondary"
        >
          {isSpinning ? 'Spinning...' : 'Zardo Wheel'}
        </s-button>
      </s-block-content>
    </s-block-border>
  );

  async function handleSpin() {
    setIsSpinning(true);
    
    try {
      const gifts = [
        "Free Sticker Pack",
        "10% Off Next Order",
        "Free Shipping",
        "Better luck next time!",
      ];
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const winChance = 0.3;
      const random = Math.random();
      
      if (random < winChance) {
        const selectedGift = gifts[Math.floor(Math.random() * (gifts.length - 1))];
        setGift(selectedGift);
      } else {
        setGift(gifts[gifts.length - 1]);
      }
      
      setHasSpun(true);
      
    } catch (error) {
      console.error('Failed to spin wheel:', error);
      setGift('An error occurred. Please try again.');
      setHasSpun(true);
    } finally {
      setIsSpinning(false);
    }
  }
}

// Export the extension
export default async () => {
  render(<Extension />, document.body)
};
