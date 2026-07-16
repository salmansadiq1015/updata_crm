import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { referenceService } from '../services/reference-service';

const ADMIN_KEY = ['qop', 'departments', 'admin'];
// The select dropdowns in the QOP forms read this key; keep it in sync on writes.
const REFERENCE_KEY = ['qop', 'references', 'departments'];

export function useDepartmentsAdmin() {
  return useQuery({
    queryKey: ADMIN_KEY,
    // Include inactive departments so deactivated ones stay visible and reactivatable.
    queryFn: () => referenceService.listAllDepartments(),
    select: (r) => r.data ?? [],
    staleTime: 30_000,
  });
}

export function useDepartmentMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ADMIN_KEY });
    qc.invalidateQueries({ queryKey: REFERENCE_KEY });
  };

  const createDepartment = useMutation({
    mutationFn: (data) => referenceService.createDepartment(data),
    onSuccess: invalidate,
  });

  const updateDepartment = useMutation({
    mutationFn: ({ id, data }) => referenceService.updateDepartment(id, data),
    onSuccess: invalidate,
  });

  return { createDepartment, updateDepartment };
}
