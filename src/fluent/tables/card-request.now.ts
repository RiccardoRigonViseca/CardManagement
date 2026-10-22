import {
    Table,
    Form,
    default_view,
    StringColumn,
    ChoiceColumn,
    BooleanColumn,
    ReferenceColumn,
    IntegerColumn,
    DateTimeColumn,
    MultiLineTextColumn,
    JsonColumn,
    GenericColumn,
    Formatter,
} from '@servicenow/sdk/core'

/**
 * Card Request
 *
 * The case record that bridges a user's message to the Card Servicing
 * Workflow, and the audit trail of what the agentic layer did about it.
 *
 * WHY A CASE AND NOT JUST A MESSAGE QUEUE
 * ---------------------------------------
 * The record is not here to decide which agent should answer -- the workflow
 * does that routing itself, and duplicating it in front would drift from the
 * agents' real capabilities. It exists because a regulated card operation
 * needs things a chat transcript cannot give:
 *
 *   - an auditable "who asked what, when, and what was done about it",
 *   - a place for the human-in-the-loop approval to live while it is pending,
 *   - a durable state for an interaction that is asynchronous by nature,
 *   - an escalation path when the agent cannot finish the job.
 *
 * STATE vs OUTCOME -- DELIBERATELY SEPARATE
 * -----------------------------------------
 * `state` is where the case is in its lifecycle. `outcome` is how it ended.
 * Keeping them apart matters because "the agent refused the operation" is a
 * successful, correct run of the system, not a failure: a limit that breaches
 * its ceiling SHOULD be refused. Collapsing both into one field would make
 * genuine technical failures indistinguishable from business rules doing their
 * job, and would make the reporting meaningless.
 *
 * TARGETS ARE BUSINESS KEYS
 * -------------------------
 * `customer_id`, `card_id` and `transaction_id` are stored as business keys,
 * not references, for the same reason the rest of the model does it: they stay
 * valid once the local tables give way to direct ESB calls, where a local
 * sys_id will not exist. The `card` reference is a convenience for navigation
 * only, and is allowed to be empty.
 *
 * TRUST BOUNDARY
 * --------------
 * `bank_id` and `requested_by` are never accepted from the caller. A business
 * rule stamps them on insert from the session, because a widget that could
 * choose its own bank_id would defeat the whole multi-tenant perimeter.
 */
export const x_snc_card_manag_1_request = Table({
    name: 'x_snc_card_manag_1_request',
    label: 'Card Request',
    display: 'number',
    audit: true,
    extensible: false,
    allowWebServiceAccess: true,
    accessibleFrom: 'public',
    callerAccess: 'tracking',
    actions: { read: true, create: true, update: true },
    autoNumber: {
        prefix: 'CRQ',
        number: 1000,
        numberOfDigits: 7,
    },
    index: [
        { name: 'idx_request_number', unique: true, element: 'number' },
        { name: 'idx_request_bank', unique: false, element: 'bank_id' },
        { name: 'idx_request_bank_state', unique: false, element: ['bank_id', 'state'] },
        { name: 'idx_request_requester', unique: false, element: 'requested_by' },
        { name: 'idx_request_conversation', unique: false, element: 'conversation_id' },
    ],
    schema: {
        // =============================================================
        // Identity — stamped server-side, never accepted from the caller
        // =============================================================
        number: StringColumn({
            label: 'Number',
            maxLength: 40,
            // The `global.` qualifier is required in a scoped application:
            // without it the default evaluates to "getNextObjNumberPadded
            // undefined, maybe missing global qualifier" and the case is
            // inserted with an empty number. Scoped tables on this instance
            // (sn_risk_advanced_*, sn_ac_automation_*) all use this form;
            // the bare call only works for tables in global scope.
            default: 'javascript:global.getNextObjNumberPadded();',
            readOnly: true,
        }),
        bank_id: StringColumn({
            label: 'Bank ID',
            maxLength: 32,
            mandatory: true,
            readOnly: true,
        }),
        requested_by: ReferenceColumn({
            label: 'Requested By',
            referenceTable: 'sys_user',
            mandatory: true,
            readOnly: true,
            cascadeRule: 'none',
        }),
        channel: ChoiceColumn({
            label: 'Channel',
            maxLength: 40,
            dropdown: 'dropdown_without_none',
            default: 'service_portal',
            choices: {
                service_portal: 'Service Portal',
                otto_panel: 'Otto Panel',
                api: 'API',
                trigger: 'Automated Trigger',
            },
        }),
        /**
         * Groups the turns of one conversation together.
         *
         * Each turn is its own case — that is what gives the audit trail its
         * granularity — but the operator experiences a single conversation, so
         * the turns have to be linkable. The bridge replays the prior turns of
         * the same session as context when it submits a new one, and the
         * "New conversation" button simply starts a new session id.
         */
        session_id: StringColumn({
            label: 'Session ID',
            maxLength: 32,
            readOnly: true,
        }),
        opened_at: DateTimeColumn({ label: 'Opened' }),

        // =============================================================
        // What the user asked
        // =============================================================
        short_description: StringColumn({
            label: 'Summary',
            maxLength: 160,
        }),
        message: MultiLineTextColumn({
            label: 'Request Message',
            maxLength: 4000,
            mandatory: true,
        }),
        /**
         * Classified AFTER handling, by the agentic layer, purely for
         * reporting. It is NOT used to route the request: the workflow decides
         * which agent answers, and a pre-classifier here would go stale every
         * time a tool is added to an agent.
         */
        request_type: ChoiceColumn({
            label: 'Request Type',
            maxLength: 40,
            dropdown: 'dropdown_with_none',
            choices: {
                inquiry: 'Information Inquiry',
                card_block: 'Card Block',
                card_unblock: 'Card Unblock',
                limit_change: 'Limit Change',
                control_change: 'Usage Control Change',
                contact_update: 'Contact Data Update',
                transaction_dispute: 'Transaction Dispute',
                other: 'Other',
            },
        }),
        priority: ChoiceColumn({
            label: 'Priority',
            maxLength: 40,
            dropdown: 'dropdown_without_none',
            default: 'normal',
            choices: {
                low: 'Low',
                normal: 'Normal',
                high: 'High',
            },
        }),

        // =============================================================
        // Lifecycle
        // =============================================================
        state: ChoiceColumn({
            label: 'State',
            maxLength: 40,
            mandatory: true,
            dropdown: 'dropdown_without_none',
            default: 'new',
            choices: {
                new: 'New',
                in_progress: 'In Progress',
                awaiting_input: 'Awaiting User Answer',
                awaiting_confirmation: 'Awaiting Confirmation',
                completed: 'Completed',
                refused: 'Refused',
                failed: 'Failed',
                cancelled: 'Cancelled',
            },
        }),
        closed_at: DateTimeColumn({ label: 'Closed' }),
        processing_seconds: IntegerColumn({
            label: 'Processing Time (s)',
            min: 0,
        }),

        // =============================================================
        // Link back to the agentic execution, for traceability
        // =============================================================
        conversation_id: StringColumn({
            label: 'Conversation ID',
            maxLength: 32,
        }),
        execution_plan_id: StringColumn({
            label: 'Execution Plan ID',
            maxLength: 32,
        }),
        agent_response: MultiLineTextColumn({
            label: 'Agent Response',
            maxLength: 8000,
        }),

        // =============================================================
        // Human-in-the-loop approval
        //
        // This is what the custom widget renders: the agent parks its intent
        // here, the user approves or rejects, and execution resumes.
        // =============================================================
        proposed_action: ChoiceColumn({
            label: 'Proposed Action',
            maxLength: 40,
            dropdown: 'dropdown_with_none',
            choices: {
                block_card: 'Block Card',
                unblock_card: 'Unblock Card',
                update_limits: 'Update Limits',
                update_controls: 'Update Usage Controls',
                update_contact: 'Update Contact Data',
                dispute_transaction: 'Dispute Transaction',
            },
        }),
        proposed_action_summary: MultiLineTextColumn({
            label: 'Proposed Action Summary',
            maxLength: 1000,
        }),
        proposed_action_payload: JsonColumn({
            label: 'Proposed Action Payload',
        }),
        /**
         * When the agent parked the proposal. Anchors the approval timeout:
         * an approval given against context the operator saw an hour ago is
         * not safe to execute, so the bridge expires it.
         *
         * Deliberately not derived from sys_updated_on, which moves on every
         * write and would keep resetting the clock.
         */
        proposed_at: DateTimeColumn({ label: 'Proposed' }),
        confirmation_state: ChoiceColumn({
            label: 'Confirmation',
            maxLength: 40,
            dropdown: 'dropdown_without_none',
            default: 'not_required',
            choices: {
                not_required: 'Not Required',
                pending: 'Pending User Confirmation',
                approved: 'Approved',
                rejected: 'Rejected',
                expired: 'Expired',
            },
        }),
        confirmed_by: ReferenceColumn({
            label: 'Confirmed By',
            referenceTable: 'sys_user',
            cascadeRule: 'none',
        }),
        confirmed_at: DateTimeColumn({ label: 'Confirmed' }),
        rejection_reason: StringColumn({
            label: 'Rejection Reason',
            maxLength: 255,
        }),

        /**
         * The question the agent is waiting on, as emitted by its
         * collect_input_from_user step: a JSON array of `{name, prompt}`.
         *
         * Stored rather than recomputed so the audit trail keeps what the
         * operator was actually asked, and so the widget can render it without
         * re-reading the agentic execution log.
         */
        pending_input: JsonColumn({
            label: 'Pending Question',
        }),

        // =============================================================
        // Outcome — how it ended, kept apart from where it is
        // =============================================================
        outcome: ChoiceColumn({
            label: 'Outcome',
            maxLength: 40,
            dropdown: 'dropdown_with_none',
            choices: {
                success: 'Success',
                refused: 'Refused By Business Rule',
                no_action_needed: 'No Action Needed',
                cancelled: 'Cancelled By User',
                failed: 'Technical Failure',
            },
        }),
        outcome_summary: MultiLineTextColumn({
            label: 'Outcome Summary',
            maxLength: 2000,
        }),
        /** Raw { success, message, data } as returned by CardOperations. */
        outcome_detail: JsonColumn({
            label: 'Outcome Detail',
        }),

        // =============================================================
        // What it ended up acting on — business keys, API-portable
        // =============================================================
        customer_id: StringColumn({ label: 'Customer ID', maxLength: 64 }),
        card_id: StringColumn({ label: 'Card ID', maxLength: 64 }),
        transaction_id: StringColumn({ label: 'Transaction ID', maxLength: 64 }),
        /** Navigation convenience only; may legitimately stay empty. */
        card: ReferenceColumn({
            label: 'Card',
            referenceTable: 'x_snc_card_manag_1_card',
            cascadeRule: 'clear',
        }),

        // =============================================================
        // Escalation to a human operator
        // =============================================================
        escalated: BooleanColumn({ label: 'Escalated', default: false }),
        escalated_to: ReferenceColumn({
            label: 'Escalated To',
            referenceTable: 'sys_user',
            cascadeRule: 'none',
            useReferenceQualifier: 'simple',
            referenceQual: 'active=true',
        }),
        escalation_reason: StringColumn({
            label: 'Escalation Reason',
            maxLength: 255,
        }),

        // =============================================================
        // Case-style running log: multiple authors, timestamped, newest first
        // =============================================================
        work_notes: GenericColumn({
            label: 'Work Notes',
            columnType: 'journal_input',
        }),
    },
})

Form({
    table: 'x_snc_card_manag_1_request',
    view: default_view,
    sections: [
        {
            caption: 'Request',
            content: [
                {
                    layout: 'two-column',
                    leftElements: [
                        { field: 'number', type: 'table_field' },
                        { field: 'requested_by', type: 'table_field' },
                        { field: 'bank_id', type: 'table_field' },
                        { field: 'channel', type: 'table_field' },
                        { field: 'opened_at', type: 'table_field' },
                    ],
                    rightElements: [
                        { field: 'state', type: 'table_field' },
                        { field: 'priority', type: 'table_field' },
                        { field: 'request_type', type: 'table_field' },
                        { field: 'closed_at', type: 'table_field' },
                        { field: 'processing_seconds', type: 'table_field' },
                    ],
                },
                {
                    layout: 'one-column',
                    elements: [
                        { field: 'short_description', type: 'table_field' },
                        { field: 'message', type: 'table_field' },
                    ],
                },
            ],
        },
        {
            caption: 'Approval',
            content: [
                {
                    layout: 'two-column',
                    leftElements: [
                        { field: 'proposed_action', type: 'table_field' },
                        { field: 'confirmation_state', type: 'table_field' },
                        { field: 'confirmed_by', type: 'table_field' },
                    ],
                    rightElements: [
                        { field: 'proposed_at', type: 'table_field' },
                        { field: 'confirmed_at', type: 'table_field' },
                        { field: 'rejection_reason', type: 'table_field' },
                    ],
                },
                {
                    layout: 'one-column',
                    elements: [
                        { field: 'proposed_action_summary', type: 'table_field' },
                        { field: 'proposed_action_payload', type: 'table_field' },
                    ],
                },
            ],
        },
        {
            caption: 'Outcome',
            content: [
                {
                    layout: 'two-column',
                    leftElements: [
                        { field: 'outcome', type: 'table_field' },
                        { field: 'customer_id', type: 'table_field' },
                        { field: 'card_id', type: 'table_field' },
                    ],
                    rightElements: [
                        { field: 'card', type: 'table_field' },
                        { field: 'transaction_id', type: 'table_field' },
                    ],
                },
                {
                    layout: 'one-column',
                    elements: [
                        { field: 'outcome_summary', type: 'table_field' },
                        { field: 'agent_response', type: 'table_field' },
                        { field: 'outcome_detail', type: 'table_field' },
                    ],
                },
            ],
        },
        {
            caption: 'Traceability',
            content: [
                {
                    layout: 'two-column',
                    leftElements: [
                        { field: 'conversation_id', type: 'table_field' },
                        { field: 'execution_plan_id', type: 'table_field' },
                    ],
                    rightElements: [
                        { field: 'escalated', type: 'table_field' },
                        { field: 'escalated_to', type: 'table_field' },
                        { field: 'escalation_reason', type: 'table_field' },
                    ],
                },
            ],
        },
        {
            caption: 'Work Notes',
            content: [
                {
                    layout: 'one-column',
                    elements: [{ field: 'work_notes', type: 'table_field' }],
                },
            ],
        },
        {
            caption: 'Activity',
            content: [
                {
                    layout: 'one-column',
                    elements: [{ type: 'formatter', formatterRef: Formatter.Activities_Filtered }],
                },
            ],
        },
    ],
})
