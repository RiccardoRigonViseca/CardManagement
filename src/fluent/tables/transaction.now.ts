import {
    Table,
    Form,
    default_view,
    StringColumn,
    ChoiceColumn,
    BooleanColumn,
    ReferenceColumn,
    DecimalColumn,
    FloatColumn,
    DateColumn,
    DateTimeColumn,
} from '@servicenow/sdk/core'

/**
 * Card Transaction
 *
 * Standard card transaction data model.
 *
 * `card` is the ONLY structural reference of this entity: a transaction always
 * belongs to a card and never points directly at the customer record.
 * `bank_id` is carried denormalized purely as the multi-tenant visibility
 * perimeter used by the portal / agentic workflows to scope what each user can
 * see, and as the correlation key towards the Digital Banking ESB.
 */
export const x_snc_card_manag_1_txn = Table({
    name: 'x_snc_card_manag_1_txn',
    label: 'Card Transaction',
    display: 'transaction_id',
    audit: false,
    extensible: false,
    allowWebServiceAccess: true,
    accessibleFrom: 'public',
    callerAccess: 'tracking',
    actions: { read: true, create: true, update: true },
    index: [
        { name: 'idx_txn_id', unique: true, element: 'transaction_id' },
        { name: 'idx_txn_bank', unique: false, element: 'bank_id' },
        { name: 'idx_txn_card_date', unique: false, element: ['card', 'transaction_date'] },
    ],
    schema: {
        // --- Identity and ownership -------------------------------------
        transaction_id: StringColumn({
            label: 'Transaction ID',
            maxLength: 64,
            mandatory: true,
        }),
        card: ReferenceColumn({
            label: 'Card',
            referenceTable: 'x_snc_card_manag_1_card',
            mandatory: true,
            cascadeRule: 'delete',
        }),
        bank_id: StringColumn({
            label: 'Bank ID',
            maxLength: 32,
            mandatory: true,
        }),

        // --- Timing -----------------------------------------------------
        transaction_date: DateTimeColumn({
            label: 'Transaction Date',
            mandatory: true,
        }),
        posting_date: DateColumn({ label: 'Posting Date' }),

        // --- Amounts ----------------------------------------------------
        direction: ChoiceColumn({
            label: 'Direction',
            maxLength: 40,
            dropdown: 'dropdown_without_none',
            default: 'debit',
            choices: {
                debit: 'Debit',
                credit: 'Credit',
            },
        }),
        amount: DecimalColumn({ label: 'Amount', mandatory: true }),
        currency: StringColumn({
            label: 'Currency',
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
        original_amount: DecimalColumn({ label: 'Original Amount' }),
        original_currency: StringColumn({ label: 'Original Currency', maxLength: 3 }),
        exchange_rate: FloatColumn({ label: 'Exchange Rate', scale: 6 }),
        fee_amount: DecimalColumn({ label: 'Fee Amount' }),

        // --- Classification ---------------------------------------------
        transaction_type: ChoiceColumn({
            label: 'Transaction Type',
            maxLength: 40,
            dropdown: 'dropdown_without_none',
            default: 'purchase',
            choices: {
                purchase: 'Purchase',
                atm_withdrawal: 'ATM Withdrawal',
                cash_advance: 'Cash Advance',
                refund: 'Refund',
                reversal: 'Reversal',
                chargeback: 'Chargeback',
                fee: 'Fee',
                interest: 'Interest',
                payment: 'Payment',
                installment: 'Installment',
                adjustment: 'Adjustment',
            },
        }),
        channel: ChoiceColumn({
            label: 'Channel',
            maxLength: 40,
            dropdown: 'dropdown_with_none',
            choices: {
                pos: 'POS',
                ecommerce: 'E-commerce',
                atm: 'ATM',
                mobile_wallet: 'Mobile Wallet',
                recurring: 'Recurring',
                branch: 'Branch',
                moto: 'MOTO',
            },
        }),
        status: ChoiceColumn({
            label: 'Status',
            maxLength: 40,
            mandatory: true,
            dropdown: 'dropdown_without_none',
            default: 'authorized',
            choices: {
                pending: 'Pending',
                authorized: 'Authorized',
                settled: 'Settled',
                declined: 'Declined',
                reversed: 'Reversed',
                refunded: 'Refunded',
                disputed: 'Disputed',
            },
        }),

        // --- Authorization data -----------------------------------------
        auth_code: StringColumn({ label: 'Authorization Code', maxLength: 20 }),
        response_code: StringColumn({ label: 'Response Code', maxLength: 10 }),
        decline_reason: StringColumn({ label: 'Decline Reason', maxLength: 120 }),
        card_present: BooleanColumn({ label: 'Card Present', default: false }),
        contactless: BooleanColumn({ label: 'Contactless', default: false }),

        // --- Merchant / acquirer ----------------------------------------
        merchant_name: StringColumn({ label: 'Merchant Name', maxLength: 160 }),
        merchant_id: StringColumn({ label: 'Merchant ID', maxLength: 40 }),
        mcc: StringColumn({ label: 'Merchant Category Code', maxLength: 4 }),
        merchant_city: StringColumn({ label: 'Merchant City', maxLength: 80 }),
        merchant_country: StringColumn({ label: 'Merchant Country', maxLength: 2 }),
        terminal_id: StringColumn({ label: 'Terminal ID', maxLength: 40 }),
        acquirer_id: StringColumn({ label: 'Acquirer ID', maxLength: 40 }),

        // --- Risk / dispute ---------------------------------------------
        fraud_score: FloatColumn({ label: 'Fraud Score', scale: 2 }),
        disputed: BooleanColumn({ label: 'Disputed', default: false }),

        description: StringColumn({ label: 'Description', maxLength: 255 }),

        // --- ESB synchronization metadata -------------------------------
        source_system: StringColumn({
            label: 'Source System',
            maxLength: 60,
            default: 'esb_digital_banking',
            readOnly: true,
        }),
        synced: BooleanColumn({ label: 'Synced From Source', default: false }),
        last_sync: DateTimeColumn({ label: 'Last Sync' }),
    },
})

Form({
    table: 'x_snc_card_manag_1_txn',
    view: default_view,
    sections: [
        {
            caption: 'Transaction',
            content: [
                {
                    layout: 'two-column',
                    leftElements: [
                        { field: 'transaction_id', type: 'table_field' },
                        { field: 'card', type: 'table_field' },
                        { field: 'bank_id', type: 'table_field' },
                        { field: 'transaction_date', type: 'table_field' },
                        { field: 'posting_date', type: 'table_field' },
                        { field: 'transaction_type', type: 'table_field' },
                        { field: 'channel', type: 'table_field' },
                    ],
                    rightElements: [
                        { field: 'status', type: 'table_field' },
                        { field: 'direction', type: 'table_field' },
                        { field: 'amount', type: 'table_field' },
                        { field: 'currency', type: 'table_field' },
                        { field: 'original_amount', type: 'table_field' },
                        { field: 'original_currency', type: 'table_field' },
                        { field: 'exchange_rate', type: 'table_field' },
                        { field: 'fee_amount', type: 'table_field' },
                    ],
                },
                {
                    layout: 'one-column',
                    elements: [{ field: 'description', type: 'table_field' }],
                },
            ],
        },
        {
            caption: 'Authorization',
            content: [
                {
                    layout: 'two-column',
                    leftElements: [
                        { field: 'auth_code', type: 'table_field' },
                        { field: 'response_code', type: 'table_field' },
                        { field: 'decline_reason', type: 'table_field' },
                    ],
                    rightElements: [
                        { field: 'card_present', type: 'table_field' },
                        { field: 'contactless', type: 'table_field' },
                        { field: 'fraud_score', type: 'table_field' },
                        { field: 'disputed', type: 'table_field' },
                    ],
                },
            ],
        },
        {
            caption: 'Merchant',
            content: [
                {
                    layout: 'two-column',
                    leftElements: [
                        { field: 'merchant_name', type: 'table_field' },
                        { field: 'merchant_id', type: 'table_field' },
                        { field: 'mcc', type: 'table_field' },
                        { field: 'merchant_city', type: 'table_field' },
                    ],
                    rightElements: [
                        { field: 'merchant_country', type: 'table_field' },
                        { field: 'terminal_id', type: 'table_field' },
                        { field: 'acquirer_id', type: 'table_field' },
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
            ],
        },
    ],
})
