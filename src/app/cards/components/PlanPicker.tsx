import React from 'react';
import {
  Flex,
  Tile,
  Heading,
  Text,
  Button,
  StatusTag,
  Box,
  Divider,
} from '@hubspot/ui-extensions';
import type { Plan } from './types';
import { effectivePrice, formatPrice, priceSuffix, type Billing } from './format';

interface Props {
  plans: Plan[];
  selectedPlanId: string | null;
  currency: string;
  billing: Billing;
  onSelect: (planId: string) => void;
}

export function PlanPicker({
  plans,
  selectedPlanId,
  currency,
  billing,
  onSelect,
}: Props) {
  const aPlanIsSelected = selectedPlanId !== null;

  return (
    <Flex direction="row" gap="md" wrap="wrap" align="stretch" justify="center">
      {plans.map((plan) => {
        const isSelected = plan.id === selectedPlanId;
        const isDimmed = aPlanIsSelected && !isSelected;
        const mutedColor = isDimmed ? 'medium' : undefined;
        const isRecommended = !!plan.recommended;
        const accentColor = isRecommended && !isDimmed ? 'success' : mutedColor;
        const price = effectivePrice(
          plan.unitPrice,
          plan.isOneTime,
          billing,
          plan.annualDiscount
        );

        return (
          <Tile key={plan.id} flush>
            <Flex direction="column" gap="sm" align="stretch">
              {/* Top row: recommended or selected badge */}
              <Flex direction="row" justify="center" align="center">
                {isSelected ? (
                  <StatusTag variant="success">Selected</StatusTag>
                ) : isRecommended ? (
                  <StatusTag variant="warning">Most popular</StatusTag>
                ) : (
                  <Text format={{ color: 'medium' }}> </Text>
                )}
              </Flex>

              {/* Plan name + description */}
              <Box>
                <Flex direction="row" justify="center">
                  <Heading>
                    <Text
                      format={{ color: accentColor, fontWeight: 'bold' }}
                      inline
                    >
                      {plan.name}
                    </Text>
                  </Heading>
                </Flex>
                <Flex direction="row" justify="center">
                  <Text format={{ color: mutedColor ?? 'medium' }}>
                    {plan.description}
                  </Text>
                </Flex>
              </Box>

              {/* Price */}
              <Flex direction="row" justify="center" gap="xs" align="baseline">
                <Text
                  format={{
                    fontWeight: 'bold',
                    color: accentColor,
                  }}
                  inline
                >
                  {formatPrice(price, currency)}
                </Text>
                <Text inline format={{ color: 'medium' }}>
                  {priceSuffix(plan.isOneTime, billing)}
                </Text>
              </Flex>

              <Divider />

              {/* Feature bullets */}
              {plan.features && plan.features.length > 0 && (
                <Flex direction="column" gap="xs">
                  {plan.features.map((feature, idx) => (
                    <Flex key={idx} direction="row" gap="xs" align="start">
                      <Text
                        inline
                        format={{ color: mutedColor ?? 'success' }}
                      >
                        ✓
                      </Text>
                      <Text format={{ color: mutedColor }}>{feature}</Text>
                    </Flex>
                  ))}
                </Flex>
              )}

              {/* CTA Button */}
              <Button
                variant={isSelected ? 'secondary' : 'primary'}
                onClick={() => onSelect(plan.id)}
                disabled={isSelected}
              >
                {isSelected ? 'Plan selected' : 'Choose this plan'}
              </Button>
            </Flex>
          </Tile>
        );
      })}
    </Flex>
  );
}
