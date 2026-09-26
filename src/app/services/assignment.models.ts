export type AssignmentStatus = 'Draft' | 'AwaitingSupplier' | 'AwaitingAgreement' | 'Pending' | 'Accepted' | 'AwaitingActivation' | 'Active' | 'InProgress' | 'Completed' | 'Cancelled';

export interface Activity {
  activity_id: string;
  name: string;
  description?: string;
  status: 'Pending' | 'Planned' | 'InProgress' | 'Completed';
}

export interface Assignment {
  assignment_id: string;
  customer_id: string;
  map_geometry_ids: string[];
  tenant_id: string;
  supplier_id?: string;
  agreement_id?: string;
  exists: boolean;
  title: string;
  description?: string;
  activities_json: Activity[];
  status: AssignmentStatus;
  due_date?: string;
  completed_at?: string;
  version: number;
}