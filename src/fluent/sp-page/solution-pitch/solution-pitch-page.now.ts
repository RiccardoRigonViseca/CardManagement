import '@servicenow/sdk/global'
import { SPPage } from '@servicenow/sdk/core'
import { x_snc_card_manag_1_pitch } from '../../sp-widget/solution-pitch/widget.now'

/**
 * Solution Pitch page.
 *
 * Gated on card_viewer like the assistant, for two reasons. The deck reads
 * real customer and card volumes, so it is not public. And it is deliberately
 * the LOWEST role in the hierarchy: operators and admins contain it, so the
 * presenter can run the deck from whichever account best demonstrates the
 * point — including a bank operator, where the figures visibly shrink to that
 * bank and the isolation demonstrates itself on stage.
 */
export const solutionPitchPage = SPPage({
    pageId: 'x_snc_card_manag_1_pitch',
    title: 'Solution Pitch',
    public: false,
    draft: false,
    roles: ['x_snc_card_manag_1.card_viewer'],
    dynamicTitleStructure: 'Solution Pitch',
    containers: [
        {
            $id: Now.ID['pitch_container'],
            name: 'Pitch',
            width: 'container',
            order: 100,
            rows: [
                {
                    $id: Now.ID['pitch_row'],
                    order: 100,
                    columns: [
                        {
                            $id: Now.ID['pitch_col'],
                            size: 12,
                            sizeSm: 12,
                            sizeXs: 12,
                            order: 100,
                            instances: [
                                {
                                    $id: Now.ID['pitch_instance'],
                                    widget: x_snc_card_manag_1_pitch,
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
