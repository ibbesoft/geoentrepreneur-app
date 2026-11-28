import { Injectable, NgZone, inject } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { BackendConfigService } from './backend-config.service';

interface NativeSsePlugin {
  configure(options: { url: string }): Promise<void>;
  open(): Promise<void>;
  close(): Promise<void>;
  addListener(
    eventName: 'open' | 'message' | 'error',
    listener: (result: { type?: string; message?: string; error?: string }) => void
  ): Promise<{ remove: () => void }>;
}

const NativeSse = registerPlugin<NativeSsePlugin>('NativeSse');

export interface ReadModelUpdatedPayload {
  event_type: 'READ_MODEL_UPDATED';
  aggregate_id: string;
  aggregate_type: string;
  tenant_id: string;
  source_event_type: string;
}

export type AssignmentSseEvent = {
  type: 'assignment_read_model_updated';
  payload: ReadModelUpdatedPayload;
};

@Injectable({ providedIn: 'root' })
export class SseService {
  private readonly authService = inject(AuthService);
  private readonly backendConfig = inject(BackendConfigService);
  private readonly zone = inject(NgZone);

  assignmentUpdates(): Observable<AssignmentSseEvent> {
    return new Observable(observer => {
      const eventsUrl = this.backendConfig.getEventsUrl();
      let source: EventSource | null = null;
      let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
      let disposed = false;
      let reconnectDelay = 1_000;
      let nativeHandles: Array<{ remove: () => void }> = [];

      const connect = async () => {
        if (disposed) {
          return;
        }

        try {
          const token = await this.authService.getAccessToken();
          if (!token) {
            scheduleReconnect();
            return;
          }
          if (disposed) {
            return;
          }

          const isNative = Capacitor.isNativePlatform();
          const streamUrl = new URL(eventsUrl);

          if (isNative) {
            streamUrl.searchParams.set('access_token', token);
            await connectNative(streamUrl.toString());
            return;
          }

          source = new EventSource(streamUrl.toString(), {
            withCredentials: !isNative
          });
          source.addEventListener('assignment_read_model_updated', handleUpdate);
          source.onopen = () => {
            reconnectDelay = 1_000;
            console.log('[SSE] Assignment stream connected');
          };
          source.onerror = () => {
            source?.close();
            source = null;
            scheduleReconnect();
          };
        } catch (error) {
          console.warn('[SSE] Unable to start assignment stream:', error);
          scheduleReconnect();
        }
      };

      const connectNative = async (streamUrl: string) => {
        await NativeSse.configure({ url: streamUrl });

        const openHandle = await NativeSse.addListener('open', () => {
          reconnectDelay = 1_000;
          console.log('[SSE] Assignment stream connected');
        });

        const messageHandle = await NativeSse.addListener('message', (result: unknown) => {
          const message = result as { type?: string; message?: string };
          if (message.type !== 'assignment_read_model_updated') {
            return;
          }
          handleNativeUpdate(message.message);
        });

        const errorHandle = await NativeSse.addListener('error', (result: unknown) => {
          const error = result as { error?: string };
          console.warn('[SSE] Assignment stream error:', error.error || 'Unknown error');
          scheduleReconnect();
        });

        nativeHandles = [openHandle, messageHandle, errorHandle];
        await NativeSse.open();
      };

      const handleNativeUpdate = (data: string | undefined) => {
        if (!data) {
          return;
        }
        try {
          const payload = JSON.parse(data) as ReadModelUpdatedPayload;
          this.zone.run(() => observer.next({
            type: 'assignment_read_model_updated',
            payload
          }));
        } catch (error) {
          console.warn('[SSE] Invalid assignment event payload:', error);
        }
      };

      const handleUpdate = (event: Event) => {
        const message = event as MessageEvent;
        try {
          const payload = JSON.parse(message.data) as ReadModelUpdatedPayload;
          this.zone.run(() => observer.next({
            type: 'assignment_read_model_updated',
            payload
          }));
        } catch (error) {
          console.warn('[SSE] Invalid assignment event payload:', error);
        }
      };

      const scheduleReconnect = () => {
        if (disposed || reconnectTimer) {
          return;
        }

        reconnectTimer = setTimeout(() => {
          reconnectTimer = undefined;
          void connect();
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
      };

      void connect();

      return () => {
        disposed = true;
        clearTimeout(reconnectTimer);
        source?.removeEventListener('assignment_read_model_updated', handleUpdate);
        source?.close();
        for (const handle of nativeHandles) {
          handle.remove();
        }
        nativeHandles = [];
        void NativeSse.close();
      };
    });
  }
}
