export interface ICustomerProjectSummary {
  id: string;
  name: string;
  code: string;
  kind: string;
  stageId: string;
  apartmentCount: number;
  building: { id: string; name: string; code: string } | null;
  members: { user: { id: string; firstName: string; lastName: string } | null }[];
}

export interface ICustomerProjectsPage {
  total: number;
  nextCursor: string | null;
  items: ICustomerProjectSummary[];
  counts: { byStage: Record<string, number> };
}
