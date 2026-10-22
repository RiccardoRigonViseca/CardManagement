import { Record } from '@servicenow/sdk/core'

Record({
    $id: Now.ID['cb289ae9fb44df500910f2e04eefdc7b'],
    table: 'sys_restricted_caller_access',
    data: {
        operation: 'read',
        rca_type: 'real_rca',
        source: '6555da3d0a0004971299ee0b192b8081',
        source_scope: 'global',
        source_table: 'sys_security_acl',
        source_type: '11',
        status: '2',
        target: 'e8590a61fbc0df500910f2e04eefdc11',
        target_scope: '888d25e9fb4c9f500910f2e04eefdca6',
        target_table: 'sys_db_object',
        target_type: '1',
    },
})
