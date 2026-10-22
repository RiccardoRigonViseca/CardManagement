import { CrossScopePrivilege } from '@servicenow/sdk/core'

CrossScopePrivilege({
    $id: Now.ID['050ff1adfb00df500910f2e04eefdcd1'],
    operation: 'read',
    status: 'allowed',
    targetName: 'sys_user_role',
    targetScope: 'global',
    targetType: 'sys_db_object',
})
