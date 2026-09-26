import { Routes } from '@angular/router';
import { AssignmentsPageComponent } from './assignments/assignments-page.component';
import { LoginComponent } from './login/login.component';
import { authGuard } from './guards/auth.guard';
import { SettingsComponent } from './settings/settings.component';

export const routes: Routes = [
	{
		path: 'login',
		component: LoginComponent
	},
	{
		path: 'assignments',
		canActivate: [authGuard],
		component: AssignmentsPageComponent
	},
	{
		path: 'settings',
		component: SettingsComponent
	},
	{
		path: '',
		redirectTo: 'assignments',
		pathMatch: 'full'
	},
	{
		path: '**',
		redirectTo: 'assignments'
	}
];
