# Why the naive agent failed

- sellers-in-sao-paulo: spelling, it matched only 'sao paulo' and missed eight other spellings of the city.
- distinct-customers: customer-id, it counted customer_id, which is one per order.
- repeat-customers-2017: customer-id, grouping by customer_id can never find a repeat.
- repeat-customer-share: customer-id, same cause, so the share is 0.
- revenue-total: undefined-metric, it summed items plus freight; the reference uses payments.
- gmv-2018: undefined-metric, it left freight out of GMV.
- late-share-delivered: date-text, it compared timestamps with a date that has no time of day.
- late-orders-2018: date-text, same comparison, so same-day deliveries count as late.
