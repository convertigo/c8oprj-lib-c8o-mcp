/*
 * Tools kept for the projects that still use them, and left out of the tool list: agents are no longer sent to them.
 * The value is what replaces the tool. upsert-ngx-crud-kit generated a whole CRUD front of shared components; pages are now
 * built one by one with ngx-page-create, and the PipelineCrm runs (12-13/11) had to be told not to use the kit.
 */
if (typeof C8O === "undefined") {
  var C8O = {};
}
C8O.retiredTools = {
  tools_upsert_ngx_crud_kit: "ngx-page-create"
};
