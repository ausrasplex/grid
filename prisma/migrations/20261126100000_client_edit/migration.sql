-- Clients: "Change client details" (clients.edit) split out of clients.manage, so Foremen can correct clients.
-- Built-in roles are kept in step with the Blocks' grants when Grid starts; custom roles that could change
-- clients keep being able to.
UPDATE "Role" SET "permissions" = array_append("permissions", 'clients.edit')
WHERE 'clients.manage' = ANY("permissions") AND NOT ('clients.edit' = ANY("permissions"));
