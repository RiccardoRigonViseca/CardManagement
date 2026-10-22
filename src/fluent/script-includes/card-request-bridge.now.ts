import '@servicenow/sdk/global'
import { ScriptInclude } from '@servicenow/sdk/core'

/**
 * Bridge between a Card Request case and the Card Servicing Workflow.
 *
 * clientCallable is set because the Service Portal widget calls it over
 * GlideAjax. That is also why every entry point re-checks authorisation
 * server-side: a client-callable script include is reachable by any
 * authenticated user who can craft the call, so the widget's UI state is
 * never treated as a security boundary. The case itself is loaded through a
 * normal GlideRecord, so the bank perimeter query rule filters it, and
 * approve/reject additionally require the caller to be the requester.
 */
ScriptInclude({
    $id: Now.ID['CardRequestBridge'],
    name: 'CardRequestBridge',
    description:
        'Bridges Card Request cases to the Card Servicing Workflow. Submits a case as the requester so the bank perimeter applies, reflects the agentic execution back onto the case, records the operation the agent proposes, and executes exactly that payload once the user approves. All methods return { success, message, data }.',
    script: Now.include('../../server/script-includes/card-request-bridge.js'),
    active: true,
    clientCallable: true,
    accessibleFrom: 'public',
    callerAccess: 'tracking',
})
