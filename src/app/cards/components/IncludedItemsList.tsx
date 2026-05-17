import React from 'react';
import { Box, Flex, Text, Heading } from '@hubspot/ui-extensions';
import type { CatalogItem } from './types';
import { effectivePrice, formatPrice, priceSuffix, type Billing } from './format';

interface Props {
  items: CatalogItem[];
  currency: string;
  billing: Billing;
  planDiscount?: number;
}

export function IncludedItemsList({
  items,
  currency,
  billing,
  planDiscount,
}: Props) {
  if (items.length === 0) return null;
  return (
    <Box>
      <Heading>What's included</Heading>
      <Text format={{ color: 'medium' }}>
        Bundled by default with the selected plan — cannot be removed.
      </Text>
      <Box marginTop="sm">
        {items.map((item) => {
          const hasPrice = item.unitPrice > 0;
          const price = effectivePrice(
            item.unitPrice,
            item.isOneTime,
            billing,
            planDiscount
          );
          return (
            <Flex
              key={item.id}
              direction="row"
              justify="between"
              align="start"
              gap="md"
              paddingY="xs"
            >
              <Flex direction="row" gap="xs" align="start">
                <Text inline format={{ color: 'success' }}>
                  ✓
                </Text>
                <Flex direction="column" gap="extra-small">
                  <Text format={{ fontWeight: 'bold' }}>{item.name}</Text>
                  {item.description && (
                    <Text format={{ color: 'medium' }}>{item.description}</Text>
                  )}
                </Flex>
              </Flex>
              {hasPrice && (
                <Text format={{ color: 'medium' }}>
                  {formatPrice(price, currency)} {priceSuffix(item.isOneTime, billing)}
                </Text>
              )}
            </Flex>
          );
        })}
      </Box>
    </Box>
  );
}
