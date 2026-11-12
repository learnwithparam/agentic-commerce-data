# Why the naive agent failed

- sellers-in-sao-paulo: spelling, it matched only 'sao paulo' and missed eight other spellings of the city.
- distinct-customers: spelling, it counted customer_id, which is one per order.
- repeat-customers-2017: spelling, grouping by customer_id can never find a repeat.
- repeat-customer-share: spelling, same cause, so the share is 0.
- revenue-total: spelling, it summed items plus freight; the reference uses payments.
- gmv-2018: spelling, it left freight out of GMV.
- late-share-delivered: spelling, it compared timestamps with a date that has no time of day.
- late-orders-2018: spelling, same comparison, so same-day deliveries count as late.
- late-share-bed-bath-by-month: spelling, the join to order_items counts an order once per item.
- late-sellers-sao-paulo-2018q2: spelling, only one spelling of the city, and the dates are compared as text.
- top-categories-gmv-2018: spelling, the names are Portuguese and GMV has no freight.
- categories-without-translation: spelling, the left join also returns the empty category.
- average-order-value-2017: spelling, joining items to payments repeats each payment per item.
- payments-health-beauty-2018: spelling, each payment is counted once per beauty item.
- top-sellers-gmv-2018: spelling, GMV without freight changes the totals.
- customers-in-sao-paulo: spelling, it counted rows, which are orders, not people.
