import '@servicenow/sdk/global'
import { Acl } from '@servicenow/sdk/core'
import { cardAdmin, cardOperator, cardViewer } from './roles.now'

/**
 * Transaction and Bank Access ACLs.
 *
 * TRANSACTIONS ARE A READ-ONLY ENTITY
 * -----------------------------------
 * Movements come from the Digital Banking ESB and are never authored here.
 * The deny-by-default `*` field ACL therefore locks every column to cardAdmin,
 * and only two columns are granted back to cardOperator: `disputed` and
 * `status`, which is precisely the surface CardOperations.disputeTransaction
 * touches.
 *
 * The practical effect is strong: even if a caller bypassed the adapter, an
 * operator still could not alter an amount, a merchant or a date. The dispute
 * exception is enforced at the platform level, not merely in script.
 *
 * BANK ACCESS IS THE ENTITLEMENT TABLE
 * ------------------------------------
 * It decides who sees which bank, so only administrators may change it --
 * otherwise an operator could grant themselves another bank's data. Read is
 * open to all card roles because CardPerimeter must query it to resolve the
 * caller's own perimeter.
 */

// ====================================================== TRANSACTIONS: record

Acl({
    $id: Now.ID['txn_read'],
    type: 'record',
    table: 'x_snc_card_manag_1_txn',
    operation: 'read',
    roles: [cardViewer],
    adminOverrides: true,
    description: 'Read transactions. Rows are limited to the user bank perimeter by the query business rule.',
})

Acl({
    $id: Now.ID['txn_write'],
    type: 'record',
    table: 'x_snc_card_manag_1_txn',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description:
        'Needed only so an operator can raise a dispute. The field-level ACLs narrow this to the disputed and status columns.',
})

Acl({
    $id: Now.ID['txn_create'],
    type: 'record',
    table: 'x_snc_card_manag_1_txn',
    operation: 'create',
    roles: [cardAdmin],
    adminOverrides: true,
    description: 'Create transactions. Administrators only: movements originate from the Digital Banking ESB.',
})

Acl({
    $id: Now.ID['txn_delete'],
    type: 'record',
    table: 'x_snc_card_manag_1_txn',
    operation: 'delete',
    roles: [cardAdmin],
    adminOverrides: true,
    description: 'Delete transactions. Administrators only.',
})

// ======================================================= TRANSACTIONS: fields

Acl({
    $id: Now.ID['txn_write_all_fields'],
    type: 'record',
    table: 'x_snc_card_manag_1_txn',
    field: '*',
    operation: 'write',
    roles: [cardAdmin],
    adminOverrides: true,
    description:
        'Default-deny for transaction columns: amounts, merchant data, dates and identifiers are administrator-only. This is what makes transactions a read-only entity in practice.',
})

Acl({
    $id: Now.ID['txn_write_disputed'],
    type: 'record',
    table: 'x_snc_card_manag_1_txn',
    field: 'disputed',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description: 'The dispute exception: operators may flag a transaction as disputed.',
})

Acl({
    $id: Now.ID['txn_write_status'],
    type: 'record',
    table: 'x_snc_card_manag_1_txn',
    field: 'status',
    operation: 'write',
    roles: [cardOperator],
    adminOverrides: true,
    description: 'The dispute exception: raising a dispute moves the transaction status to disputed.',
})

// ======================================================= BANK ACCESS: record

Acl({
    $id: Now.ID['bank_access_read'],
    type: 'record',
    table: 'x_snc_card_manag_1_bank_access',
    operation: 'read',
    roles: [cardViewer],
    adminOverrides: true,
    description: 'Read bank entitlements. Required by CardPerimeter to resolve the current user perimeter.',
})

Acl({
    $id: Now.ID['bank_access_write'],
    type: 'record',
    table: 'x_snc_card_manag_1_bank_access',
    operation: 'write',
    roles: [cardAdmin],
    adminOverrides: true,
    description:
        'Change bank entitlements. Administrators only: an operator able to edit this could grant themselves another bank data.',
})

Acl({
    $id: Now.ID['bank_access_create'],
    type: 'record',
    table: 'x_snc_card_manag_1_bank_access',
    operation: 'create',
    roles: [cardAdmin],
    adminOverrides: true,
    description: 'Grant bank entitlements. Administrators only.',
})

Acl({
    $id: Now.ID['bank_access_delete'],
    type: 'record',
    table: 'x_snc_card_manag_1_bank_access',
    operation: 'delete',
    roles: [cardAdmin],
    adminOverrides: true,
    description: 'Revoke bank entitlements. Administrators only.',
})
