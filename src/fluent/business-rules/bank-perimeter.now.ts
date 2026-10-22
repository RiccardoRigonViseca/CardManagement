import '@servicenow/sdk/global'
import { BusinessRule } from '@servicenow/sdk/core'

/**
 * Data-layer enforcement of the multi-tenant bank_id perimeter.
 *
 * One query business rule per data table. Query rules run on every read of the
 * table, so the perimeter holds for list views, the Table API, reports, flows
 * and AI agents -- not only for callers that go through CardDataProvider.
 * The provider keeps its own check as a second layer (defence in depth).
 *
 * Bank Access itself is intentionally NOT filtered here: it is the entitlement
 * table, protected by ACLs instead, and filtering it with a rule that depends
 * on reading it would be circular.
 */

const PERIMETER_SCRIPT = Now.include('../../server/business-rules/restrict-to-bank-perimeter.js')

BusinessRule({
    $id: Now.ID['customer_bank_perimeter'],
    name: 'Restrict Customers To Bank Perimeter',
    table: 'x_snc_card_manag_1_customer',
    when: 'before',
    action: ['query'],
    order: 100,
    active: true,
    description:
        'Restricts customer queries to the banks mapped to the current user in Bank Access. Users with a full-visibility role are unaffected.',
    script: PERIMETER_SCRIPT,
})

BusinessRule({
    $id: Now.ID['card_bank_perimeter'],
    name: 'Restrict Cards To Bank Perimeter',
    table: 'x_snc_card_manag_1_card',
    when: 'before',
    action: ['query'],
    order: 100,
    active: true,
    description:
        'Restricts card queries to the banks mapped to the current user in Bank Access. Users with a full-visibility role are unaffected.',
    script: PERIMETER_SCRIPT,
})

BusinessRule({
    $id: Now.ID['txn_bank_perimeter'],
    name: 'Restrict Transactions To Bank Perimeter',
    table: 'x_snc_card_manag_1_txn',
    when: 'before',
    action: ['query'],
    order: 100,
    active: true,
    description:
        'Restricts transaction queries to the banks mapped to the current user in Bank Access. Users with a full-visibility role are unaffected.',
    script: PERIMETER_SCRIPT,
})

BusinessRule({
    $id: Now.ID['request_bank_perimeter'],
    name: 'Restrict Card Requests To Bank Perimeter',
    table: 'x_snc_card_manag_1_request',
    when: 'before',
    action: ['query'],
    order: 100,
    active: true,
    description:
        'Restricts card request queries to the banks mapped to the current user in Bank Access, so an operator never sees another bank cases. Users with a full-visibility role are unaffected.',
    script: PERIMETER_SCRIPT,
})
