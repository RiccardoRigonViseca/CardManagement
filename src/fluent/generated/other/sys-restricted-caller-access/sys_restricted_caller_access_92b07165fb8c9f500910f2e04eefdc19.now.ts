import { Record } from '@servicenow/sdk/core'

Record({
    $id: Now.ID['92b07165fb8c9f500910f2e04eefdc19'],
    table: 'sys_restricted_caller_access',
    data: {
        operation: 'read',
        rca_type: 'real_rca',
        source: 'bfc5926378144c9a8a8a18bf26a03f5e',
        source_scope: '6805ff49c0eb46ee969d42f0dd56b3bf',
        source_table: 'sys_ws_operation',
        source_type: '22',
        status: '2',
        target: 'c1fe6dadfb4c9f500910f2e04eefdc63',
        target_scope: '888d25e9fb4c9f500910f2e04eefdca6',
        target_table: 'sys_db_object',
        target_type: '1',
    },
})
