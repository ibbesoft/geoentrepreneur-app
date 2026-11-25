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

export interface CreateAssignmentActivity {
  name: string;
  description?: string;
}

export interface CreateAssignmentCommand {
  type: 'CREATE_ASSIGNMENT';
  title: string;
  description?: string;
  map_geometry_ids: string[];
  activities: CreateAssignmentActivity[];
  due_date?: string;
}

export interface UpdateAssignmentCommand {
  type: 'UPDATE_ASSIGNMENT';
  assignment_id: string;
  title: string;
  description?: string;
  map_geometry_ids: string[];
  activities: CreateAssignmentActivity[];
  due_date?: string;
}

export interface DeleteAssignmentCommand {
  type: 'DELETE_ASSIGNMENT';
  assignment_id: string;
}

export interface PublishAssignmentCommand {
  type: 'PUBLISH_ASSIGNMENT';
  assignment_id: string;
}