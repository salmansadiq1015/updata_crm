import appointmentRepository from './appointment.repository.js';

function normalizeId(value) {
  if (!value) return null;
  return String(value._id || value);
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatAddress(site) {
  if (!site) return '';
  const cityLine = [site.postalCode, site.city].filter(Boolean).join(' ');
  return [site.street, cityLine].filter(Boolean).join(', ');
}

function parseAppointmentNotes(notes) {
  const [siteAddress = '', accessInstructions = '', parkingInfo = ''] = String(notes || '')
    .split('|')
    .map((value) => value.trim());

  return { siteAddress, accessInstructions, parkingInfo };
}

async function loadRelatedMaps(assignments) {
  const siteIds = [...new Set(assignments.map((assignment) => normalizeId(assignment.siteId)).filter(Boolean))];
  const customerIds = [...new Set(assignments.map((assignment) => normalizeId(assignment.customerId)).filter(Boolean))];

  const [sites, customers] = await Promise.all([
    siteIds.length
      ? import('../crm/site.model.js').then(({ default: Site }) => (
        Site.find({ _id: { $in: siteIds } }).select('street postalCode city name').lean()
      ))
      : [],
    customerIds.length
      ? import('../crm/customer.model.js').then(({ default: Customer }) => (
        Customer.find({ _id: { $in: customerIds } }).select('name email phone street postalCode city').lean()
      ))
      : [],
  ]);

  return {
    siteMap: new Map(sites.map((site) => [normalizeId(site), site])),
    customerMap: new Map(customers.map((customer) => [normalizeId(customer), customer])),
  };
}

function serializeDocument(file, source = 'file') {
  const id = normalizeId(file._id || file.fileId);
  return {
    id,
    file_id: id,
    name: file.originalName || file.fileName || 'Document',
    mime_type: file.mimeType || null,
    size_bytes: file.sizeBytes || null,
    category: file.category || 'OTHER',
    source,
    download_path: `/mobile/orders/${normalizeId(file.assignmentId || file.entityId || file.orderId)}/documents/${id}/download`,
    updated_at: toIso(file.updatedAt || file.createdAt),
  };
}

async function loadDocumentMap(assignments) {
  const assignmentIds = assignments.map((assignment) => normalizeId(assignment)).filter(Boolean);
  const orderIds = [...new Set(assignments.map((assignment) => normalizeId(assignment.orderId)).filter(Boolean))];
  const projectIds = [...new Set(assignments.map((assignment) => normalizeId(assignment.projectId)).filter(Boolean))];
  const docsByAssignment = new Map(assignmentIds.map((id) => [id, []]));

  const [entityFiles, projectDocuments] = await Promise.all([
    assignmentIds.length || orderIds.length
      ? import('../files/file.model.js').then(({ default: FileMetadata }) => (
        FileMetadata.find({
          $or: [
            { module: 'mobile', entityId: { $in: assignmentIds } },
            { module: 'pm', entityId: { $in: assignmentIds } },
            { module: 'mobile', entityId: { $in: orderIds } },
            { module: 'pm', entityId: { $in: orderIds } },
          ],
        }).select('originalName mimeType sizeBytes category entityId updatedAt createdAt').lean()
      ))
      : [],
    projectIds.length
      ? import('../pm/projectDocument.model.js').then(({ default: ProjectDocument }) => (
        ProjectDocument.find({ projectId: { $in: projectIds }, status: 'FINAL', fileId: { $ne: null } })
          .select('projectId fileId fileName category updatedAt createdAt')
          .populate({ path: 'fileId', select: 'originalName mimeType sizeBytes category updatedAt createdAt' })
          .lean()
      ))
      : [],
  ]);

  const assignmentByOrderId = new Map(assignments.map((assignment) => [
    normalizeId(assignment.orderId),
    normalizeId(assignment),
  ]).filter(([orderId]) => orderId));
  const assignmentsByProjectId = new Map();
  for (const assignment of assignments) {
    const projectId = normalizeId(assignment.projectId);
    if (!projectId) continue;
    if (!assignmentsByProjectId.has(projectId)) assignmentsByProjectId.set(projectId, []);
    assignmentsByProjectId.get(projectId).push(normalizeId(assignment));
  }

  for (const file of entityFiles) {
    const entityId = normalizeId(file.entityId);
    const assignmentId = docsByAssignment.has(entityId) ? entityId : assignmentByOrderId.get(entityId);
    if (!assignmentId) continue;
    docsByAssignment.get(assignmentId).push(serializeDocument({ ...file, assignmentId }, 'mobile'));
  }

  for (const doc of projectDocuments) {
    const projectId = normalizeId(doc.projectId);
    const assignmentIdsForProject = assignmentsByProjectId.get(projectId) || [];
    const file = doc.fileId || {};
    for (const assignmentId of assignmentIdsForProject) {
      docsByAssignment.get(assignmentId).push(serializeDocument({
        _id: file._id || doc.fileId,
        assignmentId,
        originalName: doc.fileName || file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        category: doc.category || file.category,
        updatedAt: doc.updatedAt || file.updatedAt,
        createdAt: doc.createdAt || file.createdAt,
      }, 'project'));
    }
  }

  for (const [assignmentId, docs] of docsByAssignment.entries()) {
    const seen = new Set();
    docsByAssignment.set(assignmentId, docs.filter((doc) => {
      if (!doc.id || seen.has(doc.id)) return false;
      seen.add(doc.id);
      return true;
    }));
  }

  return docsByAssignment;
}

function serializeAssignment(assignment, appointment, maps, documents, syncTimestamp) {
  const assignmentId = normalizeId(assignment);
  const employeeId = normalizeId(assignment.employeeId);
  const projectId = normalizeId(assignment.projectId);
  const customerId = normalizeId(assignment.customerId);
  const siteId = normalizeId(assignment.siteId);
  const site = maps.siteMap.get(siteId);
  const customer = maps.customerMap.get(customerId);
  const parsedNotes = parseAppointmentNotes(appointment?.customerNotes);
  const siteAddress = formatAddress(site) || parsedNotes.siteAddress || '';
  const customerName = appointment?.customerContactName || customer?.name || '';
  const customerPhone = appointment?.customerContactPhone || customer?.phone || '';
  const customerEmail = appointment?.customerContactEmail || customer?.email || '';
  const scheduledStart = toIso(assignment.startDatetime);
  const scheduledEnd = toIso(assignment.endDatetime);
  const updatedAt = toIso(assignment.updatedAt);

  return {
    id: assignmentId,
    _id: assignmentId,
    order_number: assignment.assignmentNumber,
    orderNumber: assignment.assignmentNumber,
    assignment_number: assignment.assignmentNumber,
    order_type: assignment.assignmentType,
    assignmentType: assignment.assignmentType,
    status: assignment.status,
    priority: assignment.priority || 'NORMAL',
    title: assignment.title || assignment.assignmentNumber,
    description: assignment.instructions || '',
    scope_of_work: assignment.instructions || '',
    instructions: assignment.instructions || '',
    scheduled_start: scheduledStart,
    scheduled_end: scheduledEnd,
    scheduledStart,
    scheduledEnd,
    employee_id: employeeId,
    project_id: projectId,
    customer_id: customerId,
    site_id: siteId,
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_email: customerEmail,
    site_address: siteAddress,
    access_instructions: parsedNotes.accessInstructions,
    parking_info: parsedNotes.parkingInfo,
    is_customer_appointment: Boolean(assignment.isCustomerAppointment),
    appointment: appointment ? {
      customer_contact_name: appointment.customerContactName || '',
      customer_contact_phone: appointment.customerContactPhone || '',
      customer_contact_email: appointment.customerContactEmail || '',
      appointment_window: appointment.appointmentWindow || '',
      confirmation_method: appointment.confirmationMethod || null,
      confirmation_status: appointment.confirmationStatus || 'PENDING',
      customer_notes: appointment.customerNotes || '',
      reminder_sent: Boolean(appointment.reminderSent),
      status_history: (appointment.statusHistory || []).map((entry) => ({
        status: entry.status,
        changed_at: toIso(entry.changedAt),
        note: entry.note || null,
      })),
    } : null,
    required_skills: assignment.requiredSkills || [],
    recommended_skills: assignment.recommendedSkills || [],
    required_certifications: assignment.requiredCertifications || [],
    recommended_certifications: assignment.recommendedCertifications || [],
    documents,
    created_at: toIso(assignment.createdAt),
    updated_at: updatedAt,
    last_synced_at: syncTimestamp,
  };
}

export async function serializeMobileAssignments(assignments, options = {}) {
  const list = Array.isArray(assignments) ? assignments : [assignments].filter(Boolean);
  if (list.length === 0) return [];

  const assignmentIds = list.map((assignment) => normalizeId(assignment)).filter(Boolean);
  const [appointments, maps, documentMap] = await Promise.all([
    appointmentRepository.findByAssignmentIds(assignmentIds),
    loadRelatedMaps(list),
    loadDocumentMap(list),
  ]);
  const appointmentMap = new Map(appointments.map((appointment) => [
    normalizeId(appointment.assignmentId),
    appointment,
  ]));
  const syncTimestamp = options.syncTimestamp || new Date().toISOString();

  return list.map((assignment) => serializeAssignment(
    assignment,
    appointmentMap.get(normalizeId(assignment)) || null,
    maps,
    documentMap.get(normalizeId(assignment)) || [],
    syncTimestamp,
  ));
}

export async function serializeMobileAssignment(assignment, options = {}) {
  const [serialized] = await serializeMobileAssignments([assignment], options);
  return serialized || null;
}
