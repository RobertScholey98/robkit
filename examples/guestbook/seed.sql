-- The guestbook's seed. It runs once, as the app's own role, when an
-- install first makes the app's schema, and never again.
insert into entry (name, message) values
  ('Rob', 'Welcome to the guestbook. Sign it below.'),
  ('Grandma', 'Lovely to see everyone here!');
