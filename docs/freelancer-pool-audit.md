# Freelancer pool audit

Measured against the production catalogue on 2026-08-21. Re-run the queries at
the end before drawing conclusions from these numbers again.

The audit answers one question: **which searches can the catalogue serve well
today?** Everything else here is evidence for that answer.

## What is actually matchable

The matcher only ever sees profiles that are real, active, bookable and not
marked unavailable. Every number below that matters is measured on that subset,
not on the raw row count.

| Stage | Profiles |
|---|---:|
| Rows in `freelancer_profiles` | 78 |
| `demo_status = 'real'` | 71 |
| and `profile_status = 'active'` | 66 |
| and a booking URL | 66 |
| and availability not `unavailable` | **66** |

## Data quality of those 66

| Attribute | Present | Share |
|---|---:|---:|
| Rate (hourly or daily) | 14 | **21 %** |
| Location | 61 | 92 % |
| Availability `available` | 64 | 97 % |
| At least one verified fact | 7 | **11 %** |
| Skill tags per profile (mean) | 10.2 | — |
| Verified facts per profile (mean) | 1.2 | — |

Two of these are product-limiting rather than cosmetic:

**Rates are missing on four of five profiles.** A recruiter cannot budget from
a result set where most cards show no price, and any brief that names a budget
gets filtered against data that mostly does not exist. This is why the example
briefs on the chat page deliberately name no rate.

**Verified facts are missing on nine of ten profiles.** The product promises a
match with a reason. A reason assembled from self-reported facts alone is a
weaker claim than the interface implies.

## Coverage by search theme

Counted as profiles carrying at least N of the theme's skill tags. Two hits is
the realistic bar for a result worth showing, since the shortlist returns at
most three profiles.

| Theme | ≥1 skill | **≥2** | ≥3 | ≥2 and a rate |
|---|---:|---:|---:|---:|
| Performance marketing | 12 | **9** | 4 | 1 |
| AI automation | 15 | **8** | 3 | 3 |
| Requirements / BA / IT project management | 18 | **6** | 2 | 0 |
| Software development | 5 | **4** | 2 | 2 |

Strongest single skills: requirements management 15, SEO 7, Google Ads 6,
Python 6, then a long tail at 3–4 including React, Angular, Scrum, AWS,
Kubernetes, LLM, RAG and n8n.

## The answer

**Serve today:** performance marketing, AI automation, requirements
engineering. These are the three themes the chat page offers as example briefs.

**Do not lead with software development.** React reaches 4 profiles, Angular,
AWS and Kubernetes 3 each. Approaching IT recruiters with a developer search is
the one campaign the catalogue cannot currently support, and a first search that
returns nothing is not recoverable by a second one.

## Known data defect

One profile carries a phone number in `role_title` (`+4915162735905`). Whatever
import wrote it put a contact field into a display field, so the same mistake
may sit in neighbouring rows. Worth a scan of the import path before the
catalogue grows.

## Reproducing this

```sql
-- Matchable funnel
select
  count(*) as rows_total,
  count(*) filter (where demo_status = 'real') as real_profiles,
  count(*) filter (where demo_status = 'real' and profile_status = 'active') as active,
  count(*) filter (where demo_status = 'real' and profile_status = 'active'
                     and booking_url is not null) as bookable,
  count(*) filter (where demo_status = 'real' and profile_status = 'active'
                     and booking_url is not null
                     and availability_status in ('available', 'limited', 'unknown')) as matchable
from public.freelancer_profiles;

-- Quality of the matchable subset
select
  count(*) as matchable,
  count(*) filter (where hourly_rate_minor is not null or day_rate_minor is not null) as with_rate,
  count(*) filter (where location_text is not null) as with_location,
  count(*) filter (where availability_status = 'available') as available_now,
  count(*) filter (where cardinality(verified_facts) > 0) as with_verified_facts,
  round(avg(cardinality(skill_tags)), 1) as mean_skills,
  round(avg(cardinality(verified_facts)), 1) as mean_verified_facts
from public.freelancer_profiles
where demo_status = 'real' and profile_status = 'active' and booking_url is not null
  and availability_status in ('available', 'limited', 'unknown');

-- Skill distribution
select lower(skill) as skill, count(*) as profiles
from public.freelancer_profiles p, unnest(p.skill_tags) as skill
where p.demo_status = 'real' and p.profile_status = 'active'
  and p.booking_url is not null
  and p.availability_status in ('available', 'limited', 'unknown')
group by 1 having count(*) >= 3 order by 2 desc, 1;
```

Theme coverage substitutes the theme's tags into this predicate, counting
`cardinality(array(select 1 from unnest(p.skill_tags) s where lower(s) in (…)))`
per profile and bucketing by 1, 2 and 3 hits.
