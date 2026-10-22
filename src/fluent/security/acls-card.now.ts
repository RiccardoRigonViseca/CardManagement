import '@servicenow/sdk/global'
import { Acl } from '@servicenow/sdk/core'
import { cardAdmin, cardOperator, cardViewer } from './roles.now'

/**
 * Card ACLs.
 *
 * Same deny-by-default field strategy as the customer table: `*` is locked to
 * cardAdmin and the operational columns are granted back to cardOperator.
 *
 * What an operator may therefore change is exactly the operational surface --
 * lifecycle status, limits, usage controls and notes. The identity of the card
 * (`card_id`, `customer_id`, `bank_id`, the `customer` reference) and the
 * product attributes stay immutable, enforced by the platform rather than by
 * convention.
 *
 * `current_balance` is also left administrator-only: it is produced by the
 * authorisation system. `available_credit` IS operator-writable because
 * CardOperations recalculates it whenever `credit_limit` changes.
 */

// ---------------------------------------------------------------- record level

Acl({
    $id: Now.ID['card_read'],
    type: 'record',
    table: 'x_snc_card_manag_1_card',
    operation: 'read',
    roles: [cardViewer],
    adminOverrides: true,
    description: 'Read cards. Rows are limited to the user bank perimeter by the query business rule.',
})

Acl({
    $id: Now.ID['card_write'],
    type: 'record',
    table: 'x_snc_card_manag_1_card',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description: 'Operate on cards. Which columns may change is decided by the field-level ACLs.',
})

Acl({
    $id: Now.ID['card_create'],
    type: 'record',
    table: 'x_snc_card_manag_1_card',
    operation: 'create',
    roles: [cardAdmin],
    adminOverrides: true,
    description: 'Create cards. Restricted to administrators: cards are issued by the Digital Banking ESB.',
})

Acl({
    $id: Now.ID['card_delete'],
    type: 'record',
    table: 'x_snc_card_manag_1_card',
    operation: 'delete',
    roles: [cardAdmin],
    adminOverrides: true,
    description: 'Delete cards. Administrators only.',
})

// ------------------------------------------------- field level: default deny

Acl({
    $id: Now.ID['card_write_all_fields'],
    type: 'record',
    table: 'x_snc_card_manag_1_card',
    field: '*',
    operation: 'write',
    roles: [cardAdmin],
    adminOverrides: true,
    description:
        'Default-deny for card columns: administrator-only unless a specific field ACL grants it. Keeps card_id, customer_id, bank_id and the product attributes immutable.',
})

// --------------------------------------------- field level: lifecycle status

Acl({
    $id: Now.ID['card_write_status'],
    type: 'record',
    table: 'x_snc_card_manag_1_card',
    field: 'status',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description: 'Block/unblock: operators may change the card status. Valid transitions are enforced by CardOperations.',
})

Acl({
    $id: Now.ID['card_write_status_reason'],
    type: 'record',
    table: 'x_snc_card_manag_1_card',
    field: 'status_reason',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description: 'Block/unblock: operators may record the reason for the status change.',
})

Acl({
    $id: Now.ID['card_write_notes'],
    type: 'record',
    table: 'x_snc_card_manag_1_card',
    field: 'notes',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description: 'Operators may annotate the card record.',
})

// ----------------------------------------------------- field level: limits

Acl({
    $id: Now.ID['card_write_credit_limit'],
    type: 'record',
    table: 'x_snc_card_manag_1_card',
    field: 'credit_limit',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description: 'Limit management: operators may change the credit limit.',
})

Acl({
    $id: Now.ID['card_write_available_credit'],
    type: 'record',
    table: 'x_snc_card_manag_1_card',
    field: 'available_credit',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description:
        'Derived from credit_limit minus current_balance. Writable only so CardOperations can keep it consistent when the credit limit changes.',
})

Acl({
    $id: Now.ID['card_write_daily_limit'],
    type: 'record',
    table: 'x_snc_card_manag_1_card',
    field: 'daily_limit',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description: 'Limit management: operators may change the daily spend limit.',
})

Acl({
    $id: Now.ID['card_write_monthly_limit'],
    type: 'record',
    table: 'x_snc_card_manag_1_card',
    field: 'monthly_limit',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description: 'Limit management: operators may change the monthly spend limit.',
})

Acl({
    $id: Now.ID['card_write_single_limit'],
    type: 'record',
    table: 'x_snc_card_manag_1_card',
    field: 'single_transaction_limit',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description: 'Limit management: operators may change the single transaction limit.',
})

Acl({
    $id: Now.ID['card_write_atm_limit'],
    type: 'record',
    table: 'x_snc_card_manag_1_card',
    field: 'atm_daily_limit',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description: 'Limit management: operators may change the ATM daily limit.',
})

Acl({
    $id: Now.ID['card_write_ecommerce_limit'],
    type: 'record',
    table: 'x_snc_card_manag_1_card',
    field: 'ecommerce_limit',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description: 'Limit management: operators may change the e-commerce limit.',
})

// --------------------------------------------- field level: usage controls

Acl({
    $id: Now.ID['card_write_contactless'],
    type: 'record',
    table: 'x_snc_card_manag_1_card',
    field: 'contactless_enabled',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description: 'Usage controls: operators may toggle contactless payments.',
})

Acl({
    $id: Now.ID['card_write_ecommerce_enabled'],
    type: 'record',
    table: 'x_snc_card_manag_1_card',
    field: 'ecommerce_enabled',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description: 'Usage controls: operators may toggle e-commerce usage.',
})

Acl({
    $id: Now.ID['card_write_atm_enabled'],
    type: 'record',
    table: 'x_snc_card_manag_1_card',
    field: 'atm_enabled',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description: 'Usage controls: operators may toggle ATM withdrawals.',
})

Acl({
    $id: Now.ID['card_write_international'],
    type: 'record',
    table: 'x_snc_card_manag_1_card',
    field: 'international_enabled',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description: 'Usage controls: operators may toggle international usage.',
})

Acl({
    $id: Now.ID['card_write_recurring'],
    type: 'record',
    table: 'x_snc_card_manag_1_card',
    field: 'recurring_enabled',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description: 'Usage controls: operators may toggle recurring payments.',
})
