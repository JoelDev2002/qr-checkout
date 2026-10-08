import type { Campaign, CampaignInput, SetCampaignActiveInput } from '../types/campaign';
import { get, patch, post, put } from './api';

export function listCampaigns(): Promise<Campaign[]> {
  return get<Campaign[]>('/campaigns');
}

export function createCampaign(input: CampaignInput): Promise<Campaign> {
  return post<Campaign>('/campaigns', input);
}

export function updateCampaign(id: number, input: CampaignInput): Promise<Campaign> {
  return put<Campaign>(`/campaigns/${id}`, input);
}

export function setCampaignActive(id: number, input: SetCampaignActiveInput): Promise<Campaign> {
  return patch<Campaign>(`/campaigns/${id}/active`, input);
}
