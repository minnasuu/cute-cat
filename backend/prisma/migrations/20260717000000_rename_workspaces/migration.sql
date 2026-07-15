-- 统一存量官方工作台名称为「服装工作台」(新 seed 名称),避免新旧账号 UI 不一致
--   仅修改 name,不动 workspaceType/isOfficial(后者已由 20260716000001 补齐)

UPDATE "Team"
   SET "name" = '服装工作台'
 WHERE "description" = '__cuca_workbench_v1__'
   AND "workspaceType" = 'clothing'
   AND "name" <> '服装工作台';
