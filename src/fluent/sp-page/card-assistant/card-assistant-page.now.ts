import '@servicenow/sdk/global'
import { SPPage } from '@servicenow/sdk/core'
import { x_snc_card_manag_1_card_assistant } from '../../sp-widget/card-assistant/widget.now'

/**
 * Card Assistant page.
 *
 * Not public: the assistant reaches real customer and card data, so an
 * unauthenticated visitor must never render it. The role gate is set to
 * card_viewer, the lowest role in the hierarchy — operators and admins
 * contain it, so they pass too, while anyone outside the application gets a
 * server-side 403 rather than an empty panel.
 */
export const cardAssistantPage = SPPage({
    pageId: 'x_snc_card_manag_1_assistant',
    title: 'Card Assistant',
    public: false,
    draft: false,
    roles: ['x_snc_card_manag_1.card_viewer'],
    // No ${portal.title} placeholder here: the platform appends the portal
    // name itself, and the literal placeholder rendered unsubstituted in the
    // browser tab.
    dynamicTitleStructure: 'Card Assistant',
    containers: [
        {
            $id: Now.ID['assistant_container'],
            name: 'Assistant',
            width: 'container',
            order: 100,
            rows: [
                {
                    $id: Now.ID['assistant_row'],
                    order: 100,
                    columns: [
                        {
                            $id: Now.ID['assistant_col'],
                            size: 12,
                            sizeSm: 12,
                            sizeXs: 12,
                            order: 100,
                            instances: [
                                {
                                    $id: Now.ID['assistant_instance'],
                                    widget: x_snc_card_manag_1_card_assistant,
                                    order: 100,
                                    active: true,
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    ],
})
