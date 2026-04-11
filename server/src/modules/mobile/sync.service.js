import logger from '../../shared/logger/index.js';

class SyncService {
  async fullSync(userId, syncData, meta = {}) {
    const outboundResults = {
      workReports: [],
      timeEntries: [],
      photos: [],
      conflicts: [],
    };

    // Process outbound items
    if (syncData.outbound) {
      if (syncData.outbound.workReports?.length) {
        const { default: reportService } = await import('./report.service.js');
        for (const item of syncData.outbound.workReports) {
          try {
            const result = await reportService.create(item.orderId, item.data, userId, meta);
            outboundResults.workReports.push({ localId: item.localId, serverId: result._id, status: 'SUCCESS' });
          } catch (err) {
            outboundResults.workReports.push({ localId: item.localId, serverId: null, status: 'FAILED', error: err.message });
          }
        }
      }

      if (syncData.outbound.timeEntries?.length) {
        const { default: timeEntryService } = await import('./timeEntry.service.js');
        for (const item of syncData.outbound.timeEntries) {
          try {
            const result = await timeEntryService.create(item.orderId, item.data, userId, meta);
            outboundResults.timeEntries.push({ localId: item.localId, serverId: result._id, status: 'SUCCESS' });
          } catch (err) {
            outboundResults.timeEntries.push({ localId: item.localId, serverId: null, status: 'FAILED', error: err.message });
          }
        }
      }

      if (syncData.outbound.photos?.length) {
        const { default: photoService } = await import('./photo.service.js');
        for (const item of syncData.outbound.photos) {
          try {
            const result = await photoService.upload(item.orderId, item.fileData, item.metadata, userId, meta);
            outboundResults.photos.push({ localId: item.localId, serverId: result._id, status: 'SUCCESS' });
          } catch (err) {
            outboundResults.photos.push({ localId: item.localId, serverId: null, status: 'FAILED', error: err.message });
          }
        }
      }

      if (syncData.outbound.chatMessages?.length) {
        const { default: chatService } = await import('./chat.service.js');
        for (const item of syncData.outbound.chatMessages) {
          try {
            await chatService.sendMessage(item.projectId, item.data, userId, meta);
          } catch (err) {
            logger.warn('Failed to sync chat message', { module: 'mobile', localId: item.localId, error: err.message });
          }
        }
      }

      if (syncData.outbound.materialItems?.length) {
        // Material items are typically part of work reports; process as needed
        logger.info('Material items sync received', { module: 'mobile', count: syncData.outbound.materialItems.length });
      }
    }

    // Pull inbound changes
    let orders = [];
    try {
      const { default: assignmentService } = await import('../deploy/assignment.service.js');
      orders = await assignmentService.listByEmployee(userId, syncData.lastSyncTimestamp);
    } catch (err) {
      logger.warn('Failed to pull inbound orders during sync', { module: 'mobile', error: err.message });
    }

    let notifications = [];
    try {
      const { default: notificationService } = await import('./notification.service.js');
      notifications = await notificationService.listNotifications(userId, {
        since: syncData.lastSyncTimestamp,
      });
    } catch (err) {
      logger.warn('Failed to pull inbound notifications during sync', { module: 'mobile', error: err.message });
    }

    logger.info('Full sync completed', { module: 'mobile', action: 'sync.full', userId });

    return {
      syncTimestamp: new Date(),
      inbound: {
        orders,
        notifications,
        catalogUpdates: [],
      },
      outboundResults,
    };
  }

  async getSyncStatus(userId) {
    // Placeholder
    return { pendingItems: 0, lastSync: null };
  }
}

const syncService = new SyncService();
export default syncService;
