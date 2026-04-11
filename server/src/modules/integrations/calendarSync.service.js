import cacheManager from '../../shared/cache/CacheManager.js';
import auditService from '../auth/audit.service.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';

let calendarConnectionRepository;

async function getRepository() {
  if (!calendarConnectionRepository) {
    const mod = await import('./calendarConnection.repository.js');
    calendarConnectionRepository = mod.default;
  }
  return calendarConnectionRepository;
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const OUTLOOK_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const OUTLOOK_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const OUTLOOK_GRAPH_API = 'https://graph.microsoft.com/v1.0';

const TOKEN_REFRESH_BUFFER_MS = 15 * 60 * 1000;

class CalendarSyncService {
  getAuthUrl(userId, provider) {
    if (provider === 'google') {
      const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
      const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
      if (!clientId || !redirectUri) {
        throw new AppError(
          'Google Calendar OAuth is not configured',
          500,
          ERROR_CODES.CALENDAR_OAUTH_FAILED,
        );
      }

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/calendar.events',
        access_type: 'offline',
        prompt: 'consent',
        state: JSON.stringify({ userId, provider }),
      });

      logger.info('Google Calendar auth URL generated', {
        module: 'integrations',
        action: 'calendar.authUrl',
        provider,
        userId,
      });

      return `${GOOGLE_AUTH_URL}?${params.toString()}`;
    }

    if (provider === 'outlook') {
      const clientId = process.env.OUTLOOK_CLIENT_ID;
      const redirectUri = process.env.OUTLOOK_REDIRECT_URI;
      if (!clientId || !redirectUri) {
        throw new AppError(
          'Outlook Calendar OAuth is not configured',
          500,
          ERROR_CODES.CALENDAR_OAUTH_FAILED,
        );
      }

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'Calendars.ReadWrite offline_access',
        state: JSON.stringify({ userId, provider }),
      });

      logger.info('Outlook Calendar auth URL generated', {
        module: 'integrations',
        action: 'calendar.authUrl',
        provider,
        userId,
      });

      return `${OUTLOOK_AUTH_URL}?${params.toString()}`;
    }

    throw new AppError(
      `Unsupported calendar provider '${provider}'`,
      400,
      ERROR_CODES.CALENDAR_OAUTH_FAILED,
    );
  }

  async handleCallback(userId, provider, code) {
    let tokens;

    if (provider === 'google') {
      tokens = await this._exchangeGoogleCode(code);
    } else if (provider === 'outlook') {
      tokens = await this._exchangeOutlookCode(code);
    } else {
      throw new AppError(
        `Unsupported calendar provider '${provider}'`,
        400,
        ERROR_CODES.CALENDAR_OAUTH_FAILED,
      );
    }

    const repo = await getRepository();
    await repo.upsertConnection(userId, provider, {
      userId,
      provider,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      tokenExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
      isConnected: true,
      connectedAt: new Date(),
    });

    logger.info('Calendar connected', {
      module: 'integrations',
      action: 'calendar.callback',
      provider,
      userId,
    });

    return { provider, status: 'connected' };
  }

  async getConnectionStatus(userId) {
    const repo = await getRepository();
    const connections = await repo.findByUserId(userId);

    const statusMap = {};
    for (const provider of ['google', 'outlook']) {
      const conn = connections.find((c) => c.provider === provider);
      statusMap[provider] = {
        isConnected: conn ? conn.isConnected : false,
        connectedAt: conn ? conn.connectedAt : null,
        tokenExpiresAt: conn ? conn.tokenExpiresAt : null,
      };
    }

    return statusMap;
  }

  async disconnect(userId, provider, meta = {}) {
    const repo = await getRepository();
    const connection = await repo.findByUserAndProvider(userId, provider);
    if (!connection) throw new NotFoundError('CalendarConnection', `${userId}:${provider}`);

    await repo.removeConnection(userId, provider);

    auditService.logEvent({
      eventType: 'calendar.disconnected',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { provider },
      module: 'integrations',
    });

    logger.info('Calendar disconnected', {
      module: 'integrations',
      action: 'calendar.disconnect',
      provider,
      userId,
    });

    return { provider, status: 'disconnected' };
  }

  async syncAppointmentToCalendar(userId, appointmentData) {
    const repo = await getRepository();
    const provider = appointmentData.calendarProvider || 'google';
    const connection = await repo.findByUserAndProvider(userId, provider);

    if (!connection || !connection.isConnected) {
      throw new AppError(
        `Calendar not connected for provider '${provider}'`,
        400,
        ERROR_CODES.CALENDAR_NOT_CONNECTED,
      );
    }

    await this.refreshTokenIfNeeded(userId, provider);
    const refreshedConnection = await repo.findByUserAndProvider(userId, provider);

    let result;
    if (provider === 'google') {
      result = await this._syncToGoogleCalendar(refreshedConnection, appointmentData);
    } else if (provider === 'outlook') {
      result = await this._syncToOutlookCalendar(refreshedConnection, appointmentData);
    } else {
      throw new AppError(
        `Unsupported calendar provider '${provider}'`,
        400,
        ERROR_CODES.CALENDAR_SYNC_FAILED,
      );
    }

    logger.info('Appointment synced to calendar', {
      module: 'integrations',
      action: 'calendar.sync',
      provider,
      userId,
      externalEventId: result.externalEventId,
    });

    return result;
  }

  async deleteCalendarEvent(userId, externalEventId) {
    const repo = await getRepository();
    const connections = await repo.findByUserId(userId);
    const activeConnection = connections.find((c) => c.isConnected);

    if (!activeConnection) {
      throw new AppError(
        'No active calendar connection found',
        400,
        ERROR_CODES.CALENDAR_NOT_CONNECTED,
      );
    }

    await this.refreshTokenIfNeeded(userId, activeConnection.provider);
    const refreshedConnection = await repo.findByUserAndProvider(userId, activeConnection.provider);

    let deleted = false;
    if (activeConnection.provider === 'google') {
      deleted = await this._deleteGoogleEvent(refreshedConnection, externalEventId);
    } else if (activeConnection.provider === 'outlook') {
      deleted = await this._deleteOutlookEvent(refreshedConnection, externalEventId);
    }

    logger.info('Calendar event deleted', {
      module: 'integrations',
      action: 'calendar.delete',
      provider: activeConnection.provider,
      userId,
      externalEventId,
      deleted,
    });

    return { deleted, externalEventId };
  }

  async refreshTokenIfNeeded(userId, provider) {
    const repo = await getRepository();
    const connection = await repo.findByUserAndProvider(userId, provider);
    if (!connection || !connection.isConnected) return;

    const expiresAt = new Date(connection.tokenExpiresAt).getTime();
    const now = Date.now();

    if (expiresAt - now > TOKEN_REFRESH_BUFFER_MS) return;

    if (!connection.refreshToken) {
      logger.warn('Cannot refresh token, no refresh token stored', {
        module: 'integrations',
        action: 'calendar.refreshToken',
        provider,
        userId,
      });
      await repo.upsertConnection(userId, provider, { isConnected: false });
      return;
    }

    let tokens;
    try {
      if (provider === 'google') {
        tokens = await this._refreshGoogleToken(connection.refreshToken);
      } else if (provider === 'outlook') {
        tokens = await this._refreshOutlookToken(connection.refreshToken);
      } else {
        return;
      }
    } catch (err) {
      logger.error('Token refresh failed', {
        module: 'integrations',
        action: 'calendar.refreshToken',
        provider,
        userId,
        error: err.message,
      });
      await repo.upsertConnection(userId, provider, { isConnected: false });
      return;
    }

    await repo.upsertConnection(userId, provider, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || connection.refreshToken,
      tokenExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
    });

    logger.info('Calendar token refreshed', {
      module: 'integrations',
      action: 'calendar.refreshToken',
      provider,
      userId,
    });
  }

  async _exchangeGoogleCode(code) {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID,
        client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_CALENDAR_REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!response.ok) {
      const err = await response.text();
      logger.error('Google token exchange failed', {
        module: 'integrations',
        action: 'calendar.google.tokenExchange',
        status: response.status,
        error: err,
      });
      throw new AppError('Google OAuth token exchange failed', 502, ERROR_CODES.CALENDAR_OAUTH_FAILED);
    }

    return response.json();
  }

  async _exchangeOutlookCode(code) {
    const response = await fetch(OUTLOOK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.OUTLOOK_CLIENT_ID,
        client_secret: process.env.OUTLOOK_CLIENT_SECRET,
        redirect_uri: process.env.OUTLOOK_REDIRECT_URI,
        grant_type: 'authorization_code',
        scope: 'Calendars.ReadWrite offline_access',
      }).toString(),
    });

    if (!response.ok) {
      const err = await response.text();
      logger.error('Outlook token exchange failed', {
        module: 'integrations',
        action: 'calendar.outlook.tokenExchange',
        status: response.status,
        error: err,
      });
      throw new AppError('Outlook OAuth token exchange failed', 502, ERROR_CODES.CALENDAR_OAUTH_FAILED);
    }

    return response.json();
  }

  async _refreshGoogleToken(refreshToken) {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID,
        client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Google token refresh failed: ${err}`);
    }

    return response.json();
  }

  async _refreshOutlookToken(refreshToken) {
    const response = await fetch(OUTLOOK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.OUTLOOK_CLIENT_ID,
        client_secret: process.env.OUTLOOK_CLIENT_SECRET,
        grant_type: 'refresh_token',
        scope: 'Calendars.ReadWrite offline_access',
      }).toString(),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Outlook token refresh failed: ${err}`);
    }

    return response.json();
  }

  async _syncToGoogleCalendar(connection, appointmentData) {
    const calendarId = appointmentData.calendarId || 'primary';
    const eventBody = {
      summary: appointmentData.title,
      description: appointmentData.description || '',
      start: {
        dateTime: appointmentData.startTime,
        timeZone: appointmentData.timeZone || 'Europe/Zurich',
      },
      end: {
        dateTime: appointmentData.endTime,
        timeZone: appointmentData.timeZone || 'Europe/Zurich',
      },
      location: appointmentData.location || '',
    };

    if (appointmentData.attendees && appointmentData.attendees.length > 0) {
      eventBody.attendees = appointmentData.attendees.map((email) => ({ email }));
    }

    let url;
    let method;
    if (appointmentData.externalEventId) {
      url = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(appointmentData.externalEventId)}`;
      method = 'PUT';
    } else {
      url = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;
      method = 'POST';
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${connection.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventBody),
    });

    if (!response.ok) {
      const err = await response.text();
      logger.error('Google Calendar sync failed', {
        module: 'integrations',
        action: 'calendar.google.sync',
        status: response.status,
        error: err,
      });
      throw new AppError('Failed to sync event to Google Calendar', 502, ERROR_CODES.CALENDAR_SYNC_FAILED);
    }

    const event = await response.json();
    return {
      externalEventId: event.id,
      provider: 'google',
      htmlLink: event.htmlLink || null,
      status: 'synced',
    };
  }

  async _syncToOutlookCalendar(connection, appointmentData) {
    const eventBody = {
      subject: appointmentData.title,
      body: {
        contentType: 'text',
        content: appointmentData.description || '',
      },
      start: {
        dateTime: appointmentData.startTime,
        timeZone: appointmentData.timeZone || 'W. Europe Standard Time',
      },
      end: {
        dateTime: appointmentData.endTime,
        timeZone: appointmentData.timeZone || 'W. Europe Standard Time',
      },
      location: {
        displayName: appointmentData.location || '',
      },
    };

    if (appointmentData.attendees && appointmentData.attendees.length > 0) {
      eventBody.attendees = appointmentData.attendees.map((email) => ({
        emailAddress: { address: email },
        type: 'required',
      }));
    }

    let url;
    let method;
    if (appointmentData.externalEventId) {
      url = `${OUTLOOK_GRAPH_API}/me/events/${encodeURIComponent(appointmentData.externalEventId)}`;
      method = 'PATCH';
    } else {
      url = `${OUTLOOK_GRAPH_API}/me/events`;
      method = 'POST';
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${connection.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventBody),
    });

    if (!response.ok) {
      const err = await response.text();
      logger.error('Outlook Calendar sync failed', {
        module: 'integrations',
        action: 'calendar.outlook.sync',
        status: response.status,
        error: err,
      });
      throw new AppError('Failed to sync event to Outlook Calendar', 502, ERROR_CODES.CALENDAR_SYNC_FAILED);
    }

    const event = await response.json();
    return {
      externalEventId: event.id,
      provider: 'outlook',
      webLink: event.webLink || null,
      status: 'synced',
    };
  }

  async _deleteGoogleEvent(connection, externalEventId) {
    const response = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/primary/events/${encodeURIComponent(externalEventId)}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${connection.accessToken}` },
      },
    );

    if (!response.ok && response.status !== 404) {
      const err = await response.text();
      logger.error('Google Calendar event delete failed', {
        module: 'integrations',
        action: 'calendar.google.delete',
        status: response.status,
        error: err,
      });
      throw new AppError('Failed to delete Google Calendar event', 502, ERROR_CODES.CALENDAR_SYNC_FAILED);
    }

    return response.status !== 404;
  }

  async _deleteOutlookEvent(connection, externalEventId) {
    const response = await fetch(
      `${OUTLOOK_GRAPH_API}/me/events/${encodeURIComponent(externalEventId)}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${connection.accessToken}` },
      },
    );

    if (!response.ok && response.status !== 404) {
      const err = await response.text();
      logger.error('Outlook Calendar event delete failed', {
        module: 'integrations',
        action: 'calendar.outlook.delete',
        status: response.status,
        error: err,
      });
      throw new AppError('Failed to delete Outlook Calendar event', 502, ERROR_CODES.CALENDAR_SYNC_FAILED);
    }

    return response.status !== 404;
  }
}

const calendarSyncService = new CalendarSyncService();
export default calendarSyncService;
