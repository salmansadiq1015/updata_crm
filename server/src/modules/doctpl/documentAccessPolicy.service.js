import { AuthorizationError } from '../../shared/errors/AppError.js';
import { loadUserPermissions, satisfiesPermission } from '../../shared/middleware/authenticate.js';

const DOCUMENT_READ_PERMISSIONS_BY_TYPE = {
  quotation: ['quotations:read'],
  order_confirmation: ['quotations:read'],
  invoice_standard: ['invoicing:read', 'accounting:ar:read'],
  invoice_advance: ['invoicing:read', 'accounting:ar:read'],
  invoice_final: ['invoicing:read', 'accounting:ar:read'],
  cover_letter: ['documents:read', 'templates:read'],
  service_report: ['field-service:read', 'mobile:read'],
  inspection_certificate: ['field-service:read', 'mobile:read'],
};

class DocumentAccessPolicyService {
  async assertCanRead(document, user) {
    const allowed = await this.canRead(document, user);
    if (!allowed) throw new AuthorizationError('You do not have access to this generated document');
  }

  async assertCanDelete(document, user) {
    const permissions = await this._permissions(user);
    if (this._isAdmin(user) || this._has(permissions, 'documents:delete') || this._has(permissions, 'templates:delete')) {
      return;
    }
    if (this._sameUser(document.generatedBy, user?._id) && this._has(permissions, 'documents:read')) {
      return;
    }
    throw new AuthorizationError('You do not have permission to delete this generated document');
  }

  async canRead(document, user) {
    if (!document || !user) return false;
    if (this._isAdmin(user)) return true;
    if (this._sameUser(document.generatedBy, user._id)) return true;

    const permissions = await this._permissions(user);
    if (this._has(permissions, 'templates:admin')) return true;

    const typePermissions = DOCUMENT_READ_PERMISSIONS_BY_TYPE[document.documentType] || [];
    if (typePermissions.some((permission) => this._has(permissions, permission))) return true;

    if (document.sourceProjectId && (this._has(permissions, 'project:documents:read') || this._has(permissions, 'projects:read'))) {
      return true;
    }

    return this._has(permissions, 'documents:read') && this._has(permissions, 'templates:read');
  }

  async _permissions(user) {
    if (!user) return [];
    return loadUserPermissions(user);
  }

  _has(permissions, permission) {
    return satisfiesPermission(permissions, permission);
  }

  _isAdmin(user) {
    return user?.role?.name === 'Admin' || user?.role === 'Admin';
  }

  _sameUser(left, right) {
    return Boolean(left && right && String(left) === String(right));
  }
}

const documentAccessPolicyService = new DocumentAccessPolicyService();
export default documentAccessPolicyService;
