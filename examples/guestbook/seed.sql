-- The guestbook's seed. The provision step runs it once, as the app's own
-- role, when pnpm dev first makes the app's schema, and never again.
insert into entry (name, message) values
  ('Rob', 'Welcome to the guestbook. Sign it below.'),
  ('Grandma', 'Lovely to see everyone here!');
