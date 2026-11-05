-- Runs once, as the app's own role, when an install first makes the app's
-- schema. robkit never runs it again.
insert into entry (name, message, at) values
  ('Robkit', 'Welcome to the guestbook.', now() - interval '1 minute'),
  ('The seed', 'This message came from seed.sql.', now());
