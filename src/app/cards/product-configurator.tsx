import React, { useEffect, useMemo, useState } from 'react';
import {
  hubspot,
  Alert,
  Box,
  Button,
  Divider,
  Flex,
  Heading,
  Link,
  LoadingSpinner,
  Select,
  StepIndicator,
  Text,
} from '@hubspot/ui-extensions';

import catalogData from './catalog.json';
import type {
  Catalog,
  CatalogItem,
  LineItem,
  Plan,
  QuoteResult,
  SelectedAddOns,
} from './components/types';

import { PlanPicker } from './components/PlanPicker';
import { IncludedItemsList } from './components/IncludedItemsList';
import { AddOnPicker } from './components/AddOnPicker';
import { OrderSummary } from './components/OrderSummary';
import { SuccessState } from './components/SuccessState';

const catalog = catalogData as Catalog;

const STEP_NAMES = ['Select plan', 'Add-ons', 'Review & create'];

interface CardProps {
  context: any;
}

function lookupItems(ids: string[]): CatalogItem[] {
  return ids
    .map((id) => catalog.items.find((it) => it.id === id))
    .filter((it): it is CatalogItem => Boolean(it));
}

function buildLineItems(plan: Plan, addOns: SelectedAddOns): LineItem[] {
  const items: LineItem[] = [];

  items.push({
    itemId: plan.id,
    name: plan.name,
    description: plan.description,
    unitPrice: plan.unitPrice,
    quantity: 1,
    isOneTime: plan.isOneTime,
    totalPrice: plan.unitPrice,
  });

  for (const includedItem of lookupItems(plan.defaultIncludedItemIds)) {
    items.push({
      itemId: includedItem.id,
      name: includedItem.name,
      description: includedItem.description,
      unitPrice: includedItem.unitPrice,
      quantity: 1,
      isOneTime: includedItem.isOneTime,
      totalPrice: includedItem.unitPrice,
    });
  }

  for (const [itemId, qty] of Object.entries(addOns)) {
    if (qty <= 0) continue;
    const item = catalog.items.find((it) => it.id === itemId);
    if (!item) continue;
    items.push({
      itemId: item.id,
      name: item.name,
      description: item.description,
      unitPrice: item.unitPrice,
      quantity: qty,
      isOneTime: item.isOneTime,
      totalPrice: item.unitPrice * qty,
    });
  }

  return items;
}

function ProductConfigurator({ context }: CardProps) {
  const dealId: string | undefined = context?.crm?.objectId
    ? String(context.crm.objectId)
    : undefined;

  const [step, setStep] = useState(0);
  const [planId, setPlanId] = useState<string | null>(null);
  const [addOns, setAddOns] = useState<SelectedAddOns>({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [templates, setTemplates] = useState<
    Array<{ id: string; name: string; type: string }> | null
  >(null);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );

  // Auto-load templates on mount so the dropdown is populated immediately
  useEffect(() => {
    (async () => {
      try {
        const r = await hubspot.serverless('list_templates_function', {});
        const body = (r as any)?.body ?? r;
        if (Array.isArray(body?.templates)) {
          const cpqOnly = body.templates.filter(
            (t: any) => t.type === 'cpq_template'
          );
          setTemplates(cpqOnly);
          if (body?.defaultTemplateId) {
            setSelectedTemplateId(String(body.defaultTemplateId));
          } else if (cpqOnly.length > 0) {
            setSelectedTemplateId(cpqOnly[0].id);
          }
        }
      } catch {
        // non-fatal
      }
    })();
  }, []);

  const selectedPlan = useMemo<Plan | null>(
    () => catalog.plans.find((p) => p.id === planId) ?? null,
    [planId]
  );

  const compatibleAddOns = useMemo<CatalogItem[]>(() => {
    if (!selectedPlan) return [];
    return lookupItems(selectedPlan.compatibleAddOnIds);
  }, [selectedPlan]);

  const includedItems = useMemo<CatalogItem[]>(() => {
    if (!selectedPlan) return [];
    return lookupItems(selectedPlan.defaultIncludedItemIds);
  }, [selectedPlan]);

  const lineItems = useMemo<LineItem[]>(
    () => (selectedPlan ? buildLineItems(selectedPlan, addOns) : []),
    [selectedPlan, addOns]
  );

  const canAdvanceFromStep0 = !!selectedPlan;
  const canAdvanceFromStep1 = !!selectedPlan;
  const lastStep = STEP_NAMES.length - 1;

  const handleSelectPlan = (newPlanId: string) => {
    setPlanId(newPlanId);
    setAddOns({});
    setError(null);
    setResult(null);
  };

  const handleToggleAddOn = (itemId: string, on: boolean) => {
    setAddOns((prev) => ({ ...prev, [itemId]: on ? 1 : 0 }));
  };

  const handleQtyChange = (itemId: string, qty: number) => {
    setAddOns((prev) => ({ ...prev, [itemId]: Math.max(0, qty) }));
  };

  const handleNext = () => {
    setError(null);
    if (step < lastStep) setStep(step + 1);
  };

  const handleBack = () => {
    setError(null);
    if (step > 0) setStep(step - 1);
  };

  const handleStepClick = (idx: number) => {
    // Allow jumping back to earlier steps; forward jumps only if prereqs met.
    if (idx < step) {
      setStep(idx);
      setError(null);
    } else if (idx === 1 && canAdvanceFromStep0) {
      setStep(1);
      setError(null);
    } else if (idx === 2 && canAdvanceFromStep1) {
      setStep(2);
      setError(null);
    }
  };

  const handleMakeQuote = async () => {
    if (!selectedPlan || !dealId) {
      setError(
        !dealId
          ? 'Could not determine the deal context.'
          : 'Please pick a plan first.'
      );
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const r = await hubspot.serverless('create_quote_function', {
        parameters: {
          dealId,
          planName: selectedPlan.name,
          currency: catalog.currency,
          templateId: selectedTemplateId,
          lineItems: lineItems.map((li) => ({
            name: li.name,
            description: li.description ?? '',
            unitPrice: li.unitPrice,
            quantity: li.quantity,
            isOneTime: li.isOneTime,
          })),
        },
      });
      const body = (r as any)?.body ?? r;
      if (body?.error) {
        setError(body.error);
      } else if (body?.quoteId && body?.quoteUrl) {
        setResult({ quoteId: body.quoteId, quoteUrl: body.quoteUrl });
      } else {
        setError('Unexpected response from the backend.');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create the quote.');
    } finally {
      setCreating(false);
    }
  };

  const handleReset = () => {
    setStep(0);
    setPlanId(null);
    setAddOns({});
    setError(null);
    setResult(null);
  };

  const handleLoadTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const r = await hubspot.serverless('list_templates_function', {});
      const body = (r as any)?.body ?? r;
      if (body?.error) {
        setError(body.error);
      } else if (Array.isArray(body?.templates)) {
        setTemplates(body.templates);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load templates.');
    } finally {
      setTemplatesLoading(false);
    }
  };

  // --- step content renderers ---
  const renderStep0 = () => (
    <PlanPicker
      plans={catalog.plans}
      selectedPlanId={planId}
      currency={catalog.currency}
      onSelect={(id) => {
        handleSelectPlan(id);
      }}
    />
  );

  const renderStep1 = () => (
    <Flex direction="column" gap="lg">
      <IncludedItemsList items={includedItems} currency={catalog.currency} />
      <Divider />
      <AddOnPicker
        items={compatibleAddOns}
        selected={addOns}
        currency={catalog.currency}
        onToggle={handleToggleAddOn}
        onQtyChange={handleQtyChange}
      />
    </Flex>
  );

  const renderStep2 = () => (
    <Flex direction="column" gap="lg">
      <OrderSummary lineItems={lineItems} currency={catalog.currency} />

      {error && (
        <Alert variant="danger" title="Error">
          {error}
        </Alert>
      )}

      {!result && (
        <Flex direction="row" justify="end">
          <Button
            variant="primary"
            onClick={handleMakeQuote}
            disabled={creating || !dealId}
          >
            {creating ? <LoadingSpinner /> : 'Make a quote in HubSpot'}
          </Button>
        </Flex>
      )}

      {result && <SuccessState result={result} onReset={handleReset} />}
    </Flex>
  );

  return (
    <Flex direction="column" gap="md">
      {/* Header */}
      <Flex direction="row" justify="between" align="start">
        <Box>
          <Heading>Configure a SaaS bundle</Heading>
          <Text format={{ color: 'medium' }}>
            Pick a plan, add optional add-ons, and create a draft quote in HubSpot.
          </Text>
        </Box>
        {(planId || step > 0) && (
          <Link onClick={handleReset}>↻ Reset configuration</Link>
        )}
      </Flex>

      {/* Quote template selector (CPQ-templates only). Defaults to the
          portal-wide HUBSPOT_QUOTE_TEMPLATE_ID secret if set, otherwise to
          the first available template. */}
      {templates && templates.length > 0 && (
        <Box>
          <Select
            name="quoteTemplate"
            label="Quote template"
            description="The CPQ template the new quote will be bound to."
            value={selectedTemplateId || undefined}
            options={templates.map((t) => ({
              label: t.name,
              value: t.id,
            }))}
            onChange={(v) => setSelectedTemplateId(v ? String(v) : null)}
          />
        </Box>
      )}

      <Divider />

      {/* Two-column wizard body */}
      <Flex direction="row" gap="lg" align="start">
        {/* Left rail: vertical step indicator */}
        <Box>
          <StepIndicator
            direction="vertical"
            stepNames={STEP_NAMES}
            currentStep={step}
            onClick={handleStepClick}
          />
        </Box>

        {/* Right side: active step content */}
        <Box>
          <Flex direction="column" gap="md">
            <Box>
              <Heading>
                {step + 1}. {STEP_NAMES[step]}
              </Heading>
              <Text format={{ color: 'medium' }}>
                {step === 0 &&
                  'Choose the plan that fits your customer best.'}
                {step === 1 &&
                  'Review what is already included, and add optional extras.'}
                {step === 2 &&
                  'Verify the configuration and create the draft quote.'}
              </Text>
            </Box>

            {step === 0 && renderStep0()}
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}

            {/* Back / Next navigation (hidden after quote creation) */}
            {!result && (
              <Flex direction="row" justify="between">
                <Button
                  variant="secondary"
                  onClick={handleBack}
                  disabled={step === 0}
                >
                  ← Back
                </Button>
                {step < lastStep && (
                  <Button
                    variant="primary"
                    onClick={handleNext}
                    disabled={
                      (step === 0 && !canAdvanceFromStep0) ||
                      (step === 1 && !canAdvanceFromStep1)
                    }
                  >
                    Next →
                  </Button>
                )}
              </Flex>
            )}
          </Flex>
        </Box>
      </Flex>

      <Divider />

      <Text format={{ color: 'medium', fontStyle: 'italic' }}>
        Built by noditch · joost@noditch.de · open-source MIT
      </Text>
    </Flex>
  );
}

hubspot.extend<'crm.record.tab'>(({ context }) => (
  <ProductConfigurator context={context} />
));
