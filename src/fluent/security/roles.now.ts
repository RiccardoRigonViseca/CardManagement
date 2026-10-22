import { Role } from '@servicenow/sdk/core'

/**
 * Card Management roles.
 *
 * The visibility perimeter is multi-tenant: it is driven by `bank_id`, which
 * identifies the bank owning the relationship. Which banks a user may see is
 * declared in the Bank Access mapping table, NOT by these roles -- the roles
 * only decide WHAT a user may do, and whether the perimeter applies at all.
 */

/**
 * Read-only access, limited to the user's own bank(s).
 * For support and audit staff who must look but never touch.
 */
export const cardViewer = Role({
    name: 'x_snc_card_manag_1.card_viewer',
    description:
        'Read-only access to customers, cards and transactions, limited to the banks mapped to the user in Bank Access.',
})

/**
 * Read and write, limited to the user's own bank(s).
 *
 * This is the role of the bank user: it can block/unblock cards, change limits
 * and usage controls, update customer contact data and flag disputes -- but
 * only within its own bank_id, and never on identifier fields.
 */
export const cardOperator = Role({
    name: 'x_snc_card_manag_1.card_operator',
    description:
        'Operate on cards and customers (block/unblock, limits, usage controls, contact data, disputes), limited to the banks mapped to the user in Bank Access. Identifier fields remain read-only.',
    containsRoles: [cardViewer],
})

/**
 * Full cross-bank access.
 *
 * WARNING: this role bypasses the bank_id perimeter by design. It is intended
 * for internal staff only -- never assign it to a bank user, or that user will
 * see every bank's data.
 */
export const cardAdmin = Role({
    name: 'x_snc_card_manag_1.card_admin',
    description:
        'Full administrative access across ALL banks. Bypasses the bank_id visibility perimeter by design - do not assign to bank users.',
    containsRoles: [cardOperator],
})
