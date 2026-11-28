import { CommonModule, DatePipe } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmbeddedAssignmentMapComponent } from './components/embedded-assignment-map.component';
import { AssignmentService } from '../services/assignment.service';
import { AuthService } from '../services/auth.service';
import { Assignment } from '../services/assignment.models';
import { SseService } from '../services/sse.service';
import { Subscription } from 'rxjs';

type AssignmentFilter = 'all' | 'published' | 'awaiting-agreement' | 'ready-to-activate' | 'active' | 'completed';

@Component({
  selector: 'app-assignments-page',
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink, EmbeddedAssignmentMapComponent],
  templateUrl: './assignments-page.component.html',
  styleUrl: './assignments-page.component.css'
})
export class AssignmentsPageComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly sseService = inject(SseService);
  private sseSubscription?: Subscription;
  private reloadTimer?: ReturnType<typeof setTimeout>;
  @ViewChild('assignmentCarousel') private assignmentCarousel?: ElementRef<HTMLElement>;
  protected readonly assignmentService = inject(AssignmentService);

  protected readonly loading = computed(() =>
    this.assignmentService.loadingAwaitingSupplier() ||
    this.assignmentService.loadingAwaitingAgreement() ||
    this.assignmentService.loadingAwaitingActivation() ||
    this.assignmentService.loadingActive() ||
    this.assignmentService.loadingCompleted()
  );

  protected readonly publishedAssignments = computed(() =>
    this.uniqueAssignments(this.assignmentService.awaitingSupplierAssignments())
  );
  protected readonly awaitingAgreementAssignments = computed(() =>
    this.uniqueAssignments(this.assignmentService.awaitingAgreementAssignments())
  );
  protected readonly readyToActivateAssignments = computed(() =>
    this.uniqueAssignments(this.assignmentService.awaitingActivationAssignments())
  );
  protected readonly activeAssignments = computed(() =>
    this.uniqueAssignments(this.assignmentService.activeAssignments())
  );
  protected readonly completedAssignments = computed(() =>
    this.uniqueAssignments(this.assignmentService.completedAssignments())
  );
  protected readonly allAssignments = computed(() => {
    const assignmentsById = new Map<string, Assignment>();

    // Later lifecycle states take precedence during a status transition.
    for (const assignmentGroup of [
      this.publishedAssignments(),
      this.awaitingAgreementAssignments(),
      this.readyToActivateAssignments(),
      this.activeAssignments(),
      this.completedAssignments()
    ]) {
      for (const assignment of assignmentGroup) {
        assignmentsById.set(assignment.assignment_id, assignment);
      }
    }

    return [...assignmentsById.values()];
  });
  protected readonly assignmentFilter = signal<AssignmentFilter>('all');
  protected readonly filteredAssignments = computed(() => {
    switch (this.assignmentFilter()) {
      case 'published':
        return this.publishedAssignments();
      case 'awaiting-agreement':
        return this.awaitingAgreementAssignments();
      case 'ready-to-activate':
        return this.readyToActivateAssignments();
      case 'active':
        return this.activeAssignments();
      case 'completed':
        return this.completedAssignments();
      default:
        return this.allAssignments();
    }
  });
  protected readonly expandedAssignmentId = signal<string | null>(null);
  protected readonly selectedAssignmentId = signal<string | null>(null);
  protected readonly assignmentActionError = signal<string | null>(null);
  protected readonly completingAssignmentId = signal<string | null>(null);
  protected readonly assigningAssignmentId = signal<string | null>(null);
  protected readonly currentUserId = computed(() => this.authService.currentUser()?.user_id ?? null);

  protected readonly selectedAssignment = computed(() => {
    const assignments = this.filteredAssignments();
    const selectedId = this.selectedAssignmentId();

    return assignments.find(assignment => assignment.assignment_id === selectedId) || assignments[0] || null;
  });
  protected readonly selectedAssignmentCanComplete = computed(() => {
    const assignment = this.selectedAssignment();
    const userId = this.currentUserId();
    if (!assignment || !userId) {
      return false;
    }

    return assignment.status === 'Active' && assignment.supplier_id === userId;
  });
  protected readonly selectedAssignmentCanAssign = computed(() => {
    const assignment = this.selectedAssignment();
    const userId = this.currentUserId();
    if (!assignment || !userId) {
      return false;
    }

    return assignment.status === 'AwaitingSupplier';
  });
  protected readonly selectedSupplierWorkflowInfo = computed(() => {
    const assignment = this.selectedAssignment();
    return assignment ? this.getSupplierWorkflowInfo(assignment) : null;
  });

  protected readonly currentUserLabel = computed(() => {
    const user = this.authService.currentUser();
    return user?.email || 'Guest';
  });

  protected readonly activeCount = computed(() => this.activeAssignments().length);
  protected readonly completedCount = computed(() => this.completedAssignments().length);
  protected readonly publishedCount = computed(() => this.publishedAssignments().length);
  protected readonly awaitingAgreementCount = computed(() => this.awaitingAgreementAssignments().length);
  protected readonly readyToActivateCount = computed(() => this.readyToActivateAssignments().length);
  protected readonly totalCount = computed(() => this.allAssignments().length);

  async ngOnInit(): Promise<void> {
    await this.reload();
    this.sseSubscription = this.sseService.assignmentUpdates().subscribe(event => {
      console.log('[SSE] Assignment read model updated:', event.payload);
      clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => void this.reloadAssignmentsAfterSse(), 500);
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.reloadTimer);
    this.sseSubscription?.unsubscribe();
  }

  async reload(): Promise<void> {
    this.assignmentActionError.set(null);
    await this.authService.restoreSession();

    await Promise.all([
      this.assignmentService.loadAwaitingSupplierAssignments(),
      this.assignmentService.loadAwaitingAgreementAssignments(),
      this.assignmentService.loadAwaitingActivationAssignments(),
      this.assignmentService.loadActiveAssignments(),
      this.assignmentService.loadCompletedAssignments()
    ]);

    this.syncSelectedAssignment();
  }

  private async reloadAssignmentsAfterSse(): Promise<void> {
    await Promise.all([
      this.assignmentService.loadAwaitingSupplierAssignments(),
      this.assignmentService.loadAwaitingAgreementAssignments(),
      this.assignmentService.loadAwaitingActivationAssignments(),
      this.assignmentService.loadActiveAssignments(),
      this.assignmentService.loadCompletedAssignments()
    ]);
    this.syncSelectedAssignment();
  }

  selectAssignment(assignment: Assignment): void {
    this.selectedAssignmentId.set(assignment.assignment_id);
  }

  setAssignmentFilter(filter: AssignmentFilter): void {
    this.assignmentFilter.set(filter);

    const assignments = this.filteredAssignments();
    if (!assignments.some(assignment => assignment.assignment_id === this.selectedAssignmentId())) {
      this.selectedAssignmentId.set(assignments[0]?.assignment_id ?? null);
    }

    requestAnimationFrame(() => {
      this.assignmentCarousel?.nativeElement.scrollTo({ left: 0, behavior: 'smooth' });
    });
  }

  selectCarouselAssignment(assignmentId: string): void {
    this.selectedAssignmentId.set(assignmentId);

    const card = this.assignmentCarousel?.nativeElement.querySelector<HTMLElement>(
      `[data-assignment-id="${assignmentId}"]`
    );

    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  updateCenteredAssignment(): void {
    const carousel = this.assignmentCarousel?.nativeElement;
    if (!carousel) {
      return;
    }

    const carouselCenter = carousel.getBoundingClientRect().left + carousel.clientWidth / 2;
    let closest: HTMLElement | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const card of carousel.querySelectorAll<HTMLElement>('[data-assignment-id]')) {
      const bounds = card.getBoundingClientRect();
      const distance = Math.abs(bounds.left + bounds.width / 2 - carouselCenter);
      if (distance < closestDistance) {
        closest = card;
        closestDistance = distance;
      }
    }

    const assignmentId = closest?.dataset['assignmentId'];
    if (assignmentId && assignmentId !== this.selectedAssignmentId()) {
      this.selectedAssignmentId.set(assignmentId);
    }
  }

  private syncSelectedAssignment(): void {
    const assignments = this.filteredAssignments();
    const selectedId = this.selectedAssignmentId();

    if (!assignments.length) {
      this.selectedAssignmentId.set(null);
      this.expandedAssignmentId.set(null);
      return;
    }

    if (!selectedId || !assignments.some(assignment => assignment.assignment_id === selectedId)) {
      this.selectedAssignmentId.set(assignments[0].assignment_id);
    }

    if (!this.expandedAssignmentId() || !assignments.some(assignment => assignment.assignment_id === this.expandedAssignmentId())) {
      this.expandedAssignmentId.set(this.selectedAssignmentId());
    }
  }

  async logout(): Promise<void> {
    await this.authService.logout();
  }

  async completeSelectedAssignment(): Promise<void> {
    const assignment = this.selectedAssignment();
    if (!assignment || !this.selectedAssignmentCanComplete()) {
      return;
    }

    this.assignmentActionError.set(null);
    this.completingAssignmentId.set(assignment.assignment_id);
    try {
      await this.assignmentService.completeAssignment(assignment.assignment_id);
      await this.reload();
    } catch (error) {
      console.error('Unable to complete assignment:', error);
      this.assignmentActionError.set('Could not complete this assignment. Please try again.');
    } finally {
      this.completingAssignmentId.set(null);
    }
  }

  async assignSelectedAssignmentToMe(): Promise<void> {
    const assignment = this.selectedAssignment();
    const userId = this.currentUserId();
    if (!assignment || !userId || !this.selectedAssignmentCanAssign()) {
      return;
    }

    this.assignmentActionError.set(null);
    this.assigningAssignmentId.set(assignment.assignment_id);
    try {
      await this.assignmentService.assignSupplier(assignment.assignment_id, userId);
      await this.reload();
    } catch (error) {
      console.error('Unable to assign assignment:', error);
      this.assignmentActionError.set('Could not assign this assignment to you. Please try again.');
    } finally {
      this.assigningAssignmentId.set(null);
    }
  }

  toggleExpanded(assignmentId: string): void {
    this.expandedAssignmentId.set(
      this.expandedAssignmentId() === assignmentId ? null : assignmentId
    );
  }

  getGeometryCountLabel(count: number): string {
    return count === 1 ? '1 geometry' : `${count} geometries`;
  }

  getSupplierWorkflowInfo(assignment: Assignment): string | null {
    const customerName = this.assignmentService.getUserDisplayName(assignment.customer_id) || 'the customer';

    if (assignment.status === 'AwaitingSupplier') {
      const selfAssignmentNote = assignment.customer_id === this.currentUserId()
        ? ' Since you are also the customer, you will become supplier to your own assignment.'
        : '';
      return `This assignment is published by ${customerName}. Use “Assign to me” to take supplier responsibility and move it to the agreement step.${selfAssignmentNote}`;
    }

    if (assignment.status === 'AwaitingAgreement' || assignment.status === 'Pending' || assignment.status === 'Accepted') {
      if (assignment.customer_id === assignment.supplier_id) {
        return `You are both customer and supplier for this assignment. Agreement here can represent internal confirmation with your subcontractors before you activate the assignment.`;
      }
      return `${customerName} and you are now agreeing that you should proceed with this assignment. When ${customerName} confirms, it will move to ready for activation by the customer.`;
    }

    if (assignment.status === 'AwaitingActivation') {
      if (assignment.customer_id === assignment.supplier_id) {
        return 'Your internal agreement is done, and this assignment is now ready for you to activate.';
      }
      return `${customerName} and you have agreed. This assignment is now ready for ${customerName} to activate.`;
    }

    return null;
  }

  private uniqueAssignments(assignments: Assignment[]): Assignment[] {
    return [...new Map(
      assignments.map(assignment => [assignment.assignment_id, assignment] as const)
    ).values()];
  }
}