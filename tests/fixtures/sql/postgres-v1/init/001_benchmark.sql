create table if not exists benchmark_items (
  id text primary key,
  label text not null
);

insert into benchmark_items (id, label) values
  ('seed-a', 'Seed A'),
  ('seed-b', 'Seed B')
on conflict (id) do nothing;
