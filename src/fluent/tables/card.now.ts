import {
    Table,
    Form,
    default_view,
    StringColumn,
    ChoiceColumn,
    BooleanColumn,
    ReferenceColumn,
    DecimalColumn,
    DateColumn,
    DateTimeColumn,
    IntegerColumn,
    MultiLineTextColumn,
} from '@servicenow/sdk/core'

/**
 * Card
 *
 * Standard credit-card data model, PCI-safe by design.
 *
 * No clear PAN is stored. The record is identified by `card_id`, the
 * anonymized / tokenized card identifier returned by the Digital Banking ESB.
 * Only `last_four` is kept for human recognition in the portal search results.
 *
 * Identifiers:
 * - `card_id`     — unique business key of the card.
 * - `customer_id` — business key of the owning customer. Kept alongside the
 *                   `customer` reference because it survives the switch from
 *                   local tables to direct API calls, where `sys_id` does not.
 * - `bank_id`     — the bank owning the relationship: the multi-tenant
 *                   visibility perimeter, not a hierarchy.
 */
export const x_snc_card_manag_1_card = Table({
    name: 'x_snc_card_manag_1_card',
    label: 'Card',
    display: 'card_id',
    audit: true,
    extensible: false,
    allowWebServiceAccess: true,
    accessibleFrom: 'public',
    callerAccess: 'tracking',
    actions: { read: true, create: true, update: true },
    index: [
        { name: 'index', unique: true, element: 'card_id' },
        { name: 'index5', unique: false, element: 'bank_id' },
        { name: 'index3', unique: false, element: ['bank_id', 'status'] },
        { name: 'index6', unique: false, element: 'customer_id' },
        {
            name: 'index2',
            unique: false,
            element: 'status',
        },
        {
            name: 'index4',
            unique: false,
            element: 'customer',
        },
    ],
    schema: {
        // --- Identity (anonymized, no clear PAN) ------------------------
        card_id: StringColumn({
            label: 'Card ID',
            maxLength: 64,
            mandatory: true,
        }),
        bank_id: StringColumn({
            label: 'Bank ID',
            maxLength: 32,
            mandatory: true,
        }),
        customer_id: StringColumn({
            label: 'Customer ID',
            maxLength: 64,
            mandatory: true,
        }),
        customer: ReferenceColumn({
            label: 'Customer',
            referenceTable: 'x_snc_card_manag_1_customer',
            cascadeRule: 'none',
            maxLength: 32,
        }),
        last_four: StringColumn({
            label: 'Last Four Digits',
            maxLength: 4,
        }),
        cardholder_name: StringColumn({
            label: 'Cardholder Name',
            maxLength: 160,
        }),

        // --- Product ----------------------------------------------------
        product_name: StringColumn({ label: 'Product Name', maxLength: 120 }),
        card_network: ChoiceColumn({
            label: 'Network',
            maxLength: 40,
            dropdown: 'dropdown_with_none',
            choices: {
                visa: {
                    label: 'Visa',
                    sequence: 1,
                },
                mastercard: {
                    label: 'Mastercard',
                    sequence: 2,
                },
                amex: {
                    label: 'American Express',
                    sequence: 3,
                },
                maestro: {
                    label: 'Maestro',
                    sequence: 4,
                },
                other: {
                    label: 'Other',
                    sequence: 5,
                },
            },
        }),
        card_type: ChoiceColumn({
            label: 'Card Type',
            maxLength: 40,
            dropdown: 'dropdown_without_none',
            default: 'credit',
            choices: {
                credit: {
                    label: 'Credit',
                    sequence: 1,
                },
                debit: {
                    label: 'Debit',
                    sequence: 2,
                },
                prepaid: {
                    label: 'Prepaid',
                    sequence: 3,
                },
                charge: {
                    label: 'Charge',
                    sequence: 4,
                },
            },
        }),
        form_factor: ChoiceColumn({
            label: 'Form Factor',
            maxLength: 40,
            dropdown: 'dropdown_without_none',
            default: 'physical',
            choices: {
                physical: {
                    label: 'Physical',
                    sequence: 1,
                },
                virtual: {
                    label: 'Virtual',
                    sequence: 2,
                },
                wallet: {
                    label: 'Wallet Token',
                    sequence: 3,
                },
            },
        }),
        currency: StringColumn({
            label: 'Currency',
            maxLength: 3,
            default: 'EUR',
            dropdown: 'suggestion',
            choices: {
                EUR: {
                    label: 'Euro',
                    sequence: 1,
                },
                USD: {
                    label: 'US Dollar',
                    sequence: 2,
                },
                GBP: {
                    label: 'British Pound',
                    sequence: 3,
                },
                CHF: {
                    label: 'Swiss Franc',
                    sequence: 4,
                },
            },
        }),

        // --- Lifecycle / status -----------------------------------------
        status: ChoiceColumn({
            label: 'Status',
            maxLength: 40,
            mandatory: true,
            dropdown: 'dropdown_without_none',
            default: 'active',
            choices: {
                requested: {
                    label: 'Requested',
                    sequence: 1,
                },
                issued: {
                    label: 'Issued',
                    sequence: 2,
                },
                active: {
                    label: 'Active',
                    sequence: 3,
                },
                blocked_temporary: {
                    label: 'Temporarily Blocked',
                    sequence: 4,
                },
                blocked_permanent: {
                    label: 'Permanently Blocked',
                    sequence: 5,
                },
                expired: {
                    label: 'Expired',
                    sequence: 6,
                },
                cancelled: {
                    label: 'Cancelled',
                    sequence: 7,
                },
            },
        }),
        status_reason: ChoiceColumn({
            label: 'Status Reason',
            maxLength: 40,
            dropdown: 'dropdown_with_none',
            choices: {
                customer_request: {
                    label: 'Customer Request',
                    sequence: 1,
                },
                lost: {
                    label: 'Lost',
                    sequence: 2,
                },
                stolen: {
                    label: 'Stolen',
                    sequence: 3,
                },
                fraud_suspected: {
                    label: 'Fraud Suspected',
                    sequence: 4,
                },
                damaged: {
                    label: 'Damaged',
                    sequence: 5,
                },
                never_received: {
                    label: 'Never Received',
                    sequence: 6,
                },
                expired: {
                    label: 'Expired',
                    sequence: 7,
                },
                issuer_decision: {
                    label: 'Issuer Decision',
                    sequence: 8,
                },
            },
        }),
        issue_date: DateColumn({ label: 'Issue Date', maxLength: 40 }),
        activation_date: DateColumn({ label: 'Activation Date', maxLength: 40 }),
        expiry_month: IntegerColumn({ label: 'Expiry Month', maxLength: 40 }),
        expiry_year: IntegerColumn({ label: 'Expiry Year', maxLength: 40 }),
        expiry_date: DateColumn({ label: 'Expiry Date', maxLength: 40 }),
        renewal_due: BooleanColumn({ label: 'Renewal Due', default: false, maxLength: 40 }),

        // --- Limits management ------------------------------------------
        credit_limit: DecimalColumn({ label: 'Credit Limit', maxLength: 15 }),
        available_credit: DecimalColumn({ label: 'Available Credit', maxLength: 15 }),
        current_balance: DecimalColumn({ label: 'Current Balance', maxLength: 15 }),
        daily_limit: DecimalColumn({ label: 'Daily Spend Limit', maxLength: 15 }),
        monthly_limit: DecimalColumn({ label: 'Monthly Spend Limit', maxLength: 15 }),
        single_transaction_limit: DecimalColumn({ label: 'Single Transaction Limit', maxLength: 15 }),
        atm_daily_limit: DecimalColumn({ label: 'ATM Daily Limit', maxLength: 15 }),
        ecommerce_limit: DecimalColumn({ label: 'E-commerce Limit', maxLength: 15 }),

        // --- Usage controls ---------------------------------------------
        contactless_enabled: BooleanColumn({ label: 'Contactless Enabled', default: true, maxLength: 40 }),
        ecommerce_enabled: BooleanColumn({ label: 'E-commerce Enabled', default: true, maxLength: 40 }),
        atm_enabled: BooleanColumn({ label: 'ATM Withdrawals Enabled', default: true, maxLength: 40 }),
        international_enabled: BooleanColumn({ label: 'International Usage Enabled', default: true, maxLength: 40 }),
        recurring_enabled: BooleanColumn({ label: 'Recurring Payments Enabled', default: true, maxLength: 40 }),

        // --- ESB synchronization metadata -------------------------------
        source_system: StringColumn({
            label: 'Source System',
            maxLength: 60,
            default: 'esb_digital_banking',
            readOnly: true,
            readOnlyOption: 'instance_configured',
        }),
        synced: BooleanColumn({ label: 'Synced From Source', default: false, maxLength: 40 }),
        last_sync: DateTimeColumn({ label: 'Last Sync', maxLength: 40 }),

        notes: MultiLineTextColumn({ label: 'Notes', maxLength: 4000 }),
        client_id: StringColumn({
            mandatory: true,
            maxLength: 64,
        }),
    },
    dbObjectId: true,
})

Form({
    table: 'x_snc_card_manag_1_card',
    view: default_view,
    sections: [
        {
            caption: 'Card',
            content: [
                {
                    layout: 'two-column',
                    leftElements: [
                        { field: 'card_id', type: 'table_field' },
                        { field: 'bank_id', type: 'table_field' },
                        { field: 'customer_id', type: 'table_field' },
                        { field: 'customer', type: 'table_field' },
                        { field: 'last_four', type: 'table_field' },
                        { field: 'cardholder_name', type: 'table_field' },
                        { field: 'product_name', type: 'table_field' },
                        { field: 'card_network', type: 'table_field' },
                        { field: 'card_type', type: 'table_field' },
                        { field: 'form_factor', type: 'table_field' },
                        { field: 'currency', type: 'table_field' },
                    ],
                    rightElements: [
                        { field: 'status', type: 'table_field' },
                        { field: 'status_reason', type: 'table_field' },
                        { field: 'issue_date', type: 'table_field' },
                        { field: 'activation_date', type: 'table_field' },
                        { field: 'expiry_month', type: 'table_field' },
                        { field: 'expiry_year', type: 'table_field' },
                        { field: 'expiry_date', type: 'table_field' },
                        { field: 'renewal_due', type: 'table_field' },
                    ],
                },
            ],
        },
        {
            caption: 'Limits',
            content: [
                {
                    layout: 'two-column',
                    leftElements: [
                        { field: 'credit_limit', type: 'table_field' },
                        { field: 'available_credit', type: 'table_field' },
                        { field: 'current_balance', type: 'table_field' },
                        { field: 'single_transaction_limit', type: 'table_field' },
                    ],
                    rightElements: [
                        { field: 'daily_limit', type: 'table_field' },
                        { field: 'monthly_limit', type: 'table_field' },
                        { field: 'atm_daily_limit', type: 'table_field' },
                        { field: 'ecommerce_limit', type: 'table_field' },
                    ],
                },
            ],
        },
        {
            caption: 'Usage Controls',
            content: [
                {
                    layout: 'two-column',
                    leftElements: [
                        { field: 'contactless_enabled', type: 'table_field' },
                        { field: 'ecommerce_enabled', type: 'table_field' },
                        { field: 'atm_enabled', type: 'table_field' },
                    ],
                    rightElements: [
                        { field: 'international_enabled', type: 'table_field' },
                        { field: 'recurring_enabled', type: 'table_field' },
                    ],
                },
            ],
        },
        {
            caption: 'Source Synchronization',
            content: [
                {
                    layout: 'two-column',
                    leftElements: [
                        { field: 'source_system', type: 'table_field' },
                        { field: 'synced', type: 'table_field' },
                    ],
                    rightElements: [{ field: 'last_sync', type: 'table_field' }],
                },
                {
                    layout: 'one-column',
                    elements: [{ field: 'notes', type: 'table_field' }],
                },
            ],
        },
        {
            caption: 'Transactions',
            content: [
                {
                    layout: 'one-column',
                    elements: [
                        {
                            type: 'list',
                            listType: '12M',
                            listRef: 'x_snc_card_manag_1_txn.card',
                        },
                    ],
                },
            ],
        },
    ],
})
