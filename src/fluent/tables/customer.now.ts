import {
    Table,
    Form,
    default_view,
    StringColumn,
    ChoiceColumn,
    BooleanColumn,
    ReferenceColumn,
    EmailColumn,
    DateColumn,
    DateTimeColumn,
    MultiLineTextColumn,
} from '@servicenow/sdk/core'

/**
 * Customer
 *
 * Represents the banking customer that owns one or more cards.
 *
 * Two distinct identifiers, deliberately kept separate:
 *
 * - `customer_id` — the unique business key of the customer, issued by the
 *   Digital Banking ESB. This is the key every consumer (portal widgets,
 *   agentic workflows, adapter) uses to address a customer. It survives the
 *   switch from local tables to direct API calls, where `sys_id` would not.
 *
 * - `bank_id` — identifies the BANK that owns the relationship, i.e. a subset
 *   of the whole customer base. It is the multi-tenant visibility perimeter:
 *   a user sees the customers and cards of the bank(s) they are entitled to.
 *   It is never a reference and carries no hierarchy.
 */
export const x_snc_card_manag_1_customer = Table({
    name: 'x_snc_card_manag_1_customer',
    label: 'Customer',
    display: 'name',
    audit: true,
    extensible: false,
    allowWebServiceAccess: true,
    accessibleFrom: 'public',
    callerAccess: 'tracking',
    actions: { read: true, create: true, update: true },
    index: [
        { name: 'idx_customer_id', unique: true, element: 'customer_id' },
        { name: 'idx_customer_bank', unique: false, element: 'bank_id' },
        { name: 'idx_customer_bank_status', unique: false, element: ['bank_id', 'status'] },
        { name: 'idx_customer_tax_id', unique: false, element: 'tax_id' },
    ],
    schema: {
        // --- Identity / ESB correlation ---------------------------------
        customer_id: StringColumn({
            label: 'Customer ID',
            maxLength: 64,
            mandatory: true,
        }),
        bank_id: StringColumn({
            label: 'Bank ID',
            maxLength: 32,
            mandatory: true,
        }),
        name: StringColumn({
            label: 'Customer Name',
            maxLength: 160,
            mandatory: true,
        }),
        customer_type: ChoiceColumn({
            label: 'Customer Type',
            maxLength: 40,
            dropdown: 'dropdown_without_none',
            default: 'individual',
            choices: {
                individual: 'Individual',
                business: 'Business',
                joint: 'Joint Account',
            },
        }),
        segment: ChoiceColumn({
            label: 'Segment',
            maxLength: 40,
            dropdown: 'dropdown_with_none',
            choices: {
                retail: 'Retail',
                affluent: 'Affluent',
                private: 'Private',
                corporate: 'Corporate',
            },
        }),
        tax_id: StringColumn({
            label: 'Tax ID / Fiscal Code',
            maxLength: 40,
        }),

        // --- Contact ----------------------------------------------------
        email: EmailColumn({ label: 'Email' }),
        phone: StringColumn({ label: 'Phone', maxLength: 40 }),
        country: StringColumn({
            label: 'Country',
            maxLength: 2,
        }),
        preferred_language: StringColumn({
            label: 'Preferred Language',
            maxLength: 5,
        }),

        // --- Relationship status ----------------------------------------
        status: ChoiceColumn({
            label: 'Status',
            maxLength: 40,
            dropdown: 'dropdown_without_none',
            default: 'active',
            choices: {
                prospect: 'Prospect',
                active: 'Active',
                suspended: 'Suspended',
                dormant: 'Dormant',
                closed: 'Closed',
            },
        }),
        kyc_status: ChoiceColumn({
            label: 'KYC Status',
            maxLength: 40,
            dropdown: 'dropdown_with_none',
            choices: {
                not_started: 'Not Started',
                pending: 'Pending',
                verified: 'Verified',
                expired: 'Expired',
                rejected: 'Rejected',
            },
        }),
        risk_level: ChoiceColumn({
            label: 'Risk Level',
            maxLength: 40,
            dropdown: 'dropdown_with_none',
            choices: {
                low: 'Low',
                medium: 'Medium',
                high: 'High',
            },
        }),
        onboarding_date: DateColumn({ label: 'Onboarding Date' }),
        base_currency: StringColumn({
            label: 'Base Currency',
            maxLength: 3,
            default: 'EUR',
            dropdown: 'suggestion',
            choices: {
                EUR: 'Euro',
                USD: 'US Dollar',
                GBP: 'British Pound',
                CHF: 'Swiss Franc',
            },
        }),

        // --- Portal linkage ---------------------------------------------
        // Links the customer to a self-service portal account. This is NOT the
        // visibility perimeter: that role belongs to `bank_id`.
        portal_user: ReferenceColumn({
            label: 'Portal User',
            referenceTable: 'sys_user',
            cascadeRule: 'clear',
            useReferenceQualifier: 'simple',
            referenceQual: 'active=true',
        }),

        // --- ESB synchronization metadata -------------------------------
        source_system: StringColumn({
            label: 'Source System',
            maxLength: 60,
            default: 'esb_digital_banking',
            readOnly: true,
        }),
        synced: BooleanColumn({
            label: 'Synced From Source',
            default: false,
        }),
        last_sync: DateTimeColumn({ label: 'Last Sync' }),

        notes: MultiLineTextColumn({ label: 'Notes', maxLength: 4000 }),
    },
})

Form({
    table: 'x_snc_card_manag_1_customer',
    view: default_view,
    sections: [
        {
            caption: 'Customer',
            content: [
                {
                    layout: 'two-column',
                    leftElements: [
                        { field: 'customer_id', type: 'table_field' },
                        { field: 'bank_id', type: 'table_field' },
                        { field: 'name', type: 'table_field' },
                        { field: 'customer_type', type: 'table_field' },
                        { field: 'segment', type: 'table_field' },
                        { field: 'tax_id', type: 'table_field' },
                        { field: 'onboarding_date', type: 'table_field' },
                        { field: 'base_currency', type: 'table_field' },
                        { field: 'portal_user', type: 'table_field' },
                    ],
                    rightElements: [
                        { field: 'status', type: 'table_field' },
                        { field: 'kyc_status', type: 'table_field' },
                        { field: 'risk_level', type: 'table_field' },
                        { field: 'email', type: 'table_field' },
                        { field: 'phone', type: 'table_field' },
                        { field: 'country', type: 'table_field' },
                        { field: 'preferred_language', type: 'table_field' },
                    ],
                },
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
            caption: 'Cards',
            content: [
                {
                    layout: 'one-column',
                    elements: [
                        {
                            type: 'list',
                            listType: '12M',
                            listRef: 'x_snc_card_manag_1_card.customer',
                        },
                    ],
                },
            ],
        },
    ],
})
