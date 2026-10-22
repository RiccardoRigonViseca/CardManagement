import '@servicenow/sdk/global'
import { ScriptInclude } from '@servicenow/sdk/core'

/**
 * Read access layer for the Card Management data model.
 *
 * Every consumer -- portal widgets, agentic workflow tools, flows -- reads
 * through this provider instead of querying the tables, so that replacing the
 * MVP tables with direct Digital Banking ESB calls touches only this one file.
 *
 * Public so that widgets and tools running in other scopes can call it;
 * callerAccess 'tracking' records which scopes do.
 */
ScriptInclude({
    $id: Now.ID['CardDataProvider'],
    name: 'CardDataProvider',
    description:
        'Read access layer for customers, cards and transactions. Addresses records by business key (customer_id, card_id, transaction_id), returns DTOs rather than GlideRecords, never exposes a clear PAN, and centrally applies the bank_id visibility perimeter.',
    script: Now.include('../../server/script-includes/card-data-provider.js'),
    active: true,
    accessibleFrom: 'public',
    callerAccess: 'tracking',
})
