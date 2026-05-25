import logger from '../../shared/logger/index.js';

class SyncService {
  async fullSync(userId, syncData, meta = {}) {
    const outboundResults = {
      workReports: [],
      timeEntries: [],
      photos: [],
      installationCaptures: [],
      notes: [],
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

      if (syncData.outbound.installationCaptures?.length) {
        const { default: installationService } = await import('../crm/installation.service.js');
        const { default: installationRepository } = await import('../crm/installation.repository.js');

        for (const item of syncData.outbound.installationCaptures) {
          try {
            let result;
            if (item.operation === 'CREATE') {
              result = await installationService.create(item.siteId, item.data, userId, meta);
            } else if (item.operation === 'UPDATE') {
              const existing = await installationRepository.findById(item.installationId);
              if (
                item.baseUpdatedAt &&
                existing?.updatedAt &&
                new Date(existing.updatedAt).getTime() > new Date(item.baseUpdatedAt).getTime()
              ) {
                outboundResults.conflicts.push({
                  localId: item.localId,
                  serverId: item.installationId,
                  entityType: 'INSTALLATION_CAPTURE',
                  status: 'CONFLICT',
                  serverUpdatedAt: existing.updatedAt,
                });
                continue;
              }
              result = await installationService.update(item.installationId, item.data, userId, meta);
            }

            outboundResults.installationCaptures.push({
              localId: item.localId,
              serverId: result?._id || item.installationId,
              status: 'SUCCESS',
            });
          } catch (err) {
            outboundResults.installationCaptures.push({
              localId: item.localId,
              serverId: item.installationId || null,
              status: 'FAILED',
              error: err.message,
            });
          }
        }
      }

      if (syncData.outbound.notes?.length) {
        const { default: entityNoteService } = await import('../crm/entityNote.service.js');

        for (const item of syncData.outbound.notes) {
          try {
            const entityType = item.entityType || item.entity_type;
            const entityId = item.entityId || item.entity_id;
            const result = await entityNoteService.create(
              entityType,
              entityId,
              item.data,
              userId,
              meta,
            );
            outboundResults.notes.push({ localId: item.localId, serverId: result._id, status: 'SUCCESS' });
          } catch (err) {
            outboundResults.notes.push({ localId: item.localId, serverId: null, status: 'FAILED', error: err.message });
          }
        }
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

    let crmAddressBook = { customers: [], contacts: [], sites: [], installations: [], notes: [], deleted: {} };
    try {
      const { default: crmAddressBookService } = await import('./crmAddressBook.service.js');
      crmAddressBook = await crmAddressBookService.listChanges(syncData.lastSyncTimestamp);
    } catch (err) {
      logger.warn('Failed to pull CRM address book during sync', { module: 'mobile', error: err.message });
    }

    logger.info('Full sync completed', { module: 'mobile', action: 'sync.full', userId });

    return {
      syncTimestamp: new Date(),
      inbound: {
        orders,
        notifications,
        crmAddressBook,
        catalogUpdates: [],
      },
      outboundResults,
    };
  }

  async getSyncStatus(_userId) {
    const userId = _userId;
    const [orders, notifications, reportCount, deviceCount] = await Promise.all([
      this._countAssignedOrders(userId),
      this._countUnreadNotifications(userId),
      this._countPendingReports(userId),
      this._countActiveDevices(userId),
    ]);

    const pendingItems = orders + notifications + reportCount;

    return {
      pendingItems,
      lastSync: null,
      serverTimestamp: new Date(),
      breakdown: {
        orders,
        notifications,
        workReports: reportCount,
      },
      device: {
        registered: deviceCount > 0,
        activeTokens: deviceCount,
      },
    };
  }

  async _countAssignedOrders(userId) {
    try {
      const Assignment = (await import('../deploy/assignment.model.js')).default;
      return Assignment.countDocuments({
        employeeId: userId,
        status: { $in: ['PLANNED', 'CONFIRMED', 'IN_PROGRESS'] },
        isDeleted: false,
      });
    } catch (err) {
      logger.warn('Failed to count assigned orders for mobile sync status', {
        module: 'mobile',
        error: err.message,
      });
      return 0;
    }
  }

  async _countUnreadNotifications(userId) {
    try {
      const InAppNotification = (await import('../notifications/inAppNotification.model.js')).default;
      return InAppNotification.countDocuments({
        userId,
        isRead: false,
        isDismissed: false,
      });
    } catch (err) {
      logger.warn('Failed to count notifications for mobile sync status', {
        module: 'mobile',
        error: err.message,
      });
      return 0;
    }
  }

  async _countPendingReports(userId) {
    try {
      const { default: workReportRepository } = await import('./workReport.repository.js');
      return workReportRepository.countPendingSyncByTechnician(userId);
    } catch (err) {
      logger.warn('Failed to count work reports for mobile sync status', {
        module: 'mobile',
        error: err.message,
      });
      return 0;
    }
  }

  async _countActiveDevices(userId) {
    try {
      const DeviceToken = (await import('./deviceToken.model.js')).default;
      return DeviceToken.countDocuments({ userId, isActive: true });
    } catch (err) {
      logger.warn('Failed to count active devices for mobile sync status', {
        module: 'mobile',
        error: err.message,
      });
      return 0;
    }
  }
}

const syncService = new SyncService();
export default syncService;
