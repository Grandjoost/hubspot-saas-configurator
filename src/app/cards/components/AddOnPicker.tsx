import React from 'react';
import {
  Box,
  Flex,
  Text,
  Heading,
  Toggle,
  StepperInput,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@hubspot/ui-extensions';
import type { CatalogItem, SelectedAddOns } from './types';
import { effectivePrice, formatPrice, priceSuffix, type Billing } from './format';

interface Props {
  items: CatalogItem[];
  selected: SelectedAddOns;
  currency: string;
  billing: Billing;
  onToggle: (itemId: string, on: boolean) => void;
  onQtyChange: (itemId: string, qty: number) => void;
}

export function AddOnPicker({
  items,
  selected,
  currency,
  billing,
  onToggle,
  onQtyChange,
}: Props) {
  if (items.length === 0) return null;

  return (
    <Box>
      <Heading>Compatible add-ons</Heading>
      <Text format={{ color: 'medium' }}>
        Optional — only add-ons compatible with the selected plan are shown.
      </Text>
      <Box marginTop="sm">
        <Table bordered={false}>
          <TableHead>
            <TableRow>
              <TableHeader>Add-on</TableHeader>
              <TableHeader align="right" width={140}>
                Price
              </TableHeader>
              <TableHeader align="center" width={120}>
                Quantity
              </TableHeader>
              <TableHeader align="center" width={70}>
                Add
              </TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => {
              const isOn = (selected[item.id] ?? 0) > 0;
              const qty = selected[item.id] ?? 1;
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <Flex direction="column" gap="extra-small">
                      <Text format={{ fontWeight: 'bold' }}>{item.name}</Text>
                      {item.description && (
                        <Text format={{ color: 'medium' }}>{item.description}</Text>
                      )}
                    </Flex>
                  </TableCell>
                  <TableCell align="right">
                    <Flex direction="column" align="end">
                      <Text format={{ fontWeight: 'bold' }}>
                        {formatPrice(
                          effectivePrice(item.unitPrice, item.isOneTime, billing),
                          currency
                        )}
                      </Text>
                      <Text format={{ color: 'medium' }}>
                        {priceSuffix(item.isOneTime, billing)}
                      </Text>
                    </Flex>
                  </TableCell>
                  <TableCell align="center">
                    {item.isQuantifiable && isOn ? (
                      <StepperInput
                        name={`qty-${item.id}`}
                        label="Qty"
                        value={qty}
                        min={item.minQty ?? 1}
                        max={item.maxQty ?? 99}
                        stepSize={item.step ?? 1}
                        onChange={(v) => onQtyChange(item.id, Number(v ?? 1))}
                      />
                    ) : (
                      <Text format={{ color: 'medium' }}>—</Text>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Toggle
                      size="sm"
                      labelDisplay="hidden"
                      label={`Add ${item.name}`}
                      checked={isOn}
                      onChange={(v) => onToggle(item.id, !!v)}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}
