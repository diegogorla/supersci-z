-- The provider audit is complete. Remove the synchronous HTTP extension so
-- browser database roles cannot use its upstream default PUBLIC grants.
drop extension if exists http;
