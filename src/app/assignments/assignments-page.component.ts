import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmbeddedAssignmentMapComponent } from './components/embedded-assignment-map.component';
import { AssignmentService } from '../services/assignment.service';
import { AuthService } from '../services/auth.service';
import { Assignment } from '../services/assignment.models';

@Component({
  selector: 'app-assignments-page',
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink, EmbeddedAssignmentMapComponent],
  templateUrl: './assignments-page.component.html',
  styleUrl: './assignments-page.component.css'
})
export class AssignmentsPageComponent implements OnInit {
  private readonly authService = inject(AuthService);
  protected readonly assignmentService = inject(AssignmentService);

  protected readonly loading = computed(() =>
    this.assignmentService.loadingActive() || this.assignmentService.loadingCompleted()
  );

  protected readonly activeAssignments = computed(() => this.assignmentService.activeAssignments());
  protected readonly completedAssignments = computed(() => this.assignmentService.completedAssignments());
  protected readonly allAssignments = computed(() => [...this.activeAssignments(), ...this.completedAssignments()]);
  protected readonly expandedAssignmentId = signal<string | null>(null);
  protected readonly selectedAssignmentId = signal<string | null>(null);

  protected readonly selectedAssignment = computed(() => {
    const assignments = this.allAssignments();
    const selectedId = this.selectedAssignmentId();

    return assignments.find(assignment => assignment.assignment_id === selectedId) || assignments[0] || null;
  });

  protected readonly currentUserLabel = computed(() => {
    const user = this.authService.currentUser();
    return user?.email || 'Guest';
  });

  protected readonly activeCount = computed(() => this.activeAssignments().length);
  protected readonly completedCount = computed(() => this.completedAssignments().length);
  protected readonly totalCount = computed(() => this.activeCount() + this.completedCount());

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    await this.authService.restoreSession();

    await Promise.all([
      this.assignmentService.loadActiveAssignments(),
      this.assignmentService.loadCompletedAssignments()
    ]);

    this.syncSelectedAssignment();
  }

  selectAssignment(assignment: Assignment): void {
    this.selectedAssignmentId.set(assignment.assignment_id);
  }

  private syncSelectedAssignment(): void {
    const assignments = this.allAssignments();
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

  toggleExpanded(assignmentId: string): void {
    this.expandedAssignmentId.set(
      this.expandedAssignmentId() === assignmentId ? null : assignmentId
    );
  }

  getGeometryCountLabel(count: number): string {
    return count === 1 ? '1 geometry' : `${count} geometries`;
  }
}