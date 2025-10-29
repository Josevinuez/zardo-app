import {
  reactExtension,
  Text,
  BlockStack,
  Heading,
  Page,
  useApi,
  Banner,
  TextField,
  Card,
  Button,
  Tag,
  InlineStack,
  useTranslate,
  Divider,
  Pressable,
} from '@shopify/ui-extensions-react/customer-account';
import { type HeadersInit } from 'node-fetch';
import { useCallback, useEffect, useState } from 'react';

export default reactExtension(
  'customer-account.page.render',
  () => <Wishlist />,
);

const apiBaseUrl = (() => {
  const env =
    typeof process !== 'undefined' && process.env
      ? (process.env as Record<string, string | undefined>)
      : undefined;
  const fromEnv =
    env?.WISHLIST_API_BASE_URL ??
    env?.SHOPIFY_APP_URL ??
    env?.APP_URL;
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv.replace(/\/$/, '');
  }
  return 'http://localhost:3000';
})();

const wishlistEndpoint = `${apiBaseUrl}/api/wishlist`;

interface Keyword {
  id: string;
  value: string;
}

interface SuggestedKeyword {
  value: string
}

interface Wishlist {
  email: string | null;
  keywords: Keyword[];
  suggestedKeywords: SuggestedKeyword[];
}

interface UIControl {
  wishlistLoading: boolean;
  emailIsSubmitable: boolean;
  emailToSubmit: boolean;
  emailLoading: boolean;
  keywordIsSubmitable: boolean;
  keywordToSubmit: boolean;
  keywordLoading: boolean;
  emailUnsubscribe: boolean
}

interface KeywordChanges {
  removedKeyword: string | null
  addedKeyword: string | null
}

function Wishlist() {
  const { authenticatedAccount } = useApi()
  const translate = useTranslate();
  const corsHeader = {
    'Content-Type': 'application/json',
  }
  const customer_id = authenticatedAccount.customer.current.id
  const [uiControl, setUIControl] = useState<UIControl>({
    wishlistLoading: true,
    emailIsSubmitable: false,
    emailToSubmit: false,
    emailLoading: false,
    keywordIsSubmitable: false,
    keywordToSubmit: false,
    keywordLoading: false,
    emailUnsubscribe: false
  });
  const [wishlist, setWishlist] = useState<
    Wishlist
  >();

  const [keywordChanges, setKeywordChanges] = useState<KeywordChanges>({ addedKeyword: null, removedKeyword: null })
  const [error, setError] = useState<String | null>(null)

  useEffect(() => {
    async function fetchWishlist() {
      setUIControl((prev) => {
        return {
          ...prev,
          wishlistLoading: true
        }
      })

      const response = await fetch(
        `${wishlistEndpoint}?id=${encodeURI(customer_id)}`,
        {
          mode: "cors",
          headers: corsHeader
        }
      );

      const wishlist = await response.json()
      setUIControl((prev) => {
        return {
          ...prev,
          wishlistLoading: false
        }
      })
      if ("error" in wishlist) setError(wishlist.error)
      if ("keywords" in wishlist) setWishlist(wishlist);
    }

    void fetchWishlist();
  }, []);

  useEffect(() => {
    async function setWishlistEmail(email: string) {
      setUIControl((prev) => {
        return {
          ...prev,
          emailLoading: true,
        }
      })

      const response = await fetch(
        wishlistEndpoint, {
        method: 'POST',
        body: JSON.stringify({
          id: customer_id,
          intent: "set_email",
          email
        }),
        mode: "cors",
        headers: corsHeader
      }
      );
      setWishlist((prev) => {
        return {
          ...prev,
          email: "",
        }
      })
      const wishlist = await response.json();
      setUIControl((prev) => {
        return {
          ...prev,
          emailLoading: false
        }
      })
      if ("error" in wishlist) setError(wishlist.error)
      if ("keywords" in wishlist) setWishlist(wishlist);

    }
    async function removeKeyword(keyword: string) {
      setKeywordChanges((prev) => {
        return {
          ...prev,
          removedKeyword: null
        }
      })
      setUIControl((prev) => {
        return {
          ...prev,
          keywordLoading: true,
          keywordToSubmit: false,
        }
      })
      const response = await fetch(
        wishlistEndpoint, {
        method: 'POST',
        body: JSON.stringify({
          id: customer_id,
          intent: "remove_keyword",
          keyword
        }),
        mode: "cors",
        headers: corsHeader
      }
      );
      const wishlist = await response.json();
      setUIControl((prev) => {
        return {
          ...prev,
          keywordLoading: false
        }
      })

      if ("error" in wishlist) setError(wishlist.error)
      if ("keywords" in wishlist) setWishlist(wishlist);
    }

    async function addKeyword(keyword: string) {
      setUIControl((prev) => {
        return {
          ...prev,
          keywordLoading: true,
          keywordToSubmit: false,
        }
      })
      const response = await fetch(
        wishlistEndpoint, {
        method: 'POST',
        body: JSON.stringify({
          id: customer_id,
          intent: "add_keyword",
          keyword
        }),
        mode: "cors",
        headers: corsHeader
      }
      );

      const wishlist = await response.json();

      setUIControl((prev) => {
        return {
          ...prev,
          keywordLoading: false
        }
      })
      if ("error" in wishlist) setError(wishlist.error)
      if ("keywords" in wishlist) setWishlist(wishlist);
    }
    async function unsubscribeEmail() {
      setUIControl((prev) => {
        return {
          ...prev,
          emailLoading: true,
        }
      })
      const response = await fetch(
        wishlistEndpoint, {
        method: 'POST',
        body: JSON.stringify({
          id: customer_id,
          intent: "unsubscribe",
        }),
        mode: "cors",
        headers: corsHeader
      }
      );

      const wishlist = await response.json();

      setUIControl((prev) => {
        return {
          ...prev,
          emailLoading: false,
        }
      })
      if ("error" in wishlist) setError(wishlist.error)
      if ("keywords" in wishlist) setWishlist(wishlist);

    }
    if (uiControl.emailIsSubmitable && uiControl.emailToSubmit) {
      setUIControl((prev) => {
        return {
          ...prev,
          emailIsSubmitable: false,
          emailToSubmit: false
        }
      })
      void setWishlistEmail(wishlist.email)
    }
    if (uiControl.emailUnsubscribe) {

      setUIControl((prev) => {
        return {
          ...prev,
          emailUnsubscribe: false,
        }
      })

      void unsubscribeEmail()
    }
    if (uiControl.keywordToSubmit) {
      setUIControl((prev) => {
        return {
          ...prev,
          keywordToSubmit: false,
          keywordIsSubmitable: false
        }
      })

      if (keywordChanges.addedKeyword) {
        void addKeyword(keywordChanges.addedKeyword)
        setKeywordChanges((prev) => {
          return {
            ...prev,
            addedKeyword: null
          }
        })
      }
      if (keywordChanges.removedKeyword) {
        void removeKeyword(keywordChanges.removedKeyword)
        setKeywordChanges((prev) => {
          return {
            ...prev,
            addedKeyword: null
          }
        })
      }
    }
  }, [uiControl, wishlist, setUIControl, setKeywordChanges])
  const removeKeywordCallback = useCallback(
    (tag: string) => () => {
      setKeywordChanges((prev) => {
        return {
          ...prev,
          removedKeyword: tag,
        }

      });
      setUIControl((prev) => {
        return {
          ...prev,
          keywordToSubmit: true
        }
      })
    },
    [],
  );

  const handleSuggestedKeywordClick = useCallback((keyword: string) => {
    setKeywordChanges({
      ...keywordChanges,
      addedKeyword: keyword
    });

    setUIControl({
      ...uiControl,
      keywordIsSubmitable: true,
      keywordToSubmit: true
    });
  }, [keywordChanges, uiControl]);

  const isValidKeyword = (keyword: string | null): boolean => {
    return keyword !== null && keyword.trim().length >= 3;
  };

  if (uiControl.wishlistLoading) {
    return <Text>{translate("loading")}</Text>;
  }

  if (!wishlist) {
    return (
      <BlockStack>
        <Heading>{translate("not-found")}</Heading>
      </BlockStack>
    );
  }

  const keywordMarkup = wishlist.keywords.map((keyword) => (
    <Tag key={keyword.id} onRemove={removeKeywordCallback(keyword.value)}>
      {keyword.value}
    </Tag>
  ));

  const suggestedKeywordsMarkup = wishlist.suggestedKeywords && wishlist.suggestedKeywords.length > 0 ? (
    <BlockStack>
      <Text size="small" emphasis="bold">{translate("suggested-keywords") || "Suggested Keywords"}</Text>
      <InlineStack spacing="tight">
        {wishlist.suggestedKeywords.map((keyword, index) => (
          <Pressable
            onPress={() => handleSuggestedKeywordClick(keyword.value)}
            disabled={wishlist.keywords.some(k => k.value === keyword.value)}
            accessibilityLabel={`Add ${keyword.value} to your wishlist`}>

            <Tag
              key={`suggested-${index}`}

            >
              {keyword.value}
            </Tag>
          </Pressable>
        ))}
      </InlineStack>
    </BlockStack>
  ) : null;

  return (
    <Page title='Wishlist'>
      {error ? <Banner status="critical">{error}</Banner> : null}
      <Card>
        <BlockStack padding={'base'}>
          <TextField
            label="Email"
            value={wishlist.email}
            onChange={(val) => {
              const checkMatch = val.match(/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/g)?.length || 0;
              if (checkMatch > 0) {
                setUIControl({ ...uiControl, emailIsSubmitable: true })
                setWishlist({
                  ...wishlist,
                  email: val,
                })
              } else {
                setUIControl({ ...uiControl, emailIsSubmitable: false })

              }
            }}
            type="email"
            required={true}
            autocomplete={{ field: "email" }} />
          <Button
            disabled={!uiControl.emailIsSubmitable}
            loading={uiControl.emailLoading}
            onPress={() => setUIControl({ ...uiControl, emailToSubmit: true })} >{translate("email-card.save-button")}</Button>
          <Button
            disabled={!wishlist.email}
            loading={uiControl.emailLoading}
            appearance='critical'
            onPress={() => setUIControl({ ...uiControl, emailUnsubscribe: true })} >{translate("email-card.unsubscribe-button")}</Button>
        </BlockStack>
      </Card>
      <Card>
        <BlockStack padding={'base'}>
          <Text size='large' emphasis='bold'>{translate("keyword-card.text1")}</Text>
          <Text size='medium'>{translate("keyword-card.text2")}</Text>

          <InlineStack spacing="tight">{keywordMarkup}</InlineStack>
          {suggestedKeywordsMarkup && (
            <>
              <Divider />
              <InlineStack padding="base">
                {suggestedKeywordsMarkup}
              </InlineStack>
            </>
          )}
          <TextField
            label={translate("keyword-card.placeholder")}
            value={keywordChanges.addedKeyword || ""}
            onChange={(val) => {
              setKeywordChanges({
                ...keywordChanges,
                addedKeyword: val
              });

              setUIControl({
                ...uiControl,
                keywordIsSubmitable: isValidKeyword(val)
              });
            }}
            type="text"
            required={true}
            accessibilityDescription={translate("keyword-card.min-chars") || "Minimum 3 characters required"}
          />

          <Button
            disabled={!uiControl.keywordIsSubmitable}
            loading={uiControl.keywordLoading}
            onPress={() => setUIControl({
              ...uiControl,
              keywordToSubmit: true
            })} >{translate("keyword-card.add-button")}</Button>
        </BlockStack>
      </Card>
    </Page >
  );
}
