import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { BackendConfigService } from './backend-config.service';

const baseUrl = 'https://api.example.test:3443';

describe('AuthService', () => {
  const navigate = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    vi.restoreAllMocks();
    navigate.mockClear();
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        {
          provide: BackendConfigService,
          useValue: {
            getBaseUrl: () => baseUrl,
            getEventsUrl: () => `${baseUrl}/events`
          }
        },
        {
          provide: Router,
          useValue: { navigate }
        }
      ]
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shares session restoration and avoids refreshing an authenticated session again', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url === `${baseUrl}/auth/refresh`) {
        return Response.json({ access_token: 'restored-token' });
      }

      if (url === `${baseUrl}/auth/me`) {
        return Response.json({
          user_id: 'user-1',
          tenant_id: 'tenant-1',
          email: 'user@example.test'
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = TestBed.inject(AuthService);
    await service.restoreSession();
    await service.restoreSession();

    expect(service.isAuthenticated()).toBe(true);
    expect(service.getUserId()).toBe('user-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${baseUrl}/auth/refresh`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include'
      })
    );
  });

  it('logs out and navigates when a 401 cannot be refreshed', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url === `${baseUrl}/auth/refresh` || url === `${baseUrl}/protected`) {
        return new Response(null, { status: 401 });
      }

      if (url === `${baseUrl}/auth/login`) {
        return Response.json({
          success: true,
          access_token: 'access-token',
          user: {
            user_id: 'user-1',
            tenant_id: 'tenant-1',
            email: 'user@example.test'
          }
        });
      }

      if (url === `${baseUrl}/auth/logout`) {
        return Response.json({ success: true });
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = TestBed.inject(AuthService);
    await service.restoreSession();
    await service.login({ email: 'user@example.test', password: 'password' });

    await expect(
      service.authenticatedFetch(`${baseUrl}/protected`)
    ).rejects.toThrow('Session expired');

    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/auth/logout`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: '{}'
      })
    );
  });
});
