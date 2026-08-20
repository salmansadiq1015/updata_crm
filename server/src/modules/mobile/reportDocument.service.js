import { NotFoundError } from '../../shared/errors/AppError.js';

/**
 * Turn an Arbeitsrapport into the payload the document renderer expects, so a
 * report can leave the system as a PDF in the company layout — the paper the
 * technician used to fill in by hand.
 */

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function toId(value) {
  if (!value) return null;
  return value._id || value.id || value;
}

/** "07:30 - 10:05 (2.5 h)" — what the technician wrote down, priced later. */
function timeSpentLine(report) {
  const from = formatTime(report.arrivalTime);
  const to = formatTime(report.departureTime);
  if (!from || !to) return '';
  const hours = (new Date(report.departureTime) - new Date(report.arrivalTime)) / 3600000;
  const billed = Math.round(Math.max(0, hours) * 4) / 4;
  return `${from} - ${to} (${billed} h)`;
}

class ReportDocumentService {
  async buildPayload(reportOrId) {
    const { default: workReportRepository } = await import('./workReport.repository.js');
    const report = (reportOrId && typeof reportOrId === 'object')
      ? reportOrId
      : await workReportRepository.findById(reportOrId);
    if (!report) throw new NotFoundError('WorkReport', reportOrId);

    const { default: Assignment } = await import('../deploy/assignment.model.js');
    const assignment = await Assignment.findById(toId(report.orderId))
      .select('title assignmentNumber assignmentType orderId customerId siteId installationId startDatetime')
      .lean();

    // The customer sits on the assignment, or on the order it belongs to.
    let customerId = assignment?.customerId || null;
    let orderNumber = '';
    if (assignment?.orderId) {
      const { default: Order } = await import('../qop/order.model.js');
      const order = await Order.findById(assignment.orderId).select('customerId customerName orderNumber').lean();
      customerId = customerId || order?.customerId || null;
      orderNumber = order?.orderNumber || '';
    }

    const { default: Customer } = await import('../crm/customer.model.js');
    const customer = customerId
      ? await Customer.findById(customerId)
        .select('customerNumber name street addressSupplement postalCode city country phone mobile email')
        .lean()
      : null;

    const { default: Site } = await import('../crm/site.model.js');
    const site = assignment?.siteId
      ? await Site.findById(assignment.siteId).select('name street postalCode city').lean()
      : null;

    // The installation worked on becomes the equipment block of the report.
    let equipment = null;
    if (assignment?.installationId) {
      const { default: Installation } = await import('../crm/installation.model.js');
      const installation = await Installation.findById(assignment.installationId)
        .select('type manufacturer model serialNumber powerOutputKw yearOfManufacture')
        .lean();
      if (installation) {
        equipment = {
          name: [installation.type, installation.powerOutputKw ? `${installation.powerOutputKw} kW` : null]
            .filter(Boolean).join(' · '),
          model: [installation.manufacturer, installation.model].filter(Boolean).join(' '),
          serialNumber: [installation.serialNumber, installation.yearOfManufacture]
            .filter(Boolean).join(' / '),
          location: site?.name || '',
        };
      }
    }

    const { default: User } = await import('../auth/user.model.js');
    const technician = report.technicianId
      ? await User.findById(toId(report.technicianId)).select('firstName lastName initials').lean()
      : null;

    const objectAddress = site?.street
      ? [site.street, site.city].filter(Boolean).join(', ')
      : [customer?.street, customer?.city].filter(Boolean).join(', ');

    const data = {
      templateType: 'service_report',
      documentNumber: report.reportNumber,
      documentDate: formatDate(report.reportDate),
      reference: orderNumber || assignment?.assignmentNumber || '',
      title: assignment?.title || '',
      language: 'de',
      objectAddress: objectAddress || null,

      customerId: toId(customerId),
      customerName: customer?.name || '',
      customer: {
        number: customer?.customerNumber || '',
        name: customer?.name || '',
        addressLine1: customer?.addressSupplement || customer?.street || '',
        addressLine2: customer?.addressSupplement ? (customer?.street || '') : '',
        plz: customer?.postalCode || '',
        city: customer?.city || '',
        country: customer?.country || 'CH',
        email: customer?.email || null,
        phone: customer?.mobile || customer?.phone || null,
      },

      equipment,
      workPerformed: report.workPerformed || '',
      findings: report.findings || '',
      recommendations: report.nextSteps || '',
      timeSpent: timeSpentLine(report),
      materialsUsed: (report.materialItems || []).map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
      })),
      technician: technician
        ? [technician.firstName, technician.lastName].filter(Boolean).join(' ')
        : (report.customerSignerName || ''),
      signerName: report.customerSignerName || '',

      sourceCustomerId: toId(customerId),
      sourceProjectId: toId(report.projectId),
      metadata: {
        customerName: customer?.name || '',
        documentNumber: report.reportNumber,
        templateType: 'service_report',
        reportStatus: report.status,
      },
    };

    return {
      templateType: 'service_report',
      sourceModule: 'mobile',
      sourceRecordId: toId(report),
      language: 'de',
      data,
    };
  }

  async generateDocument(reportOrId, generatedBy, meta = {}) {
    const payload = await this.buildPayload(reportOrId);
    const { default: documentGenerationService } = await import('../doctpl/documentGeneration.service.js');
    const generatedDocument = await documentGenerationService.generate({
      ...payload,
      generatedBy,
      meta,
    });

    const { default: fileService } = await import('../files/file.service.js');
    let downloadUrl = null;
    try {
      downloadUrl = await fileService.getDownloadUrl(generatedDocument.fileId);
    } catch {
      downloadUrl = null;
    }

    return {
      document: generatedDocument,
      documentId: generatedDocument._id,
      fileId: generatedDocument.fileId,
      fileName: generatedDocument.fileName,
      downloadUrl,
    };
  }
}

const reportDocumentService = new ReportDocumentService();
export default reportDocumentService;
