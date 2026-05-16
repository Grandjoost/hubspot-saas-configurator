import React from 'react';
import { Alert, Flex, Link, Text, Button } from '@hubspot/ui-extensions';
import type { QuoteResult } from './types';

interface Props {
  result: QuoteResult;
  onReset: () => void;
}

export function SuccessState({ result, onReset }: Props) {
  return (
    <Alert title="Draft quote created" variant="success">
      <Flex direction="column" gap="sm" align="start">
        <Text>
          A draft quote with all line items has been created and associated with this
          deal. Add discounts, route for approval, and send from HubSpot as usual.
        </Text>
        <Flex direction="row" gap="sm">
          <Link href={result.quoteUrl} external>
            Open quote in HubSpot
          </Link>
          <Button variant="secondary" onClick={onReset}>
            Configure another quote
          </Button>
        </Flex>
      </Flex>
    </Alert>
  );
}
