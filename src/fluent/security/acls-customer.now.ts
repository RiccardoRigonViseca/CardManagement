import '@servicenow/sdk/global'
import { Acl } from '@servicenow/sdk/core'
import { cardAdmin, cardOperator, cardViewer } from './roles.now'

/**
 * Customer ACLs.
 *
 * ROLE INHERITANCE
 * ----------------
 * cardAdmin contains cardOperator contains cardViewer, so an ACL granted to
 * cardViewer also passes for operators and admins. Each ACL therefore lists
 * only the LOWEST role that should pass.
 *
 * FIELD STRATEGY: DENY BY DEFAULT
 * -------------------------------
 * The `*` field ACL restricts every column to cardAdmin. Writable columns are
 * then granted back one by one to cardOperator. The effect is that anything we
 * forget stays locked instead of silently writable -- and the identifier
 * columns (`customer_id`, `bank_id`) are read-only at the platform level, not
 * merely by convention in CardOperations.
 *
 * Row-level isolation is NOT handled here: ACLs grant access to the table,
 * while the bank_id perimeter is applied by the query business rule.
 */

// ---------------------------------------------------------------- record level

Acl({
    $id: Now.ID['customer_read'],
    type: 'record',
    table: 'x_snc_card_manag_1_customer',
    operation: 'read',
    roles: [cardViewer],
    adminOverrides: true,
    description: 'Read customers. Rows are limited to the user bank perimeter by the query business rule.',
})

Acl({
    $id: Now.ID['customer_write'],
    type: 'record',
    table: 'x_snc_card_manag_1_customer',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description: 'Update customers. Which columns may change is decided by the field-level ACLs.',
})

Acl({
    $id: Now.ID['customer_create'],
    type: 'record',
    table: 'x_snc_card_manag_1_customer',
    operation: 'create',
    roles: [cardAdmin],
    adminOverrides: true,
    description: 'Create customers. Restricted to administrators: customers originate from the Digital Banking ESB.',
})

Acl({
    $id: Now.ID['customer_delete'],
    type: 'record',
    table: 'x_snc_card_manag_1_customer',
    operation: 'delete',
    roles: [cardAdmin],
    adminOverrides: true,
    description: 'Delete customers. Administrators only.',
})

// ----------------------------------------------------------------- field level

Acl({
    $id: Now.ID['customer_write_all_fields'],
    type: 'record',
    table: 'x_snc_card_manag_1_customer',
    field: '*',
    operation: 'write',
    roles: [cardAdmin],
    adminOverrides: true,
    description:
        'Default-deny for customer columns: everything is administrator-only unless a specific field ACL grants it. Keeps customer_id and bank_id immutable.',
})

Acl({
    $id: Now.ID['customer_write_email'],
    type: 'record',
    table: 'x_snc_card_manag_1_customer',
    field: 'email',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description: 'Contact data: operators may update the email address.',
})

Acl({
    $id: Now.ID['customer_write_phone'],
    type: 'record',
    table: 'x_snc_card_manag_1_customer',
    field: 'phone',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description: 'Contact data: operators may update the phone number.',
})

Acl({
    $id: Now.ID['customer_write_country'],
    type: 'record',
    table: 'x_snc_card_manag_1_customer',
    field: 'country',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description: 'Contact data: operators may update the country.',
})

Acl({
    $id: Now.ID['customer_write_language'],
    type: 'record',
    table: 'x_snc_card_manag_1_customer',
    field: 'preferred_language',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description: 'Contact data: operators may update the preferred language.',
})

Acl({
    $id: Now.ID['customer_write_notes'],
    type: 'record',
    table: 'x_snc_card_manag_1_customer',
    field: 'notes',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description: 'Operators may annotate the customer record.',
})
