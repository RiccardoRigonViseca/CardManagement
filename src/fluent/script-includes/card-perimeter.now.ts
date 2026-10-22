import '@servicenow/sdk/global'
import { ScriptInclude } from '@servicenow/sdk/core'

/**
 * Shared resolver for the multi-tenant bank_id perimeter.
 *
 * Called by both the query business rules (data-layer enforcement) and
 * CardDataProvider (adapter-layer enforcement), so the two can never disagree
 * about what a user is entitled to see.
 */
ScriptInclude({
    $id: Now.ID['CardPerimeter'],
    name: 'CardPerimeter',
    description:
        'Resolves the bank_id visibility perimeter of the current user from the Bank Access mapping table. Shared by the query business rules and CardDataProvider so enforcement is identical at both layers. Fails closed: a user with no mapping sees nothing.',
    script: Now.include('../../server/script-includes/card-perimeter.js'),
    active: true,
    accessibleFrom: 'public',
    callerAccess: 'tracking',
})
