import type { Cashier, CreateCashierInput, SetCashierActiveInput } from '../types/user';
import { get, patch, post } from './api';

export function listCashiers(active?: boolean): Promise<Cashier[]> {
  const query = active === undefined ? '' : `?active=${String(active)}`;
  return get<Cashier[]>(`/users${query}`);
}

export function createCashier(input: CreateCashierInput): Promise<Cashier> {
  return post<Cashier>('/users', input);
}

export function setCashierActive(id: number, input: SetCashierActiveInput): Promise<Cashier> {
  return patch<Cashier>(`/users/${id}/active`, input);
}
