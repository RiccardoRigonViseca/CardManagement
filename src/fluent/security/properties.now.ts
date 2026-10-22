import '@servicenow/sdk/global'
import { Property } from '@servicenow/sdk/core'

/**
 * Roles that bypass the bank_id visibility perimeter and see every bank.
 *
 * Kept as a property so the entitlement model can be widened operationally
 * (for example adding an internal audit role) without a code change.
 *
 * WARNING: any role listed here sees ALL banks. Never add the role assigned to
 * bank users -- that would collapse the multi-tenant isolation.
 */
Property({
    $id: Now.ID['full_visibility_roles'],
    name: 'x_snc_card_manag_1.full_visibility_roles',
    type: 'string',
    value: 'x_snc_card_manag_1.card_admin',
    description:
        'Comma-separated list of roles that bypass the bank_id visibility perimeter and can see data across all banks. The admin role always bypasses it. Never list the role assigned to bank users.',
    roles: {
        read: ['admin'],
        write: ['admin'],
    },
})
