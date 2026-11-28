import { Injectable, inject, signal } from '@angular/core';
import {
  Assignment,
  CreateAssignmentCommand,
  DeleteAssignmentCommand,
  PublishAssignmentCommand,
  UpdateAssignmentCommand
} from './assignment.models';
import { AuthService, UserInfo } from './auth.service';
import { BackendConfigService } from './backend-config.service';

@Injectable({
  providedIn: 'root'
})
export class AssignmentService {
  private readonly authService = inject(AuthService);
  private readonly backendConfig = inject(BackendConfigService);

  readonly assignments = signal<Assignment[]>([]);
  readonly awaitingSupplierAssignments = signal<Assignment[]>([]);
  readonly awaitingAgreementAssignments = signal<Assignment[]>([]);
  readonly awaitingActivationAssignments = signal<Assignment[]>([]);
  readonly activeAssignments = signal<Assignment[]>([]);
  readonly completedAssignments = signal<Assignment[]>([]);
  readonly loading = signal(false);
  readonly loadingAwaitingSupplier = signal(false);
  readonly loadingAwaitingAgreement = signal(false);
  readonly loadingAwaitingActivation = signal(false);
  readonly loadingActive = signal(false);
  readonly loadingCompleted = signal(false);

  private readonly userCache = new Map<string, UserInfo | null>();
  readonly userNames = signal<Map<string, string>>(new Map());

  async loadAssignments(): Promise<void> {
    this.loading.set(true);

    try {
      const assignments = await this.getAssignments();
      this.assignments.set(assignments);
      await this.loadUserNames(assignments);
    } catch (error) {
      console.error('Error loading assignments:', error);
      this.assignments.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async loadActiveAssignments(): Promise<void> {
    this.loadingActive.set(true);

    try {
      const assignments = await this.getActiveAssignments();
      this.activeAssignments.set(assignments);
      await this.loadUserNames(assignments);
    } catch (error) {
      console.error('Error loading active assignments:', error);
      this.activeAssignments.set([]);
    } finally {
      this.loadingActive.set(false);
    }
  }

  async loadCompletedAssignments(): Promise<void> {
    this.loadingCompleted.set(true);

    try {
      const assignments = await this.getCompletedAssignments();
      this.completedAssignments.set(assignments);
      await this.loadUserNames(assignments);
    } catch (error) {
      console.error('Error loading completed assignments:', error);
      this.completedAssignments.set([]);
    } finally {
      this.loadingCompleted.set(false);
    }
  }

  async loadAwaitingSupplierAssignments(): Promise<void> {
    this.loadingAwaitingSupplier.set(true);

    try {
      const assignments = await this.getAwaitingSupplierAssignments();
      this.awaitingSupplierAssignments.set(assignments);
      await this.loadUserNames(assignments);
    } catch (error) {
      console.error('Error loading assignments awaiting supplier:', error);
      this.awaitingSupplierAssignments.set([]);
    } finally {
      this.loadingAwaitingSupplier.set(false);
    }
  }

  async loadAwaitingAgreementAssignments(): Promise<void> {
    this.loadingAwaitingAgreement.set(true);

    try {
      const assignments = await this.getAssignmentsByQuery('awaiting_agreement');
      this.awaitingAgreementAssignments.set(this.onlyAssignedToCurrentSupplier(assignments));
      await this.loadUserNames(assignments);
    } catch (error) {
      console.error('Error loading assignments awaiting agreement:', error);
      this.awaitingAgreementAssignments.set([]);
    } finally {
      this.loadingAwaitingAgreement.set(false);
    }
  }

  async loadAwaitingActivationAssignments(): Promise<void> {
    this.loadingAwaitingActivation.set(true);

    try {
      const assignments = await this.getAssignmentsByQuery('awaiting_activation');
      this.awaitingActivationAssignments.set(this.onlyAssignedToCurrentSupplier(assignments));
      await this.loadUserNames(assignments);
    } catch (error) {
      console.error('Error loading assignments awaiting activation:', error);
      this.awaitingActivationAssignments.set([]);
    } finally {
      this.loadingAwaitingActivation.set(false);
    }
  }

  private async loadUserNames(assignments: Assignment[]): Promise<void> {
    const userIds = new Set<string>();

    for (const assignment of assignments) {
      if (assignment.customer_id) {
        userIds.add(assignment.customer_id);
      }

      if (assignment.supplier_id) {
        userIds.add(assignment.supplier_id);
      }
    }

    const fetchPromises: Promise<void>[] = [];
    for (const userId of userIds) {
      if (!this.userCache.has(userId)) {
        fetchPromises.push(this.fetchAndCacheUser(userId));
      }
    }

    await Promise.all(fetchPromises);

    const namesMap = new Map<string, string>();
    for (const [id, user] of this.userCache) {
      if (user) {
        namesMap.set(id, user.full_name || user.email);
      }
    }

    this.userNames.set(namesMap);
  }

  private async fetchAndCacheUser(userId: string): Promise<void> {
    const user = await this.authService.getUserById(userId);
    this.userCache.set(userId, user);
  }

  async getActiveAssignments(): Promise<Assignment[]> {
    const response = await this.authService.authenticatedFetch(
      `${this.backendConfig.getBaseUrl()}/queries/assignments/active`
    );

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      throw new Error('Failed to fetch active assignments');
    }

    const assignments = await response.json() as Assignment[];
    const supplierId = this.authService.currentUser()?.user_id;
    if (!supplierId) {
      return [];
    }
    return assignments.filter(assignment =>
      assignment.supplier_id === supplierId
    );
  }

  async getCompletedAssignments(): Promise<Assignment[]> {
    const response = await this.authService.authenticatedFetch(
      `${this.backendConfig.getBaseUrl()}/queries/assignments/completed`
    );

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      throw new Error('Failed to fetch completed assignments');
    }

    return await response.json();
  }

  async getAssignments(): Promise<Assignment[]> {
    const response = await this.authService.authenticatedFetch(
      `${this.backendConfig.getBaseUrl()}/queries/assignments`
    );

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      throw new Error('Failed to fetch assignments');
    }

    return await response.json();
  }

  async getAwaitingSupplierAssignments(): Promise<Assignment[]> {
    return this.getAssignmentsByQuery('awaiting_supplier');
  }

  private async getAssignmentsByQuery(query: 'awaiting_supplier' | 'awaiting_agreement' | 'awaiting_activation'): Promise<Assignment[]> {
    const response = await this.authService.authenticatedFetch(
      `${this.backendConfig.getBaseUrl()}/queries/assignments/${query}`
    );

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch assignments for ${query}`);
    }

    return await response.json() as Assignment[];
  }

  private onlyAssignedToCurrentSupplier(assignments: Assignment[]): Assignment[] {
    const supplierId = this.authService.currentUser()?.user_id;
    return supplierId
      ? assignments.filter(assignment => assignment.supplier_id === supplierId)
      : [];
  }

  async createAssignment(command: CreateAssignmentCommand): Promise<void> {
    const response = await this.authService.authenticatedFetch(
      `${this.backendConfig.getBaseUrl()}/commands/assignment`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command)
      }
    );

    if (!response.ok) {
      throw new Error('Failed to create assignment');
    }
  }

  async updateAssignment(command: UpdateAssignmentCommand): Promise<void> {
    const response = await this.authService.authenticatedFetch(
      `${this.backendConfig.getBaseUrl()}/commands/assignment/${command.assignment_id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command)
      }
    );

    if (!response.ok) {
      throw new Error('Failed to update assignment');
    }
  }

  async deleteAssignment(assignmentId: string): Promise<void> {
    const command: DeleteAssignmentCommand = {
      type: 'DELETE_ASSIGNMENT',
      assignment_id: assignmentId
    };
    const response = await this.authService.authenticatedFetch(
      `${this.backendConfig.getBaseUrl()}/commands/assignment/${assignmentId}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command)
      }
    );

    if (!response.ok) {
      throw new Error('Failed to delete assignment');
    }
  }

  async publishAssignment(assignmentId: string): Promise<void> {
    const command: PublishAssignmentCommand = {
      type: 'PUBLISH_ASSIGNMENT',
      assignment_id: assignmentId
    };
    const response = await this.authService.authenticatedFetch(
      `${this.backendConfig.getBaseUrl()}/commands/assignment/${assignmentId}/publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command)
      }
    );

    if (!response.ok) {
      throw new Error('Failed to publish assignment');
    }
  }

  async assignSupplier(assignmentId: string, supplierId: string): Promise<void> {
    const response = await this.authService.authenticatedFetch(
      `${this.backendConfig.getBaseUrl()}/commands/assignment/assign_supplier`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_id: assignmentId, supplier_id: supplierId })
      }
    );

    if (!response.ok) {
      throw new Error('Failed to assign supplier');
    }
  }

  async createAgreement(assignmentId: string, supplierId: string, title: string): Promise<void> {
    const response = await this.authService.authenticatedFetch(
      `${this.backendConfig.getBaseUrl()}/commands/agreement`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignment_id: assignmentId,
          supplier_id: supplierId,
          title,
          description: '',
          document_key: ''
        })
      }
    );

    if (!response.ok) {
      throw new Error('Failed to create agreement');
    }
  }

  async activateAssignment(assignmentId: string): Promise<void> {
    const response = await this.authService.authenticatedFetch(
      `${this.backendConfig.getBaseUrl()}/commands/assignment/activate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_id: assignmentId })
      }
    );

    if (!response.ok) {
      throw new Error('Failed to activate assignment');
    }
  }

  async completeAssignment(assignmentId: string): Promise<void> {
    const response = await this.authService.authenticatedFetch(
      `${this.backendConfig.getBaseUrl()}/commands/assignment/complete`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_id: assignmentId })
      }
    );

    if (!response.ok) {
      throw new Error('Failed to complete assignment');
    }
  }

  getUserDisplayName(userId: string | undefined): string {
    if (!userId) {
      return '';
    }

    return this.userNames().get(userId) || '';
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'AwaitingSupplier':
        return 'Awaiting Supplier';
      case 'AwaitingAgreement':
        return 'Awaiting Agreement';
      case 'Pending':
        return 'Pending';
      case 'Accepted':
        return 'Accepted';
      case 'AwaitingActivation':
        return 'Awaiting Activation';
      case 'Active':
        return 'Active';
      case 'InProgress':
        return 'In Progress';
      case 'Completed':
        return 'Completed';
      case 'Cancelled':
        return 'Cancelled';
      case 'Draft':
        return 'Draft';
      default:
        return status;
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'Draft':
        return 'status-draft';
      case 'AwaitingSupplier':
        return 'status-awaiting-supplier';
      case 'AwaitingAgreement':
      case 'Pending':
        return 'status-pending';
      case 'Accepted':
        return 'status-accepted';
      case 'AwaitingActivation':
        return 'status-awaiting-activation';
      case 'Active':
        return 'status-active';
      case 'InProgress':
        return 'status-in-progress';
      case 'Completed':
        return 'status-completed';
      case 'Cancelled':
        return 'status-cancelled';
      default:
        return '';
    }
  }
}