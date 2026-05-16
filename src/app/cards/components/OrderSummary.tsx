import React from 'react';
import {
  Box,
  Flex,
  Text,
  Heading,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@hubspot/ui-extensions';
import type { LineItem } from './types';
import { formatPrice, priceSuffix } from './format';

interface Props {
  lineItems: LineItem[];
  currency: string;
}

export function OrderSummary({ lineItems, currency }: Props) {
  const recurringTotal = lineItems
    .filter((li) => !li.isOneTime)
    .reduce((sum, li) => sum + li.totalPrice, 0);
  const oneTimeTotal = lineItems
    .filter((li) => li.isOneTime)
    .reduce((sum, li) => sum + li.totalPrice, 0);

  return (
    <Box>
      <Heading>Order summary</Heading>
      <Box marginTop="sm">
        <Table bordered={false}>
          <TableHead>
            <TableRow>
              <TableHeader>Item</TableHeader>
              <TableHeader align="right" width={160}>
                Unit price
              </TableHeader>
              <TableHeader align="right" width={120}>
                Total
              </TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {lineItems.map((li) => (
              <TableRow key={li.itemId}>
                <TableCell>
                  <Text>
                    {li.name}
                    {li.quantity > 1 ? ` × ${li.quantity}` : ''}
                  </Text>
                </TableCell>
                <TableCell align="right">
                  <Flex direction="column" align="end">
                    <Text format={{ color: 'medium' }}>
                      {formatPrice(li.unitPrice, currency)}
                    </Text>
                    <Text format={{ color: 'medium' }}>
                      {priceSuffix(li.isOneTime)}
                    </Text>
                  </Flex>
                </TableCell>
                <TableCell align="right">
                  <Text format={{ fontWeight: 'bold' }}>
                    {formatPrice(li.totalPrice, currency)}
                  </Text>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>
                <Text format={{ fontWeight: 'bold' }}>Monthly recurring</Text>
              </TableCell>
              <TableCell align="right">
                <Text format={{ fontWeight: 'bold' }}>
                  {formatPrice(recurringTotal, currency)}
                </Text>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell colSpan={2}>
                <Text format={{ fontWeight: 'bold' }}>One-time</Text>
              </TableCell>
              <TableCell align="right">
                <Text format={{ fontWeight: 'bold' }}>
                  {formatPrice(oneTimeTotal, currency)}
                </Text>
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Box>
    </Box>
  );
}
