import { adminBffRequest } from './admin-bff-client'
import type { AdminPrincipal } from '@/types/admin.types'

export const adminPrincipalApi = {
  async me(): Promise<AdminPrincipal> {
    const data = await adminBffRequest<{ readonly principal: AdminPrincipal }>('/api/session')
    return data.principal
  },
}
