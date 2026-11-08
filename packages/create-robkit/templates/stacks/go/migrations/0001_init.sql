-- One row per visit, by whoever made it.
create table visit (
  id serial primary key,
  viewer text not null,
  at timestamptz not null default now()
);
