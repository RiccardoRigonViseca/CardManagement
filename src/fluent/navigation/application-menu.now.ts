import '@servicenow/sdk/global'
import { ApplicationMenu, Record } from '@servicenow/sdk/core'

/**
 * Navigator entry for the Card Management application.
 */
const cardManagementMenu = ApplicationMenu({
    $id: Now.ID['card_management_menu'],
    title: 'Card Management',
    hint: 'Manage customers, cards and card transactions',
    description: 'Card Management — customers, cards, transactions and card operations',
    roles: ['admin'],
    active: true,
})

Record({
    $id: Now.ID['module_customers'],
    table: 'sys_app_module',
    data: {
        title: 'Customers',
        application: cardManagementMenu,
        link_type: 'LIST',
        name: 'x_snc_card_manag_1_customer',
        hint: 'All customers',
        active: true,
        order: 100,
    },
})

Record({
    $id: Now.ID['module_cards'],
    table: 'sys_app_module',
    data: {
        title: 'Cards',
        application: cardManagementMenu,
        link_type: 'LIST',
        name: 'x_snc_card_manag_1_card',
        hint: 'All cards',
        active: true,
        order: 200,
    },
})

Record({
    $id: Now.ID['module_cards_blocked'],
    table: 'sys_app_module',
    data: {
        title: 'Blocked Cards',
        application: cardManagementMenu,
        link_type: 'FILTER',
        name: 'x_snc_card_manag_1_card',
        filter: 'statusINblocked_temporary,blocked_permanent',
        hint: 'Cards currently blocked',
        active: true,
        order: 250,
    },
})

Record({
    $id: Now.ID['module_transactions'],
    table: 'sys_app_module',
    data: {
        title: 'Card Transactions',
        application: cardManagementMenu,
        link_type: 'LIST',
        name: 'x_snc_card_manag_1_txn',
        hint: 'All card transactions',
        active: true,
        order: 300,
    },
})

Record({
    $id: Now.ID['module_requests_separator'],
    table: 'sys_app_module',
    data: {
        title: 'Card Requests',
        application: cardManagementMenu,
        link_type: 'SEPARATOR',
        active: true,
        order: 500,
    },
})

Record({
    $id: Now.ID['module_requests_open'],
    table: 'sys_app_module',
    data: {
        title: 'Open Requests',
        application: cardManagementMenu,
        link_type: 'FILTER',
        name: 'x_snc_card_manag_1_request',
        filter: 'stateINnew,in_progress,awaiting_confirmation^ORDERBYDESCopened_at',
        hint: 'Card requests still being handled',
        active: true,
        order: 510,
    },
})

Record({
    $id: Now.ID['module_requests_awaiting'],
    table: 'sys_app_module',
    data: {
        title: 'Awaiting My Confirmation',
        application: cardManagementMenu,
        link_type: 'FILTER',
        name: 'x_snc_card_manag_1_request',
        filter: 'confirmation_state=pending^requested_by=javascript:gs.getUserID()^ORDERBYDESCopened_at',
        hint: 'Actions the agent has proposed and is waiting on you to approve',
        active: true,
        order: 520,
    },
})

Record({
    $id: Now.ID['module_requests_all'],
    table: 'sys_app_module',
    data: {
        title: 'All Requests',
        application: cardManagementMenu,
        link_type: 'LIST',
        name: 'x_snc_card_manag_1_request',
        hint: 'Every card request, open and closed',
        active: true,
        order: 530,
    },
})

Record({
    $id: Now.ID['module_bank_access'],
    table: 'sys_app_module',
    data: {
        title: 'Bank Access',
        application: cardManagementMenu,
        link_type: 'LIST',
        name: 'x_snc_card_manag_1_bank_access',
        hint: 'Which banks each user may see and operate on',
        roles: ['x_snc_card_manag_1.card_admin'],
        active: true,
        order: 600,
    },
})

Record({
    $id: Now.ID['module_transactions_disputed'],
    table: 'sys_app_module',
    data: {
        title: 'Disputed Transactions',
        application: cardManagementMenu,
        link_type: 'FILTER',
        name: 'x_snc_card_manag_1_txn',
        filter: 'disputed=true^ORstatus=disputed',
        hint: 'Transactions flagged as disputed',
        active: true,
        order: 350,
    },
})
