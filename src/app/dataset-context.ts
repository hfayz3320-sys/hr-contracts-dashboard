import { createContext, useContext } from 'react';
import type { Dataset } from '@/data/fixtures.types';

const empty: Dataset = {
  employees: [],
  contracts: [],
  insurance: [],
  importJobs: [],
  reviewItems: [],
  auditEvents: [],
  sourceFiles: [],
};

export type ApiState = 'loading' | 'live' | 'synthetic' | 'error';

/**
 * Per-endpoint error map. Each key matches one of the dataset slices; a
 * non-null value means that particular slice's last fetch FAILED and the
 * data array in `Dataset` for that slice is therefore an empty placeholder,
 * NOT an authoritative "this table is empty in D1" signal. Pages that care
 * about the distinction (Employees, Contracts, Insurance) should consume
 * this map via `useEndpointError(...)` and render an explicit error banner.
 */
export type EndpointErrors = {
  employees: string | null;
  contracts: string | null;
  insurance: string | null;
  importJobs: string | null;
  reviewItems: string | null;
  auditEvents: string | null;
};

export const emptyEndpointErrors: EndpointErrors = {
  employees: null,
  contracts: null,
  insurance: null,
  importJobs: null,
  reviewItems: null,
  auditEvents: null,
};

export type DatasetContextValue = {
  data: Dataset;
  apiState: ApiState;
  errorMessage: string | null;
  endpointErrors: EndpointErrors;
  /** Last fetch wall-clock so the debug panel can show "Last refreshed". */
  lastFetchAt: string | null;
};

export const DatasetContext = createContext<DatasetContextValue>({
  data: empty,
  apiState: 'loading',
  errorMessage: null,
  endpointErrors: emptyEndpointErrors,
  lastFetchAt: null,
});

export function useDataset(): Dataset {
  return useContext(DatasetContext).data;
}

export function useApiState(): ApiState {
  return useContext(DatasetContext).apiState;
}

export function useApiError(): string | null {
  return useContext(DatasetContext).errorMessage;
}

export function useEndpointErrors(): EndpointErrors {
  return useContext(DatasetContext).endpointErrors;
}

export function useEndpointError(slice: keyof EndpointErrors): string | null {
  return useContext(DatasetContext).endpointErrors[slice];
}

export function useLastFetchAt(): string | null {
  return useContext(DatasetContext).lastFetchAt;
}

export const emptyDataset = empty;
