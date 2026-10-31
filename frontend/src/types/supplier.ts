export type Supplier = {
  id: number;
  ruc: string;
  businessName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SupplierFields = {
  businessName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

export type CreateSupplierInput = SupplierFields & { ruc: string };

export type SetSupplierActiveInput = {
  active: boolean;
};
