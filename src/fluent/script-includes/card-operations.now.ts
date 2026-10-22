import '@servicenow/sdk/global'
import { ScriptInclude } from '@servicenow/sdk/core'

/**
 * Write operations on cards and customers.
 *
 * Kept separate from CardDataProvider on purpose: the provider is the thin,
 * replaceable data-access layer, while the business rules (state transitions,
 * limit validation, field whitelists, audit) live here and survive the switch
 * to the ESB untouched.
 *
 * Identifiers (customer_id, card_id, transaction_id, bank_id) are never
 * writable. Transactions are read-only except for the dispute flag.
 */
ScriptInclude({
    $id: Now.ID['CardOperations'],
    name: 'CardOperations',
    description:
        'Write operations: block/unblock a card, update spending limits and usage controls, update customer contact data, and flag a transaction as disputed. Enforces state transitions, limit hierarchy, editable-field whitelists and the bank_id perimeter. All methods return { success, message, data }.',
    script: Now.include('../../server/script-includes/card-operations.js'),
    active: true,
    accessibleFrom: 'public',
    callerAccess: 'tracking',
})
