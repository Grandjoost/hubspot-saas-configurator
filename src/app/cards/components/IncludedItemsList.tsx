import React from 'react';
import { Box, Flex, Text, Heading } from '@hubspot/ui-extensions';
import type { CatalogItem } from './types';
import { formatPrice, priceSuffix } from './format';

interface Props {
  items: CatalogItem[];
  currency: string;
}

export function IncludedItemsList({ items, currency }: Props) {
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
                  {formatPrice(item.unitPrice, currency)} {priceSuffix(item.isOneTime)}
                </Text>
              )}
            </Flex>
          );
        })}
      </Box>
    </Box>
  );
}
