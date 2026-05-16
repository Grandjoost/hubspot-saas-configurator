export interface CatalogItem {
  id: string;
  name: string;
  description?: string;
  unitPrice: number;
  isOneTime: boolean;
  isQuantifiable?: boolean;
  minQty?: number;
  maxQty?: number;
  step?: number;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  unitPrice: number;
  isOneTime: boolean;
  features?: string[];
  recommended?: boolean;
  defaultIncludedItemIds: string[];
  compatibleAddOnIds: string[];
}

export interface Catalog {
  currency: string;
  plans: Plan[];
  items: CatalogItem[];
}

export interface SelectedAddOns {
  [itemId: string]: number; // qty
}

export interface LineItem {
  itemId: string;
  name: string;
  description?: string;
  unitPrice: number;
  quantity: number;
  isOneTime: boolean;
  totalPrice: number;
}

export interface QuoteResult {
  quoteId: string;
  quoteUrl: string;
}
