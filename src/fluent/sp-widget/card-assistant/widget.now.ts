import '@servicenow/sdk/global'
import { SPWidget } from '@servicenow/sdk/core'

/**
 * Card Assistant widget.
 *
 * The conversational entry point to the agentic layer, with the
 * human-in-the-loop approval rendered inline.
 *
 * It talks only to CardRequestBridge: no AI API calls, no direct table
 * queries. That boundary is what lets the MVP tables be swapped for Digital
 * Banking ESB calls without touching this widget, and it keeps the approval
 * gate enforced server-side rather than by the UI.
 */
export const x_snc_card_manag_1_card_assistant = SPWidget({
    $id: Now.ID['card_assistant_widget'],
    id: 'x_snc_card_manag_1_card_assistant',
    name: 'Card Assistant',
    description:
        'Conversational panel for bank operators: ask about customers, cards and transactions, and approve the operations the AI agents propose before they are applied. Scoped to the operator bank perimeter.',
    htmlTemplate: Now.include('./template.html'),
    clientScript: Now.include('./client_script.js'),
    serverScript: Now.include('./server_script.js'),
    customCss: Now.include('./styles.css'),
    public: false,
    optionSchema: [
        {
            name: 'title',
            label: 'Panel Title',
            type: 'string',
            section: 'Presentation',
            defaultValue: 'Card Assistant',
        },
        {
            name: 'placeholder',
            label: 'Input Placeholder',
            type: 'string',
            section: 'Presentation',
            defaultValue: 'Ask about a customer, a card or its transactions…',
        },
        {
            name: 'history_limit',
            label: 'Exchanges Shown',
            type: 'integer',
            section: 'Behavior',
            defaultValue: 5,
        },
        {
            name: 'poll_interval_ms',
            label: 'Poll Interval (ms)',
            type: 'integer',
            section: 'Behavior',
            defaultValue: 2500,
        },
        {
            name: 'max_polls',
            label: 'Max Poll Attempts',
            type: 'integer',
            section: 'Behavior',
            defaultValue: 40,
        },
    ],
})
