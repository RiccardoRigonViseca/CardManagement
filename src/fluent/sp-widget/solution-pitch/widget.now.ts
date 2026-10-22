import '@servicenow/sdk/global'
import { SPWidget } from '@servicenow/sdk/core'

/**
 * Solution Pitch widget.
 *
 * A presentation deck that reads the running application instead of
 * describing it. Every figure — agents, tools, ACLs, request outcomes, data
 * volumes — is counted at render time, so the pitch cannot claim more than
 * what is actually deployed.
 *
 * That is also the point of showing it at all: the strongest argument for this
 * solution is not a diagram, it is that the diagram is live.
 */
export const x_snc_card_manag_1_pitch = SPWidget({
    $id: Now.ID['solution_pitch_widget'],
    id: 'x_snc_card_manag_1_pitch',
    name: 'Solution Pitch',
    description:
        'Presentation deck for the agentic card management solution. Walks through the problem, the four-layer architecture, the safety model, the human approval gate, multi-tenant isolation and API readiness, illustrated throughout with live figures counted from the instance.',
    htmlTemplate: Now.include('./template.html'),
    clientScript: Now.include('./client_script.js'),
    serverScript: Now.include('./server_script.js'),
    customCss: Now.include('./styles.css'),
    public: false,
    optionSchema: [
        {
            name: 'title',
            label: 'Deck Title',
            type: 'string',
            section: 'Presentation',
            defaultValue: 'Agentic Card Operations',
        },
        {
            name: 'subtitle',
            label: 'Subtitle',
            type: 'string',
            section: 'Presentation',
            defaultValue: 'Card servicing an AI can run, but cannot get wrong',
        },
        {
            name: 'assistant_page_id',
            label: 'Assistant Page Id',
            type: 'string',
            section: 'Behavior',
            defaultValue: 'x_snc_card_manag_1_assistant',
        },
    ],
    linkScript: Now.include('./sp_widget_x_snc_card_manag_1_pitch/link-script.js'),
})
