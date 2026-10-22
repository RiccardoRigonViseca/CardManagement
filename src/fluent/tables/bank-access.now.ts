import {
    Table,
    Form,
    default_view,
    StringColumn,
    BooleanColumn,
    ReferenceColumn,
    MultiLineTextColumn,
} from '@servicenow/sdk/core'

/**
 * Bank Access
 *
 * Maps a platform user to the bank(s) whose data they may see and operate on.
 * This is the single source of the multi-tenant visibility perimeter.
 *
 * WHY A MAPPING TABLE INSTEAD OF A FIELD ON sys_user
 * --------------------------------------------------
 * Today each bank has one service user, so a single field would do. A mapping
 * table also covers the cases that follow shortly -- several operators for the
 * same bank, or one internal user serving two banks -- without reshaping the
 * model. It also keeps everything inside this scope rather than augmenting a
 * core platform table.
 *
 * Note the difference from `customer.portal_user`: that field links a customer
 * to their self-service portal account. It is NOT the perimeter. Entitlement
 * to a bank's data is declared here and only here.
 */
export const x_snc_card_manag_1_bank_access = Table({
    name: 'x_snc_card_manag_1_bank_access',
    label: 'Bank Access',
    display: 'bank_id',
    audit: true,
    extensible: false,
    allowWebServiceAccess: false,
    accessibleFrom: 'public',
    callerAccess: 'tracking',
    actions: { read: true },
    index: [
        { name: 'idx_bank_access_user', unique: false, element: 'user' },
        { name: 'idx_bank_access_user_bank', unique: true, element: ['user', 'bank_id'] },
    ],
    schema: {
        user: ReferenceColumn({
            label: 'User',
            referenceTable: 'sys_user',
            mandatory: true,
            cascadeRule: 'delete',
            useReferenceQualifier: 'simple',
            referenceQual: 'active=true',
        }),
        bank_id: StringColumn({
            label: 'Bank ID',
            maxLength: 32,
            mandatory: true,
        }),
        bank_name: StringColumn({
            label: 'Bank Name',
            maxLength: 120,
        }),
        active: BooleanColumn({
            label: 'Active',
            default: true,
        }),
        notes: MultiLineTextColumn({ label: 'Notes', maxLength: 1000 }),
    },
})

Form({
    table: 'x_snc_card_manag_1_bank_access',
    view: default_view,
    sections: [
        {
            caption: 'Bank Access',
            content: [
                {
                    layout: 'two-column',
                    leftElements: [
                        { field: 'user', type: 'table_field' },
                        { field: 'bank_id', type: 'table_field' },
                    ],
                    rightElements: [
                        { field: 'bank_name', type: 'table_field' },
                        { field: 'active', type: 'table_field' },
                    ],
                },
                {
                    layout: 'one-column',
                    elements: [{ field: 'notes', type: 'table_field' }],
                },
            ],
        },
    ],
})
