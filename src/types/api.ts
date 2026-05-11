export type ListResponse<T> = {
  items: T[];
  total: number;
};

export type Paged<T> = {
  page: number;
  pageSize: number;
  total: number;
  items: T[];
};
