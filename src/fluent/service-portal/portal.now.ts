import '@servicenow/sdk/global'
import { ServicePortal } from '@servicenow/sdk/core'
import { cardAssistantPage } from '../sp-page/card-assistant/card-assistant-page.now'

/**
 * Card Management portal.
 *
 * A self-contained portal so the assistant is demoable end to end. Your
 * existing custom portal can host the Card Assistant widget instead — it is a
 * normal sp_widget, so it can simply be dropped onto a page there and this
 * portal left unused.
 *
 * Theme is OOTB Coral (verified against this instance), which brings the Stock
 * Header with it. No custom theme or header was created: nothing in the
 * requirement called for custom branding, and a custom theme would be one more
 * thing to maintain for no gain.
 */
export const cardManagementPortal = ServicePortal({
    $id: Now.ID['card_management_portal'],
    title: 'Card Management',
    urlSuffix: 'x_snc_card_manag_1',
    homePage: cardAssistantPage,
    theme: '281507c44317d210ca4c1f425db8f2fd', // OOTB Coral (verified on this instance)
    defaultPortal: false,
    enableFavorites: false,
    inactive: false,
    hidePortalName: false,
})
