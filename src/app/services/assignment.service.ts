import { Injectable, inject, signal } from '@angular/core';
import { Assignment } from './assignment.models';
import { AuthService, UserInfo } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class AssignmentService {
  private readonly authService = inject(AuthService);

  readonly activeAssignments = signal<Assignment[]>([]);
  readonly completedAssignments = signal<Assignment[]>([]);
  readonly loadingActive = signal(false);
  readonly loadingCompleted = signal(false);

  private readonly userCache = new Map<string, UserInfo | null>();
  readonly userNames = signal<Map<string, string>>(new Map());

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
      `${this.authService.getBaseUrl()}/queries/assignments/active`
    );

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      throw new Error('Failed to fetch active assignments');
    }

    return await response.json();
  }

  async getCompletedAssignments(): Promise<Assignment[]> {
    const response = await this.authService.authenticatedFetch(
      `${this.authService.getBaseUrl()}/queries/assignments/completed`
    );

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      throw new Error('Failed to fetch completed assignments');
    }

    return await response.json();
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