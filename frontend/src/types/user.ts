export type Cashier = {
  id: number;
  name: string;
  email: string;
  active: boolean;
  createdAt: string;
};

export type CreateCashierInput = {
  name: string;
  email: string;
  password: string;
};

export type SetCashierActiveInput = {
  active: boolean;
};
